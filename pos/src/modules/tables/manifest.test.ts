// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of the tables module, which arrives over the wire and so is
// invisible to the registry tests.

import { describe, expect, it } from 'vitest';
import { tablesModule } from './manifest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '../constants';
import { MODULES } from '../registry';
import { REQUIRED_HOST_API } from './lib/hostPlatform';
import { NAV_ICONS } from '../../platform/icons';

describe('tables manifest', () => {
  it('is its own module, not a vertical and not a bundled one', () => {
    // §4.11: tables are a model of service, not a thing a shop sells. The id
    // deliberately carries no `vertical-` prefix, so `assertSingleVerticalRemote`
    // has no opinion about it and a café can carry both.
    expect(tablesModule.id).toBe('tables');
    expect(tablesModule.id.startsWith('vertical-')).toBe(false);
    expect(MODULES.some((m) => m.id === tablesModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(tablesModule.id);
  });

  it('is always enabled: its presence IS the restaurant switch', () => {
    // Which is why there is no `pos_stores.service_mode` column — a store
    // either carries this module or does not.
    expect(tablesModule.alwaysEnabled).toBe(true);
  });

  it('runs in every shell and is not owner-only', () => {
    // The waiter's tablet is the web shell, the counter is the cashier one,
    // and §4.7 says everyone sees every table.
    expect(tablesModule.shells).toEqual(['web', 'cashier', 'tablet']);
    expect(tablesModule.ownerOnly).toBeUndefined();
  });

  it('owns /tables at the root, with an icon the host knows', () => {
    expect(tablesModule.routes[0]).toEqual(expect.objectContaining({ path: '/tables/*' }));
    expect(tablesModule.routes[0].mount).toBeUndefined();
    expect(tablesModule.nav[0]).toEqual(
      expect.objectContaining({ to: '/tables', label: 'Столи', location: 'cashier-primary' })
    );
    expect(Object.keys(NAV_ICONS)).toContain(tablesModule.nav[0].icon);
  });

  it('puts the floor plan in the admin, where the owner draws it', () => {
    // The module itself is not `ownerOnly` — waiters need `/tables` — and it
    // does not have to be: the `/admin` area is gated by the shell's own
    // `Guard ownerOnly`, and it is web-only, so the till never mounts this.
    expect(tablesModule.routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'tables', mount: 'admin' })])
    );
    expect(tablesModule.ownerOnly).toBeUndefined();
    expect(tablesModule.nav).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: '/admin/tables', location: 'admin-sidebar' }),
      ])
    );
  });

  it('declares no offline hooks: a read mirror is not a queue', () => {
    // К4j gives the module its own Dexie to draw the map without a network,
    // but `ModuleOfflineHooks` describes rows waiting for the server, and a
    // bill never waits — every write says «Потрібна мережа» instead.
    expect(tablesModule.offline).toBeUndefined();
  });

  it('asks the host only for members it already had', () => {
    // No new export name, so `PLATFORM_VERSION` stays where К2 left it. A
    // dotted member is resolved key by key.
    expect(REQUIRED_HOST_API).toContain('api.posRequest');
    expect(REQUIRED_HOST_API).toContain('useOfflineStatus');
    expect(REQUIRED_HOST_API).toContain('formatUah');
    // К4f: the menu through the shell-aware reader, and the café's tap rule
    // borrowed whole. Every one of them shipped with platform 13.
    expect(REQUIRED_HOST_API).toContain('cashierApi.getCatalog');
    expect(REQUIRED_HOST_API).toContain('needsModifierSheet');
    expect(REQUIRED_HOST_API).toContain('defaultModifierIds');
    expect(REQUIRED_HOST_API).toContain('groupsOf');
  });
});
