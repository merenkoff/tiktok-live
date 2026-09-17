// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of an online-only vertical module. The registry tests only see
// bundled modules, so the ones that arrive over the wire pin their own shape.

import { describe, expect, it } from 'vitest';
import { verticalFlowersModule } from './manifest';
import { NAV_ICONS } from '../../platform/icons';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '../constants';
import { resolveSalesCatalog } from '../verticals';
import { MODULES } from '../registry';

describe('vertical-flowers manifest', () => {
  it('is keyed exactly as the store setting names it', () => {
    // `module_remotes['vertical-flowers']` → `vertical-<pos_stores.vertical>`;
    // `applyModuleRemotes` refuses a descriptor whose id differs from the key.
    expect(verticalFlowersModule.id).toBe('vertical-flowers');
  });

  it('is online-only: always enabled, and not a bundled module id', () => {
    // Being in `module_remotes` is the opt-in, and the server already refuses
    // an entry that disagrees with the store's vertical — a second switch in
    // Settings would have nothing to mean.
    expect(verticalFlowersModule.alwaysEnabled).toBe(true);
    expect(MODULES.some((m) => m.id === verticalFlowersModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(
      verticalFlowersModule.id
    );
  });

  it('supplies a catalog, which is the whole point of a vertical', () => {
    expect(verticalFlowersModule.sales?.Catalog).toBeTruthy();
    const resolved = resolveSalesCatalog('flowers', [...MODULES, verticalFlowersModule]);
    expect(resolved).toMatchObject({ moduleId: 'vertical-flowers', source: 'vertical' });
  });

  it('runs in both shells and is not owner-only', () => {
    // `ownerOnly` is module-scoped: it would take the sell screen away from
    // the sellers who spend all day on it.
    expect(verticalFlowersModule.shells).toEqual(['web', 'cashier']);
    expect(verticalFlowersModule.ownerOnly).toBeUndefined();
  });

  it('declares a route and a nav entry the store setting can mirror', () => {
    // Both sides require them for an object-form `module_remotes` entry
    // (`parsePresentation`, `sanitizeRemoteNav`), and on the desktop the
    // greyed "not downloaded" tile points at this route.
    const [route] = verticalFlowersModule.routes;
    expect(route.path).toBe('/flowers/*');
    const [nav] = verticalFlowersModule.nav;
    expect(nav).toMatchObject({ to: '/flowers', location: 'cashier-primary', match: '/flowers' });
    // An icon this host does not ship would silently become a puzzle piece.
    expect(Object.keys(NAV_ICONS)).toContain(nav.icon);
  });
});
