// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The first real **online-only** feature module (roadmap #13): the POS shell
// ships none of this code. It reaches a store because its owner registered it
// as an object entry in `pos_stores.module_remotes` —
//
//   "tiktok-live": { url, title, routePath: "/live", nav: [...], icon: "Video" }
//
// — which is also what `alwaysEnabled` below means: being in `module_remotes`
// IS the opt-in, so there is nothing to tick in the Settings module checklist
// and `tiktok-live` is not a valid `enabled_modules` id.
//
// `id` must be exactly the key used in `module_remotes`, or `applyModuleRemotes`
// rejects the descriptor the remote exports and falls back to the placeholder.

// Type-only import (erased at build time — this does NOT pull the bundled
// registry, and every manifest with it, into the remote chunk).
import type { RemoteModuleDescriptor } from '../registry';
import { lazyWithRetry } from '../lazyWithRetry';

const LiveDeskPage = lazyWithRetry(() =>
  import('./pages/LiveDeskPage').then((m) => ({ default: m.LiveDeskPage }))
);
const LiveSettingsPage = lazyWithRetry(() =>
  import('./pages/LiveSettingsPage').then((m) => ({ default: m.LiveSettingsPage }))
);

export const TIKTOK_LIVE_MODULE_ID = 'tiktok-live';

export const tiktokLiveModule: RemoteModuleDescriptor = {
  id: TIKTOK_LIVE_MODULE_ID,
  title: 'Прямий ефір',
  shells: ['web', 'cashier'],
  alwaysEnabled: true,
  // Two surfaces, not one screen shown twice. `mount` already carries the
  // chrome, the audience and the shell: the root mount is the operational desk
  // for whoever is running the till, the admin mount is owner-only by
  // construction (`renderRoutes` wraps `/admin` in `<Guard ownerOnly>`) and
  // web-only, so it holds the configuration. `returns` splits the same way.
  //
  // This cannot be done by branching inside one component: on the web both
  // `/live` and `/admin/live` report shell `'web'`.
  routes: [
    // Splat, matching the shape `placeholderDescriptor` uses for the
    // not-yet-downloaded state, so the URL is the same either way.
    { path: '/live/*', element: LiveDeskPage },
    { path: 'live', mount: 'admin', element: LiveSettingsPage },
  ],
  nav: [
    // `Video` is in the host's `NAV_ICONS` allowlist (`platform/icons.ts`); an
    // unknown name would silently resolve to the `Puzzle` fallback. Keep this in
    // sync with the `icon` in the store's `module_remotes` entry, which is what
    // the desktop placeholder renders before the module is downloaded.
    {
      to: '/live',
      label: 'Ефір',
      icon: 'Video',
      location: 'cashier-primary',
      order: 85,
      match: '/live',
    },
    // Admin sidebar reaches the settings, not the feed — the owner opens the
    // feed itself from the till rail.
    { to: '/admin/live', label: 'Прямий ефір', location: 'admin-sidebar', order: 60 },
  ],
};
