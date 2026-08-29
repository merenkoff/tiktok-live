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
  | 'upc_dev';

export interface GtinHint {
  gtin: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  best_source: GtinSource | string | null;
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

export const DEFAULT_SOURCE_PRIORITY: GtinSource[] = [
  'open_products_facts',
  'upc_dev',
  'upcitemdb',
  'open_beauty_facts',
  'open_food_facts',
  'manual',
];

export function sourcePriorityList(): string[] {
  const env = process.env.GTIN_SOURCE_PRIORITY?.trim();
  if (!env) return [...DEFAULT_SOURCE_PRIORITY];
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Higher = better. Unknown sources get 0. */
export function sourceScore(source: string): number {
  const list = sourcePriorityList();
  const idx = list.indexOf(source);
  if (idx === -1) return 0;
  return list.length - idx;
}
