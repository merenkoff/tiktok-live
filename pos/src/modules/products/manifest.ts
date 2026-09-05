// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Package } from 'lucide-react';
import type { ModuleDescriptor } from '../types';
import { lazyWithRetry } from '../lazyWithRetry';

const ProductsPage = lazyWithRetry(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage }))
);

/** Product / variant / tag catalog management. Owner-only, web build only. */
export const productsModule: ModuleDescriptor = {
  id: 'products',
  title: 'Товари',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [{ path: 'products', mount: 'admin', element: ProductsPage }],
  nav: [
    { to: '/admin/products', label: 'Товари', location: 'admin-sidebar', order: 20 },
    {
      to: '/admin/products',
      label: 'Товари',
      icon: Package,
      location: 'cashier-primary',
      order: 35,
      // The web cashier rail gives owners a shortcut into the catalog; the bottom bar does not.
      visible: (ctx) => ctx.shell === 'web' && ctx.role === 'owner' && ctx.variant === 'rail',
    },
  ],
};
