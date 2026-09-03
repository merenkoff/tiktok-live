// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import type { ModuleDescriptor } from '../types';

const DashboardPage = lazy(() =>
  import('../../pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);

/** The "Сьогодні" dashboard — the `/admin` index route. Owner-only, web. */
export const analyticsModule: ModuleDescriptor = {
  id: 'analytics',
  title: 'Аналітика',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [{ index: true, mount: 'admin', element: DashboardPage }],
  nav: [{ to: '/admin', end: true, label: 'Сьогодні', location: 'admin-sidebar', order: 10 }],
};
