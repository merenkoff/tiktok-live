// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import type { ModuleDescriptor } from '../types';

const SettingsPage = lazy(() =>
  import('../../pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

/** Store settings — including the module checklist itself, so it can never be disabled. */
export const settingsModule: ModuleDescriptor = {
  id: 'settings',
  title: 'Налаштування',
  core: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [{ path: 'settings', mount: 'admin', element: SettingsPage }],
  nav: [{ to: '/admin/settings', label: 'Налаштування', location: 'admin-sidebar', order: 70 }],
};
