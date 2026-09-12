// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.lease.test.ts
//
// The till's reserve of tax-office codes (TechDocs/POS_FISCAL_OFFLINE.md,
// план фазы 3, шаг 1) — what a till has to be carrying before the network
// goes, and how it tells us its queue has drained.
//
// What is pinned: only the register holder gets a lease and a second till is
// refused; the answer is the till's whole reserve, topped up and idempotent;
// leased codes are the server's no longer; an empty outbox releases the replay
// and a new receipt holds it back again; and a handover returns the reserve
// while a forced one burns it.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import { OFFLINE_LEASE_SIZE } from '../pos/fiscal/offline/lease.js';
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
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

const TILL = 'till-lease-A';
const OTHER = 'till-lease-B';

describe.skipIf(!hasDb)('POS fiscal offline lease (case C — the till carries the codes)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rflease');
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
      offline_mode: true,
      offline_codes_target: 60,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    await pool.query(
      `UPDATE pos_fiscal_settings SET holder_device_id = NULL, holder_since = NULL,
         holder_last_seen_at = NULL, handover_device_id = NULL, handover_name = NULL
       WHERE store_id = $1`,
      [store.storeId]
    );
    resetRateLimiter();
    await offlinePool.refillOfflineCodes(await ctx(), AbortSignal.timeout(10_000));
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const ctx = async () => (await resolveContext(store.storeId)) as FiscalContext;
  const headers = (device: string | null = TILL) => ({
    ...auth(store.sellerToken),
    ...(device ? { 'x-pos-device-id': device } : {}),
  });

  const lease = (opts: { device?: string | null; pending?: number } = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/offline/lease',
      headers: headers(opts.device === undefined ? TILL : opts.device),
      payload: { outbox_pending: opts.pending ?? 0 },
    });

  const counts = () => offlinePool.countCodes(store.storeId, '');

  // ── Who may carry a reserve ───────────────────────────────────────────────

  it('hands the first till a full reserve and claims the register for it', async () => {
    const res = await lease();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lease_size).toBe(OFFLINE_LEASE_SIZE);
    expect(body.codes).toHaveLength(OFFLINE_LEASE_SIZE);
    // Serial order is spend order: the tax office issued them in it.
    expect(body.codes[0].fiscal_code).toBe('OFF-0001');
    expect(body.codes.map((c: { serial_id: number }) => c.serial_id)).toEqual(
      [...body.codes].sort((a: { serial_id: number }, b: { serial_id: number }) => a.serial_id - b.serial_id)
        .map((c: { serial_id: number }) => c.serial_id)
    );
    // The reserve is the server's no longer — a case-B session must never
    // stamp a code a till may already have printed.
    expect(await counts()).toMatchObject({ free: 10, leased: OFFLINE_LEASE_SIZE, used: 0 });

    const holder = await pool.query(
      `SELECT holder_device_id FROM pos_fiscal_settings WHERE store_id = $1`,
      [store.storeId]
    );
    expect(holder.rows[0].holder_device_id).toBe(TILL);
  });

  it('refuses a second till and leaves its reserve alone', async () => {
    await lease();
    const res = await lease({ device: OTHER });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'register_held' });
    expect(res.json().holder).toMatchObject({ device_id: TILL });
    expect((await offlinePool.listLeasedCodes(store.storeId, '', OTHER))).toHaveLength(0);
  });

  it('refuses the web shell, which has no device id to lease to', async () => {
    const res = await lease({ device: null });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'device_id_required' });
  });

  it('says so plainly when the store does not sell offline', async () => {
    await updateFiscalSettings(store.storeId, { offline_mode: false });
    const res = await lease();
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'offline_off' });
  });

  // ── Topping up ────────────────────────────────────────────────────────────

  it('is idempotent: the same reserve comes back, not a second one', async () => {
    const first = await lease();
    const second = await lease();
    expect(second.json().codes).toEqual(first.json().codes);
    expect(await counts()).toMatchObject({ leased: OFFLINE_LEASE_SIZE });
  });

  it('tops the reserve back up after the till spent some of it', async () => {
    await lease();
    // Three receipts printed during an outage: those codes are `used` now.
    const held = await offlinePool.listLeasedCodes(store.storeId, '', TILL);
    await pool.query(
      `UPDATE pos_fiscal_offline_codes SET status = 'used' WHERE id = ANY($1::bigint[])`,
      [held.slice(0, 3).map((c) => c.id)]
    );

    const res = await lease();
    expect(res.json().codes).toHaveLength(OFFLINE_LEASE_SIZE);
    expect(res.json().codes.map((c: { fiscal_code: string }) => c.fiscal_code)).not.toContain(
      held[0].fiscal_code
    );
    expect(await counts()).toMatchObject({ free: 7, leased: OFFLINE_LEASE_SIZE, used: 3 });
  });

  it('hands over what is left when the pool cannot fill the reserve', async () => {
    // An outage long enough to drain the pool is a real state, not an error:
    // the till learns how many receipts it still has and says so to the cashier.
    await pool.query(
      `UPDATE pos_fiscal_offline_codes SET status = 'burned' WHERE store_id = $1 AND status = 'free'`,
      [store.storeId]
    );
    await pool.query(
      `UPDATE pos_fiscal_offline_codes SET status = 'free' WHERE store_id = $1 AND serial_id <= 2`,
      [store.storeId]
    );
    const res = await lease();
    expect(res.statusCode).toBe(200);
    expect(res.json().codes).toHaveLength(2);
  });

  // ── What else the till needs to know ──────────────────────────────────────

  it('carries the shift, ФН ПРРО and the live session with the codes', async () => {
    // The till prints ФН ПРРО on every offline receipt and builds the QR from
    // it, and it may only stamp inside a shift that was opened online.
    await fiscalService.preflight(store.storeId, store.sellerId, TILL);
    await pool.query(
      `UPDATE pos_fiscal_settings SET register_fiscal_number = '4001118166' WHERE store_id = $1`,
      [store.storeId]
    );

    const body = (await lease()).json();
    expect(body.register_fiscal_number).toBe('4001118166');
    expect(body.shift).toMatchObject({ id: expect.any(Number) });
    expect(body.shift.auto_close_due_at).toBeTruthy();
    expect(body.session).toBeNull();
  });

  it('reports no shift when none is open — the till must not stamp then', async () => {
    const body = (await lease()).json();
    expect(body.shift).toBeNull();
  });

  // ── Releasing the replay ──────────────────────────────────────────────────

  it('an empty outbox marks the session ready, a pending one does not', async () => {
    const opened = await session.openSession(await ctx(), {
      holder: 'device',
      shiftId: null,
      deviceId: TILL,
      clientSessionId: 'cs-1',
      requireCode: false,
    });
    expect(opened.ready_at).toBeNull();
    // Still uploading: the replay must not send `go-offline` yet, or the
    // receipts still queued would be dated before a chain that moved past them.
    expect((await lease({ pending: 2 })).json().session.ready_at).toBeNull();
    expect(await session.listReplayableSessions({ storeId: store.storeId })).toHaveLength(0);

    expect((await lease({ pending: 0 })).json().session.ready_at).toBeTruthy();
    expect(
      (await session.listReplayableSessions({ storeId: store.storeId })).map((s) => s.id)
    ).toContain(opened.id);
  });

  it('leaves a server-held session alone — nothing else can add to it', async () => {
    const opened = await session.openServerSession(await ctx(), null);
    expect(
      (await session.listReplayableSessions({ storeId: store.storeId })).map((s) => s.id)
    ).toContain(opened.id);
    // And the till's own lease call does not touch it: the session is not its.
    expect((await lease({ pending: 0 })).json().session).toMatchObject({
      id: opened.id,
      holder: 'server',
      ready_at: null,
    });
  });

  // ── Giving the register up ────────────────────────────────────────────────

  it('a clean handover returns the reserve to the pool', async () => {
    await lease();
    await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/register/handover/request',
      headers: headers(OTHER),
      payload: {},
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/register/handover/confirm',
      headers: headers(TILL),
      payload: { outbox_pending: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(await counts()).toMatchObject({ free: 60, leased: 0 });
  });

  it('a forced handover burns the reserve instead of recycling it', async () => {
    // The old till may have printed receipts on some of those codes and we
    // will never see them in order; reusing one would file it twice.
    await lease();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/register/handover/force',
      headers: auth(store.ownerToken),
      payload: { device_id: OTHER },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().burned_codes).toBe(OFFLINE_LEASE_SIZE);
    expect(await counts()).toMatchObject({ free: 10, leased: 0, burned: OFFLINE_LEASE_SIZE });
  });

  it('counts the till its own reserve on the status screen', async () => {
    await lease();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/status',
      headers: headers(),
    });
    expect(res.json().offline.codes).toMatchObject({
      free: 10,
      leased: OFFLINE_LEASE_SIZE,
      leased_to_me: OFFLINE_LEASE_SIZE,
    });
    // The web shell holds none of them, and its panel says so.
    const web = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/status',
      headers: auth(store.sellerToken),
    });
    expect(web.json().offline.codes.leased_to_me).toBe(0);
  });
});
