// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { Product } from '@pos/platform';
import { componentOptions, type ComponentOption } from '../components/componentOptions';

/**
 * What a modifier's answer may take off the shelf: any active variant, a
 * recipe included (the server expands it at checkout, so there is no depth
 * cap) — with the INGREDIENTS first. An answer nearly always writes off
 * something the shop does not sell by itself (milk, syrup, a slice of
 * cheese), and typing «сир» in a pizzeria must not put «4 сира · 30 см»
 * above the cheese.
 */
export function ingredientOptions(
  products: Product[],
  opts: { excludeProductId?: number; maxDepth?: number } = {}
): ComponentOption[] {
  const ingredient = new Set<number>();
  for (const product of products) {
    if (product.sellable !== false) continue;
    for (const variant of product.variants) ingredient.add(variant.id);
  }
  // A modifier's answer may take anything (no depth cap); a recipe passes its
  // own limits — never itself, and a recipe inside only where the vertical allows.
  const options = componentOptions(products, { maxDepth: 99, ...opts });
  return [
    ...options.filter((option) => ingredient.has(option.variant_id)),
    ...options.filter((option) => !ingredient.has(option.variant_id)),
  ];
}
