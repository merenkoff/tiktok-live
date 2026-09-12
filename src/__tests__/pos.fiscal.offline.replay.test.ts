// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.replay.test.ts
//
// The replay of a server-held offline session (`replayOfflineSessions`, driven
// from `retryPendingFiscalDocs`) — phase 2, step 3. Sales are stamped over
// HTTP with the provider down, then the cron tick is run by hand with the
// provider back.
//
// Pinned: go-offline exactly once, with the session's start and code; the
// documents in `offline_seq` order and none of them before go-offline; an
// outage mid-way resumes on the next tick without a second go-offline; a
// refused document is parked and the chain continues; a delivered online
// document newer than the session start parks the whole session; go-online
// is never repeated inside two minutes; the session closes only when the
// register says it is online.

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

describe.skipIf(!hasDb)('POS fiscal offline replay (case B — server session)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfrepl');
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

  /**
   * The cron tick, scoped to this store: the fiscal suites run in parallel
   * workers against one database, and an unscoped pass would replay another
   * file's session with this worker's fake.
   */
  const tick = async () => {
    resetRateLimiter();
    return fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });
  };
  const live = () => session.getLiveSession(store.storeId, '');
  const rows = async () =>
    (await pool.query(`SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY offline_seq, id`, [store.storeId]))
      .rows as ledger.FiscalReceiptRow[];
  const saleStatus = async (id: number) =>
    (await pool.query(`SELECT status, fiscal_status FROM pos_sales WHERE id = $1`, [id])).rows[0];
  const offlineCalls = () => fake.offline!.calls;

  /** `toBe(201)` with the body in the failure message when it is not. */
  const expect201 = (res: { statusCode: number; json: () => unknown }) =>
    expect({ status: res.statusCode, body: res.statusCode === 201 ? 'ok' : res.json() }).toEqual({
      status: 201,
      body: 'ok',
    });

  /** Two sales stamped offline inside one session; provider back afterwards. */
  const stampTwo = async () => {
    await warm();
    providerDown();
    const a = await sell();
    const b = await sell();
    expect201(a);
    expect201(b);
    const s = (await live()) as session.OfflineSessionRow;
    fake.offline!.calls.length = 0;
    fake.calls.length = 0;
    return { s, saleA: a.json(), saleB: b.json() };
  };

  it('replays the session in order: go-offline once, documents by seq, go-online, closed', async () => {
    const { s, saleA, saleB } = await stampTwo();

    const result = await tick();
    expect(result).toMatchObject({ replayed: 2, closed: 1, stuck: 0, done: 0, failed: 0 });

    // The provider saw exactly this sequence.
    expect(offlineCalls().filter((c) => !c.startsWith('askOfflineCodes') && !c.startsWith('getOfflineCodes'))).toEqual([
      'registerState',
      'goOffline',
      'registerSaleOffline',
      'registerSaleOffline',
      'goOnline',
      'registerState',
    ]);
    expect(fake.offline!.goOfflineCalls).toEqual([
      { at: new Date(s.started_at), fiscalCode: 'OFF-0001' },
    ]);
    // Nothing went through the online path.
    expect(fake.calls.filter((c) => c.method === 'registerSale')).toHaveLength(0);

    const docs = await rows();
    expect(docs.map((r) => [r.offline_seq, r.status, r.fiscal_code])).toEqual([
      [1, 'done', 'OFF-0002'],
      [2, 'done', 'OFF-0003'],
    ]);
    expect(docs.every((r) => r.control_number && r.provider_doc_id)).toBe(true);
    // The chain: the second document named the first as its predecessor.
    const sent = fake.calls.filter((c) => c.method === 'registerSaleOffline');
    expect(sent).toHaveLength(2);

    expect(await session.getSession(s.id)).toMatchObject({ status: 'closed', go_offline_tx_id: 'fake-tx-OFF-0001' });
    expect((await session.getSession(s.id))?.ended_at).not.toBeNull();
    expect(await live()).toBeNull();
    expect(await saleStatus(saleA.id)).toEqual({ status: 'completed', fiscal_status: 'done' });
    expect(await saleStatus(saleB.id)).toEqual({ status: 'completed', fiscal_status: 'done' });

    // The next tick has nothing to do, and a new sale is online again.
    expect(await tick()).toMatchObject({ replayed: 0, closed: 0 });
    fake.calls.length = 0;
    const online = await sell();
    expect(online.statusCode).toBe(201);
    expect(online.json().fiscal).toMatchObject({ status: 'done', mode: 'online' });
  });

  it('leaves the session untouched while the provider is still unreachable', async () => {
    const { s } = await stampTwo();
    fake.signInError = 'unavailable';

    const result = await tick();
    expect(result).toMatchObject({ replayed: 0, closed: 0, stuck: 0 });
    expect(await session.getSession(s.id)).toMatchObject({ status: 'open', go_offline_tx_id: null });
    expect(offlineCalls()).toEqual([]);
    expect((await rows()).every((r) => r.status === 'pending')).toBe(true);
    // And the till keeps stamping meanwhile.
    fake.signInError = null;
    expect((await sell()).statusCode).toBe(201);
    expect((await rows()).map((r) => r.offline_seq)).toEqual([1, 2, 3]);
  });

  it('resumes after an outage mid-replay without a second go-offline', async () => {
    const { s } = await stampTwo();
    // go-offline goes through; the first document hits an outage, so the
    // pass stops there and the second stays queued behind it.
    fake.offline!.registerErrors.push('unavailable');
    const first = await tick();
    expect(first).toMatchObject({ replayed: 0, closed: 0, stuck: 0 });
    expect(await session.getSession(s.id)).toMatchObject({ status: 'replaying', go_offline_tx_id: 'fake-tx-OFF-0001' });
    let docs = await rows();
    expect(docs.map((r) => r.status)).toEqual(['failed', 'pending']);

    // Sales are refused now — the session is being sent.
    expect((await sell()).statusCode).toBe(503);

    const second = await tick();
    expect(second).toMatchObject({ replayed: 2, closed: 1 });
    expect(offlineCalls().filter((c) => c === 'goOffline')).toHaveLength(1);
    docs = await rows();
    expect(docs.map((r) => r.status)).toEqual(['done', 'done']);
    expect(await live()).toBeNull();
  });

  it('parks a refused document and carries on with the chain', async () => {
    const { s, saleA, saleB } = await stampTwo();
    fake.offline!.registerErrors.push('rejected');

    const result = await tick();
    expect(result).toMatchObject({ replayed: 1, abandoned: 1, closed: 1 });
    const docs = await rows();
    expect(docs.map((r) => [r.offline_seq, r.status])).toEqual([
      [1, 'abandoned'],
      [2, 'done'],
    ]);
    expect(docs[0].error_code).toBe('rejected');
    // The sale stands: the goods left the store. It is the owner's document now.
    expect(await saleStatus(saleA.id)).toEqual({ status: 'completed', fiscal_status: 'failed' });
    expect(await saleStatus(saleB.id)).toEqual({ status: 'completed', fiscal_status: 'done' });
    expect((await fiscalService.listAttentionDocs(store.storeId)).map((d) => d.id)).toContain(docs[0].id);
    expect(await session.getSession(s.id)).toMatchObject({ status: 'closed' });
  });

  it('parks the whole session when an online document was delivered after its start', async () => {
    const { s } = await stampTwo();
    // Something online got through to the tax office after the session began
    // (should be impossible with the holder lock; the check is the backstop).
    await pool.query(
      `INSERT INTO pos_fiscal_receipts
         (store_id, doc_type, provider, status, provider_request_id, total_cents, attempts, mode, fiscal_date, provider_doc_id)
       VALUES ($1, 'service_in', 'checkbox', 'done', $2, 1, 1, 'online', NOW() + interval '1 minute', 'late-doc')`,
      [store.storeId, crypto.randomUUID()]
    );

    const result = await tick();
    expect(result).toMatchObject({ replayed: 0, stuck: 1, closed: 0 });
    expect(await session.getSession(s.id)).toMatchObject({ status: 'stuck', error_code: 'go_offline_order' });
    expect(offlineCalls()).not.toContain('goOffline');
    expect(offlineCalls()).not.toContain('registerSaleOffline');
    expect((await rows()).filter((r) => r.mode === 'offline').every((r) => r.status === 'pending')).toBe(true);
  });

  it('parks the session when the provider refuses go-offline outright', async () => {
    const { s } = await stampTwo();
    fake.offline!.goOfflineError = 'rejected';

    const result = await tick();
    expect(result).toMatchObject({ stuck: 1, replayed: 0 });
    expect(await session.getSession(s.id)).toMatchObject({ status: 'stuck', error_code: 'go_offline_rejected' });
    expect(offlineCalls()).not.toContain('registerSaleOffline');
  });

  it('never repeats go-online inside two minutes, and closes only once the register is online', async () => {
    const { s } = await stampTwo();
    // Each tick polls the register twice (probe + after go-online); four
    // polls keep saying offline, so the register comes back during tick 3.
    fake.offline!.goOnlineLag = 4;

    const first = await tick();
    expect(first).toMatchObject({ replayed: 2, closed: 0 });
    expect(offlineCalls().filter((c) => c === 'goOnline')).toHaveLength(1);
    expect(await session.getSession(s.id)).toMatchObject({ status: 'replaying' });
    expect((await session.getSession(s.id))?.last_go_online_at).not.toBeNull();

    // Straight away again: polls, does not call go-online a second time.
    const second = await tick();
    expect(second).toMatchObject({ closed: 0 });
    expect(offlineCalls().filter((c) => c === 'goOnline')).toHaveLength(1);

    // Two minutes later: allowed to call again; by now the register is online.
    await pool.query(
      `UPDATE pos_fiscal_offline_sessions SET last_go_online_at = NOW() - interval '3 minutes' WHERE id = $1`,
      [s.id]
    );
    const third = await tick();
    expect(third).toMatchObject({ closed: 1 });
    expect(offlineCalls().filter((c) => c === 'goOnline')).toHaveLength(2);
    expect(await live()).toBeNull();
  });

  it('treats duplicate as success — the provider already holds the offline document', async () => {
    const { s, saleA } = await stampTwo();
    const [first] = await rows();
    // Pretend the first document reached the provider on an earlier, lost attempt.
    fake.documents.set(first.provider_request_id, {
      providerDocId: 'fake-doc-earlier',
      fiscalCode: 'OFF-0002',
      fiscalDate: new Date().toISOString(),
      taxUrl: null,
      qrPayload: null,
      vatCents: null,
      receiptText: null,
      controlNumber: '4242',
      raw: null,
    });

    const result = await tick();
    expect(result).toMatchObject({ replayed: 2, closed: 1 });
    const docs = await rows();
    expect(docs[0]).toMatchObject({ status: 'done', provider_doc_id: 'fake-doc-earlier', control_number: '4242' });
    expect(await saleStatus(saleA.id)).toMatchObject({ fiscal_status: 'done' });
    expect(await session.getSession(s.id)).toMatchObject({ status: 'closed' });
  });
});
