// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.routing.test.ts
//
// A product goes through its own register, and a table bill holding food and
// alcohol becomes two receipts (ДК2-А, TechDocs/POS_DUAL_REGISTER.md §4.2).
// «Шабля»: food on one ФОП's Cashalot, alcohol on another's. Two fakes stand
// behind one `cashalot` id, picked by the licence, so each register has its
// own documents (helpers/split-fiscal-provider.ts).

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { getSalesSummary } from '../pos/analytics.service.js';
import * as bills from '../pos/bills.service.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { issueOnCredit } from '../pos/debts.service.js';
import { DebtConflict } from '../pos/debt-lines.service.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings, updateRegisterSettings } from '../pos/fiscal/settings.service.js';
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
import { BAR_LICENCE, FOOD_LICENCE, splitProvider } from './helpers/split-fiscal-provider.js';

describe.skipIf(!hasDb)('POS fiscal: products go through their own register (ДК2-А)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let food: FakeFiscalProvider;
  let bar: FakeFiscalProvider;
  let borscht = 0;
  let vodka = 0;
  let vodkaProduct = 0;
  let hall = 0;
  let tableSeq = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rroute');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    hall = Number(
      (
        await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`, [
          store.storeId,
        ])
      ).rows[0].id
    );
    borscht = (await seedProduct(store.storeId, { name: 'Борщ', priceCents: 12_345, quantity: 500 }))
      .variantId;
    const v = await seedProduct(store.storeId, { name: 'Горілка 50 мл', priceCents: 6_000, quantity: 500 });
    vodka = v.variantId;
    vodkaProduct = v.productId;
    await pool.query(`UPDATE pos_products SET fiscal_register = 2 WHERE id = $1`, [vodkaProduct]);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    food = new FakeFiscalProvider({ id: 'cashalot' });
    bar = new FakeFiscalProvider({ id: 'cashalot' });
    registerProvider(splitProvider(food, bar));
    resetRuntime();
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_registers WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'cashalot',
      auto_open_shift: true,
      secrets: { licenceKey: FOOD_LICENCE, cashierPin: '0000' },
    });
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const enableBar = () =>
    updateRegisterSettings(store.storeId, 2, {
      enabled: true,
      label: 'Бар',
      secrets: { licenceKey: BAR_LICENCE, cashierPin: '1111' },
    });

  const sell = (items: Array<{ variant_id: number; quantity: number }>, amount: number) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: { items, payments: [{ method: 'cash', amount_cents: amount }], client_uuid: randomUUID() },
    });

  const registered = (fake: FakeFiscalProvider, method = 'registerSale') =>
    fake.calls.filter((c) => c.method === method);

  async function firedBill(items: Array<{ variant_id: number; quantity: number }>): Promise<bills.Bill> {
    tableSeq += 1;
    const table = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, `R${tableSeq}`]
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

  const payBill = (billId: number, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/pay`,
      headers: auth(store.sellerToken),
      payload: body,
    });

  // ── One register per receipt at the till ──────────────────────────────────

  it('sells a register-2 product through register 1 while register 2 is off', async () => {
    const res = await sell([{ variant_id: vodka, quantity: 1 }], 6_000);
    expect(res.statusCode).toBe(201);
    expect(registered(food)).toHaveLength(1);
    const sale = await pool.query(`SELECT fiscal_register FROM pos_sales WHERE id = $1`, [res.json().id]);
    expect(sale.rows[0].fiscal_register).toBe(1);

    const catalog = await app.inject({
      method: 'GET',
      url: '/api/pos/catalog',
      headers: auth(store.sellerToken),
    });
    const row = catalog.json().find((item: { variant_id: number }) => item.variant_id === vodka);
    expect(row.fiscal_register).toBe(1);
  });

  it('sends an alcohol-only receipt through register 2 and returns it there', async () => {
    await enableBar();
    const res = await sell([{ variant_id: vodka, quantity: 2 }], 12_000);
    expect(res.statusCode).toBe(201);
    expect(registered(bar)).toHaveLength(1);
    expect(registered(food)).toHaveLength(0);
    const saleId = res.json().id;
    const sale = await pool.query(`SELECT fiscal_register FROM pos_sales WHERE id = $1`, [saleId]);
    expect(sale.rows[0].fiscal_register).toBe(2);

    const refunded = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: res.json().items[0].id, quantity: 1 }], method: 'cash' },
    });
    expect(refunded.statusCode).toBe(200);
    expect(registered(bar, 'registerRefund')).toHaveLength(1);
    expect(registered(food, 'registerRefund')).toHaveLength(0);

    const catalog = await app.inject({
      method: 'GET',
      url: '/api/pos/catalog',
      headers: auth(store.sellerToken),
    });
    const row = catalog.json().find((item: { variant_id: number }) => item.variant_id === vodka);
    expect(row.fiscal_register).toBe(2);
  });

  it('refuses a mixed cart from a till that cannot show two receipts, writing nothing', async () => {
    await enableBar();
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_sales WHERE store_id = $1`, [
      store.storeId,
    ]);
    const res = await sell(
      [
        { variant_id: borscht, quantity: 1 },
        { variant_id: vodka, quantity: 1 },
      ],
      20_000
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('split_needs_update');
    const after = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_sales WHERE store_id = $1`, [
      store.storeId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(registered(food)).toHaveLength(0);
    expect(registered(bar)).toHaveLength(0);
  });

  // ── A table's bill ────────────────────────────────────────────────────────

  it('pays a food-and-alcohol bill as two receipts, change on the last', async () => {
    await enableBar();
    const bill = await firedBill([
      { variant_id: borscht, quantity: 1 },
      { variant_id: vodka, quantity: 2 },
    ]);
    // 12 345 + 12 000 = 24 345; 10 % off the whole = 2 435, shared 1 235 / 1 200.
    const res = await payBill(bill.id, {
      parts: [{ payments: [{ method: 'cash', amount_cents: 30_000 }], client_uuid: randomUUID() }],
      cart_discount: { type: 'percent', value: 10 },
      cash_rounding: 10,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sale_ids).toHaveLength(2);
    expect(registered(food)).toHaveLength(1);
    expect(registered(bar)).toHaveLength(1);

    const sales = (
      await pool.query(
        `SELECT s.id, s.fiscal_register, s.total_cents, s.rounding_cents, s.cart_discount_cents,
                (SELECT SUM(amount_cents) FROM pos_payments p WHERE p.sale_id = s.id)::int AS paid
         FROM pos_sales s WHERE s.id = ANY($1::bigint[]) ORDER BY s.id`,
        [res.json().sale_ids]
      )
    ).rows;
    expect(sales.map((s) => s.fiscal_register)).toEqual([1, 2]);
    expect(sales.reduce((sum, s) => sum + Number(s.cart_discount_cents), 0)).toBe(2_435);
    // The food receipt took exactly what it owed after its own rounding…
    expect(sales[0].paid).toBe(Number(sales[0].total_cents) + Number(sales[0].rounding_cents));
    // …and the bar's took the rest of the 300 ₴ note, change included.
    expect(sales[0].paid + sales[1].paid).toBe(30_000);
    expect(await billStatus(bill.id)).toBe('paid');
  });

  it('quotes each receipt of a bill exactly as the payment then rings it (ДК3-Г)', async () => {
    await enableBar();
    const bill = await firedBill([
      { variant_id: borscht, quantity: 1 },
      { variant_id: vodka, quantity: 2 },
    ]);
    const body = {
      parts: [{ payments: [{ method: 'cash', amount_cents: 0 }] }],
      cart_discount: { type: 'percent', value: 10 },
      cash_rounding: 10,
    };
    const quote = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${bill.id}/pay-quote`,
      headers: auth(store.sellerToken),
      payload: body,
    });
    expect(quote.statusCode).toBe(200);
    const receipts = quote.json().receipts as Array<{ register_no: number; label: string | null; due_cents: number }>;
    expect(receipts.map((r) => [r.register_no, r.label])).toEqual([
      [1, null],
      [2, 'Бар'],
    ]);
    expect(registered(food)).toHaveLength(0);
    expect(await billStatus(bill.id)).toBe('open');

    const paid = await payBill(bill.id, {
      ...body,
      parts: [{ payments: [{ method: 'cash', amount_cents: quote.json().due_cents }], client_uuid: randomUUID() }],
    });
    expect(paid.statusCode).toBe(200);
    const sales = (
      await pool.query(
        `SELECT total_cents + rounding_cents AS due FROM pos_sales WHERE id = ANY($1::bigint[]) ORDER BY id`,
        [paid.json().sale_ids]
      )
    ).rows.map((r) => Number(r.due));
    expect(sales).toEqual(receipts.map((r) => r.due_cents));
  });

  it('queues a paid bill’s receipts for the bar printer, one device at a time (ДК3-Г, Д13)', async () => {
    await enableBar();
    // Bills paid by earlier tests of this store are in the queue too.
    await pool.query(
      `UPDATE pos_sales SET printed_at = NOW() WHERE store_id = $1 AND print_requested_at IS NOT NULL`,
      [store.storeId]
    );
    const bill = await firedBill([
      { variant_id: borscht, quantity: 1 },
      { variant_id: vodka, quantity: 1 },
    ]);
    const paid = await payBill(bill.id, {
      parts: [{ payments: [{ method: 'card', amount_cents: 18_345 }], client_uuid: randomUUID() }],
    });
    expect(paid.statusCode).toBe(200);
    const saleIds = paid.json().sale_ids as number[];

    const take = (device?: string) =>
      app.inject({
        method: 'GET',
        url: '/api/pos/sales/print-queue',
        headers: { ...auth(store.sellerToken), ...(device ? { 'x-pos-device-id': device } : {}) },
      });
    expect((await take()).statusCode).toBe(400);

    const first = await take('bar-desktop');
    expect(first.statusCode).toBe(200);
    const jobs = first.json().jobs as Array<{ id: number; fiscal_register: number; fiscal: { fiscal_code: string } | null }>;
    expect(jobs.map((j) => j.id)).toEqual(saleIds);
    expect(jobs.map((j) => j.fiscal_register)).toEqual([1, 2]);
    expect(jobs.every((j) => Boolean(j.fiscal?.fiscal_code))).toBe(true);

    // Another desktop gets nothing while the lease holds.
    expect((await take('other-desktop')).json().jobs).toEqual([]);

    const done = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleIds[0]}/printed`,
      headers: auth(store.sellerToken),
    });
    expect(done.statusCode).toBe(200);
    const again = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleIds[0]}/printed`,
      headers: auth(store.sellerToken),
    });
    expect(again.statusCode).toBe(200);

    // The lease runs out: the unprinted one goes to whoever asks next.
    await pool.query(
      `UPDATE pos_sales SET print_claimed_at = NOW() - INTERVAL '3 minutes' WHERE id = ANY($1::bigint[])`,
      [saleIds]
    );
    expect((await take('other-desktop')).json().jobs.map((j: { id: number }) => j.id)).toEqual([saleIds[1]]);

    // A sale rung at the counter is never queued.
    const counter = await sell([{ variant_id: borscht, quantity: 1 }], 12_345);
    expect(counter.statusCode).toBe(201);
    const queued = await pool.query(`SELECT print_requested_at FROM pos_sales WHERE id = $1`, [counter.json().id]);
    expect(queued.rows[0].print_requested_at).toBeNull();
  });

  it('refuses «порівну» and mixed payment while register 2 works', async () => {
    await enableBar();
    const bill = await firedBill([{ variant_id: borscht, quantity: 2 }]);
    const res = await payBill(bill.id, {
      parts: [
        {
          payments: [
            { method: 'cash', amount_cents: 12_345 },
            { method: 'cash', amount_cents: 12_345 },
          ],
        },
      ],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/порівну/);
    expect(registered(food)).toHaveLength(0);
  });

  it('keeps the food receipt when the bar receipt is refused, and owes the alcohol again', async () => {
    await enableBar();
    const bill = await firedBill([
      { variant_id: borscht, quantity: 1 },
      { variant_id: vodka, quantity: 1 },
    ]);
    await warmBar();
    bar.queueError('rejected', 'refused by the provider');
    const res = await payBill(bill.id, {
      parts: [{ payments: [{ method: 'card', amount_cents: 18_345 }] }],
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().sale_ids).toHaveLength(1);
    expect(res.json().error).toContain('поверніть гостю лише за страви, які знову в рахунку');
    const lines = (
      await pool.query(
        `SELECT b.variant_id, b.sale_id FROM pos_bill_items b WHERE b.bill_id = $1 ORDER BY b.id`,
        [bill.id]
      )
    ).rows.map((r) => ({ variant: Number(r.variant_id), paid: r.sale_id != null }));
    expect(lines).toEqual([
      { variant: borscht, paid: true },
      { variant: vodka, paid: false },
    ]);
    expect(await billStatus(bill.id)).toBe('open');
  });

  // ── Guards ────────────────────────────────────────────────────────────────

  it('never puts register-2 goods on credit', async () => {
    await enableBar();
    const customer = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, 'Сусід', '+380670009901', 1000000) RETURNING id`,
      [store.storeId]
    );
    await expect(
      issueOnCredit({
        storeId: store.storeId,
        staffId: store.sellerId,
        customerId: Number(customer.rows[0].id),
        items: [{ variant_id: vodka, quantity: 1 }],
        client_uuid: randomUUID(),
      })
    ).rejects.toBeInstanceOf(DebtConflict);
  });

  it('refuses an exchange that would move goods between registers', async () => {
    await enableBar();
    const sold = await sell([{ variant_id: borscht, quantity: 1 }], 12_345);
    expect(sold.statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${sold.json().id}/exchange`,
      headers: auth(store.sellerToken),
      payload: {
        refund: {
          items: [{ sale_item_id: sold.json().items[0].id, quantity: 1 }],
          method: 'cash',
          reason_code: 'other',
          client_uuid: randomUUID(),
        },
        sale: {
          items: [{ variant_id: vodka, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 6_000 }],
          client_uuid: randomUUID(),
        },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('exchange_cross_register');
    expect(registered(bar)).toHaveLength(0);
  });

  // ── Takings ───────────────────────────────────────────────────────────────

  it('splits the day’s takings by register, adding up to the totals', async () => {
    await enableBar();
    await sell([{ variant_id: vodka, quantity: 1 }], 10_000);
    await sell([{ variant_id: borscht, quantity: 1 }], 12_345);
    const summary = await getSalesSummary(store.storeId);
    expect(summary.registers?.map((r) => r.register_no)).toEqual([1, 2]);
    const sum = (key: 'gross_cents' | 'refunded_cents' | 'sales_count') =>
      (summary.registers ?? []).reduce((total, r) => total + r[key], 0);
    expect(sum('gross_cents')).toBe(summary.gross_cents);
    expect(sum('refunded_cents')).toBe(summary.refunded_cents);
    expect(sum('sales_count')).toBe(summary.sales_count);
    const barCash = summary.registers?.[1].payments.find((p) => p.method === 'cash');
    // 100 ₴ handed over for a 60 ₴ shot: the change is not the bar's takings.
    expect(barCash?.amount_cents).toBeGreaterThan(0);
    const barGross = summary.registers?.[1].gross_cents ?? 0;
    expect(summary.registers?.[1].payments.reduce((t, p) => t + p.amount_cents, 0)).toBe(
      barGross + (summary.registers?.[1].rounding_cents ?? 0)
    );
  });

  async function warmBar() {
    // Open register 2's shift first, so the queued failure hits the document.
    const shifts = await import('../pos/fiscal/shifts.service.js');
    const ctx = await shifts.resolveContext(store.storeId, 2);
    await shifts.openShift(ctx!, AbortSignal.timeout(10_000), store.sellerId);
    const foodCtx = await shifts.resolveContext(store.storeId, 1);
    await shifts.openShift(foodCtx!, AbortSignal.timeout(10_000), store.sellerId);
  }

  async function billStatus(billId: number): Promise<string> {
    return String((await pool.query(`SELECT status FROM pos_bills WHERE id = $1`, [billId])).rows[0].status);
  }
});
