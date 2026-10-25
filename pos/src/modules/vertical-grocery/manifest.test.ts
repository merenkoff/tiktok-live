// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of the grocery vertical module, which arrives over the wire and so
// is invisible to the registry tests.

import { describe, expect, it } from 'vitest';
import { verticalGroceryModule } from './manifest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '../constants';
import { resolveSalesCatalog } from '../verticals';
import { MODULES } from '../registry';
import { REQUIRED_HOST_API, missingHostApi } from './lib/hostPlatform';
import { PLATFORM_VERSION } from '../../platform/version';
import { VERTICAL_OPTIONS } from '../../lib/vertical';

describe('vertical-grocery manifest', () => {
  it('is keyed exactly as the store setting names it', () => {
    // `module_remotes['vertical-grocery']` → `vertical-<pos_stores.vertical>`.
    expect(verticalGroceryModule.id).toBe('vertical-grocery');
    expect(VERTICAL_OPTIONS.map((v) => `vertical-${v.id}`)).toContain(verticalGroceryModule.id);
  });

  it('is online-only: always enabled, and not a bundled module id', () => {
    expect(verticalGroceryModule.alwaysEnabled).toBe(true);
    expect(MODULES.some((m) => m.id === verticalGroceryModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(verticalGroceryModule.id);
  });

  it('supplies a catalog, which is the whole point of a vertical', () => {
    expect(verticalGroceryModule.sales?.Catalog).toBeTruthy();
    const resolved = resolveSalesCatalog('grocery', [...MODULES, verticalGroceryModule]);
    expect(resolved).toMatchObject({ moduleId: 'vertical-grocery', source: 'vertical' });
  });

  it('falls back to the bundled catalog when the bundle is not there', () => {
    // A grocery whose module never arrived still sells — through the clothing
    // catalog, which knows weighed goods too.
    expect(resolveSalesCatalog('grocery', MODULES)).toMatchObject({ moduleId: 'vertical-clothing' });
  });

  it('runs in every shell, is not owner-only, and owns no route or nav entry yet', () => {
    expect(verticalGroceryModule.shells).toEqual(['web', 'cashier', 'tablet']);
    expect(verticalGroceryModule.ownerOnly).toBeUndefined();
    expect(verticalGroceryModule.routes).toEqual([]);
    expect(verticalGroceryModule.nav).toEqual([]);
  });

  it('refuses to link into a host older than platform 21', () => {
    // A 20 host would link this module and then have no `addWeighed` to call
    // on the first weighed tile. The guard has to name a 21-only symbol.
    expect(PLATFORM_VERSION).toBeGreaterThanOrEqual(21);
    expect(REQUIRED_HOST_API).toContain('isWeighed');
    expect(REQUIRED_HOST_API).toContain('lineAmountCents');
    // …and this host, the one the tests run against, has all of it.
    expect(missingHostApi()).toEqual([]);
  });
});
