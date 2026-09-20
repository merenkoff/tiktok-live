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

  it('owns no route or nav yet — the sell screen is a slot, not a page', () => {
    // The kitchen board (К3) will be the first. Until then the object entry in
    // `module_remotes` still names a `routePath` and a nav item, because both
    // sanitisers require them; they shape the desktop's pending tile only.
    expect(verticalCafeModule.routes).toEqual([]);
    expect(verticalCafeModule.nav).toEqual([]);
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
