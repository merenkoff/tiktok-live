// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which module renders the sell screen's catalog, and — the part that matters —
// what happens when the store's own one is not there. Every branch has to end
// with a catalog, because the alternative is a till that cannot sell.

import { describe, expect, it } from 'vitest';
import { resolveSalesCatalog, verticalModuleId } from './verticals';
import { MODULES } from './registry';
import type { AnyModuleDescriptor } from './registry';
import type { ModuleDescriptor } from './types';

const FlowersCatalog = () => null;
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
