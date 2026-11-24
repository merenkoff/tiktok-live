// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Роздача» — the waiter marks what of a kitchen round they carried to the
// table (TechDocs/POS_PASS.md, phase B2).
//
// A round goes to the kitchen whole and comes out in parts — the borscht now,
// the varenyky in ten minutes — carried by whoever is free. This screen lists
// what is still to be carried, table by table, and one tap «Несу» records it;
// the kitchen board then shows the round as partly carried.
//
// Its own module, on top of `tables`: without tables there are no bills and
// no rounds to carry. A remote cannot declare that dependency itself
// (`requires` is dropped from a remote's descriptor), so the server refuses
// `pass` in `module_remotes` without `tables`, and the page says so if it
// ever meets a store like that anyway. Delivered like `tables`: the shell
// ships none of this code. No `offline` hooks and no mirror — a plate is
// carried NOW, and a tap that cannot reach the server is said to need it.

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '@host/modules/registry';
import { lazyWithRetry } from '@host/modules/lazyWithRetry';

const PassRoutes = lazyWithRetry(() => import('./pages/PassRoutes').then((m) => ({ default: m.PassRoutes })));

export const PASS_MODULE_ID = 'pass';

export const passModule: RemoteModuleDescriptor = {
  id: PASS_MODULE_ID,
  title: 'Роздача',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  routes: [{ path: '/pass/*', element: PassRoutes }],
  nav: [
    // `UtensilsCrossed` is in the host's `NAV_ICONS` allowlist. Keep in sync
    // with the `icon` of the store's `module_remotes` entry (the placeholder).
    {
      to: '/pass',
      label: 'Роздача',
      icon: 'UtensilsCrossed',
      location: 'cashier-primary',
      order: 61,
      match: '/pass',
    },
  ],
};
