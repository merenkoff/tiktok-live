// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk. Same
// pattern as `fiscal-checkbox/manifest.ts`.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const CashalotTillPage = lazyWithRetry(() =>
  import('./pages/CashalotTillPage').then((m) => ({ default: m.CashalotTillPage }))
);
const CashalotAdminPage = lazyWithRetry(() =>
  import('./pages/CashalotAdminPage').then((m) => ({ default: m.CashalotAdminPage }))
);

export const FISCAL_CASHALOT_MODULE_ID = 'fiscal-cashalot';

/**
 * Cashalot's own provider UI (ПРРО track CA, phase CA6): `/fiscal` (till —
 * shift control, cash in/out) and `/admin/fiscal` (owner — the three
 * credentials, the tax table and the test mode, connection test, the
 * attention list). The same two mounts as `fiscal-checkbox`, because a store
 * carries exactly one `fiscal-*` remote (`assertSingleFiscalRemote`) and the
 * host's nav expects the same paths from whichever it is.
 *
 * `alwaysEnabled: true` and no `ownerOnly` — the same two decisions, for the
 * same reasons, as the Checkbox manifest explains.
 */
export const fiscalCashalotModule: RemoteModuleDescriptor = {
  id: FISCAL_CASHALOT_MODULE_ID,
  title: 'Фіскалізація (Cashalot)',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  routes: [
    { path: '/fiscal/*', element: CashalotTillPage },
    { path: 'fiscal', mount: 'admin', element: CashalotAdminPage },
  ],
  nav: [
    {
      to: '/fiscal',
      label: 'Зміна',
      icon: 'ShieldCheck',
      location: 'cashier-primary',
      order: 90,
      match: '/fiscal',
    },
    { to: '/admin/fiscal', label: 'Фіскалізація', location: 'admin-sidebar', order: 65 },
  ],
};
