// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.checkout.test.ts
//
// Case B of TechDocs/POS_FISCAL_OFFLINE.md over HTTP: the provider is
// unreachable, the till can reach us, the store runs `offline_mode` — so the
// sale is stamped from the server's code reserve instead of being refused.
// Phase 2, step 2.
//
// What is pinned: the 201 carries an offline stamp and no provider was
// called; every later sale joins the same session in order, even once the
// provider is back; refunds and service receipts wait for the replay; a
// replaying session, the 36h/24h limits and an empty reserve each refuse with
// their own code; and a stamp that failed voids the sale — nothing left the
// building.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import * as ledger from '../pos/fiscal/ledger.js';
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

const DEVICE = 'till-A';

describe.skipIf(!hasDb)('POS fiscal offline checkout (case B — server session)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfoffb');
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
    // Nobody holds the register between tests.
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

  /** Prime the shift cache + mirror row while the provider is reachable. */
  const warm = () => fiscalService.preflight(store.storeId, store.sellerId, DEVICE);

  /** The provider stops answering; the next pre-flight has to probe it. */
  const providerDown = () => {
    resetRuntime();
    fake.queueError('unavailable');
  };

  const sell = (clientUuid?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: headers(),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        ...(clientUuid ? { client_uuid: clientUuid } : {}),
      },
    });

  const refund = (saleId: number, saleItemId: number) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: headers(),
      payload: { items: [{ sale_item_id: saleItemId, quantity: 1 }], method: 'cash' },
    });

  const serviceReceipt = () =>
    app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/service',
      headers: headers(),
      payload: { amount_cents: 500 },
    });

  const live = () => session.getLiveSession(store.storeId, '');
  const ledgerRows = async () =>
    (await pool.query(`SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`, [store.storeId]))
      .rows as ledger.FiscalReceiptRow[];
  const saleRow = async (id: number) =>
    (await pool.query(`SELECT * FROM pos_sales WHERE id = $1`, [id])).rows[0];
  const providerCalls = () => fake.calls.filter((c) => c.method.startsWith('register'));

  // ── Opening a session ─────────────────────────────────────────────────────

  it('stamps the sale from the reserve when the provider is unreachable, without calling it', async () => {
    await warm();
    providerDown();

    const res = await sell();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.fiscal).toMatchObject({
      status: 'pending',
      mode: 'offline',
      fiscal_code: 'OFF-0002', // OFF-0001 went to go-offline
      // Still the provider's to give: it is minted when the document is
      // actually registered.
      control_number: null,
      qr_payload: null,
    });
    // The check link, though, is ours — composed at stamp time so the customer
    // walks out with a scannable QR. See the dedicated test below.
    expect(body.fiscal.tax_url).toContain('/cashregs/check');
    expect(body.fiscal.fiscal_date).toBeTruthy();
    expect(providerCalls()).toHaveLength(0);

    const s = await live();
    expect(s).toMatchObject({ holder: 'server', status: 'open', go_offline_code: 'OFF-0001' });
    expect(s?.shift_id).not.toBeNull();

    const [row] = await ledgerRows();
    expect(row).toMatchObject({ mode: 'offline', offline_seq: 1, status: 'pending', fiscal_code: 'OFF-0002' });
    expect(Number(row.offline_session_id)).toBe(s?.id);
    expect(row.next_attempt_at).toBeNull();
    expect((await saleRow(body.id)).fiscal_status).toBe('pending');
    expect(await offlinePool.countCodes(store.storeId, '')).toEqual({ free: 58, leased: 0, used: 2, burned: 0 });
  });

  it('reports mode and control number when the sale is read back, not only at checkout', async () => {
    // The checkout response carries them, `GET /sales/:id` used not to — so a
    // re-opened offline receipt looked like an ordinary pending one, and the
    // till had nothing to print the «ОФЛАЙН» block from.
    await warm();
    providerDown();
    const saleId = (await sell()).json().id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/pos/sales/${saleId}`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fiscal).toMatchObject({
      status: 'pending',
      mode: 'offline',
      fiscal_code: 'OFF-0002',
      control_number: null,
    });
  });

  it('gives the offline receipt its tax-office QR at stamp time, not after the replay', async () => {
    // The link is ФН ПРРО + the reserve code + date/time/sum — all of it known
    // at the till. The cabinet will not find the document until it is
    // delivered, which is exactly what the «ОФЛАЙН» mark next to the QR says.
    await warm();
    providerDown();

    const body = (await sell()).json();
    const url = new URL(body.fiscal.tax_url);
    expect(url.pathname).toBe('/cashregs/check');
    expect(url.searchParams.get('id')).toBe('OFF-0002');
    expect(url.searchParams.get('fn')).toBe('FAKE-FN'); // cached by the refill
    expect(url.searchParams.get('sm')).toBe('100.00');
    expect(url.searchParams.get('mac')).toBeNull();

    // And it survives to the receipt the till re-reads for printing.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/pos/sales/${body.id}`,
      headers: headers(),
    });
    expect(detail.json().fiscal.tax_url).toBe(body.fiscal.tax_url);
  });

  it('stamps without a link when the register number was never learned', async () => {
    // A store whose refill never managed a `registerState` has no ФН — the sale
    // still goes through, the paper just says the QR is coming.
    await warm();
    await pool.query(`UPDATE pos_fiscal_settings SET register_fiscal_number = NULL WHERE store_id = $1`, [
      store.storeId,
    ]);
    providerDown();

    const body = (await sell()).json();
    expect(body.fiscal).toMatchObject({ status: 'pending', mode: 'offline', tax_url: null });
  });

  it('keeps stamping into the same session — even once the provider is back', async () => {
    await warm();
    providerDown();
    const first = await sell();
    expect(first.statusCode).toBe(201);
    const sessionId = (await live())?.id;

    // The queued error is spent; the provider would answer now. Still offline:
    // an online receipt inside the session would break the go-offline order.
    fake.calls.length = 0;
    const second = await sell();
    expect(second.statusCode).toBe(201);
    expect(second.json().fiscal).toMatchObject({ mode: 'offline', fiscal_code: 'OFF-0003' });
    expect(fake.calls).toHaveLength(0); // not even a sign-in: the session short-circuits pre-flight

    const rows = await ledgerRows();
    expect(rows.map((r) => r.offline_seq)).toEqual([1, 2]);
    expect(rows.every((r) => Number(r.offline_session_id) === sessionId)).toBe(true);
    expect((await live())?.id).toBe(sessionId);
  });

  it('replays the same client_uuid as the already stamped document, not a second stamp', async () => {
    await warm();
    providerDown();
    const uuid = crypto.randomUUID();
    const first = await sell(uuid);
    expect(first.statusCode).toBe(201);
    const again = await sell(uuid);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    expect(await ledgerRows()).toHaveLength(1);
    expect(await offlinePool.countCodes(store.storeId, '')).toMatchObject({ used: 2 });
  });

  it('still refuses when no shift was opened online — v1 cannot open one offline', async () => {
    providerDown(); // cold: no shift mirror row at all
    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'unavailable' });
    expect(await live()).toBeNull();
    expect(await ledgerRows()).toHaveLength(0);
  });

  it('does nothing different when offline_mode is off', async () => {
    await updateFiscalSettings(store.storeId, { offline_mode: false });
    await warm();
    providerDown();
    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(await live()).toBeNull();
  });

  // ── What a live session refuses ───────────────────────────────────────────

  it('refuses refunds and service receipts while the session is live', async () => {
    // A fiscalised sale first, online.
    await warm();
    const sold = await sell();
    expect(sold.statusCode).toBe(201);
    expect(sold.json().fiscal.status).toBe('done');
    const saleItemId = sold.json().items[0].id;

    providerDown();
    const offlineSale = await sell();
    expect([offlineSale.statusCode, offlineSale.json()]).toMatchObject([201, {}]);
    expect(await live()).not.toBeNull();

    const ref = await refund(sold.json().id, saleItemId);
    expect(ref.statusCode).toBe(503);
    expect(ref.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'offline_session_open' });
    // Refused before money moved.
    expect((await saleRow(sold.json().id)).status).toBe('completed');

    // The fiscal routes speak 409 `error: <kind>` for "fix/wait first".
    const svc = await serviceReceipt();
    expect(svc.statusCode).toBe(409);
    expect(svc.json().error).toBe('offline_session_open');
  });

  it('refuses sales with 503 replaying once the session is being sent', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);
    const s = (await live()) as session.OfflineSessionRow;
    await session.markReplaying(s.id);

    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'replaying' });
    expect(res.json().message).toContain('за хвилину');
    expect(await ledgerRows()).toHaveLength(1);
  });

  it('stops selling after 36h of offline and parks the session', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);
    const s = (await live()) as session.OfflineSessionRow;
    await pool.query(
      `UPDATE pos_fiscal_offline_sessions SET started_at = NOW() - interval '36 hours' WHERE id = $1`,
      [s.id]
    );

    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('offline_limit');
    expect(await session.getSession(s.id)).toMatchObject({ status: 'stuck', error_code: 'offline_limit' });
    expect(await live()).toBeNull();

    // The owner sees the parked session, with its never-sent document.
    const attention = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/attention',
      headers: auth(store.ownerToken),
    });
    expect(attention.statusCode).toBe(200);
    expect(attention.json().sessions).toEqual([
      expect.objectContaining({
        id: s.id,
        status: 'stuck',
        error_code: 'offline_limit',
        holder: 'server',
        documents: { pending: 1, done: 0, abandoned: 0 },
      }),
    ]);
  });

  it('refuses to close the shift by hand while the session is live', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);

    const res = await app.inject({ method: 'POST', url: '/api/pos/fiscal/shift/close', headers: headers() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('offline_session_open');
    const shift = await pool.query(`SELECT status FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    expect(shift.rows.map((r) => r.status)).toEqual(['open']);
    expect(fake.calls.map((c) => c.method)).not.toContain('closeShift');
  });

  it('reports the live session and its documents on /fiscal/status', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);
    expect((await sell()).statusCode).toBe(201);

    const res = await app.inject({ method: 'GET', url: '/api/pos/fiscal/status', headers: headers() });
    expect(res.statusCode).toBe(200);
    expect(res.json().offline).toMatchObject({
      enabled: true,
      codes: { free: 57, used: 3 },
      session: {
        holder: 'server',
        status: 'open',
        go_offline_sent: false,
        last_go_online_at: null,
        documents: { pending: 2, done: 0, abandoned: 0 },
        error_code: null,
      },
    });
    expect(res.json().holder).toMatchObject({ device_id: DEVICE, is_me: true });
  });

  it('stops selling when the shift is about to hit 24h', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);
    await pool.query(
      `UPDATE pos_fiscal_shifts SET opened_at = NOW() - interval '23 hours 50 minutes' WHERE store_id = $1`,
      [store.storeId]
    );
    const res = await sell();
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('shift_deadline');
    expect((await live())?.status).toBe('open'); // the session itself is fine
  });

  it('voids the sale when the reserve runs dry — nothing was sent', async () => {
    await warm();
    providerDown();
    expect((await sell()).statusCode).toBe(201);
    // Hand every remaining code to a till.
    await offlinePool.takeFreeCodes(store.storeId, '', 100, { status: 'leased', deviceId: 'till-B' });

    const res = await sell();
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: 'fiscal_failed',
      code: 'offline_codes_exhausted',
      sale_voided: true,
      sale_kept: false,
    });
    expect((await saleRow(res.json().sale_id)).status).toBe('voided');
    const rows = await ledgerRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ status: 'abandoned', mode: 'offline', offline_seq: null });
  });

  // ── The rest of the machinery keeps its hands off ─────────────────────────

  it('holds back online retries for the store while a session is live', async () => {
    // An online document that failed before the outage was noticed.
    await warm();
    const online = await ledger.openDocument({
      storeId: store.storeId,
      docType: 'service_in',
      provider: 'checkbox',
      requestId: crypto.randomUUID(),
      totalCents: 100,
    });
    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE id = $1`,
      [online.id]
    );

    providerDown();
    expect((await sell()).statusCode).toBe(201);
    expect((await ledger.claimDueDocuments(10)).map((r) => r.id)).not.toContain(online.id);

    const s = (await live()) as session.OfflineSessionRow;
    await session.markReplaying(s.id);
    await session.markClosed(s.id);
    expect((await ledger.claimDueDocuments(10)).map((r) => r.id)).toContain(online.id);
  });

  it('a web caller without a device id is still refused in offline mode', async () => {
    await warm();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('register_held');
  });
});
