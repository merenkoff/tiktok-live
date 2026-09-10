// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.holder.test.ts
//
// The register holder and handover protocol (TechDocs/POS_FISCAL_OFFLINE.md
// §3а) over HTTP. Two guarantees above all: the lock changes nothing while
// `offline_mode` is off, and while it is on, exactly one device id can sell.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import * as holder from '../pos/fiscal/offline/holder.js';
import * as offlinePool from '../pos/fiscal/offline/pool.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
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

const DEVICE_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE_B = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';

describe.skipIf(!hasDb)('POS fiscal register holder', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfhold');
    app = await buildPosTestApp();
    product = await seedProduct(store.storeId, { priceCents: 10000, quantity: 500 });
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
    await pool.query(`DELETE FROM pos_fiscal_offline_codes WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      offline_mode: true,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    await pool.query(
      `UPDATE pos_fiscal_settings SET holder_device_id = NULL, holder_name = NULL, holder_since = NULL,
         holder_last_seen_at = NULL, handover_device_id = NULL, handover_name = NULL,
         handover_requested_at = NULL WHERE store_id = $1`,
      [store.storeId]
    );
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const headers = (token: string, deviceId?: string) => ({
    ...auth(token),
    ...(deviceId ? { 'x-pos-device-id': deviceId } : {}),
  });

  const sell = (deviceId?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: headers(store.sellerToken, deviceId),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      },
    });

  const post = (path: string, deviceId: string | undefined, payload: unknown = {}, token = store.sellerToken) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/fiscal/register/${path}`,
      headers: headers(token, deviceId),
      payload: payload as Record<string, unknown>,
    });

  const status = (deviceId?: string) =>
    app.inject({ method: 'GET', url: '/api/pos/fiscal/status', headers: headers(store.sellerToken, deviceId) });

  const holderRow = async () =>
    (
      await pool.query(
        `SELECT holder_device_id, holder_name, holder_last_seen_at, handover_device_id
         FROM pos_fiscal_settings WHERE store_id = $1`,
        [store.storeId]
      )
    ).rows[0];

  // ── Off switch ────────────────────────────────────────────────────────────

  it('enforces nothing while offline_mode is off: web shell and two tills all sell', async () => {
    await updateFiscalSettings(store.storeId, { offline_mode: false });
    expect((await sell()).statusCode).toBe(201);
    expect((await sell(DEVICE_A)).statusCode).toBe(201);
    expect((await sell(DEVICE_B)).statusCode).toBe(201);
    expect((await holderRow()).holder_device_id).toBeNull();
  });

  // ── The gate ──────────────────────────────────────────────────────────────

  it('lets the first till take a free register implicitly, then refuses the second', async () => {
    const first = await sell(DEVICE_A);
    expect(first.statusCode).toBe(201);
    expect((await holderRow()).holder_device_id).toBe(DEVICE_A);

    const second = await sell(DEVICE_B);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: 'register_held',
      holder: { device_id: DEVICE_A, stale: false },
    });
    // Nothing was written for the refused sale: no row, no provider call.
    expect(fake.calls.filter((c) => c.method === 'registerSale')).toHaveLength(1);

    // The holder keeps selling.
    expect((await sell(DEVICE_A)).statusCode).toBe(201);
  });

  it('refuses a caller with no device id — the web shell can never hold', async () => {
    const res = await sell();
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'register_held', code: 'no_device', holder: null });
    expect((await holderRow()).holder_device_id).toBeNull();
  });

  it('gates refunds and service receipts the same way', async () => {
    const sale = await sell(DEVICE_A);
    const saleId = sale.json().id;
    const refund = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: headers(store.sellerToken, DEVICE_B),
      payload: { items: [{ sale_item_id: sale.json().items[0].id, quantity: 1 }] },
    });
    expect(refund.statusCode).toBe(409);
    expect(refund.json().error).toBe('register_held');

    const service = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/service',
      headers: headers(store.sellerToken, DEVICE_B),
      payload: { amount_cents: 500 },
    });
    expect(service.statusCode).toBe(409);
    expect(service.json()).toMatchObject({ error: 'register_held', holder: { device_id: DEVICE_A } });
  });

  // ── Claim / release ───────────────────────────────────────────────────────

  it('claim: free → mine (with a name), mine again → still mine, other → 409 register_taken', async () => {
    const a = await post('claim', DEVICE_A, { device_name: 'Каса біля входу' });
    expect(a.statusCode).toBe(200);
    expect(a.json().holder).toMatchObject({ device_id: DEVICE_A, name: 'Каса біля входу', stale: false });

    const again = await post('claim', DEVICE_A);
    expect(again.statusCode).toBe(200);
    expect(again.json().holder.name).toBe('Каса біля входу');

    const b = await post('claim', DEVICE_B, { device_name: 'Друга' });
    expect(b.statusCode).toBe(409);
    expect(b.json()).toMatchObject({ error: 'register_taken', holder: { device_id: DEVICE_A } });
    expect((await holderRow()).holder_device_id).toBe(DEVICE_A);
  });

  it('claim without a device id is a 400, not a lock', async () => {
    const res = await post('claim', undefined);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('device_id_required');
  });

  it('release: only the holder, and only without a live offline session', async () => {
    await post('claim', DEVICE_A);
    expect((await post('release', DEVICE_B)).statusCode).toBe(409);
    expect((await post('release', DEVICE_B)).json().error).toBe('not_holder');

    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions (store_id, holder, device_id, started_at, status)
       VALUES ($1, 'device', $2, NOW(), 'open')`,
      [store.storeId, DEVICE_A]
    );
    const blocked = await post('release', DEVICE_A);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe('session_open');

    await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
    const ok = await post('release', DEVICE_A);
    expect(ok.statusCode).toBe(200);
    expect((await holderRow()).holder_device_id).toBeNull();
    // Free again: the other till can take it.
    expect((await post('claim', DEVICE_B)).statusCode).toBe(200);
  });

  // ── Handover ──────────────────────────────────────────────────────────────

  it('request → holder sees it in status → confirm moves the lock and returns the lease', async () => {
    await post('claim', DEVICE_A, { device_name: 'A' });
    // Give A a lease so we can see it come back.
    await pool.query(
      `INSERT INTO pos_fiscal_offline_codes (store_id, fiscal_code, serial_id, status, lease_device_id, leased_at)
       VALUES ($1, 'OFF-1', 1, 'leased', $2, NOW()), ($1, 'OFF-2', 2, 'leased', $2, NOW())`,
      [store.storeId, DEVICE_A]
    );

    const req = await post('handover/request', DEVICE_B, { device_name: 'B' });
    expect(req.statusCode).toBe(202);
    expect(req.json()).toMatchObject({
      status: 'requested',
      holder: { device_id: DEVICE_A, handover_request: { device_id: DEVICE_B, name: 'B' } },
    });

    const seenByA = await status(DEVICE_A);
    expect(seenByA.json().holder).toMatchObject({
      device_id: DEVICE_A,
      is_me: true,
      handover_request: { device_id: DEVICE_B },
    });
    const seenByB = await status(DEVICE_B);
    expect(seenByB.json().holder.is_me).toBe(false);

    // B cannot confirm for A.
    const wrong = await post('handover/confirm', DEVICE_B, { outbox_pending: 0 });
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().error).toBe('not_holder');

    // A with a non-empty outbox is refused.
    const busy = await post('handover/confirm', DEVICE_A, { outbox_pending: 3 });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ error: 'handover_blocked', reason: 'outbox_pending' });

    const ok = await post('handover/confirm', DEVICE_A, { outbox_pending: 0 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().holder).toMatchObject({ device_id: DEVICE_B, name: 'B', handover_request: null });
    expect(await offlinePool.countCodes(store.storeId, '')).toMatchObject({ free: 2, leased: 0 });

    // Now B sells and A is refused.
    expect((await sell(DEVICE_B)).statusCode).toBe(201);
    expect((await sell(DEVICE_A)).statusCode).toBe(409);
  });

  it('confirm is refused while the holder has a live offline session', async () => {
    await post('claim', DEVICE_A);
    await post('handover/request', DEVICE_B);
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions (store_id, holder, device_id, started_at, status)
       VALUES ($1, 'device', $2, NOW(), 'replaying')`,
      [store.storeId, DEVICE_A]
    );
    const res = await post('handover/confirm', DEVICE_A, { outbox_pending: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'handover_blocked', reason: 'session_open' });
    expect((await holderRow()).holder_device_id).toBe(DEVICE_A);
  });

  it('confirm without a request, and a request from the holder itself, are 409s', async () => {
    await post('claim', DEVICE_A);
    const none = await post('handover/confirm', DEVICE_A, { outbox_pending: 0 });
    expect(none.statusCode).toBe(409);
    expect(none.json().error).toBe('no_request');
    const self = await post('handover/request', DEVICE_A);
    expect(self.statusCode).toBe(409);
    expect(self.json().error).toBe('already_holder');
  });

  it('a request against a free register simply claims it', async () => {
    const res = await post('handover/request', DEVICE_B, { device_name: 'B' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'claimed', holder: { device_id: DEVICE_B } });
  });

  it('a newer request replaces an older one', async () => {
    await post('claim', DEVICE_A);
    await post('handover/request', DEVICE_B, { device_name: 'B' });
    await post('handover/request', 'cccccccc-3333-4ccc-8ccc-cccccccccccc', { device_name: 'C' });
    expect((await holderRow()).handover_device_id).toBe('cccccccc-3333-4ccc-8ccc-cccccccccccc');
  });

  // ── Force ─────────────────────────────────────────────────────────────────

  it('force: owner only; strands the old holder’s session, burns its lease, moves the lock', async () => {
    await post('claim', DEVICE_A);
    await pool.query(
      `INSERT INTO pos_fiscal_offline_codes (store_id, fiscal_code, serial_id, status, lease_device_id, leased_at)
       VALUES ($1, 'OFF-1', 1, 'leased', $2, NOW())`,
      [store.storeId, DEVICE_A]
    );
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions (store_id, holder, device_id, started_at, status)
       VALUES ($1, 'device', $2, NOW(), 'open')`,
      [store.storeId, DEVICE_A]
    );
    await post('handover/request', DEVICE_B, { device_name: 'B' });

    const seller = await post('handover/force', undefined, {}, store.sellerToken);
    expect(seller.statusCode).toBe(403);

    const res = await post('handover/force', undefined, {}, store.ownerToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      holder: { device_id: DEVICE_B, name: 'B', handover_request: null },
      stuck_sessions: 1,
      burned_codes: 1,
    });
    const session = (
      await pool.query(`SELECT status, error_code FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [
        store.storeId,
      ])
    ).rows[0];
    expect(session).toMatchObject({ status: 'stuck', error_code: 'register_taken' });
    expect(await offlinePool.countCodes(store.storeId, '')).toMatchObject({ burned: 1, leased: 0 });
    expect((await sell(DEVICE_A)).statusCode).toBe(409);
    expect((await sell(DEVICE_B)).statusCode).toBe(201);
  });

  it('force with an explicit target and no pending request', async () => {
    await post('claim', DEVICE_A);
    const none = await post('handover/force', undefined, {}, store.ownerToken);
    expect(none.statusCode).toBe(400);
    expect(none.json().error).toBe('no_target');

    const bad = await post('handover/force', undefined, { device_id: 'not valid!' }, store.ownerToken);
    expect(bad.statusCode).toBe(400);

    const res = await post('handover/force', undefined, { device_id: DEVICE_B, device_name: 'Нова' }, store.ownerToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ holder: { device_id: DEVICE_B, name: 'Нова' }, stuck_sessions: 0, burned_codes: 0 });
  });

  // ── Heartbeat and status ──────────────────────────────────────────────────

  it('status reports the offline block and a stale holder; the holder’s own poll refreshes it', async () => {
    await post('claim', DEVICE_A);
    await pool.query(
      `UPDATE pos_fiscal_settings SET holder_last_seen_at = NOW() - interval '10 minutes' WHERE store_id = $1`,
      [store.storeId]
    );
    const seenByB = await status(DEVICE_B);
    expect(seenByB.json()).toMatchObject({
      offline: { capable: true, enabled: true, codes: { free: 0, leased: 0, used: 0 }, session: null },
      holder: { device_id: DEVICE_A, stale: true, is_me: false },
    });

    resetRuntime(); // throttle: allow the first touch
    const seenByA = await status(DEVICE_A);
    expect(seenByA.json().holder).toMatchObject({ is_me: true, stale: false });
    const row = await holderRow();
    expect(Date.now() - new Date(row.holder_last_seen_at).getTime()).toBeLessThan(60_000);
  });

  it('status without offline_mode shows the capability but no holder block', async () => {
    await updateFiscalSettings(store.storeId, { offline_mode: false });
    const res = await status(DEVICE_A);
    expect(res.json().offline).toMatchObject({ capable: true, enabled: false, codes: null });
    expect(res.json().holder).toBeNull();
  });

  it('touchHolder is throttled in-process', async () => {
    await holder.claimRegister(store.storeId, DEVICE_A, null);
    await holder.touchHolder(store.storeId, DEVICE_A); // arms the throttle
    await pool.query(
      `UPDATE pos_fiscal_settings SET holder_last_seen_at = NOW() - interval '10 minutes' WHERE store_id = $1`,
      [store.storeId]
    );
    await holder.touchHolder(store.storeId, DEVICE_A); // within the interval: no write
    expect((await holder.getHolder(store.storeId))?.stale).toBe(true);
    resetRuntime();
    await holder.touchHolder(store.storeId, DEVICE_A);
    expect((await holder.getHolder(store.storeId))?.stale).toBe(false);
  });
});
