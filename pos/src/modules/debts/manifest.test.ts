// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of the `debts` module, which arrives over the wire and so is
// invisible to the registry tests.

import { describe, expect, it } from 'vitest';
import { debtsModule } from './manifest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '../constants';
import { MODULES } from '../registry';
import { navGroupOf } from '../navGroups';
import { NAV_ICONS } from '../../platform/icons';

describe('debts manifest', () => {
  it('is its own module — not a vertical, not bundled, for every vertical (Д1)', () => {
    expect(debtsModule.id).toBe('debts');
    expect(debtsModule.id.startsWith('vertical-')).toBe(false);
    expect(MODULES.some((m) => m.id === debtsModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(debtsModule.id);
  });

  it('is always enabled once a store carries it, in every shell, for staff too', () => {
    // The cashier writes goods to a tab and takes the money; only the owner's
    // tools inside it are the owner's, and the server enforces that.
    expect(debtsModule.alwaysEnabled).toBe(true);
    expect(debtsModule.shells).toEqual(['web', 'cashier', 'tablet']);
    expect(debtsModule.ownerOnly).toBeUndefined();
  });

  it('fills the host’s slots: beside «Оплатити», under the customer, on «Сьогодні»', () => {
    expect(debtsModule.checkout?.Action).toBeDefined();
    expect(debtsModule.customer?.Panel).toBeDefined();
    expect(debtsModule.analytics?.Panels).toBeDefined();
    // No catalog: a feature module never draws the sell screen's catalog.
    expect(debtsModule.sales).toBeUndefined();
    // Online only in this release — the offline queue and the slip printer come later.
    expect(debtsModule.offline).toBeUndefined();
    expect(debtsModule.hardware).toBeUndefined();
  });

  it('mounts the notebook in the till’s frame and in the owner’s cabinet', () => {
    expect(debtsModule.routes).toEqual([
      expect.objectContaining({ path: '/debts/*', props: { frame: 'till' } }),
      expect.objectContaining({ path: 'debts/*', mount: 'admin', props: { frame: 'admin' } }),
    ]);
    expect(debtsModule.nav).toEqual([
      expect.objectContaining({ to: '/debts', location: 'cashier-primary', label: 'Борги' }),
      expect.objectContaining({ to: '/admin/debts', location: 'admin-sidebar', label: 'Борги' }),
    ]);
    for (const item of debtsModule.nav) expect(Object.keys(NAV_ICONS)).toContain(item.icon);
    // In the owner's «Продажі», beside the customers.
    expect(navGroupOf(debtsModule.id)).toBe('sales');
  });
});
