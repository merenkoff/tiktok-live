// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/bouquet.ts — the till's mirror of how the server prices and names
// a bouquet assembled at the counter.
//
// The server is the authority: `priceOfComposition` + `withLabour` in
// `src/pos/composites.service.ts`, and `customBouquetLabel` in
// `sales.service.ts`. This file exists because the desktop till has to show the
// customer a price and print an `OFF-` receipt with no network, and the two
// answers have to agree to the kopeck once the sale syncs. Any change on one
// side is a change on both — `src/__tests__/pos.composites.test.ts` pins the
// server's numbers and `bouquet.test.ts` pins these against the same cases.

import type { CatalogItem } from '../types';

export interface BouquetComponent {
  component_variant_id: number;
  /** Per one unit of the bouquet, in the component's own unit. */
  quantity: number;
}

/**
 * Add the store's assembly charge to a parts sum.
 *
 * Mirrors `withLabour`. `Math.round` is the tie-breaker both sides use, so a
 * half-kopeck lands the same way here and in Postgres.
 */
export function withLabour(partsCents: number, labourBps: number): number {
  if (!Number.isFinite(labourBps) || labourBps <= 0) return partsCents;
  return partsCents + Math.round((partsCents * labourBps) / 10000);
}

/**
 * What one bouquet costs: its stems at catalogue price, plus the assembly
 * charge. A component the snapshot does not know counts as 0 rather than
 * throwing — a stale mirror should misprice by one stem, not refuse the sale.
 */
export function priceOfComponents(
  components: BouquetComponent[],
  catalogByVariantId: Map<number, Pick<CatalogItem, 'price_cents'>>,
  labourBps: number
): number {
  const parts = components.reduce((sum, row) => {
    const price = catalogByVariantId.get(row.component_variant_id)?.price_cents ?? 0;
    return sum + price * row.quantity;
  }, 0);
  return withLabour(parts, labourBps);
}

/**
 * The caption for a bouquet assembled at the counter — mirrors
 * `customBouquetLabel`. Short because it is what a 32-character ПРРО receipt
 * prints next to the product name.
 */
export function customBouquetLabel(components: BouquetComponent[]): string {
  const stems = components.reduce((sum, row) => sum + row.quantity, 0);
  return `${stems} ${pluralStems(stems)}`;
}

function pluralStems(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'стебел';
  switch (n % 10) {
    case 1:
      return 'стебло';
    case 2:
    case 3:
    case 4:
      return 'стебла';
    default:
      return 'стебел';
  }
}
