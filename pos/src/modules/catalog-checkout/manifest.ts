// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import { useAuthStore } from '@pos/platform';
import { RegisterPage } from '../../pages/register/RegisterPage';
import type { ModuleDescriptor } from '../types';

// Lazy: the morning list is not on the path of ringing a sale, and the sell
// screen must not pay for it on boot.
const PreordersPage = lazy(() =>
  import('../../pages/orders/PreordersPage').then((m) => ({ default: m.PreordersPage }))
);

// The bar's open bottles (track ДК, ДК5): core like the pre-orders, because
// its backend is core and the stamps it scans are the sell screen's business.
const BottlesPage = lazy(() =>
  import('../../pages/bottles/BottlesPage').then((m) => ({ default: m.BottlesPage }))
);

/** «Пляшки» only where something is poured from a stamped bottle — read at login. */
function pours(): boolean {
  return useAuthStore.getState().auth?.store.bottles === true;
}

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
    { path: '/bottles', element: BottlesPage },
    { path: 'bottles', mount: 'admin', element: BottlesPage, props: { admin: true } },
  ],
  nav: [
    { to: '/register', label: 'Каса', icon: 'ShoppingCart', location: 'cashier-primary', order: 10 },
    {
      to: '/orders',
      label: 'Замовлення',
      icon: 'CalendarClock',
      location: 'cashier-primary',
      order: 20,
      match: '/orders',
    },
    {
      to: '/bottles',
      label: 'Пляшки',
      icon: 'ClipboardCheck',
      location: 'cashier-primary',
      order: 25,
      visible: pours,
    },
    { to: '/admin/bottles', label: 'Пляшки', location: 'admin-sidebar', order: 33, group: 'catalog', visible: pours },
  ],
};
