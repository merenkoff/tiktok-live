// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleId } from './types';

/** Always available — never stored, never toggleable. Mirrors backend `CORE_MODULE_IDS`. */
export const CORE_MODULE_IDS: readonly ModuleId[] = ['catalog-checkout', 'settings', 'hardware'];

/**
 * The set a store gets when it has never configured `enabled_modules` (fresh
 * install, or a client reading an older cached auth). Mirrors backend
 * `DEFAULT_ENABLED_MODULES` and the migration backfill.
 */
export const DEFAULT_ENABLED_MODULE_IDS: readonly ModuleId[] = [
  'returns',
  'customers',
  'products',
  'stock',
  'analytics',
  'staff',
  'gtin-enrichment',
  'qr-payment',
];

export function isCoreModule(id: ModuleId): boolean {
  return CORE_MODULE_IDS.includes(id);
}
