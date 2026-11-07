// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import type { ModuleDescriptor } from '../types';
import { useAuthStore } from '@pos/platform';

/** A store with a kitchen publishes a guest menu; an auth cached before `dishFacts` reads as «yes». */
function hasKitchen(): boolean {
  return useAuthStore.getState().auth?.store.vertical?.dishFacts !== false;
}

const SettingsPage = lazy(() =>
  import('../../pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const QrMenuPage = lazy(() =>
  import('../../pages/admin/QrMenuPage').then((m) => ({ default: m.QrMenuPage }))
);
const AppearancePage = lazy(() =>
  import('../../pages/admin/AppearancePage').then((m) => ({ default: m.AppearancePage }))
);

/** Store settings — including the module checklist itself, so it can never be disabled. */
export const settingsModule: ModuleDescriptor = {
  id: 'settings',
  title: 'Налаштування',
  core: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [
    { path: 'settings', mount: 'admin', element: SettingsPage },
    // Menu appearance lives here, in a core module, for the same reason the
    // module checklist does: a store must never be able to turn off the screen
    // that undoes what it did to its own menus.
    { path: 'appearance', mount: 'admin', element: AppearancePage },
    // The guest's QR menu and what it says about the place — the owner's and
    // the café marketer's (track МР). The page itself says nothing to a store
    // without a kitchen; the menu entry is only shown to one that has it.
    { path: 'qr-menu', mount: 'admin', element: QrMenuPage, roles: ['owner', 'marketer'] },
  ],
  nav: [
    { to: '/admin/settings', label: 'Налаштування', location: 'admin-sidebar', order: 70 },
    { to: '/admin/appearance', label: 'Вигляд меню', location: 'admin-sidebar', order: 75 },
    {
      to: '/admin/qr-menu',
      label: 'QR-меню',
      icon: 'QrCode',
      location: 'admin-sidebar',
      order: 65,
      roles: ['owner', 'marketer'],
      visible: hasKitchen,
    },
  ],
};
