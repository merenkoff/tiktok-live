// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { StaffPage } from '../../pages/admin/StaffPage';
import type { ModuleDescriptor } from '../types';

/** Seller accounts + PIN management. Owner-only, web. */
export const staffModule: ModuleDescriptor = {
  id: 'staff',
  title: 'Співробітники',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [{ path: 'staff', mount: 'admin', element: StaffPage }],
  nav: [{ to: '/admin/staff', label: 'Співробітники', location: 'admin-sidebar', order: 60 }],
};
