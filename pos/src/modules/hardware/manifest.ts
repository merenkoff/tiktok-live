// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import { ScanLine } from 'lucide-react';
import type { ModuleDescriptor } from '../types';

const HardwarePage = lazy(() =>
  import('../../pages/HardwarePage').then((m) => ({ default: m.HardwarePage }))
);

/** Scanner / printer setup + app update. Cashier (desktop) shell only; always on there. */
export const hardwareModule: ModuleDescriptor = {
  id: 'hardware',
  title: 'Обладнання',
  core: true,
  coreInShell: 'cashier',
  shells: ['cashier'],
  routes: [{ path: '/hardware', element: HardwarePage }],
  nav: [
    {
      to: '/hardware',
      label: 'Обладнання',
      icon: ScanLine,
      location: 'cashier-primary',
      order: 40,
      indicator: 'update',
    },
  ],
};
