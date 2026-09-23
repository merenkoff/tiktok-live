// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Typed wrapper over the host's `api.posRequest` for the owner's tech cards —
// the `vertical-cafe/kitchen/kitchenApi.ts` shape. Nothing here is a new
// export of `@pos/platform`, which is what keeps this module on platform 15
// and means К5d re-releases `products` alone.

import { api } from '@pos/platform';

/** One row of «Техкарти» — mirrors `TechCardRow` in `src/pos/composites.service.ts`. */
export interface TechCardRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  label: string;
  unit: string;
  kind: 'composite';
  stock_mode: 'own' | 'derived';
  /** What it sells for. */
  price_cents: number;
  /** What it costs to assemble, at the LAST purchase prices of its leaves. */
  cost_cents: number;
  /** Shelves it takes from, expanded. Zero = a recipe that is empty. */
  leaf_count: number;
  /** At least one leaf has never been received with a price. */
  has_unpriced_leaf: boolean;
  /**
   * Cost as a share of price, in basis points (2500 = 25 %). **Null** when it
   * cannot be told honestly — and the screen must then say «—» and why, never
   * 0 %: zero per cent here is a number the owner would reprice on.
   */
  food_cost_bps: number | null;
}

/**
 * Every composite the store sells, with what it costs to assemble.
 *
 * `posRequest` is called as a METHOD of `api`, never as a detached function:
 * it is a class method that reaches its axios client through `this`, and a
 * detached call fails inside the host before any request leaves the page.
 */
export function listTechCards(): Promise<TechCardRow[]> {
  return api.posRequest<TechCardRow[]>('get', '/products/tech-cards');
}
