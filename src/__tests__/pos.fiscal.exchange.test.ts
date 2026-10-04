// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.exchange.test.ts — an exchange in a store that
// fiscalises.
//
// Under ПРРО an exchange is TWO documents, in order: the return receipt against
// the original sale's receipt, then the sale receipt for the new goods. What is
// pinned here is that order and what each half's failure does:
//
//   * ПРРО unreachable at pre-flight → nothing written (one gate, the refund's);
//   * the return receipt fails → the refund stands, `failed` for the cron, and
//     the sale half still goes out — same stance as the refund route;
//   * the sale receipt is REFUSED → only the new sale is voided, the refund and
//     its receipt stand, and the body says so;
//   * the sale receipt is AMBIGUOUS → the new sale stands `failed`;
//   * a replay makes no provider call at all — on the exchange route AND on the
//     plain refund route, which used to re-fiscalise whichever refund was last.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { FiscalError } from '../pos/fiscal/errors.js';
import type { FiscalErrorKind } from '../pos/fiscal/errors.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';
import type { FiscalCallCtx, FiscalRefundDoc, FiscalResult, FiscalSaleDoc } from '../pos/fiscal/types.js';

/** A provider that fails exactly the Nth sale document with `kind`, and registers the rest. */
class FailsNthSale extends FakeFiscalProvider {
  private sales = 0;
  constructor(private readonly nth: number, private readonly kind: FiscalErrorKind) {
    super();
  }
  override async registerSale(ctx: FiscalCallCtx, doc: FiscalSaleDoc): Promise<FiscalResult> {
    this.sales += 1;
    if (this.sales === this.nth) {
      this.calls.push({ method: 'registerSale', requestId: doc.requestId, doc });
      throw new FiscalError(`fake ${this.kind}`, this.kind);
    }
    return super.registerSale(ctx, doc);
  }
}

describe.skipIf(!hasDb)('POS exchange — ПРРО', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let coat = 0;
  let tee = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('exchfisc');
    coat = (await seedProduct(store.storeId, { name: 'Пальто', priceCents: 50000, quantity: 500 })).variantId;
    tee = (await seedProduct(store.storeId, { name: 'Футболка', priceCents: 30000, quantity: 500 })).variantId;
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      default_tax_code: 'A',
      receipt_source: 'local',
      receipt_width: 32,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  const install = (provider: FakeFiscalProvider) => {
    fake = provider;
    registerProvider(fake);
    resetRuntime();
    resetRateLimiter();
  };

  beforeEach(async () => {
    install(new FakeFiscalProvider());
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  /** Prime the runtime so the next pre-flight makes no provider call. */
  const warm = () => fiscalService.preflight(store.storeId, store.sellerId);

  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api/pos${url}`, headers: auth(store.sellerToken), payload });

  const stockOf = async (variantId: number) =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);

  /** A fiscalised sale of one coat, paid in cash. */
  const sellCoat = async () => {
    const res = await post('/sales/complete', {
      items: [{ variant_id: coat, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 50000 }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal.status).toBe('done');
    return res.json();
  };

  const exchangeBody = (sale: { items: { id: number }[] }) => ({
    refund: {
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method: 'cash',
      reason_code: 'size',
      client_uuid: randomUUID(),
    },
    sale: {
      items: [{ variant_id: tee, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 30000 }],
      client_uuid: randomUUID(),
    },
  });

  const callsOf = (method: string) => fake.calls.filter((c) => c.method === method);
  const ledger = async (where: string, id: number) =>
    (await pool.query(`SELECT status, provider_doc_id FROM pos_fiscal_receipts WHERE ${where} = $1`, [id])).rows[0];

  it('registers the return receipt against the sale, then the sale receipt — two documents, in that order', async () => {
    await warm();
    const sale = await sellCoat();
    const saleDoc = await ledger('sale_id', sale.id);
    const before = fake.calls.length;

    const res = await post(`/sales/${sale.id}/exchange`, exchangeBody(sale));
    expect(res.statusCode).toBe(201);
    const view = res.json();
    expect(view.refund.refund_fiscal.status).toBe('done');
    expect(view.refund.refund_fiscal.fiscal_code).toEqual(expect.any(String));
    expect(view.sale.fiscal.status).toBe('done');
    expect(view.refund.refunds[0].fiscal_status).toBe('done');
    expect(view.refund.refunds[0].fiscal.fiscal_code).toBe(view.refund.refund_fiscal.fiscal_code);

    const registered = fake.calls.slice(before).filter((c) => c.method.startsWith('register'));
    expect(registered.map((c) => c.method)).toEqual(['registerRefund', 'registerSale']);
    const refundDoc = registered[0].doc as FiscalRefundDoc;
    expect(refundDoc.relatedProviderDocId).toBe(saleDoc.provider_doc_id);
    expect(refundDoc.totalCents).toBe(50000);
    expect(refundDoc.payments).toEqual([{ method: 'cash', amountCents: 50000 }]);
    expect((registered[1].doc as FiscalSaleDoc).totalCents).toBe(30000);

    expect((await ledger('refund_id', view.refund.refund_id)).status).toBe('done');
    expect((await ledger('sale_id', view.sale.id)).status).toBe('done');
  });

  it('writes nothing when ПРРО is unreachable at pre-flight', async () => {
    await warm();
    const sale = await sellCoat();
    // A fresh runtime with no shift: the next pre-flight has to ask the
    // provider, and the provider is down.
    resetRuntime();
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    fake.queueError('unavailable');
    const coatBefore = await stockOf(coat);

    const res = await post(`/sales/${sale.id}/exchange`, exchangeBody(sale));
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'fiscal_unavailable', code: 'unavailable' });

    const refunds = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_refunds WHERE sale_id = $1`, [sale.id]);
    expect(refunds.rows[0].n).toBe(0);
    expect(await stockOf(coat)).toBe(coatBefore);
  });

  it('keeps the refund when its receipt fails, and still registers the sale receipt', async () => {
    await warm();
    const sale = await sellCoat();
    fake.queueError('unavailable', 'gateway timeout');

    const res = await post(`/sales/${sale.id}/exchange`, exchangeBody(sale));
    expect(res.statusCode).toBe(201);
    const view = res.json();
    expect(view.refund.refund_fiscal.status).toBe('failed');
    expect(view.sale.fiscal.status).toBe('done');
    expect((await ledger('refund_id', view.refund.refund_id)).status).toBe('failed');
    expect(
      (await pool.query(`SELECT fiscal_status FROM pos_refunds WHERE id = $1`, [view.refund.refund_id])).rows[0].fiscal_status
    ).toBe('failed');
    expect(callsOf('registerSale')).toHaveLength(2);
  });

  it('voids only the new sale when ПРРО refuses its receipt — the refund and its receipt stand', async () => {
    // The original sale is the first sale document; the exchange's is the second.
    install(new FailsNthSale(2, 'rejected'));
    await warm();
    const sale = await sellCoat();
    const teeBefore = await stockOf(tee);
    const coatBefore = await stockOf(coat);

    const res = await post(`/sales/${sale.id}/exchange`, exchangeBody(sale));
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body).toMatchObject({ error: 'fiscal_failed', code: 'rejected', sale_voided: true, sale_kept: false });
    expect(body.difference_cents).toBe(-20000);
    expect(body.refund.refund_fiscal.status).toBe('done');
    expect(body.refund.refund_id).toEqual(expect.any(Number));

    const newSale = await pool.query(`SELECT status FROM pos_sales WHERE id = $1`, [body.sale_id]);
    expect(newSale.rows[0].status).toBe('voided');
    expect(await stockOf(tee)).toBe(teeBefore);
    // The coat came back and stays back: the refund is not undone.
    expect(await stockOf(coat)).toBe(coatBefore + 1);
    const original = await pool.query(`SELECT status FROM pos_sales WHERE id = $1`, [sale.id]);
    expect(original.rows[0].status).toBe('refunded');

    // The slot is free again: a replay reports the voided sale rather than
    // silently reusing it.
    const again = await post(`/sales/${sale.id}/exchange`, {
      refund: { ...exchangeBody(sale).refund, client_uuid: body.refund.refunds[0].client_uuid },
      sale: { ...exchangeBody(sale).sale, client_uuid: (await pool.query(`SELECT client_uuid FROM pos_sales WHERE id = $1`, [body.sale_id])).rows[0].client_uuid },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('exchange_sale_voided');
  });

  it('keeps the new sale, failed, when the outcome of its receipt is ambiguous', async () => {
    install(new FailsNthSale(2, 'unavailable'));
    await warm();
    const sale = await sellCoat();

    const res = await post(`/sales/${sale.id}/exchange`, exchangeBody(sale));
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body).toMatchObject({ error: 'fiscal_failed', code: 'unavailable', sale_voided: false, sale_kept: true });
    const newSale = await pool.query(`SELECT status, fiscal_status FROM pos_sales WHERE id = $1`, [body.sale_id]);
    expect(newSale.rows[0]).toMatchObject({ status: 'completed', fiscal_status: 'failed' });
    expect((await ledger('sale_id', body.sale_id)).status).toBe('failed');
  });

  it('answers a replay from the ledger — no second return receipt, no second sale receipt', async () => {
    await warm();
    const sale = await sellCoat();
    const payload = exchangeBody(sale);
    const first = await post(`/sales/${sale.id}/exchange`, payload);
    expect(first.statusCode).toBe(201);
    const calls = fake.calls.length;

    const again = await post(`/sales/${sale.id}/exchange`, payload);
    expect(again.statusCode).toBe(200);
    expect(again.json().refund.refund_fiscal.fiscal_code).toBe(first.json().refund.refund_fiscal.fiscal_code);
    expect(again.json().sale.fiscal.fiscal_code).toBe(first.json().sale.fiscal.fiscal_code);
    expect(fake.calls.length).toBe(calls);
  });

  it('on the plain refund route, a replay fiscalises ITS refund — not whichever was last', async () => {
    await warm();
    const res = await post('/sales/complete', {
      items: [{ variant_id: coat, quantity: 2 }],
      payments: [{ method: 'cash', amount_cents: 100000 }],
    });
    const sale = res.json();
    const firstUuid = randomUUID();
    const first = await post(`/sales/${sale.id}/refunds`, {
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method: 'cash',
      client_uuid: firstUuid,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().refund_fiscal.status).toBe('done');
    const second = await post(`/sales/${sale.id}/refunds`, {
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method: 'cash',
      client_uuid: randomUUID(),
    });
    expect(second.statusCode).toBe(200);
    const refundCalls = callsOf('registerRefund').length;

    const replay = await post(`/sales/${sale.id}/refunds`, {
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method: 'cash',
      client_uuid: firstUuid,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refund_fiscal.fiscal_code).toBe(first.json().refund_fiscal.fiscal_code);
    expect(replay.json().refund_fiscal.fiscal_code).not.toBe(second.json().refund_fiscal.fiscal_code);
    expect(callsOf('registerRefund')).toHaveLength(refundCalls);
  });
});
