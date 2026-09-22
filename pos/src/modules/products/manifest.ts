// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from '../types';
import { lazyWithRetry } from '../lazyWithRetry';

const ProductsPage = lazyWithRetry(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage }))
);
const ModifiersPage = lazyWithRetry(() =>
  import('./pages/ModifiersPage').then((m) => ({ default: m.ModifiersPage }))
);
const TechCardsPage = lazyWithRetry(() =>
  import('./pages/TechCardsPage').then((m) => ({ default: m.TechCardsPage }))
);

/** Product / variant / tag catalog management. Owner-only, web build only. */
export const productsModule: ModuleDescriptor = {
  id: 'products',
  title: 'Товари',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [
    { path: 'products', mount: 'admin', element: ProductsPage },
    // The questions a product may ask («Молоко?») and their answers. Host code,
    // not café code: the next vertical that asks a question reuses it.
    { path: 'modifiers', mount: 'admin', element: ModifiersPage },
    // What a composite costs to assemble, and what share of its price that is.
    { path: 'tech-cards', mount: 'admin', element: TechCardsPage },
  ],
  nav: [
    { to: '/admin/products', label: 'Товари', location: 'admin-sidebar', order: 20 },
    // Shown to every owner, not only a café: a clothing shop CAN make a product
    // composite (phase A), so hiding the screen from it would be a lie. Where
    // there is nothing to show, the page says so and points at the product card.
    { to: '/admin/tech-cards', label: 'Техкарти', location: 'admin-sidebar', order: 21 },
    { to: '/admin/modifiers', label: 'Модифікатори', location: 'admin-sidebar', order: 22 },
    {
      to: '/admin/products',
      label: 'Товари',
      icon: 'Package',
      location: 'cashier-primary',
      order: 35,
      // The web cashier rail gives owners a shortcut into the catalog; the bottom bar does not.
      visible: (ctx) => ctx.shell === 'web' && ctx.role === 'owner' && ctx.variant === 'rail',
    },
  ],
};
