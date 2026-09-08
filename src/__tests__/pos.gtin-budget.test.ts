// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.gtin-budget.test.ts
//
// The daily provider budget is the only thing standing between a busy shift and
// a 429 from upc.dev, and it is also what a store owner's `gtin_daily_limit` is
// checked against. Two properties matter:
//
//   - the counter is keyed by whoever actually holds the upstream allowance, so
//     one store's scans cannot spend another store's key;
//   - a request the provider never counted gives its slot back, so a provider
//     that is down cannot hollow out the whole day.
//
// The provider functions are driven with a stubbed `fetch`: everything asserted
// here is about the budget rows, never about a real outbound call.

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
import { lookupUpcDev } from '../pos/gtin/upc-dev.provider.js';
import { lookupUpcitemdb } from '../pos/gtin/upcitemdb.provider.js';

const KEY_A = 'test-key-alpha';
const KEY_B = 'test-key-beta';
const SCOPES = [budgetScope('upc_dev', KEY_A), budgetScope('upc_dev', KEY_B), 'shared'];

async function used(provider: 'upc_dev' | 'upcitemdb', scope: string): Promise<number> {
  return getUsedCount(provider, { scope });
}

function stubFetch(impl: () => Promise<unknown> | never): void {
  vi.stubGlobal('fetch', vi.fn(impl as () => Promise<Response>));
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe.skipIf(!hasDb)('GTIN provider budget', () => {
  beforeAll(async () => {
    await applyPosMigrations();
  }, 120000);

  afterEach(async () => {
    vi.unstubAllGlobals();
    await pool.query(`DELETE FROM pos_gtin_provider_budget WHERE scope = ANY($1)`, [SCOPES]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('scope', () => {
    it('gives two upc.dev keys two independent buckets', async () => {
      const a = budgetScope('upc_dev', KEY_A);
      const b = budgetScope('upc_dev', KEY_B);
      expect(a).not.toBe(b);

      expect(await tryConsumeBudget('upc_dev', { scope: a, limit: 1 })).toBe(true);
      // Store A is now out. Store B, on its own key, must be untouched.
      expect(await tryConsumeBudget('upc_dev', { scope: a, limit: 1 })).toBe(false);
      expect(await tryConsumeBudget('upc_dev', { scope: b, limit: 1 })).toBe(true);
    });

    it('puts two stores that share the env key in one bucket', async () => {
      // They really do share one allowance upstream; separate buckets here would
      // spend it twice over and start collecting 429s.
      const scope = budgetScope('upc_dev', KEY_A);
      expect(budgetScope('upc_dev', ` ${KEY_A} `)).toBe(scope);
      expect(await tryConsumeBudget('upc_dev', { scope, limit: 1 })).toBe(true);
      expect(await tryConsumeBudget('upc_dev', { scope, limit: 1 })).toBe(false);
    });

    it('keeps the key out of the table', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      expect(scope).toMatch(/^key:[0-9a-f]{16}$/);
      expect(scope).not.toContain(KEY_A);
    });

    it('meters upcitemdb per deployment — its trial has no key', async () => {
      expect(budgetScope('upcitemdb')).toBe('shared');
      expect(budgetScope('upcitemdb', KEY_A)).toBe('shared');
    });
  });

  describe('releaseBudget', () => {
    it('gives a slot back and never goes below zero', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      await tryConsumeBudget('upc_dev', { scope });
      expect(await used('upc_dev', scope)).toBe(1);

      await releaseBudget('upc_dev', { scope });
      expect(await used('upc_dev', scope)).toBe(0);
      await releaseBudget('upc_dev', { scope });
      expect(await used('upc_dev', scope)).toBe(0);
    });
  });

  describe('a provider that is down', () => {
    it('does not spend the day on timeouts', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      stubFetch(() => Promise.reject(new Error('The operation timed out.')));

      for (let i = 0; i < 5; i++) {
        const out = await lookupUpcDev('4820000000017', {
          upcDevApiKey: KEY_A,
          upcDevDailyLimit: null,
        });
        expect(out).toMatchObject({ skipped: 'error' });
      }
      expect(await used('upc_dev', scope)).toBe(0);
    });

    it('refunds a 5xx', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      stubFetch(async () => jsonResponse({}, 503));

      const out = await lookupUpcDev('4820000000017', {
        upcDevApiKey: KEY_A,
        upcDevDailyLimit: null,
      });
      expect(out).toMatchObject({ skipped: 'error', reason: 'http_503' });
      expect(await used('upc_dev', scope)).toBe(0);
    });

    it('keeps the slot on a 429 — that allowance really was spent', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      stubFetch(async () => jsonResponse({}, 429));

      await lookupUpcDev('4820000000017', { upcDevApiKey: KEY_A, upcDevDailyLimit: null });
      expect(await used('upc_dev', scope)).toBe(1);
    });

    it('keeps the slot on a 401 — refunding would hammer a provider all day', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      stubFetch(async () => jsonResponse({}, 401));

      await lookupUpcDev('4820000000017', { upcDevApiKey: KEY_A, upcDevDailyLimit: null });
      expect(await used('upc_dev', scope)).toBe(1);
    });
  });

  describe('a provider that answers', () => {
    it('spends one slot on a hit', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      stubFetch(async () => jsonResponse({ ok: true, data: { name: 'Bodysuit' } }));

      const out = await lookupUpcDev('4820000000017', {
        upcDevApiKey: KEY_A,
        upcDevDailyLimit: null,
      });
      expect(out).toMatchObject({ source: 'upc_dev', found: true, name: 'Bodysuit' });
      expect(await used('upc_dev', scope)).toBe(1);
    });

    it('spends one slot on a miss too — the request still happened', async () => {
      const scope = budgetScope('upc_dev', KEY_A);
      stubFetch(async () => jsonResponse({ ok: false }));

      await lookupUpcDev('4820000000017', { upcDevApiKey: KEY_A, upcDevDailyLimit: null });
      expect(await used('upc_dev', scope)).toBe(1);
    });

    it('refunds upcitemdb on a timeout as well', async () => {
      stubFetch(() => Promise.reject(new Error('The operation timed out.')));
      const out = await lookupUpcitemdb('4820000000017');
      expect(out).toMatchObject({ skipped: 'error' });
      expect(await used('upcitemdb', 'shared')).toBe(0);
    });
  });

  it('does not call the provider once the store cap is reached', async () => {
    const scope = budgetScope('upc_dev', KEY_A);
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { name: 'X' } }));
    vi.stubGlobal('fetch', fetchMock);

    const cfg = { upcDevApiKey: KEY_A, upcDevDailyLimit: 2 };
    await lookupUpcDev('4820000000017', cfg);
    await lookupUpcDev('4820000000017', cfg);
    const third = await lookupUpcDev('4820000000017', cfg);

    expect(third).toEqual({ skipped: 'quota' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await used('upc_dev', scope)).toBe(2);
  });
});
