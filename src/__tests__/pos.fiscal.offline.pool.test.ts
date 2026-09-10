// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.pool.test.ts
//
// The server-side pool of tax-office offline codes (`src/pos/fiscal/offline/
// pool.ts`) against the fake provider's in-memory reserve. What matters:
// the pool never duplicates a code, never reuses one, notices codes the
// provider spent on its own, and the cron leaves stores alone unless they
// opted in with a capable provider.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import * as offlinePool from '../pos/fiscal/offline/pool.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import { resolveContext, type FiscalContext } from '../pos/fiscal/shifts.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

describe.skipIf(!hasDb)('POS fiscal offline code pool', () => {
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfpool');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    fake = new FakeFiscalProvider({ offline: true });
    registerProvider(fake);
    resetRuntime();
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_offline_codes WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      offline_mode: true,
      offline_codes_target: 60,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const ctx = async () => (await resolveContext(store.storeId)) as FiscalContext;
  const signal = () => AbortSignal.timeout(10_000);
  /** Each refill takes a background slot; the bucket refills slower than a test runs. */
  const refill = async () => {
    resetRateLimiter();
    return offlinePool.refillOfflineCodes(await ctx(), signal());
  };
  const counts = () => offlinePool.countCodes(store.storeId, '');
  const codeRows = async () =>
    (
      await pool.query(
        `SELECT fiscal_code, serial_id, status, lease_device_id FROM pos_fiscal_offline_codes
         WHERE store_id = $1 ORDER BY serial_id`,
        [store.storeId]
      )
    ).rows;

  // ── Refill ────────────────────────────────────────────────────────────────

  it('fills an empty pool up to the target, asking the tax office first', async () => {
    const result = await refill();
    expect(result).toEqual({ asked: 'done', fetched: 60, burned: 0 });
    expect(await counts()).toEqual({ free: 60, leased: 0, used: 0, burned: 0 });
    expect(fake.offline?.calls).toEqual(['askOfflineCodes:60', 'getOfflineCodes:60']);
  });

  it('does nothing while the pool is at target — no provider call at all', async () => {
    await refill();
    fake.offline!.calls.length = 0;
    const again = await refill();
    expect(again).toEqual({ asked: 'skipped', fetched: 0, burned: 0 });
    expect(fake.offline?.calls).toEqual([]);
  });

  it('never duplicates a code the provider lists again', async () => {
    await refill();
    // Take some out so the pool is below target; the provider still lists
    // the same 60 (they are unused at the tax office until sent).
    await offlinePool.takeFreeCodes(store.storeId, '', 10, { status: 'used', receiptId: null });
    const result = await refill();
    expect(result).toEqual({ asked: 'done', fetched: 0, burned: 0 });
    expect(await counts()).toEqual({ free: 50, leased: 0, used: 10, burned: 0 });
    expect((await codeRows()).length).toBe(60);
  });

  it('still reads the reserve when the ask times out — earlier asks may have landed', async () => {
    fake.offline!.askStatus = 'timeout';
    // Pretend a previous, successful ask left 20 codes at the provider.
    fake.offline!.askStatus = 'done';
    await fake.offline!.askOfflineCodes(null as never, 20);
    fake.offline!.askStatus = 'timeout';
    fake.offline!.calls.length = 0;

    const result = await refill();
    expect(result).toEqual({ asked: 'timeout', fetched: 20, burned: 0 });
    expect(fake.offline?.calls).toEqual(['askOfflineCodes:60', 'getOfflineCodes:60']);
  });

  it('burns free codes the provider spent on its own, and only free ones', async () => {
    await refill();
    // Lease the two lowest to a till, then have the provider eat the next 5
    // (auto-offline at a tax-office timeout) — the leased ones stay listed
    // because they are still unused at the provider.
    const leased = await offlinePool.takeFreeCodes(store.storeId, '', 2, {
      status: 'leased',
      deviceId: 'dev-A',
    });
    expect(leased.map((c) => c.fiscal_code)).toEqual(['OFF-0001', 'OFF-0002']);
    fake.offline!.reserve = fake.offline!.reserve.filter(
      (c) => !['OFF-0003', 'OFF-0004', 'OFF-0005', 'OFF-0006', 'OFF-0007'].includes(c.fiscalCode)
    );
    // Asking mints replacements up to 60 again, so the provider now lists
    // 60 codes — none of which are 0003..0007.
    const result = await refill();
    expect(result.burned).toBe(0); // 60 listed = target: nothing is provably gone yet
    expect(result.fetched).toBe(5);

    // Now the provider cannot mint (tax office silent) and lists fewer than
    // target: whatever free code of ours is missing is provably spent.
    fake.offline!.askStatus = 'error';
    fake.offline!.reserve = fake.offline!.reserve.filter((c) => c.fiscalCode !== 'OFF-0010');
    // Stamp the five lowest free codes (0003..0007 — the ghosts) on documents,
    // which also drops the pool below target so the refill runs.
    const used = await offlinePool.takeFreeCodes(store.storeId, '', 5, { status: 'used', receiptId: null });
    expect(used.map((c) => c.fiscal_code)).toEqual(['OFF-0003', 'OFF-0004', 'OFF-0005', 'OFF-0006', 'OFF-0007']);
    const sweep = await refill();
    expect(sweep).toEqual({ asked: 'error', fetched: 0, burned: 1 });
    const rows = await codeRows();
    expect(rows.find((r) => r.fiscal_code === 'OFF-0010')?.status).toBe('burned');
    expect(rows.find((r) => r.fiscal_code === 'OFF-0001')?.status).toBe('leased');
    expect(rows.find((r) => r.fiscal_code === 'OFF-0003')?.status).toBe('used');
  });

  // ── Taking and releasing ──────────────────────────────────────────────────

  it('takeFreeCodes hands out the lowest serials and marks them', async () => {
    await refill();
    const first = await offlinePool.takeFreeCodes(store.storeId, '', 3, {
      status: 'leased',
      deviceId: 'dev-A',
    });
    expect(first.map((c) => c.fiscal_code)).toEqual(['OFF-0001', 'OFF-0002', 'OFF-0003']);
    expect(first.every((c) => c.status === 'leased' && c.lease_device_id === 'dev-A')).toBe(true);

    const next = await offlinePool.takeFreeCodes(store.storeId, '', 1, {
      status: 'used',
      receiptId: null,
    });
    expect(next[0].fiscal_code).toBe('OFF-0004');
    expect(next[0].status).toBe('used');
    expect(await counts()).toEqual({ free: 56, leased: 3, used: 1, burned: 0 });

    expect(await offlinePool.takeFreeCodes(store.storeId, '', 0, { status: 'used', receiptId: null })).toEqual([]);
  });

  it('returns fewer than asked when the pool runs dry, never a code twice', async () => {
    await refill();
    const all = await offlinePool.takeFreeCodes(store.storeId, '', 100, {
      status: 'leased',
      deviceId: 'dev-A',
    });
    expect(all).toHaveLength(60);
    expect(new Set(all.map((c) => c.fiscal_code)).size).toBe(60);
    expect(await offlinePool.takeFreeCodes(store.storeId, '', 1, { status: 'leased', deviceId: 'dev-B' })).toEqual([]);
  });

  it('releaseLeasedCodes returns a lease to free, or burns it', async () => {
    await refill();
    await offlinePool.takeFreeCodes(store.storeId, '', 5, { status: 'leased', deviceId: 'dev-A' });
    await offlinePool.takeFreeCodes(store.storeId, '', 2, { status: 'leased', deviceId: 'dev-B' });

    expect(await offlinePool.releaseLeasedCodes(store.storeId, 'dev-A', 'free')).toBe(5);
    expect(await offlinePool.releaseLeasedCodes(store.storeId, 'dev-B', 'burned')).toBe(2);
    expect(await counts()).toEqual({ free: 58, leased: 0, used: 0, burned: 2 });
    // Idempotent: nothing left to release.
    expect(await offlinePool.releaseLeasedCodes(store.storeId, 'dev-A', 'free')).toBe(0);
  });

  // ── Cron ──────────────────────────────────────────────────────────────────

  it('refillAllStores refills opted-in stores and skips the rest', async () => {
    // Other suites' stores may also have offline_mode on in this database, so
    // the totals are lower bounds; the store-level effect is what is pinned.
    resetRateLimiter();
    const result = await offlinePool.refillAllStores();
    expect(result.stores).toBeGreaterThanOrEqual(1);
    expect(result.fetched).toBeGreaterThanOrEqual(60);
    expect(await counts()).toMatchObject({ free: 60 });

    // offline_mode off → not even resolved: the pool stays empty.
    await pool.query(`DELETE FROM pos_fiscal_offline_codes WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, { offline_mode: false });
    resetRateLimiter();
    await offlinePool.refillAllStores();
    expect(await counts()).toMatchObject({ free: 0 });
  });

  it('refillAllStores skips a store whose adapter lost the capability', async () => {
    // Settings say offline_mode, but the adapter now installed for
    // `checkbox` declares no `offline` — nothing to refill from.
    const plain = new FakeFiscalProvider();
    registerProvider(plain);
    resetRuntime();
    await offlinePool.refillAllStores();
    expect(await counts()).toMatchObject({ free: 0 });
  });

  it('refillAllStores counts a provider failure without stopping', async () => {
    fake.signInError = 'unavailable';
    const result = await offlinePool.refillAllStores();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(await counts()).toMatchObject({ free: 0 });
  });
});
