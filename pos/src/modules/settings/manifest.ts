// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import type { ModuleDescriptor } from '../types';

const SettingsPage = lazy(() =>
  import('../../pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const AppearancePage = lazy(() =>
  import('../../pages/admin/AppearancePage').then((m) => ({ default: m.AppearancePage }))
);

/** Store settings — including the module checklist itself, so it can never be disabled. */
export const settingsModule: ModuleDescriptor = {
  id: 'settings',
  title: 'Налаштування',
  core: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [
    { path: 'settings', mount: 'admin', element: SettingsPage },
    // Menu appearance lives here, in a core module, for the same reason the
    // module checklist does: a store must never be able to turn off the screen
    // that undoes what it did to its own menus.
    { path: 'appearance', mount: 'admin', element: AppearancePage },
  ],
  nav: [
    { to: '/admin/settings', label: 'Налаштування', location: 'admin-sidebar', order: 70 },
    { to: '/admin/appearance', label: 'Вигляд меню', location: 'admin-sidebar', order: 75 },
  ],
};
