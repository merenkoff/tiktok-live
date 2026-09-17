// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Which module renders the catalog half of the sell screen.
 *
 * The store's vertical names a module (`vertical-<id>`); everything except
 * clothing arrives as an online-only remote. Three things make that module
 * absent at the worst possible moment, and all three end the same way — with
 * the bundled clothing catalog, so the till can always sell:
 *
 *  - on the web a remote that 404s or fails its signature check simply does not
 *    exist (no nav entry, no route, no placeholder — `applyModuleRemotes` only
 *    synthesises those on the desktop);
 *  - on a desktop till's first cold boot it has not been downloaded yet, and
 *    the registry holds a `pending` placeholder with no code behind it;
 *  - a module that loads can still throw on render (`CatalogBoundary`).
 */

import type { AnyModuleDescriptor } from './registry';
import { allModules } from './registry';
import type { ModuleSalesSlot } from './types';

export const VERTICAL_MODULE_PREFIX = 'vertical-';
export const FALLBACK_VERTICAL_MODULE_ID = 'vertical-clothing';

/** Why the store's own vertical module did not supply the catalog. */
export type FallbackReason = 'missing' | 'pending' | 'no_sales_slot' | 'render_error';

export interface ResolvedSalesCatalog {
  Catalog: ModuleSalesSlot['Catalog'];
  moduleId: string;
  source: 'vertical' | 'fallback';
  reason?: FallbackReason;
}

export function verticalModuleId(vertical: string | undefined): string {
  return `${VERTICAL_MODULE_PREFIX}${vertical ?? 'clothing'}`;
}

export function resolveSalesCatalog(
  vertical: string | undefined,
  modules: AnyModuleDescriptor[] = allModules()
): ResolvedSalesCatalog {
  const wanted = verticalModuleId(vertical);
  const own = modules.find((m) => m.id === wanted);
  if (own && !('pending' in own && own.pending) && own.sales?.Catalog) {
    return { Catalog: own.sales.Catalog, moduleId: wanted, source: 'vertical' };
  }

  // Bundled and core, so this is always here — but a descriptor without a
  // catalog would be a build error waiting to happen, so say so loudly.
  const fallback = modules.find((m) => m.id === FALLBACK_VERTICAL_MODULE_ID);
  if (!fallback?.sales?.Catalog) {
    throw new Error(`${FALLBACK_VERTICAL_MODULE_ID} must declare sales.Catalog`);
  }
  return {
    Catalog: fallback.sales.Catalog,
    moduleId: FALLBACK_VERTICAL_MODULE_ID,
    source: 'fallback',
    reason: !own ? 'missing' : 'pending' in own && own.pending ? 'pending' : 'no_sales_slot',
  };
}
