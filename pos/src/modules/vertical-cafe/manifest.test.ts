// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of the café vertical module, which arrives over the wire and so
// is invisible to the registry tests.

import { describe, expect, it } from 'vitest';
import { verticalCafeModule } from './manifest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '../constants';
import { resolveSalesCatalog } from '../verticals';
import { MODULES } from '../registry';
import { REQUIRED_HOST_API } from './lib/hostPlatform';
import { PLATFORM_VERSION } from '../../platform/version';
import { NAV_ICONS } from '../../platform/icons';

describe('vertical-cafe manifest', () => {
  it('is keyed exactly as the store setting names it', () => {
    // `module_remotes['vertical-cafe']` → `vertical-<pos_stores.vertical>`.
    expect(verticalCafeModule.id).toBe('vertical-cafe');
  });

  it('is online-only: always enabled, and not a bundled module id', () => {
    expect(verticalCafeModule.alwaysEnabled).toBe(true);
    expect(MODULES.some((m) => m.id === verticalCafeModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(verticalCafeModule.id);
  });

  it('supplies a catalog, which is the whole point of a vertical', () => {
    expect(verticalCafeModule.sales?.Catalog).toBeTruthy();
    const resolved = resolveSalesCatalog('cafe', [...MODULES, verticalCafeModule]);
    expect(resolved).toMatchObject({ moduleId: 'vertical-cafe', source: 'vertical' });
  });

  it('runs in both shells and is not owner-only', () => {
    expect(verticalCafeModule.shells).toEqual(['web', 'cashier']);
    expect(verticalCafeModule.ownerOnly).toBeUndefined();
  });

  it('owns the kitchen board in both shells, with a nav entry the icon set knows', () => {
    // К3c: the first route this module owns. A root mount (no `mount:
    // 'admin'`), so the desktop cashier renders it too; the splat matches the
    // shape the desktop's pending placeholder builds from `routePath`.
    expect(verticalCafeModule.routes).toEqual([
      expect.objectContaining({ path: '/kitchen/*' }),
    ]);
    expect(verticalCafeModule.routes[0].mount).toBeUndefined();
    expect(verticalCafeModule.nav).toEqual([
      expect.objectContaining({ to: '/kitchen', label: 'Кухня', location: 'cashier-primary' }),
    ]);
    expect(Object.keys(NAV_ICONS)).toContain(verticalCafeModule.nav[0].icon);
  });

  it('probes the two host members the board needs without a new export name', () => {
    // `api.posRequest` and `useOfflineStatus` were on the host long before
    // platform 13, so PLATFORM_VERSION stays put — but a host missing either
    // must be told, not guessed at.
    expect(REQUIRED_HOST_API).toContain('api.posRequest');
    expect(REQUIRED_HOST_API).toContain('useOfflineStatus');
  });

  it('refuses to link into a host older than platform 13', () => {
    // A 12 host would link this module and then ignore `addItem`'s third
    // argument, so every modified latte would ring at the card price — worse
    // than the bundled fallback. The guard has to name a 13-only symbol.
    expect(PLATFORM_VERSION).toBeGreaterThanOrEqual(13);
    expect(REQUIRED_HOST_API).toContain('resolveLineModifiers');
    expect(REQUIRED_HOST_API).toContain('needsModifierSheet');
  });
});
