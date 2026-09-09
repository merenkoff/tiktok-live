// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Інвентаризація» — the seller counts stock on the till, scanner in hand,
// with or without a network, and the sheet lands on the server as a draft
// `inventory` document the owner posts from the web (roadmap #12 track 3,
// TechDocs/POS_MODULE_OFFLINE_DATA.md — this is the worked example).
//
// Delivered like `tiktok-live`: the shell ships none of this code, a store
// opts in with an object entry in `pos_stores.module_remotes`. Unlike it, the
// module keeps its own offline data (`data/db.ts`) and declares `offline`
// hooks, which the host registers with the shell's offline runtime.

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';
import { pendingCount, syncSheets } from './data/sync';

const StocktakeRoutes = lazyWithRetry(() =>
  import('./pages/StocktakeRoutes').then((m) => ({ default: m.StocktakeRoutes }))
);

export const STOCKTAKE_MODULE_ID = 'stocktake';

export const stocktakeModule: RemoteModuleDescriptor = {
  id: STOCKTAKE_MODULE_ID,
  title: 'Інвентаризація',
  shells: ['web', 'cashier'],
  alwaysEnabled: true,
  // Splat, matching the shape `placeholderDescriptor` uses for the
  // not-yet-downloaded state; `StocktakeRoutes` nests the list and the sheet.
  routes: [{ path: '/stocktake/*', element: StocktakeRoutes }],
  nav: [
    // `ClipboardCheck` is in the host's `NAV_ICONS` allowlist. Keep in sync
    // with the `icon` in the store's `module_remotes` entry (the placeholder).
    {
      to: '/stocktake',
      label: 'Інвентаризація',
      icon: 'ClipboardCheck',
      location: 'cashier-primary',
      order: 70,
      match: '/stocktake',
    },
  ],
  offline: { pendingCount, sync: syncSheets },
};
