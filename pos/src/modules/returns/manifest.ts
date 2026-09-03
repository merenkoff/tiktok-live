// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ListOrdered, Receipt } from 'lucide-react';
import { CashierSalesPage } from '../../pages/sales/CashierSalesPage';
import { SalesPage } from '../../pages/admin/SalesPage';
import type { ModuleDescriptor, NavCtx } from '../types';

/** Owner on the web build reaches receipts through the admin page; everyone else gets the till screen. */
const isOwnerWeb = (ctx: NavCtx): boolean => ctx.shell === 'web' && ctx.role === 'owner';

/** Receipt lookup + refunds/cancellations. Toggleable; on by default. */
export const returnsModule: ModuleDescriptor = {
  id: 'returns',
  title: 'Чеки та повернення',
  defaultEnabled: true,
  shells: ['web', 'cashier'],
  routes: [
    { path: '/sales', element: CashierSalesPage },
    { path: 'sales', mount: 'admin', element: SalesPage },
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
