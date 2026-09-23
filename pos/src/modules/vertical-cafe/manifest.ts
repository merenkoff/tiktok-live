// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A type-only import: pulling the registry in for real would drag every other
// module's manifest (and their lazy pages) into this bundle.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const CafeCatalog = lazyWithRetry(() => import('./CafeCatalog'));
const KitchenPage = lazyWithRetry(() => import('./kitchen/KitchenPage'));

/**
 * The café sales vertical — the counter's sell screen and the kitchen's board
 * (TechDocs/POS_CAFE.md).
 *
 * The catalog slot (К2): the menu with its questions (`ModifierSheet` is host
 * UI, the tap rule is here). The kitchen board `/kitchen` (К3c) is the first
 * route this module owns — a root mount, so both shells render it inside the
 * host's `CashierLayout`; the `module_remotes` entry's `routePath`/`nav` must
 * now name the same path and label, since the desktop's placeholder tile
 * stands in for it until the bundle downloads (POS_VERTICALS.md §7m).
 *
 * `alwaysEnabled` and not `ownerOnly`, for the reasons `vertical-flowers`
 * gives: the entry in `module_remotes` is the opt-in, and the sell screen and
 * the board are the sellers'.
 */
export const verticalCafeModule: RemoteModuleDescriptor = {
  id: 'vertical-cafe',
  title: 'Кафе',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  sales: { Catalog: CafeCatalog },
  routes: [{ path: '/kitchen/*', element: KitchenPage }],
  nav: [
    {
      to: '/kitchen',
      label: 'Кухня',
      icon: 'ClipboardList',
      location: 'cashier-primary',
      order: 80,
      match: '/kitchen',
    },
  ],
};
