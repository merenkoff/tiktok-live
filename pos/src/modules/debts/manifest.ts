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
// The desktop till also writes handovers without a network (PR3, §6): its
// own Dexie keeps a mirror of who may take credit and a queue of what was
// given, and the `offline` hooks below are how the shell's runtime sends that
// queue and counts it in «Очікує синк». Repayments stay online (decision Д7).
// The «ПІД ЗАПИС» slip prints only on a desktop whose «Обладнання» names a
// printer for the station below — not printed by default, the owner's
// decision.

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';
import { pendingCount, syncIssues } from './data/sync';
import { DEBTS_MODULE_ID, DEBTS_SLIP_STATION } from './lib/ids';

const DebtsRoutes = lazyWithRetry(() => import('./pages/DebtsRoutes').then((m) => ({ default: m.DebtsRoutes })));
const CheckoutAction = lazyWithRetry(() => import('./components/CheckoutAction'));
const CustomerPanel = lazyWithRetry(() => import('./components/CustomerPanel'));
const DebtPanels = lazyWithRetry(() => import('./components/DebtPanels'));

export { DEBTS_MODULE_ID };

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
  hardware: {
    stations: [
      {
        id: DEBTS_SLIP_STATION,
        title: 'Квитанції під запис',
        hint: 'Квитанція для покупця, коли товар записано під запис. Без принтера квитанція не друкується.',
      },
    ],
  },
  offline: { pendingCount, sync: syncIssues },
};
