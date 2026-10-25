// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Same pattern as `tiktok-live/lib/hostPlatform.test.ts` — the real platform
// with the names an older host lacks taken out, loaded against a mocked
// `@pos/platform`.
//
// Note on fidelity, as there: a real ES module namespace reads a missing name
// back as `undefined`, while Vitest's mock proxy throws on a name the factory
// never mentioned — so the "old host" lists the missing symbols explicitly as
// `undefined`. That is the value the runtime produces; only the way of getting
// there differs.

import { afterEach, describe, expect, it, vi } from 'vitest';

type Shim = typeof import('./hostPlatform');

/** What a platform-20 host lacks: everything a weighing needs. */
const WEIGHED_SYMBOLS = { isWeighed: undefined, displayUnit: undefined, lineAmountCents: undefined };

async function mockHost(overrides: Record<string, unknown>): Promise<void> {
  vi.resetModules();
  const real = await vi.importActual<Record<string, unknown>>('@pos/platform');
  vi.doMock('@pos/platform', () => ({ ...real, ...overrides }));
}

async function loadShim(overrides: Record<string, unknown>): Promise<Shim> {
  await mockHost(overrides);
  return import('./hostPlatform');
}

afterEach(() => {
  vi.doUnmock('@pos/platform');
  vi.resetModules();
});

describe('hostPlatform on a host older than weighed goods', () => {
  it('still loads — the whole reason for the namespace import', async () => {
    await expect(loadShim(WEIGHED_SYMBOLS)).resolves.toBeDefined();
  });

  it('names exactly the platform-21 symbols the host is missing', async () => {
    const shim = await loadShim(WEIGHED_SYMBOLS);
    expect(shim.missingHostApi()).toEqual(['isWeighed', 'displayUnit', 'lineAmountCents']);
  });

  it('resolves a dotted member, and misses it when the object is there but the method is not', async () => {
    const shim = await loadShim({ cashierApi: {} });
    expect(shim.missingHostApi()).toEqual(['cashierApi.getCatalog']);
  });

  it('makes the catalog throw into the host’s boundary instead of rendering half a till', async () => {
    const shim = await loadShim(WEIGHED_SYMBOLS);
    const { default: GroceryCatalog } = await import('../GroceryCatalog');
    expect(() => GroceryCatalog({ active: true, stockEpoch: 0 })).toThrow(shim.HostTooOldError);
  });
});
