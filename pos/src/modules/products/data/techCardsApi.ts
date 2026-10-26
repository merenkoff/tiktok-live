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

/** «Імпорт техкарт» (TechDocs/POS_ONBOARDING.md, O3) — mirrors `src/pos/techcards-import.service.ts`. */
export interface TechCardImportDish {
  dish: string;
  variant: string | null;
  components: Array<{ ingredient: string; quantity: number; unit: string; is_new: boolean }>;
  cost_cents: number | null;
  price_cents: number | null;
  food_cost_bps: number | null;
  becomes: 'derived' | 'replaced' | null;
  error: string | null;
}

export interface TechCardImportResult {
  ok: boolean;
  applied: boolean;
  errors: string[];
  warnings: string[];
  dishes: TechCardImportDish[];
  ingredients: Array<{ name: string; unit: string; cost_cents: number | null; is_new: boolean; price_changed: boolean }>;
  totals: { dishes: number; becomes_derived: number; replaced: number; ingredients_new: number; prices_set: number };
}

/**
 * The plan for the owner's table (`apply: false`), or its write (`apply:
 * true`, all or nothing — a plan with errors comes back `applied: false`).
 */
export function importTechCards(
  rows: Array<{ line: number; dish: string; variant: string; ingredient: string; quantity: string; unit: string; price: string }>,
  apply: boolean
): Promise<TechCardImportResult> {
  return api.posRequest<TechCardImportResult>('post', '/products/tech-cards/import', { rows, apply }, { timeout: 120_000 });
}
