// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { homePath, moduleVisible, type RouteContext } from './renderRoutes';
import type { ModuleDescriptor, ModuleId, RouteDef } from './types';
import type { PosShell } from '../shell';
import type { PosRole } from '../types';

function ctx(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    shell: 'web',
    role: 'owner',
    enabled: new Set<ModuleId>(['stock']),
    isAuthenticated: true,
    ...overrides,
  };
}

function mod(overrides: Partial<ModuleDescriptor> = {}): ModuleDescriptor {
  return {
    id: 'stock',
    title: 'Склад',
    shells: ['web', 'cashier'],
    routes: [] as RouteDef[],
    nav: [],
    ...overrides,
  };
}

describe('homePath', () => {
  it('sends a web owner to the admin area', () => {
    expect(homePath(ctx({ shell: 'web', role: 'owner' }))).toBe('/admin');
  });

  it('sends everyone else to the till', () => {
    const elsewhere: Array<[PosShell, PosRole | null]> = [
      ['web', 'seller'],
      ['web', null],
      ['cashier', 'owner'],
      ['cashier', 'seller'],
      ['cashier', null],
    ];
    for (const [shell, role] of elsewhere) {
      expect(homePath(ctx({ shell, role })), `${shell}/${role}`).toBe('/register');
    }
  });
});

describe('moduleVisible', () => {
  it('shows an enabled module that runs in this shell', () => {
    expect(moduleVisible(mod(), ctx())).toBe(true);
  });

  it('hides a module that does not run in this shell', () => {
    expect(moduleVisible(mod({ shells: ['web'] }), ctx({ shell: 'cashier' }))).toBe(false);
    expect(moduleVisible(mod({ shells: ['cashier'] }), ctx({ shell: 'web' }))).toBe(false);
  });

  it('hides an owner-only module from sellers and from a signed-out shell', () => {
    const ownerOnly = mod({ ownerOnly: true });
    expect(moduleVisible(ownerOnly, ctx({ role: 'owner' }))).toBe(true);
    expect(moduleVisible(ownerOnly, ctx({ role: 'seller' }))).toBe(false);
    expect(moduleVisible(ownerOnly, ctx({ role: null }))).toBe(false);
  });

  it('hides a module the store has turned off', () => {
    expect(moduleVisible(mod(), ctx({ enabled: new Set<ModuleId>() }))).toBe(false);
  });

  it('checks the enabled set even for a module marked core in the registry', () => {
    // `renderModuleRoutes` is always handed the resolved set from
    // `useEnabledModules`, which already unions in the core ids.
    expect(moduleVisible(mod({ core: true }), ctx({ enabled: new Set<ModuleId>() }))).toBe(false);
  });
});
