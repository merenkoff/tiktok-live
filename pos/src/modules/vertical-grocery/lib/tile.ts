// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { displayUnit, isWeighed } from '@pos/platform';
import type { CatalogItem } from '@pos/platform';

type TileVariant = Pick<
  CatalogItem,
  'price_cents' | 'compare_at_cents' | 'price_per' | 'unit' | 'quantity'
>;

/** What one product tile says: the props `ProductTile` takes, decided here. */
export interface GroceryTile {
  /** Absent when the card's variants have no one price worth naming. */
  priceCents?: number;
  /** «кг» or «л» after a weighed price — «189,90 ₴/кг». */
  priceUnit?: string;
  /** The old price beside the price, when it belongs to that price. */
  compareAtCents: number | null;
  /** Pieces on the shelf; absent for anything sold by weight. */
  stock?: number;
  disabled: boolean;
}

/**
 * The tile of a grocery card.
 *
 * A packed card reads as any shop's: its cheapest price, the pieces on the
 * shelf, greyed at none. A weighed one names its price per kilogram (or
 * litre) and is never greyed or «немає», because the scale, not the books, is
 * the truth about a cheese (TechDocs/grocery/G4_WEIGHED.md, decision 6). A
 * card mixing the two — a cheese by weight and the same cheese in a 200 g
 * pack — names no price at all: the cheapest of a price per kilogram and a
 * price per pack means nothing.
 *
 * The old price follows the rule the clothing tile has (`tileCompareAt`):
 * every variant at the price shown must carry the same one, or none is shown.
 * Unlike the fallback catalog, a weighed card keeps it — «229,90 → 189,90
 * ₴/кг» is the promotion a grocery runs most, and the cart already prices its
 * old price per kilogram the same way.
 */
export function groceryTile(variants: readonly TileVariant[]): GroceryTile {
  if (variants.length === 0) return { compareAtCents: null, disabled: true };
  const weighed = variants.filter((v) => isWeighed(v.price_per));

  if (weighed.length > 0 && weighed.length < variants.length) {
    return { compareAtCents: null, disabled: false };
  }

  const minPrice = Math.min(...variants.map((v) => v.price_cents));
  const compareAtCents = oldPriceAt(variants, minPrice);

  if (weighed.length === variants.length) {
    // A kilogram and a litre on one card are two prices with nothing between.
    const units = new Set(variants.map((v) => displayUnit(v.unit, v.price_per)));
    if (units.size > 1) return { compareAtCents: null, disabled: false };
    return {
      priceCents: minPrice,
      priceUnit: [...units][0],
      compareAtCents,
      disabled: false,
    };
  }

  const stock = variants.reduce((sum, v) => sum + v.quantity, 0);
  return { priceCents: minPrice, compareAtCents, stock, disabled: stock <= 0 };
}

function oldPriceAt(variants: readonly TileVariant[], price: number): number | null {
  let old: number | null | undefined;
  for (const v of variants) {
    if (v.price_cents !== price) continue;
    const mine = v.compare_at_cents ?? null;
    if (old === undefined) old = mine;
    else if (old !== mine) return null;
  }
  return old != null && old > price ? old : null;
}
