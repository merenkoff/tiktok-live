// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.bill-payment.fiscal.test.ts — paying a table bill in a
// store that fiscalises.
//
// Until this existed `POST /bills/:id/pay` never asked ПРРО anything: every
// table sale in a fiscalising store stayed `fiscal_status='none'` for ever —
// no receipt, and a refund with nothing to return against. What is pinned here
// is the same three outcomes the till's checkout has (pos.fiscal.checkout.
// test.ts), applied to the parts of a bill:
//
//   * ПРРО unreachable BEFORE a part is written → nothing is written;
//   * the provider REFUSED the document → the part is undone and its plates
//     are owed again — WITHOUT returning stock, because the round took it and
//     the dish was cooked;
//   * the outcome is AMBIGUOUS → the sale stands, `failed`, for the retry.
//
// See bill-payment.service.ts rule 4, TechDocs/POS_TABLES.md §9.8.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { FiscalError } from '../pos/fiscal/errors.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import * as bills from '../pos/bills.service.js';
import { fireRound } from '../pos/rounds.service.js';
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
import type { FiscalResult, FiscalSaleDoc, FiscalCallCtx } from '../pos/fiscal/types.js';

/** A provider that refuses exactly the Nth sale document, and registers the rest. */
class RefusesNthSale extends FakeFiscalProvider {
  private sales = 0;
  constructor(private readonly nth: number) {
    super();
  }
  override async registerSale(ctx: FiscalCallCtx, doc: FiscalSaleDoc): Promise<FiscalResult> {
    this.sales += 1;
    if (this.sales === this.nth) {
      this.calls.push({ method: 'registerSale', requestId: doc.requestId, doc });
      throw new FiscalError('refused by the provider', 'rejected');
    }
    return super.registerSale(ctx, doc);
  }
}

describe.skipIf(!hasDb)('POS bill payment — ПРРО', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let hall = 0;
  let tea = 0;
  let cake = 0;
  let tableSeq = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('billfisc');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    hall = Number(
      (
        await pool.query(
          `INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`,
          [store.storeId]
        )
      ).rows[0].id
    );
    tea = (await seedProduct(store.storeId, { name: 'Чай', priceCents: 4000, quantity: 500 })).variantId;
    cake = (await seedProduct(store.storeId, { name: 'Торт', priceCents: 6000, quantity: 500 })).variantId;
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

  const enableFiscal = () =>
    updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      default_tax_code: 'A',
      receipt_source: 'local',
      receipt_width: 32,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
  const disableFiscal = () => updateFiscalSettings(store.storeId, { enabled: false });
  /** Prime the runtime so the next pre-flight makes no provider call (see pos.fiscal.checkout.test.ts). */
  const warm = () => fiscalService.preflight(store.storeId, store.sellerId);

  const stockOf = async (variantId: number): Promise<number> =>
    Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0]
        ?.quantity ?? 0
    );

  /** A bill whose lines are all fired, ready to pay. */
  async function firedBill(items: Array<{ variant_id: number; quantity: number }>): Promise<bills.Bill> {
    tableSeq += 1;
    const table = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, `FP${tableSeq}`]
    );
    const opened = await bills.openBill({
      storeId: store.storeId,
      staffId: store.sellerId,
      tableId: Number(table.rows[0].id),
    });
    for (const item of items) {
      await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, item);
    }
    return fireRound({ storeId: store.storeId, staffId: store.sellerId, billId: opened.bill.id });
  }

  const pay = (billId: number, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/pay`,
      headers: auth(store.sellerToken),
      payload: body,
    });
  const cash = (amount: number) => [{ method: 'cash' as const, amount_cents: amount }];

  const registerCalls = () => fake.calls.filter((c) => c.method === 'registerSale').length;
  // `pg` hands bigint columns back as strings; the assertions compare numbers.
  const billLines = async (billId: number) =>
    (
      await pool.query(
        `SELECT id, sale_id FROM pos_bill_items WHERE bill_id = $1 ORDER BY sort_order, id`,
        [billId]
      )
    ).rows.map((r) => ({ id: Number(r.id), sale_id: r.sale_id == null ? null : Number(r.sale_id) }));
  const salesOfBill = async (billId: number) =>
    (
      await pool.query(
        `SELECT DISTINCT s.id, s.status, s.fiscal_status
           FROM pos_sales s
           JOIN pos_sale_items i ON i.sale_id = s.id
           JOIN pos_bill_items b ON b.id = i.bill_item_id
          WHERE b.bill_id = $1 ORDER BY s.id`,
        [billId]
      )
    ).rows.map((r) => ({ id: Number(r.id), status: String(r.status), fiscal_status: String(r.fiscal_status) }));
  const ledgerRows = async () =>
    (
      await pool.query(`SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`, [store.storeId])
    ).rows;
  const billStatus = async (billId: number) =>
    String((await pool.query(`SELECT status FROM pos_bills WHERE id = $1`, [billId])).rows[0].status);

  // ── The store does not fiscalise ─────────────────────────────────────────

  it('changes nothing for a store without ПРРО', async () => {
    await disableFiscal();
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    const res = await pay(bill.id, { parts: [{ payments: cash(4000) }] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ warning: null, fiscal: [] });
    const [sale] = await salesOfBill(bill.id);
    expect(sale.fiscal_status).toBe('none');
    expect(fake.calls).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });

  // ── Registering ──────────────────────────────────────────────────────────

  it('registers a whole-bill payment with ПРРО before it counts as paid', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([
      { variant_id: tea, quantity: 2 },
      { variant_id: cake, quantity: 1 },
    ]);
    const res = await pay(bill.id, { parts: [{ payments: cash(14000) }] });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.warning).toBeNull();
    expect(body.sale_ids).toHaveLength(1);
    expect(body.fiscal).toHaveLength(1);
    expect(body.fiscal[0]).toMatchObject({ sale_id: body.sale_ids[0] });
    expect(body.fiscal[0].fiscal.status).toBe('done');
    expect(body.bill.status).toBe('paid');

    expect(registerCalls()).toBe(1);
    const [sale] = await salesOfBill(bill.id);
    expect(sale.fiscal_status).toBe('done');
    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('done');
    expect(Number(rows[0].sale_id)).toBe(sale.id);
    expect(Number(rows[0].total_cents)).toBe(14000);
  });

  it('a split by dishes is one receipt per guest — each with its own goods', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([
      { variant_id: tea, quantity: 1 },
      { variant_id: cake, quantity: 1 },
    ]);
    const [teaLine, cakeLine] = await billLines(bill.id);
    const res = await pay(bill.id, {
      parts: [
        { line_ids: [teaLine.id], payments: cash(4000) },
        { line_ids: [cakeLine.id], payments: cash(6000) },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().fiscal).toHaveLength(2);
    expect(registerCalls()).toBe(2);
    const rows = await ledgerRows();
    expect(rows.map((r) => Number(r.total_cents)).sort((a, b) => a - b)).toEqual([4000, 6000]);
    expect(rows.every((r) => r.status === 'done')).toBe(true);
    expect(await billStatus(bill.id)).toBe('paid');
  });

  it('a split by sum is ONE receipt paid in several rows', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([{ variant_id: tea, quantity: 3 }]);
    const res = await pay(bill.id, {
      parts: [
        {
          payments: [
            { method: 'cash', amount_cents: 4000 },
            { method: 'card', amount_cents: 4000 },
            { method: 'cash', amount_cents: 4000 },
          ],
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    // One list of goods, so one receipt — the schema and the law agree on this.
    expect(registerCalls()).toBe(1);
    expect(await ledgerRows()).toHaveLength(1);
  });

  it('lets the refund of a registered table sale reach ПРРО (it used to have nothing to return against)', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    const paid = await pay(bill.id, { parts: [{ payments: cash(4000) }] });
    const saleId = paid.json().sale_ids[0];
    const detail = (
      await pool.query(`SELECT id, quantity FROM pos_sale_items WHERE sale_id = $1`, [saleId])
    ).rows[0];

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: Number(detail.id), quantity: 1 }], reason: 'test', method: 'cash' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().refund_fiscal.status).toBe('done');
    expect(fake.calls.filter((c) => c.method === 'registerRefund')).toHaveLength(1);
  });

  // ── ПРРО unreachable before anything is written ──────────────────────────

  it('writes nothing when ПРРО is unreachable — the plates stay owed', async () => {
    await enableFiscal();
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    const stockBefore = await stockOf(tea);

    fake.queueError('unavailable');
    const res = await pay(bill.id, { parts: [{ payments: cash(4000) }] });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    // The waiter's sentence, not a machine word: the `tables` module prints `error` as it is.
    expect(body.error).toBe('Немає звʼязку з ПРРО — спробуйте ще раз');
    expect(body).toMatchObject({ code: 'unavailable', sale_ids: [] });
    expect(body.support_code).toBe('FS-UNAVAILABLE');
    expect(body.bill.status).toBe('open');

    expect(await salesOfBill(bill.id)).toHaveLength(0);
    expect((await billLines(bill.id)).every((l) => l.sale_id === null)).toBe(true);
    expect(await stockOf(tea)).toBe(stockBefore);
    expect(await billStatus(bill.id)).toBe('open');
  });

  // ── The provider refused: undo the part, keep the dinner ─────────────────

  it('undoes the part when the provider refuses the receipt — plates owed, stock NOT returned', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([{ variant_id: tea, quantity: 2 }]);
    // The round already took the stock; that is the number that must not move.
    const stockAfterRound = await stockOf(tea);

    fake.queueError('rejected', 'bad tax code');
    const res = await pay(bill.id, { parts: [{ payments: cash(8000) }] });

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error).toBe(
      'ПРРО відхилило чек — перевірте товари та ціни. Оплату цієї частини скасовано, страви знову в рахунку.'
    );
    expect(body).toMatchObject({ code: 'rejected', sale_voided: true, sale_kept: false, sale_ids: [] });
    expect(body.bill.status).toBe('open');

    const sales = await salesOfBill(bill.id);
    expect(sales).toHaveLength(1);
    expect(sales[0].status).toBe('voided');
    // Back on the bill as unpaid…
    expect((await billLines(bill.id)).every((l) => l.sale_id === null)).toBe(true);
    // …and the dish is still cooked: a plain `voidSale` would have credited this back.
    expect(await stockOf(tea)).toBe(stockAfterRound);
    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('abandoned');
    expect(rows[0].error_code).toBe('sale_voided');
    expect(await billStatus(bill.id)).toBe('open');
  });

  it('can be paid again after a refused receipt — and then registers exactly once', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);

    fake.queueError('rejected');
    expect((await pay(bill.id, { parts: [{ payments: cash(4000) }] })).statusCode).toBe(502);

    const again = await pay(bill.id, { parts: [{ payments: cash(4000) }] });
    expect(again.statusCode).toBe(200);
    expect(again.json().bill.status).toBe('paid');
    const live = (await salesOfBill(bill.id)).filter((s) => s.status === 'completed');
    expect(live).toHaveLength(1);
    expect(live[0].fiscal_status).toBe('done');
  });

  it('a refused second part leaves the first paid and registered, and only the second owed', async () => {
    resetProviders();
    install(new RefusesNthSale(2));
    await enableFiscal();
    await warm();
    const bill = await firedBill([
      { variant_id: tea, quantity: 1 },
      { variant_id: cake, quantity: 1 },
    ]);
    const [teaLine, cakeLine] = await billLines(bill.id);

    const res = await pay(bill.id, {
      parts: [
        { line_ids: [teaLine.id], payments: cash(4000) },
        { line_ids: [cakeLine.id], payments: cash(6000) },
      ],
    });

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.sale_voided).toBe(true);
    // The first guest's receipt went through and is reported as such.
    expect(body.sale_ids).toHaveLength(1);

    const lines = await billLines(bill.id);
    expect(lines.find((l) => l.id === teaLine.id)?.sale_id).toBe(body.sale_ids[0]);
    expect(lines.find((l) => l.id === cakeLine.id)?.sale_id).toBeNull();
    expect(await billStatus(bill.id)).toBe('open');

    const rows = await ledgerRows();
    expect(rows.map((r) => r.status).sort()).toEqual(['abandoned', 'done']);
  });

  // ── Ambiguous: the receipt may exist ─────────────────────────────────────

  it('keeps the sale when the outcome is ambiguous, says so, and lets the retry settle it', async () => {
    // A timeout says nothing about whether ПРРО committed the receipt. Voiding
    // here would put the plates back on the bill while the tax service may hold
    // a valid receipt — and the waiter's re-ring would fiscalise it twice.
    await enableFiscal();
    await warm();
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    const stockAfterRound = await stockOf(tea);

    fake.queueError('unavailable', 'gateway timeout');
    const res = await pay(bill.id, { parts: [{ payments: cash(4000) }] });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.warning).toContain('Не пробивайте його вдруге');
    expect(body.sale_ids).toHaveLength(1);
    expect(body.bill.status).toBe('paid');

    const [sale] = await salesOfBill(bill.id);
    expect(sale.status).toBe('completed');
    expect(sale.fiscal_status).toBe('failed');
    expect(await stockOf(tea)).toBe(stockAfterRound);
    const [row] = await ledgerRows();
    expect(row.status).toBe('failed');
    expect(row.next_attempt_at).toBeTruthy();

    // The retry pass registers it — the waiter never has to.
    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE store_id = $1`,
      [store.storeId]
    );
    resetRateLimiter();
    const result = await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });
    expect(result.done).toBe(1);
    expect((await salesOfBill(bill.id))[0].fiscal_status).toBe('done');
  });

  // ── A replayed part must not pass off an undone sale as a success ────────

  it('refuses a part whose client_uuid names an already-undone sale', async () => {
    await enableFiscal();
    await warm();
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    const uuid = '5f0d9c1e-3b7a-4c52-8e2b-7d1f0a9b6c33';

    fake.queueError('rejected');
    expect((await pay(bill.id, { parts: [{ client_uuid: uuid, payments: cash(4000) }] })).statusCode).toBe(502);

    const replay = await pay(bill.id, { parts: [{ client_uuid: uuid, payments: cash(4000) }] });
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error).toContain('скасовано');
    // Nothing was rung, so the plates are still owed.
    expect((await billLines(bill.id)).every((l) => l.sale_id === null)).toBe(true);
  });
});
