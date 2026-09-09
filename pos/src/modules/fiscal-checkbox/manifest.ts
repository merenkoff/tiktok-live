// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk. Same
// pattern as `tiktok-live/manifest.ts`.
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const CheckboxTillPage = lazyWithRetry(() =>
  import('./pages/CheckboxTillPage').then((m) => ({ default: m.CheckboxTillPage }))
);
const CheckboxAdminPage = lazyWithRetry(() =>
  import('./pages/CheckboxAdminPage').then((m) => ({ default: m.CheckboxAdminPage }))
);

export const FISCAL_CHECKBOX_MODULE_ID = 'fiscal-checkbox';

/**
 * Checkbox's own provider UI: `/fiscal` (till — shift control) and
 * `/admin/fiscal` (owner — credentials, connection test, list of documents
 * the retry cron gave up on).
 *
 * `alwaysEnabled: true`, matching `tiktok-live`: the module opts a store in
 * through `pos_stores.module_remotes`, not `enabled_modules` — there is
 * nothing for the bundled toggleable-module gate to check.
 *
 * Deliberately NO `ownerOnly: true` on the descriptor — that flag is
 * module-scoped and would take the till's shift screen away from every
 * seller. Owner-only for the admin route comes for free from `mount: 'admin'`
 * (`renderRoutes.tsx` wraps `/admin` in `<Guard ownerOnly>`).
 */
export const fiscalCheckboxModule: RemoteModuleDescriptor = {
  id: FISCAL_CHECKBOX_MODULE_ID,
  title: 'Фіскалізація (Checkbox)',
  shells: ['web', 'cashier'],
  alwaysEnabled: true,
  routes: [
    { path: '/fiscal/*', element: CheckboxTillPage },
    { path: 'fiscal', mount: 'admin', element: CheckboxAdminPage },
  ],
  nav: [
    {
      to: '/fiscal',
      label: 'Зміна',
      icon: 'Receipt',
      location: 'cashier-primary',
      order: 90,
      match: '/fiscal',
    },
    { to: '/admin/fiscal', label: 'Фіскалізація', location: 'admin-sidebar', order: 65 },
  ],
};
