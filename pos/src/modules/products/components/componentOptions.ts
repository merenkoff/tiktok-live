// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { Product } from '@pos/platform';

/** One thing that can go into a composite, flattened out of the catalogue. */
export interface ComponentOption {
  variant_id: number;
  caption: string;
  unit: string;
  quantity: number;
}

/**
 * Everything a composite may be assembled from: every active variant of a
 * product that is not itself composite. One level deep is the server's rule
 * too — it makes cycles impossible without a recursive check.
 */
export function componentOptions(products: Product[], excludeProductId?: number): ComponentOption[] {
  const options: ComponentOption[] = [];
  for (const product of products) {
    if (!product.is_active) continue;
    if (product.kind === 'composite') continue;
    if (excludeProductId != null && product.id === excludeProductId) continue;
    for (const variant of product.variants) {
      if (!variant.is_active) continue;
      options.push({
        variant_id: variant.id,
        caption: variant.label ? `${product.name} · ${variant.label}` : product.name,
        unit: variant.unit,
        quantity: variant.quantity,
      });
    }
  }
  return options.sort((a, b) => a.caption.localeCompare(b.caption, 'uk'));
}
