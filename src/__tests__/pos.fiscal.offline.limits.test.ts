// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.limits.test.ts
//
// The tax office's monthly offline allowance: 168 hours per ПРРО per calendar
// month (Положення № 13), on top of the 36 hours in a row the session gate
// already holds. TechDocs/POS_FISCAL_OFFLINE.md.
//
// What is pinned: the month is Ukrainian, not UTC (an outage at 00:30 on the
// 1st belongs to the new month only if Kyiv says so); every stretch of the
// month counts, whatever became of it; a register that has spent the hours
// cannot open another offline session; one that spends them mid-session stops
// selling but keeps the session — those receipts still owe the tax office a
// delivery; and the count travels to the till with its lease, because the till
// is the one that has to refuse while it has no network.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import {
  kyivMonthStart,
  offlineMonthUsage,
  OFFLINE_MONTH_MAX_MS,
} from '../pos/fiscal/offline/limits.js';
import * as offlinePool from '../pos/fiscal/offline/pool.js';
import * as session from '../pos/fiscal/offline/session.js';
import { resolveContext, type FiscalContext } from '../pos/fiscal/shifts.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

const DEVICE = 'till-limits';
const HOUR = 60 * 60 * 1000;

describe('Ukrainian calendar month', () => {
  it('starts at local midnight of the 1st, not at 00:00 UTC', () => {
    // Summer: Kyiv is UTC+3, so the month begins at 21:00 of the last day.
    expect(kyivMonthStart(new Date('2026-09-13T00:30:00Z')).toISOString()).toBe(
      '2026-08-31T21:00:00.000Z'
    );
    // Winter: UTC+2.
    expect(kyivMonthStart(new Date('2026-01-01T21:30:00Z')).toISOString()).toBe(
      '2025-12-31T22:00:00.000Z'
    );
  });

  it('uses the offset in effect on the 1st, not today\'s', () => {
    // Clocks go forward on the last Sunday of March: the 1st is still UTC+2
    // while the day the question is asked is already UTC+3.
    expect(kyivMonthStart(new Date('2026-03-30T12:00:00Z')).toISOString()).toBe(
      '2026-02-28T22:00:00.000Z'
    );
    // And back in October: the 1st is UTC+3, the end of the month UTC+2.
    expect(kyivMonthStart(new Date('2026-10-30T12:00:00Z')).toISOString()).toBe(
      '2026-09-30T21:00:00.000Z'
    );
  });

  it('puts an outage just after Kyiv midnight into the new month', () => {
    // 21:30 UTC on 31 August is already 1 September in Kyiv (summer), so the
    // current month is September — an outage starting then is charged to it,
    // not to August.
    expect(kyivMonthStart(new Date('2026-08-31T21:30:00Z')).toISOString()).toBe(
      '2026-08-31T21:00:00.000Z'
    );
    // Half an hour earlier it is still August.
    expect(kyivMonthStart(new Date('2026-08-31T20:30:00Z')).toISOString()).toBe(
      '2026-07-31T21:00:00.000Z'
    );
    expect(kyivMonthStart(new Date('2026-09-01T00:30:00Z')).toISOString()).toBe(
      '2026-08-31T21:00:00.000Z'
    );
  });
});

describe.skipIf(!hasDb)('POS fiscal offline monthly limit (168 h per register)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rflimit');
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
    fake = new FakeFiscalProvider({ offline: true, shiftOpen: true });
    registerProvider(fake);
    resetRuntime();
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_offline_codes WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      default_tax_code: 'A',
      receipt_source: 'local',
      receipt_width: 32,
      offline_mode: true,
      offline_codes_target: 60,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    await pool.query(
      `UPDATE pos_fiscal_settings SET holder_device_id = NULL, holder_since = NULL,
         holder_last_seen_at = NULL, handover_device_id = NULL WHERE store_id = $1`,
      [store.storeId]
    );
    product = await seedProduct(store.storeId, { priceCents: 10000, quantity: 50 });
    resetRateLimiter();
    await offlinePool.refillOfflineCodes(
      (await resolveContext(store.storeId)) as FiscalContext,
      AbortSignal.timeout(10_000)
    );
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const headers = () => ({ ...auth(store.sellerToken), 'x-pos-device-id': DEVICE });
  const warm = () => fiscalService.preflight(store.storeId, store.sellerId, DEVICE);
  const providerDown = () => {
    resetRuntime();
    fake.queueError('unavailable');
  };
  const sell = () =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: headers(),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      },
    });
  const live = () => session.getLiveSession(store.storeId, '');

  // The counting tests below pin absolute instants and ask the counter about a
  // fixed `now` rather than the clock: a fixture written as "20 hours ago" is
  // half in the previous month if the suite happens to run on the 1st.
  const NOW = new Date('2026-09-20T12:00:00Z');
  const MONTH_START = kyivMonthStart(NOW); // 2026-08-31T21:00Z
  const at = (hoursIntoMonth: number): string =>
    new Date(MONTH_START.getTime() + hoursIntoMonth * HOUR).toISOString();

  /** A stretch of offline time, placed by its offset from the month's start. */
  const stretch = async (
    fromHour: number,
    toHour: number | null,
    status = 'closed',
    registerKey = ''
  ) => {
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions
         (store_id, cash_register_key, holder, device_id, started_at, ended_at, status)
       VALUES ($1, $2, 'device', $3, $4, $5, $6)`,
      [store.storeId, registerKey, DEVICE, at(fromHour), toHour === null ? null : at(toHour), status]
    );
  };

  // ── Counting ──────────────────────────────────────────────────────────────

  it('adds up every stretch of the month, whatever became of it', async () => {
    await stretch(10, 20, 'closed');
    await stretch(30, 33, 'stuck'); // parked is still time spent offline
    const usage = await offlineMonthUsage(store.storeId, '', NOW);
    expect(Math.round(usage.used_ms / HOUR)).toBe(13);
    expect(usage.limit_ms).toBe(OFFLINE_MONTH_MAX_MS);
    expect(usage.month_start).toBe(MONTH_START.toISOString());
  });

  it('counts a session that is still open up to now', async () => {
    // Started 3 hours before the `now` we ask about, no end yet.
    const hoursIn = (NOW.getTime() - MONTH_START.getTime()) / HOUR;
    await stretch(hoursIn - 3, null, 'open');
    const usage = await offlineMonthUsage(store.storeId, '', NOW);
    expect(Math.round(usage.used_ms / HOUR)).toBe(3);
  });

  it('clips a stretch that began in the previous month', async () => {
    await stretch(-5, 2, 'closed');
    // Only the two hours that fell inside this month.
    expect(Math.round((await offlineMonthUsage(store.storeId, '', NOW)).used_ms / HOUR)).toBe(2);
  });

  it('ignores a stretch that ended before the month began', async () => {
    await stretch(-30, -6, 'closed');
    expect((await offlineMonthUsage(store.storeId, '', NOW)).used_ms).toBe(0);
  });

  it('ignores a stretch that has not started as of the moment asked about', async () => {
    await stretch(40, 44, 'closed');
    expect((await offlineMonthUsage(store.storeId, '', new Date(at(20)))).used_ms).toBe(0);
  });

  it('is per register, not per store', async () => {
    await stretch(10, 15, 'closed', 'OTHER-REGISTER');
    expect((await offlineMonthUsage(store.storeId, '', NOW)).used_ms).toBe(0);
    expect(
      Math.round((await offlineMonthUsage(store.storeId, 'OTHER-REGISTER', NOW)).used_ms / HOUR)
    ).toBe(5);
  });

  // ── What it refuses ───────────────────────────────────────────────────────

  /**
   * Spend the month's allowance without waiting a week.
   *
   * These tests go through the real gates, which ask the clock, so the fixture
   * has to fit inside the month that is actually running. A month cannot hold
   * more offline hours than it has elapsed — so the allowance is filled with
   * as many overlapping closed stretches as it takes. Overlapping is a shape
   * production never produces (one live session per register), but the counter
   * sums rows, and rows are what this needs.
   */
  const spendTheMonth = async () => {
    const elapsedMs = Date.now() - kyivMonthStart().getTime();
    const span = Math.max(60_000, elapsedMs - 60_000);
    const copies = Math.ceil(OFFLINE_MONTH_MAX_MS / span) + 1;
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions
         (store_id, cash_register_key, holder, started_at, ended_at, status)
       SELECT $1, '', 'server', NOW() - ($2 || ' milliseconds')::interval,
              NOW() - interval '1 minute', 'closed'
       FROM generate_series(1, $3)`,
      [store.storeId, String(span), copies]
    );
  };

  it('refuses to open another offline session once the month is spent', async () => {
    await warm();
    await spendTheMonth();
    providerDown();

    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'offline_month_limit' });
    // Nothing was opened, and nothing was stamped: the sale simply did not happen.
    expect(await live()).toBeNull();
  });

  it('stops selling inside a live session but leaves the session alone', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);
    const open = (await live()) as session.OfflineSessionRow;

    await spendTheMonth();
    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('offline_month_limit');

    // Unlike the 36h limit, this one does not park the session: its receipts
    // are lawful and still owe the tax office a delivery.
    expect(await session.getSession(open.id)).toMatchObject({ status: 'open' });
    expect(await live()).not.toBeNull();
  });

  /**
   * A short stretch that just ended, for the endpoints that measure against
   * the real clock. Twenty minutes rather than hours so it still lies inside
   * the month when the suite runs shortly after midnight on the 1st.
   */
  const recentStretch = async () => {
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions
         (store_id, cash_register_key, holder, started_at, ended_at, status)
       VALUES ($1, '', 'server', NOW() - interval '30 minutes', NOW() - interval '10 minutes', 'closed')`,
      [store.storeId]
    );
  };

  it('sends the count to the till with its lease', async () => {
    await recentStretch();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/offline/lease',
      headers: headers(),
      payload: { outbox_pending: 0 },
    });
    expect(res.statusCode).toBe(200);
    const month = res.json().offline_month;
    expect(month.limit_ms).toBe(OFFLINE_MONTH_MAX_MS);
    expect(Math.round(month.used_ms / 60_000)).toBe(20);
    expect(Date.parse(month.measured_at)).toBeGreaterThan(Date.parse(month.month_start));
  });

  it('shows the owner the same count on the settings screen', async () => {
    await recentStretch();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.ownerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(Math.round(res.json().offline_month.used_ms / 60_000)).toBe(20);
  });
});
