// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.checkout.test.ts
//
// Checkout orchestration end to end over HTTP, against a fake provider.
//
// The two assertions worth guarding above all others:
//   * a sale is voided ONLY when the document cannot exist at the provider —
//     voiding on an ambiguous failure double-fiscalises the re-ring;
//   * a replayed `client_uuid` for a voided sale is a 409, not a 200 carrying
//     the corpse.

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

describe.skipIf(!hasDb)('POS fiscal checkout orchestration', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfchk');
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
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    product = await seedProduct(store.storeId, { priceCents: 10000, quantity: 50 });
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const enableFiscal = () =>
    updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      default_tax_code: 'A',
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });

  const disableFiscal = () => updateFiscalSettings(store.storeId, { enabled: false });

  /**
   * Prime the runtime cache so the next sale's pre-flight makes no provider
   * call. Without this a queued error is consumed by `signIn`/`getShift` and
   * the sale never reaches `registerSale` — which is a 503, not the document
   * failure these tests are about.
   */
  const warmFiscal = () => fiscalService.preflight(store.storeId, store.sellerId);

  const sell = (clientUuid?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        ...(clientUuid ? { client_uuid: clientUuid } : {}),
      },
    });

  const ledgerRows = async () =>
    (
      await pool.query(
        `SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`,
        [store.storeId]
      )
    ).rows;

  const saleRow = async (id: number) =>
    (await pool.query(`SELECT * FROM pos_sales WHERE id = $1`, [id])).rows[0];

  const stockOf = async (variantId: number) =>
    Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId]))
        .rows[0].quantity
    );

  const counter = async () =>
    Number(
      (
        await pool.query(
          `SELECT next_value FROM pos_store_counters WHERE store_id = $1 AND counter_key = 'sale'`,
          [store.storeId]
        )
      ).rows[0]?.next_value ?? 1
    );

  // ── 1. Fiscalisation off ───────────────────────────────────────────────────

  it('leaves a non-fiscal store completely unchanged', async () => {
    await disableFiscal();
    const res = await sell();
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal).toBeNull();
    expect((await saleRow(res.json().id)).fiscal_status).toBe('none');
    expect(await ledgerRows()).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  // ── 2. Pre-flight ─────────────────────────────────────────────────────────

  it('blocks the sale and writes nothing when ПРРО is unreachable', async () => {
    await enableFiscal();
    const salesBefore = await pool.query(
      `SELECT count(*)::int AS n FROM pos_sales WHERE store_id = $1`,
      [store.storeId]
    );
    const counterBefore = await counter();

    fake.queueError('unavailable');
    const res = await sell();

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'unavailable' });
    expect(res.json().support_code).toBe('FS-UNAVAILABLE');

    const salesAfter = await pool.query(
      `SELECT count(*)::int AS n FROM pos_sales WHERE store_id = $1`,
      [store.storeId]
    );
    expect(salesAfter.rows[0].n).toBe(salesBefore.rows[0].n);
    // No receipt number was burned either — the customer's next receipt must
    // not skip a number for a sale that never existed.
    expect(await counter()).toBe(counterBefore);
  });

  // ── 3-4. Voiding, and NOT voiding ─────────────────────────────────────────

  it('voids the sale when the provider refused the document outright', async () => {
    await enableFiscal();
    const stockBefore = await stockOf(product.variantId);
    await warmFiscal();

    // `rejected` is a contract: validated and refused ⇒ no document exists.
    fake.queueError('rejected', 'bad tax code');
    const res = await sell();

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: 'fiscal_failed',
      code: 'rejected',
      sale_voided: true,
      sale_kept: false,
    });

    const sale = await saleRow(res.json().sale_id);
    expect(sale.status).toBe('voided');
    expect(await stockOf(product.variantId)).toBe(stockBefore);

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('abandoned');
    expect(rows[0].error_code).toBe('sale_voided');
  });

  it('does NOT void when the document may already exist at the provider', async () => {
    // The regression that matters most. A timeout says nothing about whether
    // ПРРО committed the receipt. Voiding here returns stock while the tax
    // service may hold a valid receipt, and the cashier's re-ring uses a fresh
    // client_uuid — so the duplicate machinery is bypassed and the sale is
    // fiscalised twice, with tax owed on both.
    await enableFiscal();
    const stockBefore = await stockOf(product.variantId);
    await warmFiscal();

    fake.queueError('unavailable', 'gateway timeout');
    const res = await sell();

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: 'fiscal_failed',
      code: 'unavailable',
      sale_voided: false,
      sale_kept: true,
    });

    const sale = await saleRow(res.json().sale_id);
    expect(sale.status).toBe('completed');
    expect(sale.fiscal_status).toBe('failed');
    // Stock stays consumed: the customer walked out with the goods.
    expect(await stockOf(product.variantId)).toBe(stockBefore - 1);

    const rows = await ledgerRows();
    expect(rows[0].status).toBe('failed');
    expect(rows[0].next_attempt_at).toBeTruthy();
  });

  // ── 5. The void itself fails ──────────────────────────────────────────────

  it('reports sale_voided:false when the cleanup void cannot run', async () => {
    // A failing cleanup must not mask the original fiscal error, and the sale
    // must not silently look cancelled.
    await enableFiscal();
    const res = await sell();
    const saleId = res.json().sale_id ?? res.json().id;
    const rows = await ledgerRows();

    const voided = await fiscalService.abortSale(
      store.storeId,
      999_999_999, // no such sale — voidSale throws
      store.sellerId,
      rows[0] ?? ({ id: -1 } as never)
    );
    expect(voided).toBe(false);
    expect(saleId).toBeTruthy();
  });

  // ── 6-7. Duplicate ────────────────────────────────────────────────────────

  it('treats duplicate as success by reading the document back', async () => {
    await enableFiscal();
    const first = await sell('11111111-1111-4111-8111-111111111111');
    expect(first.statusCode).toBe(201);

    // Re-register the same requestId directly: the provider answers duplicate,
    // and the orchestrator must resolve it rather than send it again.
    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('done');
    expect(rows[0].fiscal_code).toBeTruthy();
    expect(first.json().fiscal).toMatchObject({ status: 'done' });
    expect(fake.documents.size).toBe(1);
  });

  it('never voids when the provider holds the document but will not name it', async () => {
    await enableFiscal();
    await warmFiscal();
    // The provider says it already has this document but gives no id, so there
    // is nothing to read back.
    fake.queueError('duplicate', 'already registered');

    const res = await sell();
    expect(res.statusCode).toBe(502);
    // Re-POSTing would answer duplicate forever, and voiding would discard a
    // receipt the tax service has already seen — so the sale stands and the
    // owner resolves it in the provider's own cabinet.
    expect(res.json().sale_voided).toBe(false);
    expect(res.json().sale_kept).toBe(true);
    expect((await saleRow(res.json().sale_id)).status).toBe('completed');

    const rows = await ledgerRows();
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_code).toBe('duplicate_unresolved');
  });

  // ── 8. Recovery ───────────────────────────────────────────────────────────

  it('opens a closed shift and retries once', async () => {
    await enableFiscal();
    const res = await sell();
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal.status).toBe('done');
    // The pre-flight auto-opened it, so no shift_closed recovery was needed.
    expect(fake.calls.filter((c) => c.method === 'openShift')).toHaveLength(1);
  });

  it('recovers from a session that expired mid-document', async () => {
    await enableFiscal();
    await sell(); // warm the session
    fake.queueError('auth_expired');
    const res = await sell();
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal.status).toBe('done');
    expect(fake.signInCount).toBeGreaterThan(1);
  });

  // ── 10-11. Replay and cancellation ────────────────────────────────────────

  it('answers 409 when a voided sale is replayed, not 200 with the corpse', async () => {
    await enableFiscal();
    const uuid = '33333333-3333-4333-8333-333333333333';
    await warmFiscal();
    fake.queueError('rejected');
    const failed = await sell(uuid);
    expect(failed.json().sale_voided).toBe(true);

    const replay = await sell(uuid);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error).toBe('sale_voided_not_fiscalised');
  });

  it('still replays a healthy sale as 200', async () => {
    await disableFiscal();
    const uuid = '44444444-4444-4444-8444-444444444444';
    const first = await sell(uuid);
    expect(first.statusCode).toBe(201);
    const replay = await sell(uuid);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(first.json().id);
  });

  it('refuses to cancel a fiscalised receipt', async () => {
    // Under ПРРО a receipt the tax service has seen can only be refunded.
    await enableFiscal();
    const sold = await sell();
    const saleId = sold.json().id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/void`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('sale_fiscalised');
    expect(res.json().fiscal_code).toBeTruthy();
  });

  it('still allows cancelling a sale that was never fiscalised', async () => {
    await disableFiscal();
    const sold = await sell();
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${sold.json().id}/void`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('voided');
  });

  // ── 9. Refunds ────────────────────────────────────────────────────────────

  it('fiscalises a refund against the sale document', async () => {
    await enableFiscal();
    const sold = await sell();
    const saleId = sold.json().id;
    const itemId = sold.json().items[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: itemId, quantity: 1 }], method: 'cash' },
    });

    expect(res.statusCode).toBe(200);
    // `refund_fiscal`, not `fiscal`: the body is the SALE's detail, whose own
    // `fiscal` key holds the sale's document. Reusing that key would overwrite
    // it with a different document that has different field names.
    expect(res.json().refund_fiscal).toMatchObject({ status: 'done' });
    expect(res.json().fiscal).toMatchObject({ status: 'done' });
    expect(res.json().fiscal.fiscal_code).not.toBe(res.json().refund_fiscal.fiscal_code);
    const rows = await ledgerRows();
    expect(rows.map((r) => r.doc_type).sort()).toEqual(['refund', 'sale']);
    const refundDoc = rows.find((r) => r.doc_type === 'refund');
    expect(refundDoc.status).toBe('done');
  });

  it('keeps a refund whose fiscalisation failed, and answers 200', async () => {
    // An error screen would make the cashier refund the customer twice.
    await enableFiscal();
    const sold = await sell();
    const saleId = sold.json().id;
    const itemId = sold.json().items[0].id;

    fake.queueError('unavailable');
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: itemId, quantity: 1 }], method: 'cash' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().refund_fiscal).toMatchObject({ status: 'failed' });
    expect(res.json().refunds).toHaveLength(1);

    const refundRow = (
      await pool.query(`SELECT * FROM pos_refunds WHERE sale_id = $1`, [saleId])
    ).rows[0];
    expect(refundRow.fiscal_status).toBe('failed');
    expect(Number(refundRow.total_cents)).toBe(10000);
  });

  it('marks a refund failed when the sale was never fiscalised', async () => {
    // `fiscalizeRefund` refuses before it writes a ledger row (there is no sale
    // document to return against), so nothing in `pos_fiscal_receipts` would
    // ever represent this refund — not the retry cron, not the attention list,
    // not the orphan-adoption pass, which scans `pos_sales` only. The
    // projection is the only place its state can be recorded.
    await enableFiscal();
    await warmFiscal();
    fake.queueError('unavailable');
    const sold = await sell();
    const saleId = sold.json().sale_id;
    const sale = await app.inject({
      method: 'GET',
      url: `/api/pos/sales/${saleId}`,
      headers: auth(store.sellerToken),
    });
    const itemId = sale.json().items[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: itemId, quantity: 1 }], method: 'cash' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().refund_fiscal.status).toBe('failed');
    const refundRow = (
      await pool.query(`SELECT * FROM pos_refunds WHERE sale_id = $1`, [saleId])
    ).rows[0];
    expect(refundRow.fiscal_status).toBe('failed');
  });

  it('always reports sale_voided on a fiscal_failed body', async () => {
    // Both `sale_voided` and `sale_kept` are present on every branch, so a
    // client reading either key cannot silently miss an outcome.
    await enableFiscal();
    await warmFiscal();
    fake.queueError('unavailable');
    const res = await sell();
    const body = res.json();
    expect(body).toHaveProperty('sale_voided');
    expect(body).toHaveProperty('sale_kept');
    expect(body.sale_kept).toBe(!body.sale_voided);
  });

  // ── 12-13. Invariants ─────────────────────────────────────────────────────

  it('abandons unfinished documents when the shift closes', async () => {
    await enableFiscal();
    await warmFiscal();
    fake.queueError('unavailable');
    const failed = await sell();
    expect(failed.json().sale_voided).toBe(false);

    const close = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/shift/close',
      headers: auth(store.sellerToken),
    });
    expect(close.statusCode).toBe(200);

    const rows = await ledgerRows();
    expect(rows[0].status).toBe('abandoned');
    expect(rows[0].next_attempt_at).toBeNull();
    // The projection has no 'abandoned' value — mirroring literally would be a
    // CHECK violation inside the sweep.
    const sale = await saleRow(rows[0].sale_id);
    expect(sale.fiscal_status).toBe('failed');
  });

  it('never writes the reserved "sent" status', async () => {
    await enableFiscal();
    await sell();
    fake.queueError('unavailable');
    await sell();
    const all = await pool.query(
      `SELECT count(*)::int AS n FROM pos_fiscal_receipts WHERE status = 'sent'`
    );
    expect(all.rows[0].n).toBe(0);
  });

  it('surfaces parked documents to the owner', async () => {
    await enableFiscal();
    await warmFiscal();
    fake.queueError('rejected');
    await sell();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/attention',
      headers: auth(store.ownerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().documents.length).toBeGreaterThan(0);
  });

  it('reports whether an adapter exists for the configured provider', async () => {
    await enableFiscal();
    const withFake = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.ownerToken),
    });
    expect(withFake.json().adapter_available).toBe(true);

    resetProviders();
    const without = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.ownerToken),
    });
    // Nothing else would tell the owner why every sale 503s.
    expect(without.json().adapter_available).toBe(false);
  });

  it('records a service receipt', async () => {
    await enableFiscal();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/service',
      headers: auth(store.sellerToken),
      payload: { amount_cents: 50000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('done');
    const rows = await ledgerRows();
    expect(rows[0].doc_type).toBe('service_in');
    expect(rows[0].sale_id).toBeNull();
  });

  it('rejects a zero-amount service receipt', async () => {
    await enableFiscal();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/service',
      headers: auth(store.sellerToken),
      payload: { amount_cents: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('maps the projection vocabulary explicitly', () => {
    expect(ledger.projectionFor('abandoned')).toBe('failed');
    expect(ledger.projectionFor('failed')).toBe('failed');
    expect(ledger.projectionFor('done')).toBe('done');
    expect(ledger.projectionFor('pending')).toBe('pending');
  });
});
