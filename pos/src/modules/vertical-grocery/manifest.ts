// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A type-only import: pulling the registry in for real would drag every other
// module's manifest (and their lazy pages) into this bundle.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const GroceryCatalog = lazyWithRetry(() => import('./GroceryCatalog'));

/**
 * The grocery sales vertical — the sell screen of a corner shop or a market
 * stall, where packed goods are scanned and loose ones weighed
 * (TechDocs/grocery/G4_WEIGHED.md §6).
 *
 * The catalog slot only, for now: no route and no nav entry, as the café had
 * in К2. Its `module_remotes` entry still names a `routePath` and one nav
 * item, because both sanitisers refuse an object entry without them — they
 * shape the desktop's `pending` placeholder while the bundle downloads, and
 * the descriptor's own empty nav wins once it has.
 *
 * What a grocery adds later lands here, not in the host: a scale's label
 * barcode with the weight inside it (Г6), a connected scale (Г9).
 *
 * `alwaysEnabled` and not `ownerOnly`, for the reasons `vertical-flowers`
 * gives: the entry in `module_remotes` is the opt-in, and the sell screen is
 * the sellers'.
 */
export const verticalGroceryModule: RemoteModuleDescriptor = {
  id: 'vertical-grocery',
  title: 'Продукти',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  sales: { Catalog: GroceryCatalog },
  routes: [],
  nav: [],
};
