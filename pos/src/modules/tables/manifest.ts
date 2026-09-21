// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Столи» — the waiter's hall map and the bills on it (phase К4e,
// TechDocs/POS_TABLES.md).
//
// Its OWN module rather than screens inside `vertical-cafe`, for three
// reasons the doc spells out in §4.11: a `module_remotes` entry carries
// exactly one `routePath` and the café spent its on `/kitchen`;
// `assertSingleVerticalRemote` constrains only `vertical-*` keys, so this one
// is free; and tables are not a vertical at all — a bar or a pizzeria takes
// this module without becoming a coffee shop. The consequence worth naming:
// the module's PRESENCE is the «restaurant» switch, which is why there is no
// `pos_stores.service_mode` column and is not going to be one.
//
// Delivered like `tiktok-live` and `stocktake`: the shell ships none of this
// code, a store opts in with an object entry in `pos_stores.module_remotes`.
// No `offline` hooks — К4j gives the module its own Dexie as a READ mirror,
// and a mirror is not a queue (`ModuleOfflineHooks` describes rows waiting
// for the server, and there are none).

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const TablesRoutes = lazyWithRetry(() =>
  import('./pages/TablesRoutes').then((m) => ({ default: m.TablesRoutes }))
);

export const TABLES_MODULE_ID = 'tables';

export const tablesModule: RemoteModuleDescriptor = {
  id: TABLES_MODULE_ID,
  title: 'Столи',
  shells: ['web', 'cashier'],
  alwaysEnabled: true,
  // Splat, matching the shape `placeholderDescriptor` uses for the
  // not-yet-downloaded state; `TablesRoutes` nests the map and (К4f) the bill.
  routes: [{ path: '/tables/*', element: TablesRoutes }],
  nav: [
    // `Grid3X3` is in the host's `NAV_ICONS` allowlist. Keep in sync with the
    // `icon` in the store's `module_remotes` entry (the placeholder).
    {
      to: '/tables',
      label: 'Столи',
      icon: 'Grid3X3',
      location: 'cashier-primary',
      order: 60,
      match: '/tables',
    },
  ],
};
