// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CatalogItem } from '@pos/platform';

type Priced = Pick<CatalogItem, 'price_cents' | 'compare_at_cents'>;

/**
 * The old price a product tile may show beside the price it shows.
 *
 * A tile says the card's CHEAPEST price, so the only old price it may put next
 * to it is one that belongs to that price: every variant priced at the minimum
 * must carry the same markdown. A card where only some sizes are marked down,
 * or where a dearer size is the marked-down one, gets no «було» on the tile —
 * the picker says it per size — because an old price next to a size that never
 * had it is a lie on the shelf.
 */
export function tileCompareAt(variants: readonly Priced[]): number | null {
  if (variants.length === 0) return null;
  const min = Math.min(...variants.map((v) => v.price_cents));
  let old: number | null | undefined;
  for (const v of variants) {
    if (v.price_cents !== min) continue;
    const mine = v.compare_at_cents ?? null;
    if (old === undefined) old = mine;
    else if (old !== mine) return null;
  }
  return old != null && old > min ? old : null;
}
