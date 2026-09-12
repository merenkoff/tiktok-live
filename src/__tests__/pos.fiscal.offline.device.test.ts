// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.device.test.ts
//
// Case C of TechDocs/POS_FISCAL_OFFLINE.md (фаза 3, шаг 2): the till had no
// network, stamped the receipt from its own lease and printed it; this is what
// happens when it finally reaches us.
//
// The asymmetry with an ordinary checkout is the point of most of these: the
// sale already happened, so a refusal must never void it, never hand stock
// back, and never look retryable when it is not. What is pinned: the stamp is
// filed as the till printed it; a code that is not this till's is refused
// before a sale row exists; the receipts join whatever session the register
// already has and the replay waits for the till to finish uploading; sales the
// till rings online meanwhile join the same chain; and the whole thing goes to
// the provider in the order the receipts were printed.

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

const TILL = 'till-dev-A';
const OTHER = 'till-dev-B';
const STRETCH = 'cs-0001';

describe.skipIf(!hasDb)('POS fiscal offline device stamp (case C — the till sold without us)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfdev');
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
    // Sales too: several assertions here are about what did NOT get written,
    // which only means anything against an empty table (the receipts FK is
    // RESTRICT, so they go in this order).
    await pool.query(`DELETE FROM pos_sales WHERE store_id = $1`, [store.storeId]);
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
         holder_last_seen_at = NULL, handover_device_id = NULL, handover_name = NULL,
         register_fiscal_number = '4001118166'
       WHERE store_id = $1`,
      [store.storeId]
    );
    product = await seedProduct(store.storeId, { priceCents: 10000, quantity: 200 });
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

  /** Open the shift online, then take a lease — what the till does before it loses the network. */
  const prepare = async () => {
    await fiscalService.preflight(store.storeId, store.sellerId, TILL);
    // Back-date the shift: in production it is open long before the network
    // drops, and Checkbox refuses a receipt dated before its shift opened
    // (`date.fiscal_date_logic`, seen in the 2026-09-12 sandbox run). A shift
    // opened "now" with receipts from twenty minutes ago is a shape no till
    // can produce.
    await pool.query(
      `UPDATE pos_fiscal_shifts SET opened_at = NOW() - INTERVAL '3 hours' WHERE store_id = $1`,
      [store.storeId]
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/offline/lease',
      headers: headers(),
      payload: { outbox_pending: 0 },
    });
    return res.json().codes as Array<{ fiscal_code: string }>;
  };

  /** A receipt the till printed while offline, now reaching us through its outbox. */
  const syncStamped = (
    stamp: { code: string; at: Date; seq: number },
    opts: { device?: string | null; clientUuid?: string; stretch?: string } = {}
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: headers(opts.device === undefined ? TILL : opts.device),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        client_uuid: opts.clientUuid ?? crypto.randomUUID(),
        fiscal_offline: {
          client_session_id: opts.stretch ?? STRETCH,
          seq: stamp.seq,
          fiscal_code: stamp.code,
          fiscal_date: stamp.at.toISOString(),
        },
      },
    });

  /** An ordinary online sale from the same till. */
  const sellOnline = () =>
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
  const rows = async () =>
    (
      await pool.query(
        `SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY fiscal_date, offline_seq`,
        [store.storeId]
      )
    ).rows as ledger.FiscalReceiptRow[];
  const sales = async () =>
    (await pool.query(`SELECT id, status, fiscal_status FROM pos_sales WHERE store_id = $1 ORDER BY id`, [store.storeId]))
      .rows as Array<{ id: number; status: string; fiscal_status: string }>;
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  const tick = async () => {
    resetRateLimiter();
    return fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });
  };

  // ── Filing what the till printed ──────────────────────────────────────────

  it('files the receipt exactly as the till stamped it, without calling the provider', async () => {
    const codes = await prepare();
    const at = minutesAgo(20);
    fake.calls.length = 0;

    const res = await syncStamped({ code: codes[0].fiscal_code, at, seq: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal).toMatchObject({
      status: 'pending',
      mode: 'offline',
      fiscal_code: codes[0].fiscal_code,
      // The provider mints it when the document is actually registered.
      control_number: null,
    });
    // The date is the till's, not ours: it is what the customer's receipt says.
    expect(new Date(res.json().fiscal.fiscal_date).getTime()).toBe(at.getTime());
    // And the QR the till already printed resolves to the same document: the
    // register's own number comes from the requisites cached at shift open.
    expect(res.json().fiscal.tax_url).toContain('fn=FAKE-FN');
    expect(res.json().fiscal.tax_url).toContain(`id=${codes[0].fiscal_code}`);
    expect(fake.calls.filter((c) => c.startsWith('register'))).toHaveLength(0);

    const [row] = await rows();
    expect(row).toMatchObject({ mode: 'offline', status: 'pending', offline_seq: 1 });
    expect(row.next_attempt_at).toBeNull();
    const spent = await pool.query(
      `SELECT status, used_by_receipt_id FROM pos_fiscal_offline_codes WHERE fiscal_code = $1 AND store_id = $2`,
      [codes[0].fiscal_code, store.storeId]
    );
    expect(spent.rows[0].status).toBe('used');
    expect(Number(spent.rows[0].used_by_receipt_id)).toBe(Number(row.id));
  });

  it('opens the session just before the first receipt and holds it for the till', async () => {
    const codes = await prepare();
    const at = minutesAgo(20);
    await syncStamped({ code: codes[0].fiscal_code, at, seq: 1 });

    const s = await live();
    expect(s).toMatchObject({
      holder: 'device',
      device_id: TILL,
      client_session_id: STRETCH,
      status: 'open',
      // Taken from the free pool, not from the till's lease: `go-offline`
      // spends a code of its own.
      go_offline_code: expect.stringMatching(/^OFF-/),
    });
    expect(new Date(s!.started_at).getTime()).toBe(at.getTime() - 1000);
    // Not replayable yet — the till has not said its queue is empty.
    expect(await session.listReplayableSessions({ storeId: store.storeId })).toHaveLength(0);
  });

  it('takes the second receipt of the same stretch into the same session', async () => {
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    const first = await live();
    await syncStamped({ code: codes[1].fiscal_code, at: minutesAgo(15), seq: 2 });

    const all = await rows();
    expect(all).toHaveLength(2);
    expect(all.map((r) => Number(r.offline_session_id))).toEqual([first!.id, first!.id]);
    expect(all.map((r) => r.offline_seq)).toEqual([1, 2]);
  });

  it('answers a re-sent receipt with the sale it already filed', async () => {
    // The till never saw our 201 and syncs the same row again.
    const codes = await prepare();
    const uuid = crypto.randomUUID();
    const at = minutesAgo(20);
    const first = await syncStamped({ code: codes[0].fiscal_code, at, seq: 1 }, { clientUuid: uuid });
    const again = await syncStamped({ code: codes[0].fiscal_code, at, seq: 1 }, { clientUuid: uuid });

    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    expect(await rows()).toHaveLength(1);
    expect(await sales()).toHaveLength(1);
  });

  // ── Refusals ──────────────────────────────────────────────────────────────

  it('refuses a code that is not this till\'s, before any sale row exists', async () => {
    await prepare();
    const res = await syncStamped({ code: 'OFF-9999', at: minutesAgo(5), seq: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'offline_stamp_rejected',
      code: 'offline_code_invalid',
    });
    // Nothing written: no sale, no document, no session.
    expect(await sales()).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
    expect(await live()).toBeNull();
  });

  it('refuses a code burned by a forced handover, and says the register moved', async () => {
    const codes = await prepare();
    await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/register/handover/force',
      headers: auth(store.ownerToken),
      payload: { device_id: OTHER },
    });

    const res = await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(10), seq: 1 });
    expect(res.statusCode).toBe(409);
    // The register is the first thing checked — the till has to be told it is
    // no longer the holder, not that its code went bad.
    expect(res.json()).toMatchObject({ error: 'register_held' });
    expect(await sales()).toHaveLength(0);
  });

  it('refuses the same code twice — one receipt, one tax-office code', async () => {
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    const res = await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(19), seq: 2 });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('offline_code_invalid');
    expect(await rows()).toHaveLength(1);
  });

  it('refuses the web shell, which never had a lease to stamp from', async () => {
    const codes = await prepare();
    const res = await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(5), seq: 1 }, { device: null });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'device_id_required' });
  });

  it('rejects a malformed stamp outright', async () => {
    await prepare();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: headers(),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        fiscal_offline: { client_session_id: STRETCH, seq: 0, fiscal_code: '', fiscal_date: 'not a date' },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(await sales()).toHaveLength(0);
  });

  it('holds the receipt back while the chain is being sent, rather than losing it', async () => {
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    const s = await live();
    await session.markReplaying(s!.id);

    const res = await syncStamped({ code: codes[1].fiscal_code, at: minutesAgo(10), seq: 2 });
    // 503, not 409: the till must try this one again in a minute.
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'replaying' });
    expect(await sales()).toHaveLength(1);
  });

  // ── One register, one chain ───────────────────────────────────────────────

  it('joins the session the server already opened while the till was offline too', async () => {
    // The provider went down first (case B), then the till lost the network.
    // Both stretches are one outage for the register and replay as one chain.
    await fiscalService.preflight(store.storeId, store.sellerId, TILL);
    const opened = await session.openServerSession(await ctx(), null);
    const codes = await prepare();

    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(10), seq: 1 });
    const s = await live();
    expect(s!.id).toBe(opened.id);
    expect(s).toMatchObject({ holder: 'server', device_id: TILL, client_session_id: STRETCH });
    // And it now waits for the till, which a purely server-held one would not.
    expect(await session.listReplayableSessions({ storeId: store.storeId })).toHaveLength(0);
  });

  it('stamps the till\'s online sales into the same session instead of registering them live', async () => {
    // While the queue drains the till keeps selling. A receipt registered
    // online inside the session would be delivered ahead of the chain and
    // break the `go-offline` ordering.
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    fake.calls.length = 0;

    const res = await sellOnline();
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal).toMatchObject({ status: 'pending', mode: 'offline' });
    expect(fake.calls.filter((c) => c.startsWith('register'))).toHaveLength(0);
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => Number(r.offline_session_id))).size).toBe(1);
  });

  // ── Getting it to the provider ────────────────────────────────────────────

  it('replays only once the till says its queue is empty, in receipt order', async () => {
    const codes = await prepare();
    // Printed 10:00, 10:05, 10:10 — synced out of order, as a retried row is.
    await syncStamped({ code: codes[1].fiscal_code, at: minutesAgo(15), seq: 2 });
    await syncStamped({ code: codes[2].fiscal_code, at: minutesAgo(10), seq: 3 });
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });

    // Still uploading: nothing may be sent, because `go-offline` would be
    // dated after receipts still sitting on the till.
    expect(await tick()).toMatchObject({ replayed: 0 });
    expect(fake.offline!.goOfflineCalls).toHaveLength(0);

    await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/offline/lease',
      headers: headers(),
      payload: { outbox_pending: 0 },
    });

    const result = await tick();
    expect(result.replayed).toBe(3);
    expect(fake.offline!.goOfflineCalls).toHaveLength(1);
    // Sent in the order the receipts were printed, not the order they arrived.
    const sent = await rows();
    expect(sent.map((r) => r.fiscal_code)).toEqual([
      codes[0].fiscal_code,
      codes[1].fiscal_code,
      codes[2].fiscal_code,
    ]);
    expect(sent.every((r) => r.status === 'done')).toBe(true);
    // The контрольне число the till could not compute arrives with the replay.
    expect(sent.every((r) => Boolean(r.control_number))).toBe(true);
    expect((await live())?.status ?? 'closed').toBe('closed');
  });

  it('parks the session when the tax office already has something newer', async () => {
    // A shift that auto-closed while the till was offline: the Z-report is
    // dated after these receipts, so the chain cannot be reopened behind it.
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    await pool.query(
      `UPDATE pos_fiscal_shifts SET status = 'closed', closed_at = NOW() WHERE store_id = $1`,
      [store.storeId]
    );
    await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/offline/lease',
      headers: headers(),
      payload: { outbox_pending: 0 },
    });

    await tick();
    const parked = await pool.query(
      `SELECT status, error_code FROM pos_fiscal_offline_sessions WHERE store_id = $1`,
      [store.storeId]
    );
    expect(parked.rows[0]).toMatchObject({ status: 'stuck', error_code: 'go_offline_order' });
    expect(fake.offline!.goOfflineCalls).toHaveLength(0);
    // The sale stands: the goods left the shop and the customer holds a receipt.
    expect((await sales())[0].status).toBe('completed');
  });

  it('parks a session that starts before the shift it would land in', async () => {
    // Checkbox: «Час фіскалізації чека повинен бути більше ніж час відкриття
    // зміни». A till dark across a shift boundary hands us receipts older than
    // the shift open when it reconnects; sending them would have every one
    // refused on its own. The owner gets one parked session instead.
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    await pool.query(
      `UPDATE pos_fiscal_shifts SET opened_at = NOW() - INTERVAL '5 minutes' WHERE store_id = $1`,
      [store.storeId]
    );
    await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/offline/lease',
      headers: headers(),
      payload: { outbox_pending: 0 },
    });

    await tick();
    const parked = await pool.query(
      `SELECT status, error_code FROM pos_fiscal_offline_sessions WHERE store_id = $1`,
      [store.storeId]
    );
    expect(parked.rows[0]).toMatchObject({ status: 'stuck', error_code: 'go_offline_order' });
    expect(fake.offline!.goOfflineCalls).toHaveLength(0);
  });

  it('replays a session whose till never came back, once the grace has passed', async () => {
    const codes = await prepare();
    await syncStamped({ code: codes[0].fiscal_code, at: minutesAgo(20), seq: 1 });
    const s = await live();
    expect(await session.listReplayableSessions({ storeId: store.storeId })).toHaveLength(0);

    await pool.query(
      `UPDATE pos_fiscal_offline_sessions SET updated_at = NOW() - ($2 || ' milliseconds')::interval
       WHERE id = $1`,
      [s!.id, String(session.DEVICE_READY_GRACE_MS + 60_000)]
    );
    expect(
      (await session.listReplayableSessions({ storeId: store.storeId })).map((x) => x.id)
    ).toContain(s!.id);
  });
});
