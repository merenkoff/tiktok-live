// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/modules.ts
// Per-store feature-module gating. Mirrors the frontend registry
// (pos/src/modules/constants.ts) — keep the two id lists in sync.

/** Always available — never stored in `pos_stores.enabled_modules`, never toggleable. */
export const CORE_MODULE_IDS = ['catalog-checkout', 'settings', 'hardware'] as const;

/**
 * The set a store gets when `enabled_modules` is empty ("never configured").
 * Matches the `015_pos_store_modules.sql` backfill.
 */
export const DEFAULT_ENABLED_MODULES = [
  'returns',
  'customers',
  'products',
  'stock',
  'analytics',
  'staff',
  'gtin-enrichment',
  'qr-payment',
] as const;

/** Every id that may legitimately appear in `enabled_modules` (excludes core). */
export const TOGGLEABLE_MODULE_IDS = [...DEFAULT_ENABLED_MODULES, 'live-selling'] as const;

const CORE_SET: ReadonlySet<string> = new Set(CORE_MODULE_IDS);
const TOGGLEABLE_SET: ReadonlySet<string> = new Set(TOGGLEABLE_MODULE_IDS);

export function isCoreModuleId(id: string): boolean {
  return CORE_SET.has(id);
}

export function isKnownToggleableModuleId(id: string): boolean {
  return TOGGLEABLE_SET.has(id);
}

/** Resolve the effective enabled set for a store (empty stored set → defaults). */
export function effectiveEnabledModules(stored: string[] | null | undefined): string[] {
  return stored && stored.length > 0 ? stored : [...DEFAULT_ENABLED_MODULES];
}

/** Is `moduleId` available for a store with this stored `enabled_modules`? */
export function isModuleEnabled(stored: string[] | null | undefined, moduleId: string): boolean {
  if (isCoreModuleId(moduleId)) return true;
  return effectiveEnabledModules(stored).includes(moduleId);
}

/**
 * Keep only real, non-core module ids from a client-supplied list, de-duplicated.
 * Unknown ids are dropped silently; core ids are never persisted.
 */
export function sanitizeEnabledModules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (isKnownToggleableModuleId(id)) seen.add(id);
  }
  return [...seen];
}
