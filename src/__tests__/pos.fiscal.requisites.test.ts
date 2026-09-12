// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.requisites.test.ts
//
// The store's legal requisites, ФН ПРРО and tax letters come from the
// provider, not from a form (TechDocs/POS_FISCAL_OFFLINE.md, «Фаза 8в»). What
// is worth pinning: they are fetched at the online moments and nowhere near
// checkout, a stale cache is refreshed and a fresh one is not, a failed fetch
// never fails the job that triggered it, and the till gets them with its login
// so it can print them without a connection.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { REQUISITES_TTL_MS, refreshRequisites } from '../pos/fiscal/requisites.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { getFiscalSettings, updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import { openShift, resolveContext, type FiscalContext } from '../pos/fiscal/shifts.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FAKE_REQUISITES, FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

describe.skipIf(!hasDb)('POS fiscal requisites', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rreq');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    fake = new FakeFiscalProvider();
    registerProvider(fake);
    resetRuntime();
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    await pool.query(
      `UPDATE pos_fiscal_settings
       SET requisites = NULL, requisites_fetched_at = NULL, register_fiscal_number = NULL
       WHERE store_id = $1`,
      [store.storeId]
    );
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const ctx = async () => (await resolveContext(store.storeId)) as FiscalContext;
  const fetches = () => fake.calls.filter((c) => c.method === 'fetchRequisites').length;
  const stored = async () => (await getFiscalSettings(store.storeId))!;

  it('opening a shift caches the requisites and the register number', async () => {
    await openShift(await ctx(), AbortSignal.timeout(5000));

    expect(fetches()).toBe(1);
    const row = await stored();
    expect(row.requisites).toEqual(FAKE_REQUISITES);
    expect(row.requisites_fetched_at).not.toBeNull();
    // Mirrored into its own column: the tax-office link builder reads it there.
    expect(row.register_fiscal_number).toBe('FAKE-FN');
  });

  it('does not ask again while the cache is younger than the TTL', async () => {
    const c = await ctx();
    expect((await refreshRequisites(c, AbortSignal.timeout(5000))).outcome).toBe('refreshed');
    expect((await refreshRequisites(c, AbortSignal.timeout(5000))).outcome).toBe('fresh');
    expect(fetches()).toBe(1);
  });

  it('asks again once the cache is older than the TTL', async () => {
    const c = await ctx();
    await refreshRequisites(c, AbortSignal.timeout(5000));
    await pool.query(
      `UPDATE pos_fiscal_settings SET requisites_fetched_at = NOW() - ($2 || ' ms')::interval
       WHERE store_id = $1`,
      [store.storeId, String(REQUISITES_TTL_MS + 1000)]
    );
    expect((await refreshRequisites(await ctx(), AbortSignal.timeout(5000))).outcome).toBe(
      'refreshed'
    );
    expect(fetches()).toBe(2);
  });

  it('a failed fetch is a log line, not a failed shift', async () => {
    // The refresh runs after the provider opened the shift; a hiccup there
    // must not turn a shift that IS open into an error the cashier sees.
    fake.requisitesError = 'unavailable';
    const state = await openShift(await ctx(), AbortSignal.timeout(5000));
    expect(state.status).toBe('open');
    expect((await stored()).requisites).toBeNull();
  });

  it('the connection test refreshes them for an enabled store, even when fresh', async () => {
    const c = await ctx();
    await refreshRequisites(c, AbortSignal.timeout(5000));
    fake.requisites = { ...FAKE_REQUISITES, point: { name: 'Нова точка', address: 'вул. Інша, 1' } };

    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/test-connection',
      headers: auth(store.ownerToken),
    });
    expect(res.statusCode).toBe(200);
    expect((await stored()).requisites?.point.name).toBe('Нова точка');
  });

  it('ships them to the till in the login blob and on the settings screen', async () => {
    await refreshRequisites(await ctx(), AbortSignal.timeout(5000));

    const me = await app.inject({ method: 'GET', url: '/api/pos/me', headers: auth(store.sellerToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json().store.fiscal).toMatchObject({
      enabled: true,
      register_fiscal_number: 'FAKE-FN',
      requisites: { organization: { name: 'ТОВ «Тестова організація»' } },
    });

    const settings = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.ownerToken),
    });
    expect(settings.json().requisites).toEqual(FAKE_REQUISITES);
    expect(settings.json().requisites_fetched_at).toMatch(/^\d{4}-/);
  });

  it('reports nothing before the first online contact', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/pos/me', headers: auth(store.sellerToken) });
    expect(me.json().store.fiscal).toMatchObject({ register_fiscal_number: null, requisites: null });
  });
});
