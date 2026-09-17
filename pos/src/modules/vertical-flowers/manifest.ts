// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A type-only import: pulling the registry in for real would drag every other
// module's manifest (and their lazy pages) into this bundle.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const FlowersHomePage = lazyWithRetry(() => import('./pages/FlowersHomePage'));
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
  routes: [{ path: '/flowers/*', element: FlowersHomePage }],
  nav: [
    {
      to: '/flowers',
      label: 'Квіти',
      icon: 'Flower2',
      location: 'cashier-primary',
      order: 80,
      match: '/flowers',
    },
  ],
};
