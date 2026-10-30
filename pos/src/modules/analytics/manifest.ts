// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import type { ModuleDescriptor } from '../types';
import { useAuthStore } from '@pos/platform';

const DashboardPage = lazy(() =>
  import('../../pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const ReviewsPage = lazy(() =>
  import('../../pages/admin/ReviewsPage').then((m) => ({ default: m.ReviewsPage }))
);

/**
 * Guests write from the QR menu, which only a store with a kitchen has — so
 * «Відгуки» is for a café or a restaurant, not a boutique. `dishFacts` is the
 * kitchen's mark on the wire; an auth cached before it reads as «yes», exactly
 * as the product form does with its dish facts.
 */
function hasGuestMenu(): boolean {
  return useAuthStore.getState().auth?.store.vertical?.dishFacts !== false;
}

/** The "Сьогодні" dashboard — the `/admin` index route. Owner-only, web. */
export const analyticsModule: ModuleDescriptor = {
  id: 'analytics',
  title: 'Аналітика',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [
    { index: true, mount: 'admin', element: DashboardPage },
    { path: 'reviews', mount: 'admin', element: ReviewsPage },
  ],
  nav: [
    { to: '/admin', end: true, label: 'Сьогодні', location: 'admin-sidebar', order: 10 },
    { to: '/admin/reviews', label: 'Відгуки', location: 'admin-sidebar', order: 12, visible: hasGuestMenu },
  ],
};
