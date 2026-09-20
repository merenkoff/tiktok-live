// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A type-only import: pulling the registry in for real would drag every other
// module's manifest (and their lazy pages) into this bundle.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const CafeCatalog = lazyWithRetry(() => import('./CafeCatalog'));

/**
 * The café sales vertical — the counter's sell screen (TechDocs/POS_CAFE.md).
 *
 * Only the catalog slot in К2: the menu with its questions (`ModifierSheet`
 * is host UI, the tap rule is here). The kitchen board (К3) will be the first
 * route this module owns; until then it declares none, and the `module_remotes`
 * entry's `routePath`/`nav` only shape the desktop's placeholder tile while
 * the bundle downloads (POS_VERTICALS.md §7m).
 *
 * `alwaysEnabled` and not `ownerOnly`, for the reasons `vertical-flowers`
 * gives: the entry in `module_remotes` is the opt-in, and the sell screen is
 * the sellers'.
 */
export const verticalCafeModule: RemoteModuleDescriptor = {
  id: 'vertical-cafe',
  title: 'Кафе',
  shells: ['web', 'cashier'],
  alwaysEnabled: true,
  sales: { Catalog: CafeCatalog },
  routes: [],
  nav: [],
};
