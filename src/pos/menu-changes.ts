// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Who changed what in the menu (migration 101, TechDocs/POS_MENU_CHANGES.md).
//
// The routes that write a product card, its variants, tags or modifier groups
// read the card before and after the write and hand both here. The diff is the
// server's own — a client never says what it changed — so the journal says what
// the database now holds, whoever wrote it and from whichever screen.
//
// What is NOT a menu change and never appears: stock (it moves with every sale),
// the stop-list (the kitchen's day, not the menu), `needs_review` (derived) and
// timestamps. A write that changes nothing writes no row.
//
// Recording never fails the write it describes: the journal is a record of a
// change that already happened, so an error here is logged and swallowed.

import { pool } from '../db.js';
import { logger } from '../logger.js';
import type { PosAuthContext } from './types.js';
import type { ProductView } from './products.service.js';
import type { ModifierGroup } from './modifiers.service.js';

export type MenuEntity = 'product' | 'modifier_group';
export type MenuAction = 'create' | 'update' | 'archive' | 'restore' | 'delete';

/** One changed field. `variant` names the variant (or the modifier) it belongs to. */
export interface MenuChange {
  field: string;
  variant?: string;
  from?: unknown;
  to?: unknown;
}

export interface MenuChangeRow {
  id: number;
  entity: MenuEntity;
  entity_id: number;
  entity_name: string;
  staff_id: number | null;
  staff_name: string;
  staff_role: string;
  action: MenuAction;
  changes: MenuChange[];
  created_at: string;
}

/** The card's own fields the journal follows, in the order a person reads them. */
export const PRODUCT_FIELDS = [
  'name',
  'description',
  'composition',
  'allergens',
  'menu_labels',
  'kcal',
  'strength_tenths',
  'prep_minutes',
  'image_url',
  'menu_hidden',
  'sellable',
  'kind',
  'stock_mode',
  'fiscal_register',
  'fiscal_excise',
  'excise_per_unit',
  'fiscal_uktzed',
] as const;

/** A variant's fields the journal follows. `is_active` is the variant's archive. */
export const VARIANT_FIELDS = [
  'label',
  'unit',
  'price_cents',
  'compare_at_cents',
  'cost_cents',
  'sku',
  'barcode',
  'pack_qty',
  'pack_label',
  'bottle_ml',
  'is_active',
] as const;

export const GROUP_FIELDS = ['name', 'min_select', 'max_select', 'is_active'] as const;
export const MODIFIER_FIELDS = ['name', 'price_delta_cents', 'label_deltas', 'is_default', 'is_active', 'component'] as const;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** A field's value as the journal keeps it: empty text is «nothing», like null. */
function valueOf(value: unknown): unknown {
  if (value === undefined || value === '') return null;
  return value;
}

type VariantView = ProductView['variants'][number] & {
  id: number;
  label: string;
  price_cents: number;
  components?: Array<{ component_variant_id: number; quantity: number; product_name: string; label: string; unit: string }>;
};

function recipeText(variant: VariantView): string[] {
  return (variant.components ?? []).map((c) => {
    const what = [c.product_name, c.label].filter(Boolean).join(' · ');
    return `${what} — ${c.quantity}${c.unit ? ` ${c.unit}` : ''}`;
  });
}

function variantName(variant: VariantView): string {
  return String(variant.label ?? '').trim();
}

/** Names for the ids a card carries, so a row stays readable after a tag is deleted. */
export interface ProductNames {
  tags: ReadonlyMap<number, string>;
  groups: ReadonlyMap<number, string>;
}

function names(ids: readonly number[] | undefined, map: ReadonlyMap<number, string>): string[] {
  return (ids ?? []).map((id) => map.get(id) ?? `#${id}`);
}

/**
 * What changed between two reads of one card. `before` null = the card was
 * just created; the answer then lists its variants with their prices.
 */
export function diffProduct(
  before: ProductView | null,
  after: ProductView,
  lookup: ProductNames
): { action: MenuAction; changes: MenuChange[] } {
  const changes: MenuChange[] = [];
  const afterVariants = (after.variants ?? []) as VariantView[];

  if (!before) {
    for (const variant of afterVariants) {
      changes.push({ field: 'variant_added', variant: variantName(variant), to: variant.price_cents });
    }
    return { action: 'create', changes };
  }

  for (const field of PRODUCT_FIELDS) {
    const from = valueOf((before as Record<string, unknown>)[field]);
    const to = valueOf((after as Record<string, unknown>)[field]);
    if (!same(from, to)) changes.push({ field, from, to });
  }
  const tagsFrom = names(before.tag_ids, lookup.tags).sort();
  const tagsTo = names(after.tag_ids, lookup.tags).sort();
  if (!same(tagsFrom, tagsTo)) changes.push({ field: 'tags', from: tagsFrom, to: tagsTo });
  // The order of the groups is the order the sheet asks them, so it counts.
  const groupsFrom = names(before.modifier_group_ids, lookup.groups);
  const groupsTo = names(after.modifier_group_ids, lookup.groups);
  if (!same(groupsFrom, groupsTo)) changes.push({ field: 'modifier_groups', from: groupsFrom, to: groupsTo });

  const beforeVariants = new Map(((before.variants ?? []) as VariantView[]).map((v) => [v.id, v]));
  for (const variant of afterVariants) {
    const old = beforeVariants.get(variant.id);
    if (!old) {
      changes.push({ field: 'variant_added', variant: variantName(variant), to: variant.price_cents });
      continue;
    }
    for (const field of VARIANT_FIELDS) {
      const from = valueOf((old as Record<string, unknown>)[field]);
      const to = valueOf((variant as Record<string, unknown>)[field]);
      if (!same(from, to)) changes.push({ field: `variant.${field}`, variant: variantName(variant), from, to });
    }
    const recipeFrom = recipeText(old);
    const recipeTo = recipeText(variant);
    if (!same(recipeFrom, recipeTo)) {
      changes.push({ field: 'variant.recipe', variant: variantName(variant), from: recipeFrom, to: recipeTo });
    }
  }

  let action: MenuAction = 'update';
  if (before.is_active && !after.is_active) action = 'archive';
  else if (!before.is_active && after.is_active) action = 'restore';
  return { action, changes };
}

function componentText(modifier: ModifierGroup['modifiers'][number]): string | null {
  if (!modifier.component) return null;
  const what = [modifier.component.product_name, modifier.component.label].filter(Boolean).join(' · ');
  const unit = modifier.component.unit ? ` ${modifier.component.unit}` : '';
  return `${what} — ${modifier.component_quantity ?? 0}${unit}`;
}

function modifierValue(modifier: ModifierGroup['modifiers'][number], field: (typeof MODIFIER_FIELDS)[number]): unknown {
  if (field === 'component') return componentText(modifier);
  return valueOf((modifier as unknown as Record<string, unknown>)[field]);
}

/** What changed in a modifier group. `after` null = the group was deleted. */
export function diffGroup(
  before: ModifierGroup | null,
  after: ModifierGroup | null
): { action: MenuAction; changes: MenuChange[] } {
  const changes: MenuChange[] = [];
  if (!before && after) {
    for (const modifier of after.modifiers) {
      changes.push({ field: 'modifier_added', variant: modifier.name, to: modifier.price_delta_cents });
    }
    return { action: 'create', changes };
  }
  if (before && !after) return { action: 'delete', changes };
  if (!before || !after) return { action: 'update', changes };

  for (const field of GROUP_FIELDS) {
    const from = valueOf((before as unknown as Record<string, unknown>)[field]);
    const to = valueOf((after as unknown as Record<string, unknown>)[field]);
    if (!same(from, to)) changes.push({ field: `group.${field}`, from, to });
  }
  const old = new Map(before.modifiers.map((m) => [m.id, m]));
  const seen = new Set<number>();
  for (const modifier of after.modifiers) {
    seen.add(modifier.id);
    const was = old.get(modifier.id);
    if (!was) {
      changes.push({ field: 'modifier_added', variant: modifier.name, to: modifier.price_delta_cents });
      continue;
    }
    for (const field of MODIFIER_FIELDS) {
      const from = modifierValue(was, field);
      const to = modifierValue(modifier, field);
      if (!same(from, to)) changes.push({ field: `modifier.${field}`, variant: modifier.name, from, to });
    }
  }
  for (const was of before.modifiers) {
    if (!seen.has(was.id)) changes.push({ field: 'modifier_removed', variant: was.name });
  }
  return { action: 'update', changes };
}

/** Tag and modifier-group names for the ids these cards carry. */
export async function loadProductNames(storeId: number, cards: ReadonlyArray<ProductView | null>): Promise<ProductNames> {
  const tagIds = new Set<number>();
  const groupIds = new Set<number>();
  for (const card of cards) {
    for (const id of card?.tag_ids ?? []) tagIds.add(id);
    for (const id of card?.modifier_group_ids ?? []) groupIds.add(id);
  }
  const tags = new Map<number, string>();
  const groups = new Map<number, string>();
  if (tagIds.size > 0) {
    const rows = await pool.query(`SELECT id, name FROM pos_tags WHERE store_id = $1 AND id = ANY($2::bigint[])`, [
      storeId,
      [...tagIds],
    ]);
    for (const row of rows.rows) tags.set(Number(row.id), String(row.name));
  }
  if (groupIds.size > 0) {
    const rows = await pool.query(
      `SELECT id, name FROM pos_modifier_groups WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [storeId, [...groupIds]]
    );
    for (const row of rows.rows) groups.set(Number(row.id), String(row.name));
  }
  return { tags, groups };
}

/** Write one row. Never throws: the change it describes has already happened. */
export async function recordMenuChange(
  auth: PosAuthContext,
  entry: { entity: MenuEntity; entityId: number; entityName: string; action: MenuAction; changes: MenuChange[] }
): Promise<void> {
  if (entry.action === 'update' && entry.changes.length === 0) return;
  try {
    await pool.query(
      `INSERT INTO pos_menu_changes
         (store_id, entity, entity_id, entity_name, staff_id, staff_name, staff_role, action, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        auth.storeId,
        entry.entity,
        entry.entityId,
        entry.entityName,
        auth.staffId,
        auth.displayName,
        auth.role,
        entry.action,
        JSON.stringify(entry.changes),
      ]
    );
  } catch (error) {
    logger.warn('Menu change not recorded', {
      storeId: auth.storeId,
      entity: entry.entity,
      entityId: entry.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Record the difference between two reads of each card (cards missing after the write are skipped). */
export async function recordProductChanges(
  auth: PosAuthContext,
  before: ReadonlyArray<ProductView>,
  after: ReadonlyArray<ProductView>
): Promise<void> {
  try {
    const lookup = await loadProductNames(auth.storeId, [...before, ...after]);
    const old = new Map(before.map((p) => [p.id, p]));
    for (const card of after) {
      const { action, changes } = diffProduct(old.get(card.id) ?? null, card, lookup);
      await recordMenuChange(auth, { entity: 'product', entityId: card.id, entityName: card.name, action, changes });
    }
  } catch (error) {
    logger.warn('Menu changes not recorded', { storeId: auth.storeId, error: error instanceof Error ? error.message : String(error) });
  }
}

export interface MenuChangeQuery {
  entity?: MenuEntity;
  entityId?: number;
  limit?: number;
  offset?: number;
}

/** The owner's read: newest first, one card's or the whole store's. */
export async function listMenuChanges(
  storeId: number,
  query: MenuChangeQuery = {}
): Promise<{ changes: MenuChangeRow[]; total: number }> {
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200);
  const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
  const where = ['store_id = $1'];
  const params: unknown[] = [storeId];
  if (query.entity) {
    params.push(query.entity);
    where.push(`entity = $${params.length}`);
  }
  if (query.entityId != null) {
    params.push(query.entityId);
    where.push(`entity_id = $${params.length}`);
  }
  const total = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_menu_changes WHERE ${where.join(' AND ')}`, params);
  const rows = await pool.query(
    `SELECT id, entity, entity_id, entity_name, staff_id, staff_name, staff_role, action, changes, created_at
     FROM pos_menu_changes
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return {
    total: Number(total.rows[0].n),
    changes: rows.rows.map((row) => ({
      id: Number(row.id),
      entity: row.entity as MenuEntity,
      entity_id: Number(row.entity_id),
      entity_name: String(row.entity_name),
      staff_id: row.staff_id == null ? null : Number(row.staff_id),
      staff_name: String(row.staff_name),
      staff_role: String(row.staff_role),
      action: row.action as MenuAction,
      changes: Array.isArray(row.changes) ? (row.changes as MenuChange[]) : [],
      created_at: new Date(row.created_at).toISOString(),
    })),
  };
}
