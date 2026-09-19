// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/modifiers.ts — the till's mirror of how the server reads a
// line's modifiers («вівсяне +15», «без цукру»).
//
// The server is the authority: `resolveLineModifiers`, `lineCaption` and
// `cleanLineNote` in `src/pos/modifiers.service.ts`, and the merge key in
// `sales.service.ts`. This copy exists for the same reason `bouquet.ts` does:
// the till has to show a price on the «Додати» button before the line exists,
// merge two identical lattes into one row the way the server will, and print
// an `OFF-` receipt with no network — and every one of those has to agree with
// what lands at sync. `src/__tests__/pos.modifiers.test.ts` pins the server's
// numbers and messages; `modifiers.test.ts` pins these against the same cases.
//
// One rule that is easy to get backwards: `is_default` is a hint for the
// screen and nothing else. The server never applies it, so the ids a default
// pre-selects are sent explicitly on the one-tap path, and an offline mirror
// prices from the ids in the payload, never from the defaults.

import type { CatalogItem, CatalogModifier, CatalogModifierGroup } from '../types';

/** Mirrors `pos_sale_items.note VARCHAR(120)`. */
export const MAX_LINE_NOTE = 120;

/**
 * One chosen modifier as a cart line records it — the shape of the sale-line
 * snapshot (`pos_sale_item_modifiers`), minus the sort order, which is the
 * array's.
 */
export interface CartLineModifier {
  id: number;
  group_name: string;
  name: string;
  /** Signed. */
  price_delta_cents: number;
}

/** What the sheet hands the cart: the answers, and the kitchen note. */
export interface CartLineChoice {
  modifiers?: number[];
  note?: string;
}

export interface ResolvedLineModifiers {
  /** The chosen answers in group order, then the group's own order. */
  snapshot: CartLineModifier[];
  /** Σ price deltas, signed. */
  deltaCents: number;
  /** For the composed caption, same order as `snapshot`. */
  names: string[];
  /** What the answers write off, per one unit of the line, aggregated by variant. */
  components: Array<{ component_variant_id: number; quantity: number }>;
  /**
   * Why the server would refuse this choice, in the server's own words — so
   * the sheet can disable «Додати» with the sentence the checkout would have
   * answered. `null` when the choice is one the server accepts. The figures
   * above are computed over the known answers regardless, so a live price can
   * be shown next to the error.
   */
  error: string | null;
}

/** The kitchen note as stored: trimmed and bounded, never null. */
export function cleanLineNote(raw: string | null | undefined): string {
  if (raw == null) return '';
  return raw.trim().slice(0, MAX_LINE_NOTE);
}

/** Modifier ids as a line names them on the wire: distinct positive integers, ascending. */
export function normalizeModifierIds(ids: readonly number[] | undefined): number[] {
  return [...new Set(ids ?? [])]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
}

/**
 * A cart line's identity, mirroring the key the server merges lines on
 * (`plainLines` in `sales.service.ts`): variant, sorted modifier ids, note.
 *
 * A line with neither keeps the bare variant id, so every uid that existed
 * before modifiers is unchanged and a repeat scan still lands on the same row.
 */
export function cartLineUid(variantId: number, ids: readonly number[], note: string): string {
  const sorted = normalizeModifierIds(ids);
  if (sorted.length === 0 && !note) return String(variantId);
  return `${variantId}|${sorted.join(',')}|${note}`;
}

interface Hit {
  group: CatalogModifierGroup;
  groupIndex: number;
  modifier: CatalogModifier;
  /** Position inside the group, which is the group's `sort_order, id` order on the wire. */
  index: number;
}

/**
 * What a line's modifiers mean, or why they would be refused. Pure: `groups`
 * is the product's groups as the catalog carries them (`CatalogItem.
 * modifier_groups`, active only, in order), `ids` the line's choice in any
 * order. Same ordering and the same sentences as the server.
 */
export function resolveLineModifiers(
  groups: readonly CatalogModifierGroup[],
  ids: readonly number[]
): ResolvedLineModifiers {
  const owner = new Map<number, Hit>();
  groups.forEach((group, groupIndex) => {
    group.modifiers.forEach((modifier, index) => {
      owner.set(modifier.id, { group, groupIndex, modifier, index });
    });
  });

  let error: string | null = null;
  const chosen: Hit[] = [];
  for (const id of normalizeModifierIds(ids)) {
    const hit = owner.get(id);
    if (!hit) {
      error ??= `Модифікатор ${id} недоступний для цього товару`;
      continue;
    }
    chosen.push(hit);
  }

  const counts = new Map<number, number>();
  for (const hit of chosen) counts.set(hit.group.id, (counts.get(hit.group.id) ?? 0) + 1);
  for (const group of groups) {
    if (error) break;
    const n = counts.get(group.id) ?? 0;
    if (n < group.min_select) {
      error =
        group.min_select === 1
          ? `Оберіть «${group.name}»`
          : `«${group.name}»: оберіть щонайменше ${group.min_select}`;
    } else if (n > group.max_select) {
      error = `«${group.name}»: не більше ${group.max_select}`;
    }
  }

  chosen.sort((a, b) => a.groupIndex - b.groupIndex || a.index - b.index);

  const totals = new Map<number, number>();
  let deltaCents = 0;
  const snapshot: CartLineModifier[] = [];
  const names: string[] = [];
  for (const { group, modifier } of chosen) {
    deltaCents += modifier.price_delta_cents;
    names.push(modifier.name);
    snapshot.push({
      id: modifier.id,
      group_name: group.name,
      name: modifier.name,
      price_delta_cents: modifier.price_delta_cents,
    });
    if (modifier.component_variant_id != null && modifier.component_quantity != null) {
      totals.set(
        modifier.component_variant_id,
        (totals.get(modifier.component_variant_id) ?? 0) + modifier.component_quantity
      );
    }
  }

  return {
    snapshot,
    deltaCents,
    names,
    components: [...totals.entries()].map(([component_variant_id, quantity]) => ({
      component_variant_id,
      quantity,
    })),
    error,
  };
}

/**
 * The caption a line with modifiers gets — «M · вівсяне · без цукру» — the
 * variant's own label first, then the answers in group order. It is what the
 * server stores in `variant_label`, so the cart row, the receipt and the
 * refund screen all read one string. The kitchen note is never part of it.
 */
export function lineCaption(variantLabel: string, modifierNames: readonly string[]): string {
  return [variantLabel.trim(), ...modifierNames].filter(Boolean).join(' · ').slice(0, 255);
}

/**
 * `compare_at` moves by the same delta as the price, as it does on the server:
 * a +20 ₴ double shot on a discounted card would otherwise read as a smaller
 * discount — or, past the old price, as a negative one — on the receipt.
 */
export function shiftCompareAt(
  compare: number | null | undefined,
  deltaCents: number
): number | null {
  if (compare == null) return null;
  return compare + deltaCents;
}

function defaultsOf(group: CatalogModifierGroup): CatalogModifier[] {
  return group.modifiers.filter((m) => m.is_default).slice(0, group.max_select);
}

/** The ids `is_default` pre-selects, per group, capped at what the group takes. */
export function defaultModifierIds(groups: readonly CatalogModifierGroup[]): number[] {
  return groups.flatMap((group) => defaultsOf(group).map((m) => m.id));
}

/**
 * Whether a tap on the tile can add the line as it is, or has to ask first:
 * more than one variant to pick from, or a required group whose defaults do
 * not answer it. An optional group never opens the sheet on a tap — the
 * tile's «⋯» does that — which is what makes «як завжди» one tap.
 */
export function needsModifierSheet(
  variants: readonly CatalogItem[],
  groups: readonly CatalogModifierGroup[]
): boolean {
  if (variants.length > 1) return true;
  return groups.some((group) => defaultsOf(group).length < group.min_select);
}

/**
 * The groups a product asks, read off whichever of its variants carries them.
 * Groups hang off the product, so every variant of one card answers the same
 * questions; a variant of an older snapshot may simply not carry the field.
 */
export function groupsOf(variants: readonly CatalogItem[]): CatalogModifierGroup[] {
  return variants.find((v) => v.modifier_groups?.length)?.modifier_groups ?? [];
}
