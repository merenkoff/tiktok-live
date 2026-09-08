// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/types.ts

export type GtinSource =
  | 'manual'
  | 'open_products_facts'
  | 'open_food_facts'
  | 'open_beauty_facts'
  | 'upcitemdb'
  /**
   * Retired. upc.dev was dropped for fabricating answers (see
   * `TechDocs/POS_GTIN_ENRICHMENT.md`); the value stays in the union only so
   * rows it already wrote still map. It is absent from the priority list, so it
   * scores 0 and loses to every live source — the next real lookup replaces it.
   */
  | 'upc_dev';

export interface GtinHint {
  gtin: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  best_source: GtinSource | string | null;
  /**
   * Tombstone: an owner cleared this entry, and no automatic source may refill
   * it until the block is lifted. `name` is null whenever this is true.
   */
  blocked: boolean;
  filled_at: Date;
  updated_at: Date;
}

export interface GtinLookupResult {
  source: GtinSource | string;
  found: boolean;
  name?: string | null;
  brand?: string | null;
  image_url?: string | null;
  raw?: unknown;
}

/**
 * Merge order, best first.
 *
 * `manual` leads on purpose: a name a human typed is the only source that was
 * looked at by someone who had the physical item in hand. It used to sit last,
 * which made the cache asymmetric — a cashier's correction was overwritten by
 * the next automatic lookup on that barcode, so a wrong name was effectively
 * permanent for every store sharing the cache.
 */
export const DEFAULT_SOURCE_PRIORITY: GtinSource[] = [
  'manual',
  'open_products_facts',
  'upcitemdb',
  'open_beauty_facts',
  'open_food_facts',
];

export function sourcePriorityList(): string[] {
  const env = process.env.GTIN_SOURCE_PRIORITY?.trim();
  if (!env) return [...DEFAULT_SOURCE_PRIORITY];
  const list = env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // An override that forgets `manual` would score it 0 and quietly bring the
  // old asymmetry back. Stickiness is a product rule, not a tuning knob.
  return list.includes('manual') ? list : ['manual', ...list];
}

/** Higher = better. Unknown sources get 0. */
export function sourceScore(source: string): number {
  const list = sourcePriorityList();
  const idx = list.indexOf(source);
  if (idx === -1) return 0;
  return list.length - idx;
}
