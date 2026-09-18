// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which module renders the sell screen's catalog, and — the part that matters —
// what happens when the store's own one is not there. Every branch has to end
// with a catalog, because the alternative is a till that cannot sell.

import { describe, expect, it } from 'vitest';
import {
  resolveAnalyticsPanels,
  resolveSalesCatalog,
  resolveSettingsCard,
  verticalModuleId,
} from './verticals';
import { MODULES } from './registry';
import type { AnyModuleDescriptor } from './registry';
import type { ModuleDescriptor } from './types';

const FlowersCatalog = () => null;
const FlowerPanels = () => null;
const FlowerSettings = () => null;
const clothing = MODULES.find((m) => m.id === 'vertical-clothing')!;

function flowers(over: Partial<ModuleDescriptor> = {}): AnyModuleDescriptor {
  return {
    id: 'vertical-flowers',
    title: 'Квіти',
    shells: ['web', 'cashier'],
    routes: [],
    nav: [],
    sales: { Catalog: FlowersCatalog },
    ...over,
  } as AnyModuleDescriptor;
}

describe('resolveSalesCatalog', () => {
  it('uses the module named by the store vertical', () => {
    const resolved = resolveSalesCatalog('flowers', [clothing, flowers()]);
    expect(resolved).toMatchObject({
      Catalog: FlowersCatalog,
      moduleId: 'vertical-flowers',
      source: 'vertical',
    });
  });

  it('falls back when the store vertical has no module at all', () => {
    // The web shell for a failed remote: no nav entry, no route, no
    // placeholder — the module simply is not in the registry.
    const resolved = resolveSalesCatalog('flowers', [clothing]);
    expect(resolved).toMatchObject({ moduleId: 'vertical-clothing', source: 'fallback', reason: 'missing' });
    expect(resolved.Catalog).toBe(clothing.sales!.Catalog);
  });

  it('falls back for a placeholder that has not been downloaded yet', () => {
    // A desktop till's first cold boot: the descriptor exists so the rail can
    // show the entry, but there is no code behind it.
    const pending = { ...flowers({ sales: undefined }), pending: true as const };
    expect(resolveSalesCatalog('flowers', [clothing, pending])).toMatchObject({
      source: 'fallback',
      reason: 'pending',
    });
  });

  it('falls back for a module that declares no catalog', () => {
    expect(resolveSalesCatalog('flowers', [clothing, flowers({ sales: undefined })])).toMatchObject({
      source: 'fallback',
      reason: 'no_sales_slot',
    });
  });

  it('treats a store with no vertical as clothing', () => {
    // An `AuthResponse` cached before verticals existed.
    expect(resolveSalesCatalog(undefined, [clothing])).toMatchObject({
      moduleId: 'vertical-clothing',
      source: 'vertical',
    });
    expect(verticalModuleId(undefined)).toBe('vertical-clothing');
  });

  it('resolves against the real registry for every shipped vertical', () => {
    expect(resolveSalesCatalog('clothing').source).toBe('vertical');
  });

  it('refuses to pretend when even the fallback is missing', () => {
    // A build error, not a runtime state — say so instead of rendering nothing.
    expect(() => resolveSalesCatalog('flowers', [flowers({ sales: undefined })])).toThrow(
      /vertical-clothing/
    );
  });
});

// The other half of the same mechanism, with the opposite consequence. The sell
// screen must always end up with a catalog; the owner's dashboard must be able
// to end up with nothing, because it is the host's screen and the panels are
// only an addition to it.
describe('resolveAnalyticsPanels', () => {
  it('uses the module named by the store vertical', () => {
    expect(resolveAnalyticsPanels('flowers', [clothing, flowers({ analytics: { Panels: FlowerPanels } })])).toEqual({
      Panels: FlowerPanels,
      moduleId: 'vertical-flowers',
    });
  });

  it('draws nothing when the store vertical has no module at all', () => {
    // A failed remote on the web. The dashboard must look exactly as it did
    // before the module existed — no empty frame, no placeholder, no error.
    expect(resolveAnalyticsPanels('flowers', [clothing])).toBeNull();
  });

  it('draws nothing for a placeholder that has not been downloaded yet', () => {
    const pending = { ...flowers({ analytics: { Panels: FlowerPanels } }), pending: true as const };
    expect(resolveAnalyticsPanels('flowers', [clothing, pending])).toBeNull();
  });

  it('draws nothing for a module that declares no panels', () => {
    expect(resolveAnalyticsPanels('flowers', [clothing, flowers()])).toBeNull();
  });

  it('never falls back to clothing, which has no figures of its own', () => {
    // The difference from `resolveSalesCatalog` above, stated as a test: a
    // clothing shop's dashboard is the plain one, not one borrowing a vertical.
    expect(resolveAnalyticsPanels('clothing', [clothing])).toBeNull();
    expect(resolveAnalyticsPanels(undefined)).toBeNull();
  });
});

// Third slot, same rule. The one it exists for is the florist's assembly
// charge, which used to be a field on the host's Settings page — shown to a
// clothing shop too, where it meant nothing.
describe('resolveSettingsCard', () => {
  it('uses the module named by the store vertical', () => {
    expect(resolveSettingsCard('flowers', [clothing, flowers({ settings: { Card: FlowerSettings } })])).toEqual({
      Card: FlowerSettings,
      moduleId: 'vertical-flowers',
    });
  });

  it('draws nothing when the module is missing, pending or declares no card', () => {
    expect(resolveSettingsCard('flowers', [clothing])).toBeNull();
    const pending = { ...flowers({ settings: { Card: FlowerSettings } }), pending: true as const };
    expect(resolveSettingsCard('flowers', [clothing, pending])).toBeNull();
    expect(resolveSettingsCard('flowers', [clothing, flowers()])).toBeNull();
  });

  it('never falls back, so a clothes shop sees the settings page it always had', () => {
    expect(resolveSettingsCard('clothing', [clothing])).toBeNull();
    expect(resolveSettingsCard(undefined)).toBeNull();
  });
});
