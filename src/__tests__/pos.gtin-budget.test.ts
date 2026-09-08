// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.gtin-budget.test.ts
//
// The daily provider budget is what stands between a busy shift and a 429 from
// UPCitemdb. The property that matters: a request the provider never counted
// gives its slot back, so a provider that is down cannot hollow out the day.
//
// (Scoping the counter per API key went out with upc.dev — UPCitemdb's trial is
// metered per source IP, so there is one bucket. The `scope` column stays for
// the next keyed provider; see provider-budget.ts.)
//
// The provider is driven with a stubbed `fetch`: everything asserted here is
// about budget rows, never about a real outbound call.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import {
  budgetScope,
  getUsedCount,
  releaseBudget,
  tryConsumeBudget,
} from '../pos/gtin/provider-budget.js';
import { lookupUpcitemdb } from '../pos/gtin/upcitemdb.provider.js';

const SCOPE = budgetScope('upcitemdb');

async function used(): Promise<number> {
  return getUsedCount('upcitemdb', { scope: SCOPE });
}

function stubFetch(impl: () => Promise<unknown> | never): void {
  vi.stubGlobal('fetch', vi.fn(impl as () => Promise<Response>));
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function reset(): Promise<void> {
  await pool.query(
    `DELETE FROM pos_gtin_provider_budget WHERE provider = 'upcitemdb' AND scope = $1`,
    [SCOPE]
  );
}

describe.skipIf(!hasDb)('GTIN provider budget', () => {
  beforeAll(async () => {
    await applyPosMigrations();
  }, 120000);

  afterEach(async () => {
    vi.unstubAllGlobals();
    await reset();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('meters UPCitemdb per deployment — its trial has no key', () => {
    expect(SCOPE).toBe('shared');
  });

  it('stops at the limit', async () => {
    await reset();
    expect(await tryConsumeBudget('upcitemdb', { scope: SCOPE, limit: 2 })).toBe(true);
    expect(await tryConsumeBudget('upcitemdb', { scope: SCOPE, limit: 2 })).toBe(true);
    expect(await tryConsumeBudget('upcitemdb', { scope: SCOPE, limit: 2 })).toBe(false);
  });

  it('gives a slot back and never goes below zero', async () => {
    await reset();
    await tryConsumeBudget('upcitemdb', { scope: SCOPE });
    expect(await used()).toBe(1);

    await releaseBudget('upcitemdb', { scope: SCOPE });
    expect(await used()).toBe(0);
    await releaseBudget('upcitemdb', { scope: SCOPE });
    expect(await used()).toBe(0);
  });

  describe('a provider that is down', () => {
    it('does not spend the day on timeouts', async () => {
      await reset();
      stubFetch(() => Promise.reject(new Error('The operation timed out.')));

      for (let i = 0; i < 5; i++) {
        expect(await lookupUpcitemdb('4820000000017')).toMatchObject({ skipped: 'error' });
      }
      expect(await used()).toBe(0);
    });

    it('refunds a 5xx', async () => {
      await reset();
      stubFetch(async () => jsonResponse({}, 503));

      expect(await lookupUpcitemdb('4820000000017')).toMatchObject({
        skipped: 'error',
        reason: 'http_503',
      });
      expect(await used()).toBe(0);
    });

    it('keeps the slot on a 429 — that allowance really was spent', async () => {
      await reset();
      stubFetch(async () => jsonResponse({}, 429));
      await lookupUpcitemdb('4820000000017');
      expect(await used()).toBe(1);
    });

    it('keeps the slot on a 401 — refunding would hammer a provider all day', async () => {
      await reset();
      stubFetch(async () => jsonResponse({}, 401));
      await lookupUpcitemdb('4820000000017');
      expect(await used()).toBe(1);
    });
  });

  describe('a provider that answers', () => {
    it('spends one slot on a hit', async () => {
      await reset();
      stubFetch(async () => jsonResponse({ items: [{ title: 'Bodysuit' }] }));

      expect(await lookupUpcitemdb('4820000000017')).toMatchObject({
        source: 'upcitemdb',
        found: true,
        name: 'Bodysuit',
      });
      expect(await used()).toBe(1);
    });

    it('spends one slot on a miss too — the request still happened', async () => {
      await reset();
      stubFetch(async () => jsonResponse({ items: [], total: 0 }));
      await lookupUpcitemdb('4820000000017');
      expect(await used()).toBe(1);
    });
  });
});
