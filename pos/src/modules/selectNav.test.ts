// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './constants';
import { MODULES } from './registry';
import { selectNavItems } from './selectNav';
import type { NavOverrides } from './navOverrides';
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
      '/admin/modifiers',
      '/admin/stock',
      '/admin/customers',
      '/admin/sales',
      '/admin/staff',
      '/admin/gtin',
      '/admin/settings',
      '/admin/appearance',
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

  it('orders the till rail: register, orders, customers, receipts, hardware', () => {
    // `/orders` sits straight after the till: what the shop promised is the
    // second thing a cashier reaches for, and both come from `catalog-checkout`.
    expect(select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary')).toEqual(
      ['/register', '/orders', '/customers', '/sales', '/hardware']
    );
  });

  it('drops the receipts entry when returns are turned off', () => {
    expect(
      select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary', without('returns'))
    ).toEqual(['/register', '/orders', '/customers', '/hardware']);
  });

  it('keeps the till itself when every toggleable module is off', () => {
    const coreOnly = new Set<ModuleId>(CORE_MODULE_IDS);
    // `/orders` survives: `catalog-checkout` is core, and so is the promise
    // list that ships with it.
    expect(select({ shell: 'cashier', role: 'seller', variant: 'rail' }, 'cashier-primary', coreOnly)).toEqual(
      ['/register', '/orders', '/hardware']
    );
  });
});

describe('store menu appearance (nav_overrides)', () => {
  const rail: NavCtx = { shell: 'cashier', role: 'seller', variant: 'rail' };

  function items(overrides: NavOverrides, ctx: NavCtx = rail) {
    return selectNavItems(MODULES, ALL, ctx, 'cashier-primary', overrides);
  }

  it('changes nothing when the store has no overrides', () => {
    expect(items({}).map((n) => n.to)).toEqual(select(rail, 'cashier-primary'));
  });

  it('renames an entry without touching its route or its icon', () => {
    const [first] = items({ 'catalog-checkout:cashier-primary:/register': { label: 'Продаж' } });
    expect(first.label).toBe('Продаж');
    expect(first.to).toBe('/register');
    expect(first.icon).toBe('Grid3X3');
  });

  it('re-icons an entry', () => {
    const [first] = items({ 'catalog-checkout:cashier-primary:/register': { icon: 'ShoppingCart' } });
    expect(first.icon).toBe('ShoppingCart');
  });

  it('reorders the menu', () => {
    expect(
      items({
        'catalog-checkout:cashier-primary:/register': { order: 100 },
      }).map((n) => n.to)
    ).toEqual(['/orders', '/customers', '/sales', '/hardware', '/register']);
  });

  it('cannot add an entry or take one away', () => {
    // The override map is appearance only: a key for an entry that does not
    // exist here is inert, and one for a disabled module stays disabled.
    const before = select(rail, 'cashier-primary');
    expect(
      items({
        'loyalty:cashier-primary:/loyalty': { label: 'Бонуси', order: 1 },
        'stock:cashier-primary:/admin/stock': { label: 'Склад', order: 2 },
      }).map((n) => n.to)
    ).toEqual(before);
  });

  it('leaves an override for another menu alone', () => {
    const sidebar = selectNavItems(
      MODULES,
      ALL,
      { shell: 'web', role: 'owner' },
      'admin-sidebar',
      { 'customers:cashier-primary:/customers': { label: 'Гості' } }
    );
    expect(sidebar.find((n) => n.to === '/admin/customers')?.label).toBe('Клієнти');
  });

  it('still hides an entry the context rules hide', () => {
    // Giving the web owner's catalog shortcut a new name and a low order does
    // not put it in a seller's rail — `visible()` runs first.
    expect(
      items({ 'products:cashier-primary:/admin/products': { label: 'Каталог', order: 1 } }).map(
        (n) => n.to
      )
    ).not.toContain('/admin/products');
  });
});
