// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Who may draw on a host screen since phase Г2 (TechDocs/grocery/PLAN.md §4):
// the store's vertical first — so nothing it drew before moves — then every
// loaded feature module, by the same rules the nav already follows.

import { describe, expect, it } from 'vitest';
import { resolveModuleSlots, type ModuleSlotContext } from './featureSlots';
import { MODULES, type AnyModuleDescriptor } from './registry';
import type { ModuleId } from './types';

const VerticalCard = () => null;
const DebtsCard = () => null;
const DebtsAction = () => null;
const ScalesCard = () => null;

function remote(id: string, over: Partial<AnyModuleDescriptor> = {}): AnyModuleDescriptor {
  return {
    id,
    title: id,
    shells: ['web', 'cashier', 'tablet'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    ...over,
  } as AnyModuleDescriptor;
}

const flowers = remote('vertical-flowers', { shells: ['cashier'], settings: { Card: VerticalCard } });
const debts = remote('debts', { settings: { Card: DebtsCard }, checkout: { Action: DebtsAction } });
const scales = remote('scales', { settings: { Card: ScalesCard } });

function ctx(over: Partial<ModuleSlotContext> = {}): ModuleSlotContext {
  return {
    vertical: 'flowers',
    shell: 'web',
    role: 'owner',
    enabled: new Set<ModuleId>(),
    ...over,
  };
}

describe('resolveModuleSlots', () => {
  it('puts the store vertical first, then feature modules in registry order', () => {
    const found = resolveModuleSlots('settings.Card', ctx(), [...MODULES, debts, flowers, scales]);
    expect(found.map((s) => s.moduleId)).toEqual(['vertical-flowers', 'debts', 'scales']);
    expect(found[0].value).toBe(VerticalCard);
  });

  it('keeps the vertical on the old rule: no shell check, so its card does not vanish from the web', () => {
    // `vertical-flowers` above runs only on the cashier, yet its settings card
    // has always been on the owner's web page.
    const found = resolveModuleSlots('settings.Card', ctx({ shell: 'web' }), [flowers]);
    expect(found.map((s) => s.moduleId)).toEqual(['vertical-flowers']);
  });

  it('never takes a vertical module that is not the store own', () => {
    const cafe = remote('vertical-cafe', { settings: { Card: VerticalCard } });
    expect(resolveModuleSlots('settings.Card', ctx({ vertical: 'flowers' }), [cafe, debts]).map((s) => s.moduleId)).toEqual([
      'debts',
    ]);
  });

  it('skips a placeholder that has not been downloaded yet', () => {
    const pending = { ...remote('debts', { settings: { Card: DebtsCard } }), pending: true as const };
    expect(resolveModuleSlots('settings.Card', ctx(), [pending])).toEqual([]);
  });

  it('respects the shell a feature module runs in', () => {
    const webOnly = remote('debts', { shells: ['web'], checkout: { Action: DebtsAction } });
    expect(resolveModuleSlots('checkout.Action', ctx({ shell: 'cashier' }), [webOnly])).toEqual([]);
    expect(resolveModuleSlots('checkout.Action', ctx({ shell: 'web' }), [webOnly])).toHaveLength(1);
  });

  it('shows an owner-only module to the owner alone', () => {
    const ownerOnly = remote('debts', { ownerOnly: true, checkout: { Action: DebtsAction } });
    expect(resolveModuleSlots('checkout.Action', ctx({ role: 'seller' }), [ownerOnly])).toEqual([]);
    expect(resolveModuleSlots('checkout.Action', ctx({ role: 'owner' }), [ownerOnly])).toHaveLength(1);
  });

  it('takes a bundled module only while the store has it enabled; a remote is enabled by being there', () => {
    const bundled = {
      ...remote('qr-payment', { checkout: { Action: DebtsAction } }),
      alwaysEnabled: undefined,
    } as AnyModuleDescriptor;
    expect(resolveModuleSlots('checkout.Action', ctx(), [bundled])).toEqual([]);
    expect(
      resolveModuleSlots('checkout.Action', ctx({ enabled: new Set<ModuleId>(['qr-payment']) }), [bundled])
    ).toHaveLength(1);
    expect(resolveModuleSlots('checkout.Action', ctx(), [debts])).toHaveLength(1);
  });

  it('counts a module once even if the registry lists it twice', () => {
    expect(resolveModuleSlots('checkout.Action', ctx(), [debts, debts])).toHaveLength(1);
  });

  it('reads a station list only when it has stations in it', () => {
    const withStation = remote('debts', {
      hardware: { stations: [{ id: 'slip', title: 'Принтер квитанцій', hint: '…' }] },
    });
    const empty = remote('scales', { hardware: { stations: [] } });
    const found = resolveModuleSlots('hardware.stations', ctx({ shell: 'cashier' }), [withStation, empty]);
    expect(found).toEqual([
      { moduleId: 'debts', value: [{ id: 'slip', title: 'Принтер квитанцій', hint: '…' }] },
    ]);
  });

  it('gives a store with no such modules nothing at all', () => {
    expect(resolveModuleSlots('checkout.Action', ctx({ vertical: 'clothing' }), MODULES)).toEqual([]);
    expect(resolveModuleSlots('customer.Panel', ctx({ vertical: 'clothing' }), MODULES)).toEqual([]);
  });

  // The opposite of `resolveSalesCatalog`, which always ends with a catalog:
  // a host screen must be able to end up exactly as it was before the module
  // existed — no empty frame, no placeholder, no borrowed clothing card.
  it('never falls back on a host screen', () => {
    // The vertical's remote failed on the web, so it is simply not there.
    expect(resolveModuleSlots('analytics.Panels', ctx(), MODULES)).toEqual([]);
    // Loaded, but declares nothing for this screen.
    expect(resolveModuleSlots('analytics.Panels', ctx(), [...MODULES, remote('vertical-flowers')])).toEqual([]);
    // A clothing shop, or a session that names no vertical at all.
    expect(resolveModuleSlots('settings.Card', ctx({ vertical: 'clothing' }), MODULES)).toEqual([]);
    expect(resolveModuleSlots('settings.Card', ctx({ vertical: undefined }), MODULES)).toEqual([]);
  });
});
