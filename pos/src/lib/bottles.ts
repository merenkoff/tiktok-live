// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// New bottles at the till (track ДК, ДК5, TechDocs/POS_DUAL_REGISTER.md §4.4).
// A pour — a shot, a glass, coffee with cognac — that would have to open a
// bottle the server has no stamp for is refused (`409 bottle_needed`, Д4)
// with every such bottle at once; the till asks for their stamps on the same
// sheet as a whole bottle's and pays again with `open_bottles`. Nothing was
// written by the refusal, so the retry is an ordinary sale.
//
// Pure: the sheet's lines and the request's field are built here, and the
// page keeps the two lists in its own state — the cart store never sees them,
// because a stamp of a bottle the bar opens belongs to no line.

import type { ExciseStampLine } from '../components/cashier/ExciseStampSheet';
import type { OpenBottleStamp } from '../types';

/** One bottle the server could not open without its stamp. */
export interface NeededBottle {
  variant_id: number;
  /** «Горілка Хортиця · 0,5 л» — the server's caption. */
  product_name: string;
  /** How many new bottles of it this cart opens. */
  count: number;
}

export type { OpenBottleStamp };

const PREFIX = 'bottle:';

/** The sheet line of a bottle to open, beside the cart's own stamped lines. */
export function bottleStampLines(
  needed: readonly NeededBottle[],
  stamps: readonly OpenBottleStamp[]
): ExciseStampLine[] {
  return needed.map((bottle) => ({
    uid: `${PREFIX}${bottle.variant_id}`,
    product_name: `Нова пляшка: ${bottle.product_name}`,
    quantity: bottle.count,
    excise_per_unit: true,
    excise_labels: stamps.filter((s) => s.variant_id === bottle.variant_id).map((s) => s.excise_label),
  }));
}

/** The variant a sheet line opens, or null for a cart line. */
export function bottleOfUid(uid: string): number | null {
  if (!uid.startsWith(PREFIX)) return null;
  const id = Number(uid.slice(PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Replace one bottle's stamps with what the sheet now holds. */
export function setBottleStamps(
  stamps: readonly OpenBottleStamp[],
  variantId: number,
  labels: readonly string[]
): OpenBottleStamp[] {
  return [
    ...stamps.filter((s) => s.variant_id !== variantId),
    ...labels.map((excise_label) => ({ variant_id: variantId, excise_label })),
  ];
}

/**
 * What the next refusal asks for, on top of what was already scanned: the
 * server spends the stamps it was sent first and names only the bottles still
 * missing, so a bottle's line asks for both.
 */
export function mergeNeeded(
  needed: readonly NeededBottle[],
  stamps: readonly OpenBottleStamp[],
  refused: readonly NeededBottle[]
): NeededBottle[] {
  const out = new Map<number, NeededBottle>();
  for (const bottle of needed) {
    const have = stamps.filter((s) => s.variant_id === bottle.variant_id).length;
    if (have > 0) out.set(bottle.variant_id, { ...bottle, count: have });
  }
  for (const bottle of refused) {
    const have = stamps.filter((s) => s.variant_id === bottle.variant_id).length;
    out.set(bottle.variant_id, { ...bottle, count: have + bottle.count });
  }
  return [...out.values()];
}

/** Bottles still short of a stamp — the sheet opens before payment while any is. */
export function bottlesMissingStamps(needed: readonly NeededBottle[], stamps: readonly OpenBottleStamp[]): number {
  return needed.reduce(
    (sum, bottle) =>
      sum + Math.max(0, bottle.count - stamps.filter((s) => s.variant_id === bottle.variant_id).length),
    0
  );
}

/** The request's field, or nothing at all when there is no stamp to send. */
export function openBottlesField(stamps: readonly OpenBottleStamp[]): { open_bottles?: OpenBottleStamp[] } {
  return stamps.length > 0 ? { open_bottles: stamps.map((s) => ({ ...s })) } : {};
}

/** The refusal's `bottles`, read defensively — a body from an older API has none. */
export function readNeededBottles(raw: unknown): NeededBottle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const r = row as Partial<NeededBottle> | null;
    const variantId = Number(r?.variant_id);
    const count = Number(r?.count);
    if (!Number.isInteger(variantId) || variantId <= 0 || !Number.isInteger(count) || count <= 0) return [];
    return [{ variant_id: variantId, product_name: String(r?.product_name ?? 'Пляшка'), count }];
  });
}

/**
 * The sentence over the stamps sheet when the till asked before payment —
 * the server's own words for `bottle_needed`, so the cashier reads the same
 * thing whichever side noticed first.
 */
export function bottleNeededText(needed: readonly NeededBottle[]): string {
  const names = needed
    .map((b) => (b.count > 1 ? `«${b.product_name}» — ${b.count} пляшки` : `«${b.product_name}»`))
    .join(', ');
  return `Відкрийте нову пляшку: ${names} — скануйте її акцизну марку`;
}
