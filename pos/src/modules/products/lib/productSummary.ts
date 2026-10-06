// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One line under a product's name in the list (C1e, PR3): «4 варіанти ·
// 350–420 ₴ · 12 шт». The list used to draw every variant as a table row under
// every product, so a catalogue of sixty cards was a screen of three hundred
// rows; the row now says the three things the owner scans for and opens the
// rest on a tap.

import { formatUahCompact } from '@pos/platform';
import type { Product, ProductVariant } from '@pos/platform';
import { ukPlural } from '../../../lib/plural';

export function pluralVariants(n: number): string {
  return `${n} ${ukPlural(n, 'варіант', 'варіанти', 'варіантів')}`;
}

/** «420 ₴», or «350–420 ₴» when the variants are not all one price. */
export function priceRange(variants: ReadonlyArray<Pick<ProductVariant, 'price_cents'>>): string | null {
  if (variants.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of variants) {
    if (v.price_cents < min) min = v.price_cents;
    if (v.price_cents > max) max = v.price_cents;
  }
  if (min === max) return formatUahCompact(min);
  return `${formatUahCompact(min).replace(/\s₴$/, '')}–${formatUahCompact(max)}`;
}

/**
 * What is on the shelf, across the card. A product with stock of its own sums
 * its variants (with the unit when they share one). A `derived` composite has
 * no stock of its own — its figure is what the components allow — and those
 * figures share components, so a sum would promise bouquets that cannot all
 * be made: it says «Можна зібрати: N» for one variant and «до N» for several.
 */
export function stockSummary(
  product: Pick<Product, 'kind' | 'stock_mode'>,
  variants: ReadonlyArray<Pick<ProductVariant, 'quantity' | 'unit'>>
): string | null {
  if (variants.length === 0) return null;
  const derived = product.kind === 'composite' && product.stock_mode === 'derived';
  if (derived) {
    const most = Math.max(...variants.map((v) => v.quantity ?? 0));
    return variants.length === 1 ? `Можна зібрати: ${most}` : `Можна зібрати: до ${most}`;
  }
  const total = variants.reduce((sum, v) => sum + (v.quantity ?? 0), 0);
  const units = new Set(variants.map((v) => v.unit));
  return units.size === 1 ? `${total} ${variants[0]!.unit}` : String(total);
}

/**
 * The variants a row speaks for: the live ones — or, for a card in the
 * archive, all of them, because archiving took every variant down with the
 * card and «Без варіантів» would hide exactly what «Повернути» brings back.
 */
export function rowVariants<V extends Pick<ProductVariant, 'is_active'>>(
  product: { is_active?: boolean; variants: V[] }
): V[] {
  return product.is_active === false ? product.variants : product.variants.filter((v) => v.is_active);
}

/** The whole line, parts joined with « · »; «Без варіантів» for a card with none. */
export function productSummary(product: Product): string {
  const variants = rowVariants(product);
  if (variants.length === 0) return 'Без варіантів';
  const parts = [pluralVariants(variants.length), priceRange(variants), stockSummary(product, variants)];
  return parts.filter((p): p is string => Boolean(p)).join(' · ');
}
