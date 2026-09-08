// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { displayGtin, enrichGtinFromSources } from './gtinLookup';

describe('displayGtin', () => {
  it('strips the GTIN-14 padding back to the scanned form', () => {
    expect(displayGtin('04820000000017')).toBe('4820000000017');
    expect(displayGtin('00000040123456')).toBe('40123456');
    expect(displayGtin('14820000000014')).toBe('14820000000014');
  });

  it('leaves anything that is not a plain barcode alone', () => {
    expect(displayGtin('not-a-barcode')).toBe('not-a-barcode');
  });
});

describe('enrichGtinFromSources', () => {
  beforeEach(() => {
    // The Open*Facts fan-out is a direct browser fetch. Stub it so a test never
    // depends on the network — and so "did not fan out" is an assertable fact.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ status: 0 }) })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function apiStub(cache: { found: boolean; blocked?: boolean; name?: string | null }) {
    return {
      getGtinCache: vi.fn().mockResolvedValue(cache),
      ingestGtin: vi.fn().mockResolvedValue({ found: false, hint: null }),
      lookupQuotaProviders: vi.fn().mockResolvedValue({ found: false, hint: null }),
    };
  }

  it('stops at a cleared entry without spending provider quota', async () => {
    // The owner rejected this name. Fanning out would re-fetch exactly what they
    // rejected, burn a quota slot, and be refused by the server anyway.
    const api = apiStub({ found: false, blocked: true });
    const out = await enrichGtinFromSources('4820000000017', api);
    expect(out).toEqual({ hint: null, blocked: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(api.lookupQuotaProviders).not.toHaveBeenCalled();
    expect(api.ingestGtin).not.toHaveBeenCalled();
  });

  it('returns a cache hit as-is', async () => {
    const api = apiStub({ found: true, name: 'Кешована назва' });
    const out = await enrichGtinFromSources('4820000000017', api);
    expect(out.hint?.name).toBe('Кешована назва');
    expect(api.lookupQuotaProviders).not.toHaveBeenCalled();
  });

  it('falls through to the quota providers on a plain miss', async () => {
    const api = apiStub({ found: false });
    await enrichGtinFromSources('4820000000017', api);
    expect(api.lookupQuotaProviders).toHaveBeenCalledTimes(1);
  });
});
