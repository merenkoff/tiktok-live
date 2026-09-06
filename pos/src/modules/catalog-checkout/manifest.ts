// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { RegisterPage } from '../../pages/register/RegisterPage';
import type { ModuleDescriptor } from '../types';

/** The sell screen (catalog grid + cart + checkout). Core — a POS without it is not a POS. */
export const catalogCheckoutModule: ModuleDescriptor = {
  id: 'catalog-checkout',
  title: 'Продажі (каса)',
  core: true,
  shells: ['web', 'cashier'],
  routes: [{ path: '/register', element: RegisterPage, eager: true }],
  nav: [
    { to: '/register', label: 'Каса', icon: 'Grid3X3', location: 'cashier-primary', order: 10 },
  ],
};
