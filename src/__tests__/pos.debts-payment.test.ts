// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.debts-payment.test.ts — paying off goods taken «під
// запис» (migration 073, TechDocs/grocery/G3_DEBTS.md §3).
//
// A repayment is an ordinary receipt for the goods being paid for, at the
// prices and discounts fixed when they were given: its lines carry exactly
// what the statement said, it moves no stock (the goods left at the handover),
// and the journal goes down by what the goods came to — not by the cash
// rounding. Under ПРРО it has the till's three outcomes, as a table bill's part
// does: nothing written, undone with the goods owed again, or kept for the
// retry.
//
// Also pinned here, because the same change made it: voiding a table bill's
// receipt gives its plates back to the bill WITHOUT crediting the stock the
// round took (it used to credit it — dinner invented back onto the shelf).

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { setComponents } from '../pos/composites.service.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
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

describe.skipIf(!hasDb)('POS «під запис» — paying it off', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let bread = 0;
  let milk = 0;
  let rose = 0;
  let bouquet = 0;
  let customerSeq = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('debtpay');
    bread = (await seedProduct(store.storeId, { name: 'Хліб', priceCents: 3200, quantity: 500 })).variantId;
    milk = (await seedProduct(store.storeId, { name: 'Молоко', priceCents: 4500, quantity: 500 })).variantId;
    rose = (await seedProduct(store.storeId, { name: 'Троянда', priceCents: 6000, quantity: 500 })).variantId;

    // A bouquet assembled when it is taken: three roses, no stock of its own.
    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name, kind, stock_mode)
       VALUES ($1, 'Букет «Ніжність»', 'composite', 'derived') RETURNING id`,
      [store.storeId]
    );
    const variant = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
       VALUES ($1, $2, '{}'::jsonb, '', 'шт', 15000, 0) RETURNING id`,
      [store.storeId, product.rows[0].id]
    );
    bouquet = Number(variant.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 0)`, [
      bouquet,
      store.storeId,
    ]);
    await setComponents(pool, store.storeId, bouquet, [{ component_variant_id: rose, quantity: 3 }]);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  async function customer(limitCents: number | null = 1000000): Promise<number> {
    customerSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [store.storeId, `Боржник ${customerSeq}`, `+38067000${String(customerSeq).padStart(4, '0')}`, limitCents]
    );
    return Number(row.rows[0].id);
  }

  const post = (url: string, body: Record<string, unknown>, token = store.sellerToken) =>
    app.inject({ method: 'POST', url, headers: auth(token), payload: body });

  /** Give goods «під запис» and return the lines it wrote. */
  async function give(
    customerId: number,
    items: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {}
  ): Promise<Array<{ id: number; owed_cents: number; line_total_cents: number }>> {
    const res = await post('/api/pos/debts/issue', {
      customer_id: customerId,
      client_uuid: randomUUID(),
      items,
      ...extra,
    });
    expect(res.statusCode).toBe(201);
    return res.json().lines;
  }

  const pay = (customerId: number, body: Record<string, unknown>) =>
    post(`/api/pos/debts/customers/${customerId}/pay`, { client_uuid: randomUUID(), ...body });
  const cash = (amount: number) => [{ method: 'cash' as const, amount_cents: amount }];

  const stockOf = async (variantId: number): Promise<number> =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);

  const saleMovements = async (saleId: number) =>
    (
      await pool.query(
        `SELECT variant_id, delta, reason FROM pos_stock_movements
          WHERE store_id = $1 AND reference_type = 'sale' AND reference_id = $2`,
        [store.storeId, saleId]
      )
    ).rows;

  const entries = async (customerId: number) =>
    (
      await pool.query(
        `SELECT kind, amount_cents, sale_id FROM pos_debt_entries
          WHERE store_id = $1 AND customer_id = $2 ORDER BY id`,
        [store.storeId, customerId]
      )
    ).rows.map((r) => ({
      kind: String(r.kind),
      amount_cents: Number(r.amount_cents),
      sale_id: r.sale_id == null ? null : Number(r.sale_id),
    }));

  const balance = async (customerId: number) =>
    (await entries(customerId)).reduce((sum, e) => sum + e.amount_cents, 0);

  const linesOf = async (customerId: number) =>
    (
      await pool.query(
        `SELECT id, sale_id FROM pos_debt_items WHERE store_id = $1 AND customer_id = $2 ORDER BY id`,
        [store.storeId, customerId]
      )
    ).rows.map((r) => ({ id: Number(r.id), sale_id: r.sale_id == null ? null : Number(r.sale_id) }));

  const salesOf = async (customerId: number) =>
    (
      await pool.query(
        `SELECT id, status, fiscal_status FROM pos_sales WHERE store_id = $1 AND customer_id = $2 ORDER BY id`,
        [store.storeId, customerId]
      )
    ).rows.map((r) => ({ id: Number(r.id), status: String(r.status), fiscal_status: String(r.fiscal_status) }));

  // ── A store without ПРРО ─────────────────────────────────────────────────

  describe('a store without ПРРО', () => {
    beforeAll(async () => {
      await pool.query(`DELETE FROM pos_fiscal_settings WHERE store_id = $1`, [store.storeId]);
    });

    it('pays everything owed in one receipt at the handover’s prices, and moves no stock', async () => {
      const id = await customer();
      const lines = await give(
        id,
        [
          { variant_id: bread, quantity: 2 },
          { variant_id: milk, quantity: 1 },
        ],
        { cart_discount: { type: 'percent', value: 10 } }
      );
      const owed = lines.reduce((sum, l) => sum + l.owed_cents, 0);
      expect(owed).toBe(9810); // 109,00 less 10 %
      const breadBefore = await stockOf(bread);
      const milkBefore = await stockOf(milk);

      const res = await pay(id, { payments: cash(10000) });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ fiscal: null, warning: null, open_lines: [] });
      expect(body.credit.balance_cents).toBe(0);
      expect(body.sale).toMatchObject({
        status: 'completed',
        customer_id: id,
        total_cents: 9810,
        repays_debt: true,
        cart_discount_type: 'fixed',
        cart_discount_cents: 1090,
      });
      // Each receipt line comes to exactly what its statement line said.
      const byName = new Map(
        (body.sale.items as Array<{ product_name: string; line_total_cents: number }>).map((i) => [
          i.product_name,
          i.line_total_cents,
        ])
      );
      for (const line of lines as Array<{ product_name?: string; owed_cents: number }>) {
        expect(byName.get(line.product_name!)).toBe(line.owed_cents);
      }

      // The goods left at the handover; paying for them moves nothing.
      expect(await stockOf(bread)).toBe(breadBefore);
      expect(await stockOf(milk)).toBe(milkBefore);
      expect(await saleMovements(body.sale.id)).toHaveLength(0);

      expect(await entries(id)).toEqual([
        { kind: 'issue', amount_cents: 9810, sale_id: null },
        { kind: 'payment', amount_cents: -9810, sale_id: body.sale.id },
      ]);
      expect((await linesOf(id)).every((l) => l.sale_id === body.sale.id)).toBe(true);
    });

    it('pays the oldest lines first, whole, and refuses anything else (Д4)', async () => {
      const id = await customer();
      const [first] = await give(id, [{ variant_id: bread, quantity: 1 }]);
      const [second] = await give(id, [{ variant_id: milk, quantity: 1 }]);
      const [third] = await give(id, [{ variant_id: rose, quantity: 1 }]);

      const notOldest = await pay(id, { line_ids: [second.id], payments: cash(4500) });
      expect(notOldest.statusCode).toBe(409);
      expect(notOldest.json().code).toBe('not_oldest');
      expect((await pay(id, { line_ids: [first.id, third.id], payments: cash(9200) })).json().code).toBe(
        'not_oldest'
      );
      expect((await pay(id, { line_ids: [987654321], payments: cash(100) })).json().code).toBe('stale_statement');

      const paidFirst = await pay(id, { line_ids: [first.id], payments: cash(3200) });
      expect(paidFirst.statusCode).toBe(200);
      expect(paidFirst.json().sale.total_cents).toBe(3200);
      expect(paidFirst.json().credit.balance_cents).toBe(10500);
      expect(paidFirst.json().open_lines.map((l: { id: number }) => l.id)).toEqual([second.id, third.id]);

      // A screen another till made stale is a 409, not a receipt for the wrong goods.
      const stale = await pay(id, { line_ids: [first.id], payments: cash(3200) });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe('stale_statement');

      expect((await pay(id, { line_ids: [second.id], payments: cash(4500) })).statusCode).toBe(200);
      // Nothing the refusals touched was written.
      expect((await salesOf(id)).map((s) => s.status)).toEqual(['completed', 'completed']);
      expect(await balance(id)).toBe(6000);
    });

    it('pays a line half given back at what is still owed, its discount carried to the kopeck', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: bread, quantity: 3 }], {
        cart_discount: { type: 'fixed', value: 1 },
      });
      expect(line.line_total_cents).toBe(9599);
      const back = await post(`/api/pos/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: line.id, quantity: 1 }],
      });
      expect(back.statusCode).toBe(200);
      expect(await balance(id)).toBe(6399);

      const res = await pay(id, { payments: cash(6399) });
      expect(res.statusCode).toBe(200);
      const [item] = res.json().sale.items;
      expect(item).toMatchObject({
        quantity: 2,
        unit_price_cents: 3200,
        line_discount_cents: 1,
        line_total_cents: 6399,
      });
      expect(res.json().sale.total_cents).toBe(6399);
      expect(await balance(id)).toBe(0);
    });

    it('rounds the cash the till took, never the debt (НБУ № 25)', async () => {
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 1 }], { cart_discount: { type: 'fixed', value: 17 } });
      expect(await balance(id)).toBe(3183);

      const res = await pay(id, { payments: cash(3200), cash_rounding: 50 });
      expect(res.statusCode).toBe(200);
      expect(res.json().sale).toMatchObject({ total_cents: 3183, cash_rounding: 50, rounding_cents: 17 });
      // The journal says what the goods came to: the 17 kopecks are the till's.
      expect((await entries(id)).at(-1)).toMatchObject({ kind: 'payment', amount_cents: -3183 });
      expect(await balance(id)).toBe(0);
    });

    it('is idempotent on client_uuid: the same tap is the same receipt', async () => {
      const id = await customer();
      await give(id, [{ variant_id: milk, quantity: 2 }]);
      const uuid = randomUUID();
      const first = await pay(id, { client_uuid: uuid, payments: cash(9000) });
      const again = await pay(id, { client_uuid: uuid, payments: cash(9000) });
      expect(first.statusCode).toBe(200);
      expect(again.statusCode).toBe(200);
      expect(again.json().sale.id).toBe(first.json().sale.id);
      expect((await entries(id)).filter((e) => e.kind === 'payment')).toHaveLength(1);

      // A key spent on another customer's repayment does not make THIS debt look paid.
      const other = await customer();
      await give(other, [{ variant_id: milk, quantity: 1 }]);
      const taken = await pay(other, { client_uuid: uuid, payments: cash(4500) });
      expect(taken.statusCode).toBe(409);
      expect(taken.json().code).toBe('uuid_taken');
      expect(await balance(other)).toBe(4500);
    });

    it('lets only one of two tills take the money for the same goods', async () => {
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 2 }]);
      const [a, b] = await Promise.all([pay(id, { payments: cash(6400) }), pay(id, { payments: cash(6400) })]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
      expect((await salesOf(id)).filter((s) => s.status === 'completed')).toHaveLength(1);
      expect((await entries(id)).filter((e) => e.kind === 'payment')).toHaveLength(1);
      expect(await balance(id)).toBe(0);
    });

    it('refuses what it cannot ring: too little money, nothing owed, a stranger, no key', async () => {
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 1 }]);

      const short = await pay(id, { payments: cash(3000) });
      expect(short.statusCode).toBe(400);
      expect(await balance(id)).toBe(3200);
      expect(await salesOf(id)).toHaveLength(0);

      const nobody = await customer();
      const nothing = await pay(nobody, { payments: cash(100) });
      expect(nothing.statusCode).toBe(409);
      expect(nothing.json().code).toBe('nothing_owed');

      const stranger = await createTestStore('debtpay-other');
      try {
        const foreign = await app.inject({
          method: 'POST',
          url: `/api/pos/debts/customers/${id}/pay`,
          headers: auth(stranger.sellerToken),
          payload: { client_uuid: randomUUID(), payments: cash(3200) },
        });
        expect(foreign.statusCode).toBe(404);
      } finally {
        await dropTestStore(stranger.storeId);
      }

      expect(
        (await post(`/api/pos/debts/customers/${id}/pay`, { payments: cash(3200) })).statusCode
      ).toBe(400);
      expect((await pay(id, { payments: [] })).statusCode).toBe(400);
      expect((await pay(id, { line_ids: [], payments: cash(3200) })).statusCode).toBe(400);
      expect(await balance(id)).toBe(3200);
    });

    it('takes money for goods since taken off the catalogue', async () => {
      const id = await customer();
      const kefir = await seedProduct(store.storeId, { name: 'Кефір', priceCents: 3900, quantity: 50 });
      await give(id, [{ variant_id: kefir.variantId, quantity: 1 }]);
      await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [kefir.variantId]);
      await pool.query(`UPDATE pos_products SET is_active = FALSE WHERE id = $1`, [kefir.productId]);

      const res = await pay(id, { payments: cash(3900) });
      expect(res.statusCode).toBe(200);
      expect(await balance(id)).toBe(0);
    });

    it('a voided repayment receipt gives the goods back to the debt — and moves no stock', async () => {
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 2 }]);
      const paid = await pay(id, { payments: cash(6400) });
      const saleId = paid.json().sale.id;
      const before = await stockOf(bread);

      const voided = await post(`/api/pos/sales/${saleId}/void`, {});
      expect(voided.statusCode).toBe(200);
      expect(voided.json().status).toBe('voided');
      expect(await stockOf(bread)).toBe(before);
      expect(await saleMovements(saleId)).toHaveLength(0);
      expect((await linesOf(id)).every((l) => l.sale_id === null)).toBe(true);
      expect(await entries(id)).toEqual([
        { kind: 'issue', amount_cents: 6400, sale_id: null },
        { kind: 'payment', amount_cents: -6400, sale_id: saleId },
        { kind: 'payment_void', amount_cents: 6400, sale_id: saleId },
      ]);

      // Voiding again changes nothing; paying again works.
      expect((await post(`/api/pos/sales/${saleId}/void`, {})).statusCode).toBe(200);
      expect(await entries(id)).toHaveLength(3);
      expect((await pay(id, { payments: cash(6400) })).statusCode).toBe(200);
      expect(await balance(id)).toBe(0);
    });

    it('a refund of a repayment receipt puts the goods back on the shelf and leaves the debt alone', async () => {
      const id = await customer();
      const roses = await stockOf(rose);
      await give(id, [{ variant_id: bouquet, quantity: 1 }]);
      expect(await stockOf(rose)).toBe(roses - 3);

      const paid = await pay(id, { payments: cash(15000) });
      expect(paid.statusCode).toBe(200);
      const [item] = paid.json().sale.items;
      // The handover's snapshot travels with the receipt, so the refund knows what to give back.
      expect(item.components.map((c: { component_variant_id: number; quantity_per_unit: number }) => [
        c.component_variant_id,
        c.quantity_per_unit,
      ])).toEqual([[rose, 3]]);
      expect(await stockOf(rose)).toBe(roses - 3);

      const refund = await post(`/api/pos/sales/${paid.json().sale.id}/refunds`, {
        items: [{ sale_item_id: item.id, quantity: 1 }],
        reason: 'не підійшов',
        method: 'cash',
      });
      expect(refund.statusCode).toBe(200);
      expect(await stockOf(rose)).toBe(roses);
      expect(await stockOf(bouquet)).toBe(0);
      // Paid is paid: the money went back over the counter, not into the notebook.
      expect(await balance(id)).toBe(0);
      expect((await linesOf(id))[0].sale_id).toBe(paid.json().sale.id);
    });
  });

  // ── A table bill's receipt, voided ───────────────────────────────────────

  describe('voiding a table bill’s receipt', () => {
    let hall = 0;
    let tableSeq = 0;

    beforeAll(async () => {
      hall = Number(
        (await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`, [store.storeId]))
          .rows[0].id
      );
    });

    async function firedBill(items: Array<{ variant_id: number; quantity: number }>): Promise<number> {
      tableSeq += 1;
      const table = await pool.query(
        `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
        [store.storeId, hall, `Д${tableSeq}`]
      );
      const opened = await bills.openBill({
        storeId: store.storeId,
        staffId: store.sellerId,
        tableId: Number(table.rows[0].id),
      });
      for (const item of items) await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, item);
      await fireRound({ storeId: store.storeId, staffId: store.sellerId, billId: opened.bill.id });
      return opened.bill.id;
    }

    const billLines = async (billId: number) =>
      (
        await pool.query(`SELECT id, sale_id FROM pos_bill_items WHERE bill_id = $1 ORDER BY sort_order, id`, [
          billId,
        ])
      ).rows.map((r) => ({ id: Number(r.id), sale_id: r.sale_id == null ? null : Number(r.sale_id) }));

    it('gives the plates back to an open bill and keeps the stock the round took', async () => {
      const billId = await firedBill([
        { variant_id: milk, quantity: 1 },
        { variant_id: bread, quantity: 1 },
      ]);
      const [milkLine] = await billLines(billId);
      const afterRound = await stockOf(milk);

      const paid = await post(`/api/pos/bills/${billId}/pay`, {
        parts: [{ line_ids: [milkLine.id], payments: cash(4500) }],
      });
      expect(paid.statusCode).toBe(200);
      const saleId = paid.json().sale_ids[0];

      const voided = await post(`/api/pos/sales/${saleId}/void`, {});
      expect(voided.statusCode).toBe(200);
      expect(voided.json().status).toBe('voided');
      // Owed again on the bill…
      expect((await billLines(billId)).every((l) => l.sale_id === null)).toBe(true);
      // …and the dish is still cooked: nothing came back onto the shelf.
      expect(await stockOf(milk)).toBe(afterRound);
      expect(await saleMovements(saleId)).toHaveLength(0);
    });

    it('refuses to hand plates back to a bill that is already closed', async () => {
      const billId = await firedBill([{ variant_id: milk, quantity: 1 }]);
      const paid = await post(`/api/pos/bills/${billId}/pay`, { parts: [{ payments: cash(4500) }] });
      expect(paid.json().bill.status).toBe('paid');
      const saleId = paid.json().sale_ids[0];
      const afterRound = await stockOf(milk);

      const voided = await post(`/api/pos/sales/${saleId}/void`, {});
      expect(voided.statusCode).toBe(400);
      expect(voided.json().error).toBe('Рахунок столу вже закрито — цей чек можна лише повернути');
      expect((await billLines(billId))[0].sale_id).toBe(saleId);
      expect(await stockOf(milk)).toBe(afterRound);
    });
  });

  // ── A store that fiscalises ──────────────────────────────────────────────

  describe('a store that fiscalises', () => {
    let fake: FakeFiscalProvider;

    beforeEach(async () => {
      fake = new FakeFiscalProvider();
      registerProvider(fake);
      resetRuntime();
      resetRateLimiter();
      await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
      await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
      await updateFiscalSettings(store.storeId, {
        enabled: true,
        provider: 'checkbox',
        auto_open_shift: true,
        default_tax_code: 'A',
        receipt_source: 'local',
        receipt_width: 32,
        secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
      });
    });

    afterEach(() => {
      resetProviders();
      resetRuntime();
    });

    /** Prime the runtime so the next pre-flight makes no provider call (see pos.fiscal.checkout.test.ts). */
    const warm = () => fiscalService.preflight(store.storeId, store.sellerId);
    const ledgerRows = async () =>
      (await pool.query(`SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`, [store.storeId])).rows;

    it('registers the repayment receipt with ПРРО before the debt counts as paid', async () => {
      await warm();
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 2 }]);

      const res = await pay(id, { payments: cash(6400) });
      expect(res.statusCode).toBe(200);
      expect(res.json().warning).toBeNull();
      expect(res.json().fiscal.status).toBe('done');
      expect((await salesOf(id))[0].fiscal_status).toBe('done');
      const [row] = await ledgerRows();
      expect(row.status).toBe('done');
      expect(Number(row.total_cents)).toBe(6400);
      expect(await balance(id)).toBe(0);
    });

    it('writes nothing when ПРРО is unreachable — the goods stay owed', async () => {
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 1 }]);

      fake.queueError('unavailable');
      const res = await pay(id, { payments: cash(3200) });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ code: 'unavailable', error: 'Немає звʼязку з ПРРО — спробуйте ще раз' });
      expect(res.json().credit.balance_cents).toBe(3200);
      expect(res.json().open_lines).toHaveLength(1);
      expect(await salesOf(id)).toHaveLength(0);
      expect((await entries(id)).map((e) => e.kind)).toEqual(['issue']);
    });

    it('undoes the receipt when the provider refuses it — owed again, stock untouched', async () => {
      await warm();
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 2 }]);
      const afterHandover = await stockOf(bread);

      fake.queueError('rejected', 'bad tax code');
      const res = await pay(id, { payments: cash(6400) });
      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.error).toBe(
        'ПРРО відхилило чек — перевірте товари та ціни. Чек погашення скасовано, товари знову в борг.'
      );
      expect(body).toMatchObject({ code: 'rejected', sale_voided: true, sale_kept: false });
      expect(body.credit.balance_cents).toBe(6400);

      expect((await salesOf(id)).map((s) => s.status)).toEqual(['voided']);
      expect((await linesOf(id)).every((l) => l.sale_id === null)).toBe(true);
      expect((await entries(id)).map((e) => e.kind)).toEqual(['issue', 'payment', 'payment_void']);
      expect(await stockOf(bread)).toBe(afterHandover);
      const [row] = await ledgerRows();
      expect(row.status).toBe('abandoned');

      // The customer pays again, and it registers exactly once.
      const again = await pay(id, { payments: cash(6400) });
      expect(again.statusCode).toBe(200);
      expect(again.json().fiscal.status).toBe('done');
      expect(await balance(id)).toBe(0);
    });

    it('keeps the receipt when the outcome is ambiguous, says so, and lets the retry settle it', async () => {
      await warm();
      const id = await customer();
      await give(id, [{ variant_id: bread, quantity: 1 }]);

      fake.queueError('unavailable', 'gateway timeout');
      const res = await pay(id, { payments: cash(3200) });
      expect(res.statusCode).toBe(200);
      expect(res.json().warning).toContain('Не пробивайте його вдруге');
      expect(res.json().fiscal).toBeNull();
      const [sale] = await salesOf(id);
      expect(sale).toMatchObject({ status: 'completed', fiscal_status: 'failed' });
      // The money is taken; the debt is paid whatever ПРРО says later.
      expect(await balance(id)).toBe(0);

      await pool.query(
        `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE store_id = $1`,
        [store.storeId]
      );
      resetRateLimiter();
      const retried = await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });
      expect(retried.done).toBe(1);
      expect((await salesOf(id))[0].fiscal_status).toBe('done');
    });

    it('refuses a replay whose receipt was undone', async () => {
      await warm();
      const id = await customer();
      await give(id, [{ variant_id: milk, quantity: 1 }]);
      const uuid = randomUUID();

      fake.queueError('rejected');
      expect((await pay(id, { client_uuid: uuid, payments: cash(4500) })).statusCode).toBe(502);
      const replay = await pay(id, { client_uuid: uuid, payments: cash(4500) });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().code).toBe('sale_voided');
      expect(await balance(id)).toBe(4500);
    });
  });
});
