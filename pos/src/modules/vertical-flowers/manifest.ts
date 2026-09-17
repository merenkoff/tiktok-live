// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A type-only import: pulling the registry in for real would drag every other
// module's manifest (and their lazy pages) into this bundle.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const ShowcasePage = lazyWithRetry(() => import('./pages/ShowcasePage'));
const FlowersCatalog = lazyWithRetry(() => import('./FlowersCatalog'));

/**
 * The flower-shop sales vertical — the first one that reaches a store as an
 * online-only module rather than shipping in the app.
 *
 * `alwaysEnabled`: being in `pos_stores.module_remotes` is the opt-in, and the
 * server already refuses an entry that disagrees with `pos_stores.vertical`
 * (`assertSingleVerticalRemote`), so there is nothing for a second switch in
 * Settings to mean.
 *
 * Not `ownerOnly`: that flag is module-scoped and would take the sell screen
 * away from the sellers who use it.
 */
export const verticalFlowersModule: RemoteModuleDescriptor = {
  id: 'vertical-flowers',
  title: 'Квіти',
  shells: ['web', 'cashier'],
  alwaysEnabled: true,
  sales: { Catalog: FlowersCatalog },
  // «Вітрина» is what the route actually shows now: the bouquets standing in
  // the window and the write-off for one that did not sell. The old page only
  // reported that the module was live, which the nav entry already does.
  routes: [{ path: '/flowers/*', element: ShowcasePage }],
  nav: [
    {
      to: '/flowers',
      label: 'Вітрина',
      icon: 'Flower2',
      location: 'cashier-primary',
      order: 80,
      match: '/flowers',
    },
  ],
};
