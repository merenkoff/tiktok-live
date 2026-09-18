// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A type-only import: pulling the registry in for real would drag every other
// module's manifest (and their lazy pages) into this bundle.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const ShowcasePage = lazyWithRetry(() => import('./pages/ShowcasePage'));
const FlowerAnalyticsPage = lazyWithRetry(() => import('./pages/FlowerAnalyticsPage'));
const FlowersCatalog = lazyWithRetry(() => import('./FlowersCatalog'));
const FlowerPanels = lazyWithRetry(() => import('./panels/FlowerPanels'));
const FloristLabourCard = lazyWithRetry(() => import('./settings/FloristLabourCard'));

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
  // Three of §13's figures on the owner's «Сьогодні». A slot rather than a
  // second page, and without a fallback: a store that never loaded this module
  // sees its dashboard exactly as before (TechDocs/POS_FLORIST_BENCH.md §15).
  analytics: { Panels: FlowerPanels },
  // What the shop charges for assembling a bouquet. It used to sit on the
  // host's Settings page, where a clothing store saw it too — see §16.
  settings: { Card: FloristLabourCard },
  // «Вітрина» is what the route actually shows now: the bouquets standing in
  // the window and the write-off for one that did not sell. The old page only
  // reported that the module was live, which the nav entry already does.
  // Two surfaces, like `tiktok-live`: the root mount is the till's window, the
  // admin mount is the owner's numbers. Owner-only by construction —
  // `renderRoutes` wraps every `/admin` route in `<Guard ownerOnly>`.
  routes: [
    { path: '/flowers/*', element: ShowcasePage },
    { path: 'flowers', mount: 'admin', element: FlowerAnalyticsPage },
  ],
  nav: [
    {
      to: '/flowers',
      label: 'Вітрина',
      icon: 'Flower2',
      location: 'cashier-primary',
      order: 80,
      match: '/flowers',
    },
    // The florist's analytics live here rather than as panels on «Сьогодні»:
    // this is the module's own surface, so it appears only in a shop that has
    // the module, and a CDN outage cannot take the core dashboard with it.
    { to: '/admin/flowers', label: 'Квіти', location: 'admin-sidebar', order: 55 },
  ],
};
