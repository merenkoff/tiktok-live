// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of «Роздача», which arrives over the wire and so is invisible to
// the registry tests.

import { describe, expect, it } from 'vitest';
import { passModule } from './manifest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '@host/modules/constants';
import { MODULES } from '@host/modules/registry';
import { REQUIRED_HOST_API } from './lib/hostPlatform';
import { NAV_ICONS } from '@host/platform/icons';

describe('pass manifest', () => {
  it('is its own online-only module, not a vertical and not a bundled one', () => {
    expect(passModule.id).toBe('pass');
    expect(passModule.id.startsWith('vertical-')).toBe(false);
    expect(MODULES.some((m) => m.id === passModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(passModule.id);
    expect(passModule.alwaysEnabled).toBe(true);
  });

  it('runs where the waiters are — the tablet and the phone included — and is not the owner’s', () => {
    expect(passModule.shells).toEqual(['web', 'cashier', 'tablet']);
    expect(passModule.ownerOnly).toBeUndefined();
  });

  it('owns /pass on the till’s rail, with an icon the host knows', () => {
    expect(passModule.routes).toEqual([expect.objectContaining({ path: '/pass/*' })]);
    expect(passModule.routes[0].mount).toBeUndefined();
    expect(passModule.nav).toEqual([
      expect.objectContaining({ to: '/pass', label: 'Роздача', location: 'cashier-primary' }),
    ]);
    expect(Object.keys(NAV_ICONS)).toContain(passModule.nav[0].icon);
  });

  it('keeps no offline queue: a plate is carried now or not at all', () => {
    expect(passModule.offline).toBeUndefined();
  });

  it('asks the host only for what every supported host already has', () => {
    expect([...REQUIRED_HOST_API]).toEqual(['api.posRequest', 'useOfflineStatus', 'useAuthStore']);
  });
});
