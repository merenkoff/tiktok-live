// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Per-store menu appearance. The two properties worth pinning are the ones the
 * design rests on: an override is **sparse** (a field it does not carry keeps
 * the module's own value, so a module can still rename or re-icon itself), and
 * it is **inert when it misses** (a key for a module or route that is gone
 * changes nothing and breaks nothing).
 */

import { describe, expect, it } from 'vitest';
import {
  applyNavOverride,
  collectNavEntries,
  navItemKey,
  pruneNavOverrides,
} from './navOverrides';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './constants';
import { MODULES } from './registry';
import type { AnyModuleDescriptor } from './registry';
import type { ModuleId, NavItem } from './types';

const ALL: ReadonlySet<ModuleId> = new Set<ModuleId>([
  ...CORE_MODULE_IDS,
  ...DEFAULT_ENABLED_MODULE_IDS,
]);

const till: NavItem = {
  to: '/register',
  label: 'Каса',
  icon: 'Grid3X3',
  location: 'cashier-primary',
  order: 10,
};

describe('navItemKey', () => {
  it('identifies an entry by module, menu and route', () => {
    expect(navItemKey('catalog-checkout', till)).toBe('catalog-checkout:cashier-primary:/register');
  });

  it('keeps one route in two menus separately customisable', () => {
    // `products` puts /admin/products in the sidebar AND in the web owner's
    // till rail. Renaming one must not rename the other.
    const sidebar = navItemKey('products', {
      to: '/admin/products',
      location: 'admin-sidebar',
    });
    const rail = navItemKey('products', {
      to: '/admin/products',
      location: 'cashier-primary',
    });
    expect(sidebar).not.toBe(rail);
  });

  it('matches the key every bundled entry would produce', () => {
    // The backend regex (`NAV_OVERRIDE_KEY_RE`, src/pos/core/nav.ts) has to
    // accept every key this build can generate, or a legitimate override is
    // silently dropped on save.
    const backendKeyRe =
      /^[a-z][a-z0-9-]{0,40}:(?:cashier-primary|admin-sidebar):\/[A-Za-z0-9/_.-]*$/;
    for (const m of MODULES) {
      for (const item of m.nav) {
        expect(navItemKey(m.id, item)).toMatch(backendKeyRe);
      }
    }
  });
});

describe('applyNavOverride', () => {
  it('returns the entry untouched when there is no override', () => {
    expect(applyNavOverride(till, undefined)).toBe(till);
  });

  it('folds in only the fields the override carries', () => {
    expect(applyNavOverride(till, { label: 'Продаж' })).toEqual({ ...till, label: 'Продаж' });
    expect(applyNavOverride(till, { icon: 'ShoppingCart' })).toEqual({
      ...till,
      icon: 'ShoppingCart',
    });
    expect(applyNavOverride(till, { order: 0 })).toEqual({ ...till, order: 0 });
  });

  it('never blanks a field out with an empty override', () => {
    // A stored `{}` (or one whose fields did not survive the server's clamps)
    // must leave the entry exactly as its module declared it.
    expect(applyNavOverride(till, {})).toEqual(till);
  });

  it('does not mutate the module descriptor it was given', () => {
    applyNavOverride(till, { label: 'Інше', icon: 'Store', order: 99 });
    expect(till).toEqual({
      to: '/register',
      label: 'Каса',
      icon: 'Grid3X3',
      location: 'cashier-primary',
      order: 10,
    });
  });
});

describe('pruneNavOverrides', () => {
  const defaults = new Map<string, NavItem>([['catalog-checkout:cashier-primary:/register', till]]);

  it('drops fields that already match the module and the entries left empty', () => {
    expect(
      pruneNavOverrides(
        { 'catalog-checkout:cashier-primary:/register': { label: 'Каса', order: 10 } },
        defaults
      )
    ).toEqual({});
  });

  it('keeps a field that differs', () => {
    expect(
      pruneNavOverrides(
        { 'catalog-checkout:cashier-primary:/register': { label: 'Каса', icon: 'Store' } },
        defaults
      )
    ).toEqual({ 'catalog-checkout:cashier-primary:/register': { icon: 'Store' } });
  });

  it('keeps an override whose entry it knows nothing about', () => {
    // A module this build does not have is not a reason to delete the store's
    // setting for it — the till that does have it still needs it.
    const unknown = { 'loyalty:cashier-primary:/loyalty': { label: 'Бонуси' } };
    expect(pruneNavOverrides(unknown, defaults)).toEqual(unknown);
  });
});

describe('collectNavEntries', () => {
  it('lists a menu in the store order, not the registry order', () => {
    const overrides = { 'customers:cashier-primary:/customers': { order: -10 } };
    const keys = collectNavEntries(MODULES, ALL, 'cashier-primary', overrides).map((e) => e.key);
    expect(keys[0]).toBe('customers:cashier-primary:/customers');
  });

  it('includes entries the editing owner would never see themselves', () => {
    // The web owner's rail never shows `/sales` (they get `/admin/sales`), but
    // their sellers' tills do — so it has to be customisable from the laptop.
    const keys = collectNavEntries(MODULES, ALL, 'cashier-primary').map((e) => e.key);
    expect(keys).toContain('returns:cashier-primary:/sales');
    expect(keys).toContain('returns:cashier-primary:/admin/sales');
  });

  it('reports where a context-limited entry actually shows up', () => {
    const entries = collectNavEntries(MODULES, ALL, 'cashier-primary');
    const catalogShortcut = entries.find((e) => e.key === 'products:cashier-primary:/admin/products');
    expect(catalogShortcut?.scope).toEqual({
      ownerOnly: true,
      shellOnly: 'web',
      variantOnly: 'rail',
    });

    const till = entries.find((e) => e.key === 'catalog-checkout:cashier-primary:/register');
    expect(till?.scope).toEqual({ ownerOnly: false, shellOnly: null, variantOnly: null });
  });

  it('drops the entries of a module the store turned off', () => {
    const enabled = new Set([...ALL].filter((id) => id !== 'customers')) as ReadonlySet<ModuleId>;
    const keys = collectNavEntries(MODULES, enabled, 'cashier-primary').map((e) => e.key);
    expect(keys).not.toContain('customers:cashier-primary:/customers');
  });

  it('includes an online-only module, which opts in through module_remotes', () => {
    const remote = {
      id: 'loyalty',
      title: 'Бонуси',
      shells: ['cashier'],
      alwaysEnabled: true,
      routes: [],
      nav: [{ to: '/loyalty', label: 'Бонуси', location: 'cashier-primary', order: 95 }],
    } as unknown as AnyModuleDescriptor;

    const keys = collectNavEntries([...MODULES, remote], ALL, 'cashier-primary').map((e) => e.key);
    expect(keys).toContain('loyalty:cashier-primary:/loyalty');
  });
});
