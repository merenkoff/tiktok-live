// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import { Users } from 'lucide-react';
import type { ModuleDescriptor } from '../types';

const CustomersPage = lazy(() =>
  import('../../pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage }))
);

/** Customer directory. Same page in the cashier chrome (`cashierShell`) and embedded in admin. */
export const customersModule: ModuleDescriptor = {
  id: 'customers',
  title: 'Клієнти',
  defaultEnabled: true,
  shells: ['web', 'cashier'],
  routes: [
    { path: '/customers', element: CustomersPage, props: { cashierShell: true } },
    { path: 'customers', mount: 'admin', element: CustomersPage },
  ],
  nav: [
    { to: '/customers', label: 'Клієнти', icon: Users, location: 'cashier-primary', order: 20 },
    { to: '/admin/customers', label: 'Клієнти', location: 'admin-sidebar', order: 40 },
  ],
};
