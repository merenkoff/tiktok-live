// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CatalogItem } from '@pos/platform';

/**
 * A card the bench may offer as a component.
 *
 * A composite cannot contain another composite — one level, enforced
 * server-side by `validateComponents` — so a bouquet card in the stem grid
 * could only ever produce a refusal the florist cannot act on. Filtering it
 * out is the same rule as `componentOptions.ts` applies in the owner's
 * composition editor, stated once on each side of the counter.
 */
export function isAssemblable(item: CatalogItem): boolean {
  return (item.kind ?? 'simple') !== 'composite';
}

/**
 * A card the florist's bench opens on: a composite the shop assembles when it
 * sells. An `own` bouquet is one already standing in a bucket — that one is
 * rung like any other product, because its stems were written off by the
 * production document days ago and taking them again would double-count.
 */
export function isAssembledOnSale(item: CatalogItem): boolean {
  return item.kind === 'composite' && item.stock_mode === 'derived';
}
