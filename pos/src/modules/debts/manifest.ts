// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Борги» — goods given «під запис» and paid off later (grocery phase Г3,
// TechDocs/grocery/G3_DEBTS.md). For every vertical (decision Д1): a village
// clothing shop gives «до зарплати» as surely as a grocery does.
//
// A module of its own, delivered like `tables` (the owner's decision of
// 2026-10-24: features are external modules). The shell ships none of this
// code; a store opts in with an object entry in `pos_stores.module_remotes`,
// and its presence IS the switch — there is no `enabled_modules` id for it.
//
// It lives mostly on screens the host owns, through the Г2 slots (platform
// 20): «Під запис» beside «Оплатити», the debt under the chosen customer and
// on the customer's card, three figures on «Сьогодні». Its own screen is the
// notebook — who owes, and one customer's statement — mounted twice, in the
// till's frame and in the owner's cabinet.
//
// Online only in this release (PR2). The desktop's offline handover queue and
// the paper slip come with PR3, which is where `offline` and
// `hardware.stations` will appear here.

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const DebtsRoutes = lazyWithRetry(() => import('./pages/DebtsRoutes').then((m) => ({ default: m.DebtsRoutes })));
const CheckoutAction = lazyWithRetry(() => import('./components/CheckoutAction'));
const CustomerPanel = lazyWithRetry(() => import('./components/CustomerPanel'));
const DebtPanels = lazyWithRetry(() => import('./components/DebtPanels'));

export const DEBTS_MODULE_ID = 'debts';

export const debtsModule: RemoteModuleDescriptor = {
  id: DEBTS_MODULE_ID,
  title: 'Борги',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  routes: [
    // The till's notebook. A splat, matching the shape `placeholderDescriptor`
    // uses for the not-yet-downloaded state.
    { path: '/debts/*', element: DebtsRoutes, props: { frame: 'till' } },
    // The same notebook in the owner's cabinet: the web's `/admin` is where the
    // owner works, and leaving it for the till's frame to read a statement
    // would drop them out of the cabinet.
    { path: 'debts/*', mount: 'admin', element: DebtsRoutes, props: { frame: 'admin' } },
  ],
  nav: [
    // `Wallet` is in the host's `NAV_ICONS` allowlist. Keep in sync with the
    // `icon` in the store's `module_remotes` entry (the placeholder).
    { to: '/debts', label: 'Борги', icon: 'Wallet', location: 'cashier-primary', order: 55, match: '/debts' },
    { to: '/admin/debts', label: 'Борги', icon: 'Wallet', location: 'admin-sidebar', order: 42 },
  ],
  checkout: { Action: CheckoutAction },
  customer: { Panel: CustomerPanel },
  analytics: { Panels: DebtPanels },
};
