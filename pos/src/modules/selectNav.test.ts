// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './constants';
import { MODULES } from './registry';
import { selectNavItems } from './selectNav';
import type { ModuleId, NavCtx, NavLocation } from './types';

const ALL: ReadonlySet<ModuleId> = new Set<ModuleId>([
  ...CORE_MODULE_IDS,
  ...DEFAULT_ENABLED_MODULE_IDS,
]);

const without = (id: ModuleId): ReadonlySet<ModuleId> =>
  new Set([...ALL].filter((m) => m !== id));

function select(
  ctx: NavCtx,
  location: NavLocation,
  enabled: ReadonlySet<ModuleId> = ALL
): string[] {
  return selectNavItems(MODULES, enabled, ctx, location).map((n) => n.to);
}

describe('admin sidebar', () => {
  it('lists the owner sections in registry order', () => {
    expect(select({ shell: 'web', role: 'owner' }, 'admin-sidebar')).toEqual([
      '/admin',
      '/admin/products',
      '/admin/stock',
      '/admin/customers',
      '/admin/sales',
      '/admin/staff',
      '/admin/settings',
    ]);
  });

  it('drops every owner-only section for a seller', () => {
    // What is left comes from modules that are not owner-only (`customers`,
    // `returns`). A seller never renders this list — the `/admin` layout that
    // hosts it is behind the owner guard — but the selector itself does not
    // know that, so pin what it actually returns.
    expect(select({ shell: 'web', role: 'seller' }, 'admin-sidebar')).toEqual([
      '/admin/customers',
      '/admin/sales',
    ]);
  });

  it('keeps only the shell-agnostic sections in the cashier shell', () => {
    // The cashier build never mounts `/admin`, so this list is unreachable
    // there; the entries that survive are the ones from web+cashier modules.
    expect(select({ shell: 'cashier', role: 'owner' }, 'admin-sidebar')).toEqual([
      '/admin/customers',
      '/admin/sales',
    ]);
  });

  it('drops a section when its module is turned off', () => {
    expect(
      select({ shell: 'web', role: 'owner' }, 'admin-sidebar', without('stock'))
    ).not.toContain('/admin/stock');
  });
});

describe('cashier rail vs bottom bar', () => {
  it('gives a web owner the catalog shortcut in the rail only', () => {
    const rail = select({ shell: 'web', role: 'owner', variant: 'rail' }, 'cashier-primary');
    const bottom = select({ shell: 'web', role: 'owner', variant: 'bottom' }, 'cashier-primary');

    expect(rail).toContain('/admin/products');
    expect(bottom).not.toContain('/admin/products');
  });

  it('never shows the catalog shortcut to a seller', () => {
    expect(
      select({ shell: 'web', role: 'seller', variant: 'rail' }, 'cashier-primary')
    ).not.toContain('/admin/products');
  });

  it('routes a web owner to the admin sales page and everyone else to the till receipts', () => {
    expect(select({ shell: 'web', role: 'owner', variant: 'rail' }, 'cashier-primary')).toContain(
      '/admin/sales'
    );
    expect(select({ shell: 'web', role: 'seller', variant: 'rail' }, 'cashier-primary')).toContain(
      '/sales'
    );
    expect(
      select({ shell: 'cashier', role: 'owner', variant: 'rail' }, 'cashier-primary')
    ).toContain('/sales');
  });

  it('offers exactly one receipts entry at a time', () => {
    for (const ctx of [
      { shell: 'web', role: 'owner', variant: 'rail' },
      { shell: 'web', role: 'seller', variant: 'rail' },
      { shell: 'cashier', role: 'seller', variant: 'bottom' },
    ] as NavCtx[]) {
      const receipts = select(ctx, 'cashier-primary').filter((to) => to.endsWith('sales'));
      expect(receipts, JSON.stringify(ctx)).toHaveLength(1);
    }
  });

  it('shows hardware only in the desktop cashier', () => {
    expect(
      select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary')
    ).toContain('/hardware');
    expect(
      select({ shell: 'web', role: 'owner', variant: 'rail' }, 'cashier-primary')
    ).not.toContain('/hardware');
  });

  it('orders the till rail: register, customers, receipts, hardware', () => {
    expect(select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary')).toEqual(
      ['/register', '/customers', '/sales', '/hardware']
    );
  });

  it('drops the receipts entry when returns are turned off', () => {
    expect(
      select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary', without('returns'))
    ).toEqual(['/register', '/customers', '/hardware']);
  });

  it('keeps the till itself when every toggleable module is off', () => {
    const coreOnly = new Set<ModuleId>(CORE_MODULE_IDS);
    expect(select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary', coreOnly)).toEqual(
      ['/register', '/hardware']
    );
  });
});
