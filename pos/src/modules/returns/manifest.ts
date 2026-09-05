// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ListOrdered, Receipt } from 'lucide-react';
import type { ModuleDescriptor, NavCtx } from '../types';
import { lazyWithRetry } from '../lazyWithRetry';

const TillReceiptsPage = lazyWithRetry(() =>
  import('./pages/TillReceiptsPage').then((m) => ({ default: m.TillReceiptsPage }))
);
const AdminSalesPage = lazyWithRetry(() =>
  import('./pages/AdminSalesPage').then((m) => ({ default: m.AdminSalesPage }))
);

/** Owner on the web build reaches receipts through the admin page; everyone else gets the till screen. */
const isOwnerWeb = (ctx: NavCtx): boolean => ctx.shell === 'web' && ctx.role === 'owner';

/** Receipt lookup + refunds/cancellations. Toggleable; on by default. */
export const returnsModule: ModuleDescriptor = {
  id: 'returns',
  title: 'Чеки та повернення',
  defaultEnabled: true,
  shells: ['web', 'cashier'],
  routes: [
    { path: '/sales', element: TillReceiptsPage },
    { path: 'sales', mount: 'admin', element: AdminSalesPage },
  ],
  nav: [
    {
      to: '/admin/sales',
      label: 'Продажі',
      icon: ListOrdered,
      location: 'cashier-primary',
      order: 30,
      visible: isOwnerWeb,
    },
    {
      to: '/sales',
      label: 'Чеки',
      icon: Receipt,
      location: 'cashier-primary',
      order: 30,
      visible: (ctx) => !isOwnerWeb(ctx),
    },
    { to: '/admin/sales', label: 'Продажі', location: 'admin-sidebar', order: 50 },
  ],
};
