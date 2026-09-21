// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/modifiers.service.ts — modifiers on a sale line («вівсяне +15»,
// «без цукру»). Migration 046; TechDocs/POS_CAFE.md §3–§4, POS_VERTICALS.md §7k.
//
// A group is a question with a count of answers (`min_select`..`max_select`);
// a modifier is one answer with a signed price delta and, optionally, what it
// writes off. Groups hang off the product. What checkout needs from here is
// `resolveLineModifiers`: given the product's groups and the ids a line named,
// the snapshot to store, the delta to add to the price and the leaves to take
// off the shelf — or a refusal that names the group, so the till can say
// «Оберіть молоко» rather than «400».

import { pool } from '../db.js';
import type { ComponentInput } from './composites.service.js';
import type { CatalogModifierGroup } from './types.js';

type DbClient = { query: typeof pool.query };

export class ModifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModifierError';
  }
}

const MAX_NAME = 80;
/** Mirrors `pos_sale_items.note VARCHAR(120)`. */
export const MAX_LINE_NOTE = 120;
/** A delta bigger than this is a typo, not a price. */
const MAX_DELTA_CENTS = 100_000_00;

export interface Modifier {
  id: number;
  group_id: number;
  name: string;
  price_delta_cents: number;
  component_variant_id: number | null;
  component_quantity: number | null;
  /** The component named, for the admin list. */
  component: { product_name: string; label: string; unit: string } | null;
  is_default: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface ModifierGroup {
  id: number;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  modifiers: Modifier[];
}

export interface ModifierGroupInput {
  name?: unknown;
  min_select?: unknown;
  max_select?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

export interface ModifierInput {
  name?: unknown;
  price_delta_cents?: unknown;
  component_variant_id?: unknown;
  component_quantity?: unknown;
  is_default?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

/** One chosen modifier as the sale line records it. */
export interface LineModifierSnapshot {
  /** Null once the answer was deleted: the name below is then the whole record. */
  modifier_id: number | null;
  group_name: string;
  name: string;
  price_delta_cents: number;
  sort_order: number;
}

export interface ResolvedLineModifiers {
  snapshot: LineModifierSnapshot[];
  /** Σ price deltas, signed. */
  deltaCents: number;
  /** What the chosen modifiers write off, per one unit of the line, authored (not yet expanded). */
  components: ComponentInput[];
  /** For the composed caption, in group order. */
  names: string[];
}

// ── validation helpers ─────────────────────────────────────────────

function cleanName(raw: unknown, what: string): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new ModifierError(`${what}: назва обовʼязкова`);
  if (name.length > MAX_NAME) throw new ModifierError(`${what}: назва довша за ${MAX_NAME} символів`);
  return name;
}

function intField(raw: unknown, what: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new ModifierError(`${what} має бути цілим числом від ${min}${max === Number.MAX_SAFE_INTEGER ? '' : ` до ${max}`}`);
  }
  return n;
}

function boolField(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  return Boolean(raw);
}

/** The kitchen note as stored: trimmed, bounded, never null. */
export function cleanLineNote(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') throw new ModifierError('Коментар до позиції має бути текстом');
  const note = raw.trim();
  if (note.length > MAX_LINE_NOTE) {
    throw new ModifierError(`Коментар до позиції довший за ${MAX_LINE_NOTE} символів`);
  }
  return note;
}

/** Modifier ids as a line names them: distinct positive integers, sorted. */
export function normalizeModifierIds(raw: unknown): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ModifierError('modifiers має бути списком id');
  const ids: number[] = [];
  for (const value of raw) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new ModifierError('Некоректний id модифікатора');
    if (ids.includes(id)) throw new ModifierError(`Модифікатор ${id} названо двічі`);
    ids.push(id);
  }
  return ids.sort((a, b) => a - b);
}

// ── reading ─────────────────────────────────────────────────────────

function rowToModifier(row: Record<string, unknown>): Modifier {
  const componentId = row.component_variant_id == null ? null : Number(row.component_variant_id);
  return {
    id: Number(row.id),
    group_id: Number(row.group_id),
    name: String(row.name),
    price_delta_cents: Number(row.price_delta_cents),
    component_variant_id: componentId,
    component_quantity: row.component_quantity == null ? null : Number(row.component_quantity),
    component:
      componentId == null
        ? null
        : {
            product_name: String(row.component_product_name ?? ''),
            label: String(row.component_label ?? ''),
            unit: String(row.component_unit ?? ''),
          },
    is_default: Boolean(row.is_default),
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
  };
}

const MODIFIER_SELECT = `
  SELECT m.id, m.group_id, m.name, m.price_delta_cents, m.component_variant_id,
         m.component_quantity, m.is_default, m.sort_order, m.is_active,
         cp.name AS component_product_name, cv.label AS component_label, cv.unit AS component_unit
  FROM pos_modifiers m
  LEFT JOIN pos_variants cv ON cv.id = m.component_variant_id
  LEFT JOIN pos_products cp ON cp.id = cv.product_id`;

async function loadModifiersByGroup(
  client: DbClient,
  storeId: number,
  groupIds: number[],
  activeOnly: boolean
): Promise<Map<number, Modifier[]>> {
  const byGroup = new Map<number, Modifier[]>();
  if (groupIds.length === 0) return byGroup;
  const result = await client.query(
    `${MODIFIER_SELECT}
     WHERE m.store_id = $1 AND m.group_id = ANY($2::bigint[])${activeOnly ? ' AND m.is_active = TRUE' : ''}
     ORDER BY m.group_id, m.sort_order, m.id`,
    [storeId, groupIds]
  );
  for (const row of result.rows) {
    const modifier = rowToModifier(row);
    byGroup.set(modifier.group_id, [...(byGroup.get(modifier.group_id) ?? []), modifier]);
  }
  return byGroup;
}

function rowToGroup(row: Record<string, unknown>, modifiers: Modifier[]): ModifierGroup {
  return {
    id: Number(row.id),
    name: String(row.name),
    min_select: Number(row.min_select),
    max_select: Number(row.max_select),
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
    modifiers,
  };
}

/** Every group of the store with its modifiers, active or not — the owner's list. */
export async function listGroups(storeId: number, client: DbClient = pool): Promise<ModifierGroup[]> {
  const groups = await client.query(
    `SELECT id, name, min_select, max_select, sort_order, is_active
     FROM pos_modifier_groups WHERE store_id = $1
     ORDER BY sort_order, id`,
    [storeId]
  );
  const modifiers = await loadModifiersByGroup(
    client,
    storeId,
    groups.rows.map((row) => Number(row.id)),
    false
  );
  return groups.rows.map((row) => rowToGroup(row, modifiers.get(Number(row.id)) ?? []));
}

export async function getGroup(
  storeId: number,
  groupId: number,
  client: DbClient = pool
): Promise<ModifierGroup> {
  const groups = await client.query(
    `SELECT id, name, min_select, max_select, sort_order, is_active
     FROM pos_modifier_groups WHERE store_id = $1 AND id = $2`,
    [storeId, groupId]
  );
  if (groups.rows.length === 0) throw new ModifierError('Групу модифікаторів не знайдено');
  const modifiers = await loadModifiersByGroup(client, storeId, [groupId], false);
  return rowToGroup(groups.rows[0], modifiers.get(groupId) ?? []);
}

/**
 * The groups attached to each product, in the product's order, with their
 * modifiers. `activeOnly` is the till's view (checkout and the catalog); the
 * owner's product card wants everything.
 */
export async function loadGroupsForProducts(
  client: DbClient,
  storeId: number,
  productIds: number[],
  opts: { activeOnly: boolean }
): Promise<Map<number, ModifierGroup[]>> {
  const byProduct = new Map<number, ModifierGroup[]>();
  if (productIds.length === 0) return byProduct;
  const links = await client.query(
    `SELECT l.product_id, g.id, g.name, g.min_select, g.max_select, g.sort_order, g.is_active
     FROM pos_product_modifier_groups l
     JOIN pos_modifier_groups g ON g.id = l.group_id
     WHERE l.store_id = $1 AND l.product_id = ANY($2::bigint[])${opts.activeOnly ? ' AND g.is_active = TRUE' : ''}
     ORDER BY l.product_id, l.sort_order, g.id`,
    [storeId, productIds]
  );
  const groupIds = [...new Set(links.rows.map((row) => Number(row.id)))];
  const modifiers = await loadModifiersByGroup(client, storeId, groupIds, opts.activeOnly);
  for (const row of links.rows) {
    const productId = Number(row.product_id);
    const group = rowToGroup(row, modifiers.get(Number(row.id)) ?? []);
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), group]);
  }
  return byProduct;
}

/** The till's view of a group: no admin fields, no component names. */
export function toCatalogGroup(group: ModifierGroup): CatalogModifierGroup {
  return {
    id: group.id,
    name: group.name,
    min_select: group.min_select,
    max_select: group.max_select,
    modifiers: group.modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      price_delta_cents: m.price_delta_cents,
      is_default: m.is_default,
      component_variant_id: m.component_variant_id,
      component_quantity: m.component_quantity,
    })),
  };
}

// ── writing ─────────────────────────────────────────────────────────

function resolveRange(minRaw: unknown, maxRaw: unknown, fallback: { min: number; max: number }) {
  const min = minRaw === undefined ? fallback.min : intField(minRaw, 'min_select', 0, 50);
  const max = maxRaw === undefined ? fallback.max : intField(maxRaw, 'max_select', 1, 50);
  if (max < min) throw new ModifierError('max_select не може бути меншим за min_select');
  return { min, max };
}

async function assertDefaultsFit(
  client: DbClient,
  groupId: number,
  maxSelect: number,
  extra: number
): Promise<void> {
  const result = await client.query(
    `SELECT COUNT(*)::int AS n FROM pos_modifiers WHERE group_id = $1 AND is_default = TRUE AND is_active = TRUE`,
    [groupId]
  );
  if (Number(result.rows[0].n) + extra > maxSelect) {
    throw new ModifierError(`Дефолтних відповідей більше, ніж max_select (${maxSelect})`);
  }
}

export async function createGroup(storeId: number, input: ModifierGroupInput): Promise<ModifierGroup> {
  const name = cleanName(input.name, 'Група');
  const { min, max } = resolveRange(input.min_select, input.max_select, { min: 0, max: 1 });
  const sortOrder = input.sort_order === undefined ? 0 : intField(input.sort_order, 'sort_order', 0);
  const result = await pool.query(
    `INSERT INTO pos_modifier_groups (store_id, name, min_select, max_select, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [storeId, name, min, max, sortOrder, boolField(input.is_active, true)]
  );
  return getGroup(storeId, Number(result.rows[0].id));
}

export async function updateGroup(
  storeId: number,
  groupId: number,
  input: ModifierGroupInput
): Promise<ModifierGroup> {
  const current = await getGroup(storeId, groupId);
  const name = input.name === undefined ? current.name : cleanName(input.name, 'Група');
  const { min, max } = resolveRange(input.min_select, input.max_select, {
    min: current.min_select,
    max: current.max_select,
  });
  const sortOrder =
    input.sort_order === undefined ? current.sort_order : intField(input.sort_order, 'sort_order', 0);
  if (max < current.max_select) await assertDefaultsFit(pool, groupId, max, 0);
  await pool.query(
    `UPDATE pos_modifier_groups
     SET name = $1, min_select = $2, max_select = $3, sort_order = $4, is_active = $5, updated_at = NOW()
     WHERE store_id = $6 AND id = $7`,
    [name, min, max, sortOrder, boolField(input.is_active, current.is_active), storeId, groupId]
  );
  return getGroup(storeId, groupId);
}

/**
 * Delete a group with its modifiers and its product links. Sale lines keep
 * what they recorded: the snapshot carries names, and `modifier_id` is SET
 * NULL by the schema.
 */
export async function deleteGroup(storeId: number, groupId: number): Promise<void> {
  const result = await pool.query(
    `DELETE FROM pos_modifier_groups WHERE store_id = $1 AND id = $2`,
    [storeId, groupId]
  );
  if (result.rowCount === 0) throw new ModifierError('Групу модифікаторів не знайдено');
}

async function resolveComponent(
  client: DbClient,
  storeId: number,
  variantRaw: unknown,
  quantityRaw: unknown
): Promise<{ variantId: number | null; quantity: number | null }> {
  const hasVariant = variantRaw !== undefined && variantRaw !== null;
  const hasQuantity = quantityRaw !== undefined && quantityRaw !== null;
  if (!hasVariant && !hasQuantity) return { variantId: null, quantity: null };
  if (hasVariant !== hasQuantity) {
    throw new ModifierError('Складник модифікатора потребує і варіанта, і кількості');
  }
  const variantId = intField(variantRaw, 'component_variant_id', 1);
  const quantity = intField(quantityRaw, 'component_quantity', 1);
  // Any variant, a recipe included: a derived one is expanded at checkout
  // through the flat table, an own one is a leaf — exactly like a recipe
  // component (POS_VERTICALS.md §7j).
  const found = await client.query(
    `SELECT 1 FROM pos_variants WHERE store_id = $1 AND id = $2 AND is_active = TRUE`,
    [storeId, variantId]
  );
  if (found.rows.length === 0) throw new ModifierError(`Складник ${variantId} не знайдено`);
  return { variantId, quantity };
}

export async function createModifier(
  storeId: number,
  groupId: number,
  input: ModifierInput
): Promise<ModifierGroup> {
  const group = await getGroup(storeId, groupId);
  const name = cleanName(input.name, 'Модифікатор');
  const delta =
    input.price_delta_cents === undefined
      ? 0
      : intField(input.price_delta_cents, 'price_delta_cents', -MAX_DELTA_CENTS, MAX_DELTA_CENTS);
  const component = await resolveComponent(
    pool,
    storeId,
    input.component_variant_id,
    input.component_quantity
  );
  const isDefault = boolField(input.is_default, false);
  if (isDefault) await assertDefaultsFit(pool, groupId, group.max_select, 1);
  const sortOrder = input.sort_order === undefined ? 0 : intField(input.sort_order, 'sort_order', 0);
  await pool.query(
    `INSERT INTO pos_modifiers
       (store_id, group_id, name, price_delta_cents, component_variant_id, component_quantity,
        is_default, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      storeId,
      groupId,
      name,
      delta,
      component.variantId,
      component.quantity,
      isDefault,
      sortOrder,
      boolField(input.is_active, true),
    ]
  );
  return getGroup(storeId, groupId);
}

export async function updateModifier(
  storeId: number,
  modifierId: number,
  input: ModifierInput
): Promise<ModifierGroup> {
  const current = await pool.query(`${MODIFIER_SELECT} WHERE m.store_id = $1 AND m.id = $2`, [
    storeId,
    modifierId,
  ]);
  if (current.rows.length === 0) throw new ModifierError('Модифікатор не знайдено');
  const row = rowToModifier(current.rows[0]);
  const group = await getGroup(storeId, row.group_id);

  const name = input.name === undefined ? row.name : cleanName(input.name, 'Модифікатор');
  const delta =
    input.price_delta_cents === undefined
      ? row.price_delta_cents
      : intField(input.price_delta_cents, 'price_delta_cents', -MAX_DELTA_CENTS, MAX_DELTA_CENTS);
  // The component pair is replaced together: sending one half is an error,
  // sending neither keeps what is there, sending both nulls clears it.
  const touchesComponent =
    input.component_variant_id !== undefined || input.component_quantity !== undefined;
  const component = touchesComponent
    ? await resolveComponent(pool, storeId, input.component_variant_id, input.component_quantity)
    : { variantId: row.component_variant_id, quantity: row.component_quantity };
  const isActive = boolField(input.is_active, row.is_active);
  const isDefault = boolField(input.is_default, row.is_default);
  if (isDefault && isActive && !(row.is_default && row.is_active)) {
    await assertDefaultsFit(pool, row.group_id, group.max_select, 1);
  }
  const sortOrder =
    input.sort_order === undefined ? row.sort_order : intField(input.sort_order, 'sort_order', 0);
  await pool.query(
    `UPDATE pos_modifiers
     SET name = $1, price_delta_cents = $2, component_variant_id = $3, component_quantity = $4,
         is_default = $5, sort_order = $6, is_active = $7, updated_at = NOW()
     WHERE store_id = $8 AND id = $9`,
    [name, delta, component.variantId, component.quantity, isDefault, sortOrder, isActive, storeId, modifierId]
  );
  return getGroup(storeId, row.group_id);
}

export async function deleteModifier(storeId: number, modifierId: number): Promise<void> {
  const result = await pool.query(`DELETE FROM pos_modifiers WHERE store_id = $1 AND id = $2`, [
    storeId,
    modifierId,
  ]);
  if (result.rowCount === 0) throw new ModifierError('Модифікатор не знайдено');
}

/** Replace a product's groups wholesale, in the order given — like tags. */
export async function setProductGroups(
  storeId: number,
  productId: number,
  groupIdsRaw: unknown
): Promise<ModifierGroup[]> {
  if (!Array.isArray(groupIdsRaw)) throw new ModifierError('group_ids має бути списком');
  const groupIds: number[] = [];
  for (const value of groupIdsRaw) {
    const id = intField(value, 'group_id', 1);
    if (groupIds.includes(id)) throw new ModifierError(`Групу ${id} названо двічі`);
    groupIds.push(id);
  }
  const product = await pool.query(`SELECT 1 FROM pos_products WHERE store_id = $1 AND id = $2`, [
    storeId,
    productId,
  ]);
  if (product.rows.length === 0) throw new ModifierError('Товар не знайдено');
  if (groupIds.length > 0) {
    const found = await pool.query(
      `SELECT id FROM pos_modifier_groups WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [storeId, groupIds]
    );
    if (found.rows.length !== groupIds.length) {
      throw new ModifierError('Деяких груп модифікаторів не знайдено');
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM pos_product_modifier_groups WHERE store_id = $1 AND product_id = $2`, [
      storeId,
      productId,
    ]);
    for (const [index, groupId] of groupIds.entries()) {
      await client.query(
        `INSERT INTO pos_product_modifier_groups (store_id, product_id, group_id, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [storeId, productId, groupId, index]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const groups = await loadGroupsForProducts(pool, storeId, [productId], { activeOnly: false });
  return groups.get(productId) ?? [];
}

/** Group ids per product, for the owner's product list. */
export async function listProductGroupIds(
  storeId: number,
  productIds: number[],
  client: DbClient = pool
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (productIds.length === 0) return map;
  const result = await client.query(
    `SELECT product_id, group_id FROM pos_product_modifier_groups
     WHERE store_id = $1 AND product_id = ANY($2::bigint[])
     ORDER BY product_id, sort_order, group_id`,
    [storeId, productIds]
  );
  for (const row of result.rows) {
    const productId = Number(row.product_id);
    map.set(productId, [...(map.get(productId) ?? []), Number(row.group_id)]);
  }
  return map;
}

// ── checkout ────────────────────────────────────────────────────────

/**
 * What a line's modifiers mean, or why they are refused.
 *
 * Pure: `groups` is the product's attached, active groups in order (from
 * `loadGroupsForProducts`), `ids` the line's choice, already normalised. A
 * line naming NO modifiers is checked too — a required group must be
 * answered, whichever client is asking; and `is_default` is never applied
 * here, because an older till sends no ids and an offline mirror that priced
 * without the default would disagree with this server on sync.
 */
export function resolveLineModifiers(groups: ModifierGroup[], ids: number[]): ResolvedLineModifiers {
  const owner = new Map<number, { group: ModifierGroup; groupIndex: number; modifier: Modifier }>();
  groups.forEach((group, groupIndex) => {
    for (const modifier of group.modifiers) {
      if (modifier.is_active) owner.set(modifier.id, { group, groupIndex, modifier });
    }
  });

  const chosen = ids.map((id) => {
    const hit = owner.get(id);
    if (!hit) throw new ModifierError(`Модифікатор ${id} недоступний для цього товару`);
    return hit;
  });

  const counts = new Map<number, number>();
  for (const hit of chosen) counts.set(hit.group.id, (counts.get(hit.group.id) ?? 0) + 1);
  for (const group of groups) {
    const n = counts.get(group.id) ?? 0;
    if (n < group.min_select) {
      throw new ModifierError(
        group.min_select === 1
          ? `Оберіть «${group.name}»`
          : `«${group.name}»: оберіть щонайменше ${group.min_select}`
      );
    }
    if (n > group.max_select) {
      throw new ModifierError(`«${group.name}»: не більше ${group.max_select}`);
    }
  }

  chosen.sort(
    (a, b) =>
      a.groupIndex - b.groupIndex ||
      a.modifier.sort_order - b.modifier.sort_order ||
      a.modifier.id - b.modifier.id
  );

  const totals = new Map<number, number>();
  let deltaCents = 0;
  const snapshot: LineModifierSnapshot[] = [];
  const names: string[] = [];
  chosen.forEach(({ group, modifier }, index) => {
    deltaCents += modifier.price_delta_cents;
    names.push(modifier.name);
    snapshot.push({
      modifier_id: modifier.id,
      group_name: group.name,
      name: modifier.name,
      price_delta_cents: modifier.price_delta_cents,
      sort_order: index,
    });
    if (modifier.component_variant_id != null && modifier.component_quantity != null) {
      totals.set(
        modifier.component_variant_id,
        (totals.get(modifier.component_variant_id) ?? 0) + modifier.component_quantity
      );
    }
  });

  return {
    snapshot,
    deltaCents,
    components: [...totals.entries()].map(([component_variant_id, quantity]) => ({
      component_variant_id,
      quantity,
    })),
    names,
  };
}

/**
 * The caption a line with modifiers gets: the variant's own label, then the
 * chosen modifiers, in group order — «M · вівсяне молоко · без цукру». Stored
 * in `pos_sale_items.variant_label`, which is what the ПРРО line, the receipt,
 * the printer and the refund screen already read, so none of them changes.
 * The kitchen note is deliberately not part of it.
 */
export function lineCaption(variantLabel: string, modifierNames: string[]): string {
  return [variantLabel.trim(), ...modifierNames].filter(Boolean).join(' · ').slice(0, 255);
}

// ── snapshots that live outside a sale (parked carts, pre-orders — К3f) ──

/**
 * A stored line-modifier snapshot (JSONB on `pos_parked_cart_items` /
 * `pos_preorder_items`, migration 051) back into its typed shape. Anything
 * that is not a list of named answers reads as «none».
 */
export function parseLineModifierSnapshot(raw: unknown): LineModifierSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m, i) => {
      const row = (m ?? {}) as Record<string, unknown>;
      return {
        modifier_id: row.modifier_id == null ? null : Number(row.modifier_id),
        group_name: String(row.group_name ?? ''),
        name: String(row.name ?? ''),
        price_delta_cents: Number(row.price_delta_cents ?? 0),
        sort_order: Number(row.sort_order ?? i),
      };
    })
    .filter((m) => m.name !== '');
}

/**
 * Resolve a line's answers against its product's groups — the same check
 * checkout makes, run where the line is written down (a parked cart, a
 * pre-order) so that a required question left unanswered is refused there
 * and not when the cart comes back to a till.
 */
export async function resolveForVariant(
  client: DbClient,
  storeId: number,
  variantId: number,
  ids: number[]
): Promise<ResolvedLineModifiers> {
  const product = await client.query(
    `SELECT product_id FROM pos_variants WHERE id = $1 AND store_id = $2`,
    [variantId, storeId]
  );
  if (product.rows.length === 0) throw new ModifierError('Позиція не знайдена');
  const productId = Number(product.rows[0].product_id);
  const groups = await loadGroupsForProducts(client, storeId, [productId], { activeOnly: true });
  return resolveLineModifiers(groups.get(productId) ?? [], ids);
}

/**
 * Σ of what a snapshot's answers cost TODAY, or null when one of them no
 * longer exists (deleted or switched off) — the «what would this cost now»
 * read next to a pre-order's quote, which must say nothing rather than a
 * wrong number.
 */
export async function liveDeltaCents(
  client: DbClient,
  storeId: number,
  snapshot: LineModifierSnapshot[]
): Promise<number | null> {
  if (snapshot.length === 0) return 0;
  const ids = snapshot.map((m) => m.modifier_id).filter((id): id is number => id != null);
  if (ids.length !== snapshot.length) return null;
  const rows = await client.query(
    `SELECT id, price_delta_cents FROM pos_modifiers
     WHERE store_id = $1 AND id = ANY($2::bigint[]) AND is_active = TRUE`,
    [storeId, ids]
  );
  if (rows.rows.length !== new Set(ids).size) return null;
  const delta = new Map(rows.rows.map((r) => [Number(r.id), Number(r.price_delta_cents)]));
  return ids.reduce((sum, id) => sum + (delta.get(id) ?? 0), 0);
}

/**
 * A pre-order's answers at hand-over: the snapshot as promised — names and
 * deltas from the order, never re-resolved, because a renamed answer must
 * not rewrite a promise and the price lock already includes the deltas —
 * plus what they write off, from the LIVE rows by id. A deleted answer
 * writes off nothing and lands on the sale line with `modifier_id` null,
 * which is what the `pos_sale_item_modifiers` FK demands.
 */
export async function promisedLineModifiers(
  client: DbClient,
  storeId: number,
  snapshot: LineModifierSnapshot[]
): Promise<{ snapshot: LineModifierSnapshot[]; names: string[]; components: ComponentInput[] }> {
  if (snapshot.length === 0) return { snapshot: [], names: [], components: [] };
  const ids = snapshot.map((m) => m.modifier_id).filter((id): id is number => id != null);
  const live = ids.length
    ? await client.query(
        `SELECT id, component_variant_id, component_quantity FROM pos_modifiers
         WHERE store_id = $1 AND id = ANY($2::bigint[])`,
        [storeId, ids]
      )
    : { rows: [] as Array<Record<string, unknown>> };
  const liveById = new Map(live.rows.map((r) => [Number(r.id), r]));
  const components: ComponentInput[] = [];
  const out = snapshot.map((m, i) => {
    const row = m.modifier_id == null ? undefined : liveById.get(m.modifier_id);
    if (row && row.component_variant_id != null) {
      components.push({
        component_variant_id: Number(row.component_variant_id),
        quantity: Number(row.component_quantity),
      });
    }
    return {
      modifier_id: row ? m.modifier_id : null,
      group_name: m.group_name,
      name: m.name,
      price_delta_cents: m.price_delta_cents,
      sort_order: i,
    };
  });
  return { snapshot: out, names: out.map((m) => m.name), components };
}
