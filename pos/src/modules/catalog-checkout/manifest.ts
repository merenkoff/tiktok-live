// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import { RegisterPage } from '../../pages/register/RegisterPage';
import type { ModuleDescriptor } from '../types';

// Lazy: the morning list is not on the path of ringing a sale, and the sell
// screen must not pay for it on boot.
const PreordersPage = lazy(() =>
  import('../../pages/orders/PreordersPage').then((m) => ({ default: m.PreordersPage }))
);

/** The sell screen (catalog grid + cart + checkout). Core — a POS without it is not a POS. */
export const catalogCheckoutModule: ModuleDescriptor = {
  id: 'catalog-checkout',
  title: 'Продажі (каса)',
  core: true,
  shells: ['web', 'cashier', 'tablet'],
  routes: [
    { path: '/register', element: RegisterPage, eager: true },
    // Pre-orders live here rather than in a vertical module: the backend is
    // core for the same reason, and a cart taken now to be rung later is this
    // module's business (TechDocs/POS_FLORIST_BENCH.md §14).
    { path: '/orders', element: PreordersPage },
  ],
  nav: [
    { to: '/register', label: 'Каса', icon: 'Grid3X3', location: 'cashier-primary', order: 10 },
    {
      to: '/orders',
      label: 'Замовлення',
      icon: 'CalendarClock',
      location: 'cashier-primary',
      order: 20,
      match: '/orders',
    },
  ],
};
