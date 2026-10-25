// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.debts-partial.test.ts — paying a «під запис» debt in
// parts (migration 078, decision Д4 revised 2026-10-25, TechDocs/grocery/
// G3_DEBTS.md §11).
//
// The customer hands over any sum. Whole lines from the oldest go on an
// ordinary receipt, as before; then some units of the next line, when it is
// counted in pieces — an ordinary receipt too, so a store with ПРРО has it;
// and the rest is a «внесок» toward that line: money without a receipt, for
// now only where nothing is fiscalised. Every test checks the debt's one
// invariant — the journal and the open lines owe the same — after it moves.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { readMigration } from '../pos/migrations.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import { refundSale } from '../pos/sales.service.js';
import { clothingVertical } from '../pos/verticals/clothing.js';
import { registerVertical, resetVerticals } from '../pos/verticals/index.js';
import type { VerticalDefinition } from '../pos/verticals/types.js';
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

/** Clothing, but selling by weight too — a stand-in for groceries, as in pos.weighed.test.ts. */
const WEIGHING: VerticalDefinition = {
  ...clothingVertical,
  units: ['шт', 'г', 'мл'],
  weighedUnits: ['г', 'мл'],
  productKinds: ['simple', 'composite'],
};

interface Line {
  id: number;
  quantity: number;
  returned_quantity: number;
  paid_quantity: number;
  prepaid_cents: number;
  remaining_quantity: number;
  owed_cents: number;
  line_total_cents: number;
  status: string;
}

describe.skipIf(!hasDb)('POS «під запис» — paying in parts', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let bread = 0;
  let milk = 0;
  let cap = 0;
  let cheese = 0;
  let customerSeq = 0;
  let previousKey: string | undefined;

  const post = (url: string, body: Record<string, unknown>, token = store.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos${url}`, headers: auth(token), payload: body });
  const get = (url: string, token = store.sellerToken) =>
    app.inject({ method: 'GET', url: `/api/pos${url}`, headers: auth(token) });

  async function product(body: Record<string, unknown>): Promise<number> {
    const res = await post('/products', body, store.ownerToken);
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { variants: Array<{ id: number }> }).variants[0].id;
  }

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    registerVertical(WEIGHING);
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('debtpart');
    bread = await product({ name: 'Хліб', variants: [{ attributes: {}, unit: 'шт', price_cents: 4500, quantity: 500 }] });
    milk = await product({ name: 'Молоко', variants: [{ attributes: {}, unit: 'шт', price_cents: 3200, quantity: 500 }] });
    cap = await product({ name: 'Кепка', variants: [{ attributes: {}, unit: 'шт', price_cents: 59000, quantity: 50 }] });
    cheese = await product({ name: 'Сир', variants: [{ attributes: {}, unit: 'г', price_cents: 18990, quantity: 9000 }] });
  }, 120000);

  afterAll(async () => {
    resetVerticals();
    resetProviders();
    await app?.close();
    await dropTestStore(store?.storeId);
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  async function customer(): Promise<number> {
    customerSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, $2, $3, 1000000) RETURNING id`,
      [store.storeId, `Боржник ${customerSeq}`, `+38067100${String(customerSeq).padStart(4, '0')}`]
    );
    return Number(row.rows[0].id);
  }

  async function give(
    customerId: number,
    items: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {}
  ): Promise<Line[]> {
    const res = await post('/debts/issue', { customer_id: customerId, client_uuid: randomUUID(), items, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().lines;
  }

  const pay = (customerId: number, body: Record<string, unknown>, clientUuid = randomUUID()) =>
    post(`/debts/customers/${customerId}/pay`, { client_uuid: clientUuid, ...body });
  const cash = (amount: number) => [{ method: 'cash' as const, amount_cents: amount }];

  const statement = async (customerId: number) => {
    const res = await get(`/debts/customers/${customerId}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as {
      credit: { balance_cents: number };
      open_lines: Line[];
      entries: Array<{ kind: string; amount_cents: number; sale_id: number | null; prepayment: boolean }>;
    };
  };

  /** The one invariant: the journal and the open lines owe the same — and return it. */
  async function owed(customerId: number): Promise<number> {
    const s = await statement(customerId);
    const journal = Number(
      (
        await pool.query(
          `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM pos_debt_entries WHERE store_id = $1 AND customer_id = $2`,
          [store.storeId, customerId]
        )
      ).rows[0].s
    );
    const lines = s.open_lines.reduce((sum, l) => sum + l.owed_cents, 0);
    expect(journal).toBe(lines);
    expect(s.credit.balance_cents).toBe(lines);
    return lines;
  }

  const lineRow = async (lineId: number) =>
    (
      await pool.query(
        `SELECT quantity, returned_quantity, paid_quantity, prepaid_cents, sale_id FROM pos_debt_items WHERE id = $1`,
        [lineId]
      )
    ).rows[0] as { quantity: number; returned_quantity: number; paid_quantity: number; prepaid_cents: number; sale_id: string | null };

  const salesCount = async (customerId: number) =>
    Number(
      (await pool.query(`SELECT COUNT(*) AS n FROM pos_sales WHERE store_id = $1 AND customer_id = $2`, [
        store.storeId,
        customerId,
      ])).rows[0].n
    );

  // ── A store without ПРРО ─────────────────────────────────────────────────

  describe('a store without ПРРО', () => {
    beforeAll(async () => {
      await pool.query(`DELETE FROM pos_fiscal_settings WHERE store_id = $1`, [store.storeId]);
    });

    it('pays some of a line’s units on an ordinary receipt and keeps the rest owed', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: bread, quantity: 5 }]);
      expect(await owed(id)).toBe(22500);

      const part = await pay(id, { part: { line_id: line.id, quantity: 2 }, payments: cash(9000) });
      expect(part.statusCode, part.body).toBe(200);
      const body = part.json();
      expect(body.prepayment).toBeNull();
      expect(body.sale).toMatchObject({ total_cents: 9000, repays_debt: true, debt_prepayment: null });
      expect(body.sale.items).toHaveLength(1);
      expect(body.sale.items[0]).toMatchObject({ quantity: 2, line_total_cents: 9000, debt_prepaid_cents: 0 });
      expect(body.open_lines).toHaveLength(1);
      expect(body.open_lines[0]).toMatchObject({ paid_quantity: 2, remaining_quantity: 3, owed_cents: 13500 });
      expect(await owed(id)).toBe(13500);
      expect((await lineRow(line.id)).sale_id).toBeNull();

      // Paying the rest as a «part» is paying the line whole — said in words.
      const all = await pay(id, { part: { line_id: line.id, quantity: 3 }, payments: cash(13500) });
      expect(all.statusCode).toBe(409);
      expect(all.json().code).toBe('too_many');

      const rest = await pay(id, { line_ids: [line.id], payments: cash(13500) });
      expect(rest.statusCode, rest.body).toBe(200);
      expect(rest.json().sale.items[0]).toMatchObject({ quantity: 3, line_total_cents: 13500 });
      expect(rest.json().open_lines).toEqual([]);
      const closed = await lineRow(line.id);
      expect(Number(closed.paid_quantity)).toBe(5);
      expect(Number(closed.sale_id)).toBe(rest.json().sale.id);
      expect(await owed(id)).toBe(0);
    });

    it('shares a discounted line’s total by the cumulative rule, to the kopeck', async () => {
      const id = await customer();
      // 3 × 32,00 = 96,00, less 7 % = 89,28: thirds of it do not divide evenly.
      const [line] = await give(id, [{ variant_id: milk, quantity: 3 }], { cart_discount: { type: 'percent', value: 7 } });
      expect(line.line_total_cents).toBe(8928);

      const a = await pay(id, { part: { line_id: line.id, quantity: 1 }, payments: cash(5000) });
      const b = await pay(id, { part: { line_id: line.id, quantity: 1 }, payments: cash(5000) });
      const c = await pay(id, { line_ids: [line.id], payments: cash(5000) });
      const slices = [a, b, c].map((res) => {
        expect(res.statusCode, res.body).toBe(200);
        return Number(res.json().sale.total_cents);
      });
      expect(slices.reduce((x, y) => x + y, 0)).toBe(8928);
      for (const slice of slices) expect(slice).toBeLessThanOrEqual(3200);
      expect(await owed(id)).toBe(0);
    });

    it('takes a «внесок» toward the oldest line without a receipt, and closes the line later', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);

      const first = await pay(id, { part: { line_id: line.id, amount_cents: 30000, method: 'cash' }, payments: [] });
      expect(first.statusCode, first.body).toBe(200);
      const prepayment = first.json().prepayment;
      expect(first.json().sale.id).toBe(prepayment.id);
      expect(prepayment).toMatchObject({
        total_cents: 30000,
        items: [],
        repays_debt: true,
        fiscal_status: 'none',
        debt_prepayment: { line_id: line.id, product_name: 'Кепка', amount_cents: 30000 },
      });
      expect(prepayment.payments).toMatchObject([{ method: 'cash', amount_cents: 30000 }]);
      expect(first.json().open_lines[0]).toMatchObject({ prepaid_cents: 30000, owed_cents: 29000, remaining_quantity: 1 });
      expect(await owed(id)).toBe(29000);
      const s = await statement(id);
      expect(s.entries[0]).toMatchObject({ kind: 'payment', amount_cents: -30000, sale_id: prepayment.id, prepayment: true });

      const second = await pay(id, { part: { line_id: line.id, amount_cents: 10000, method: 'card' }, payments: [] });
      expect(second.statusCode, second.body).toBe(200);
      expect(await owed(id)).toBe(19000);

      const close = await pay(id, { line_ids: [line.id], payments: cash(19000) });
      expect(close.statusCode, close.body).toBe(200);
      const receipt = close.json().sale;
      expect(receipt.total_cents).toBe(19000);
      expect(receipt.items[0]).toMatchObject({
        quantity: 1,
        unit_price_cents: 59000,
        line_total_cents: 19000,
        debt_prepaid_cents: 40000,
      });
      expect(close.json().open_lines).toEqual([]);
      expect(await owed(id)).toBe(0);

      // Paid in three payments: a refund of the last would hand back a third of it.
      await expect(
        refundSale({
          storeId: store.storeId,
          saleId: receipt.id,
          staffId: store.sellerId,
          items: [{ sale_item_id: receipt.items[0].id, quantity: 1 }],
          method: 'cash',
          reason_code: 'other',
        })
      ).rejects.toThrow(/оплачено частинами/);
      await expect(
        refundSale({
          storeId: store.storeId,
          saleId: prepayment.id,
          staffId: store.sellerId,
          items: [{ sale_item_id: 1, quantity: 1 }],
          method: 'cash',
          reason_code: 'other',
        })
      ).rejects.toThrow(/скасовують/);
    });

    it('takes whole lines, units of the next and a «внесок» in one request — and a repeated tap writes nothing twice', async () => {
      const id = await customer();
      const [breadLine] = await give(id, [{ variant_id: bread, quantity: 1 }]);
      const [milkLine] = await give(id, [{ variant_id: milk, quantity: 5 }]);
      await give(id, [{ variant_id: cap, quantity: 1 }]);
      const before = await owed(id);

      const key = randomUUID();
      const body = {
        line_ids: [breadLine.id],
        part: { line_id: milkLine.id, quantity: 3, amount_cents: 5000, method: 'cash' },
        payments: cash(14100),
      };
      const res = await pay(id, body, key);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().sale).toMatchObject({ total_cents: 4500 + 9600, debt_prepayment: null });
      expect(res.json().sale.items.map((i: { quantity: number }) => i.quantity)).toEqual([1, 3]);
      expect(res.json().prepayment).toMatchObject({ total_cents: 5000, debt_prepayment: { line_id: milkLine.id } });
      expect(await owed(id)).toBe(before - 14100 - 5000);
      expect(await salesCount(id)).toBe(2);

      const again = await pay(id, body, key);
      expect(again.statusCode, again.body).toBe(200);
      expect(again.json().sale.id).toBe(res.json().sale.id);
      expect(again.json().prepayment.id).toBe(res.json().prepayment.id);
      expect(await salesCount(id)).toBe(2);
      expect(await owed(id)).toBe(before - 19100);
    });

    it('refuses what §11 does not allow, writing nothing', async () => {
      const id = await customer();
      const [first] = await give(id, [{ variant_id: bread, quantity: 3 }]);
      const [second] = await give(id, [{ variant_id: cap, quantity: 1 }]);
      const [weighed] = await give(id, [{ variant_id: cheese, quantity: 700, weight_source: 'manual' }]);
      const before = await owed(id);

      const notNext = await pay(id, { part: { line_id: second.id, quantity: 1 }, payments: cash(59000) });
      expect(notNext.statusCode).toBe(409);
      expect(notNext.json().code).toBe('not_oldest');

      const grams = await pay(id, {
        line_ids: [first.id, second.id],
        part: { line_id: weighed.id, quantity: 300 },
        payments: cash(200000),
      });
      expect(grams.statusCode).toBe(409);
      expect(grams.json().code).toBe('weighed_whole_line');

      const tooMuch = await pay(id, { part: { line_id: first.id, amount_cents: 13500, method: 'cash' }, payments: [] });
      expect(tooMuch.statusCode).toBe(409);
      expect(tooMuch.json().code).toBe('prepay_covers_line');

      const coins = await pay(id, {
        part: { line_id: first.id, amount_cents: 1025, method: 'cash' },
        payments: [],
        cash_rounding: 50,
      });
      expect(coins.statusCode).toBe(400);
      expect(coins.json().error).toMatch(/кратну 50/);

      const both = await pay(id, { part: { line_id: first.id, amount_cents: 1000 }, payments: cash(1000) });
      expect(both.statusCode).toBe(400);
      const nothing = await pay(id, { part: { line_id: first.id }, payments: [] });
      expect(nothing.statusCode).toBe(400);

      // A «внесок» first, then units of the same line: refused, it closes whole.
      expect((await pay(id, { part: { line_id: first.id, amount_cents: 1000, method: 'cash' }, payments: [] })).statusCode).toBe(200);
      const after = await pay(id, { part: { line_id: first.id, quantity: 1 }, payments: cash(4500) });
      expect(after.statusCode).toBe(409);
      expect(after.json().code).toBe('has_prepayment');
      expect(await owed(id)).toBe(before - 1000);
    });

    it('voids a «внесок» and a receipt of some units, each giving back exactly what it took', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: bread, quantity: 4 }]);
      const units = await pay(id, { part: { line_id: line.id, quantity: 1 }, payments: cash(4500) });
      const money = await pay(id, { part: { line_id: line.id, amount_cents: 2000, method: 'cash' }, payments: [] });
      expect(await owed(id)).toBe(18000 - 4500 - 2000);

      const voidMoney = await post(`/sales/${money.json().prepayment.id}/void`, {}, store.ownerToken);
      expect(voidMoney.statusCode, voidMoney.body).toBe(200);
      expect(Number((await lineRow(line.id)).prepaid_cents)).toBe(0);
      expect(await owed(id)).toBe(13500);

      const voidUnits = await post(`/sales/${units.json().sale.id}/void`, {}, store.ownerToken);
      expect(voidUnits.statusCode, voidUnits.body).toBe(200);
      expect(Number((await lineRow(line.id)).paid_quantity)).toBe(0);
      expect(await owed(id)).toBe(18000);
      const kinds = (await statement(id)).entries.map((e) => e.kind);
      expect(kinds.filter((k) => k === 'payment_void')).toHaveLength(2);
    });

    it('returns the unpaid units of a part-paid line, and refuses a line with a «внесок»', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: milk, quantity: 3 }], { cart_discount: { type: 'percent', value: 7 } });
      const paid = await pay(id, { part: { line_id: line.id, quantity: 1 }, payments: cash(5000) });
      const slice = Number(paid.json().sale.total_cents);

      const back = await post(`/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: line.id, quantity: 2 }],
      });
      expect(back.statusCode, back.body).toBe(200);
      expect(back.json().entry.amount_cents).toBe(-(8928 - slice));
      expect(await owed(id)).toBe(0);
      expect(back.json().lines[0]).toMatchObject({ status: 'paid', remaining_quantity: 0 });

      const id2 = await customer();
      const [capLine] = await give(id2, [{ variant_id: cap, quantity: 1 }]);
      await pay(id2, { part: { line_id: capLine.id, amount_cents: 30000, method: 'cash' }, payments: [] });
      const refused = await post(`/debts/customers/${id2}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: capLine.id, quantity: 1 }],
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().code).toBe('has_prepayment');
      expect(await owed(id2)).toBe(29000);
    });

    it('writes off what is left owed after the «внески»', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
      await pay(id, { part: { line_id: line.id, amount_cents: 30000, method: 'cash' }, payments: [] });
      const res = await post(
        `/debts/customers/${id}/writeoff`,
        { client_uuid: randomUUID(), reason: 'Поїхав назовсім' },
        store.ownerToken
      );
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().entry.amount_cents).toBe(-29000);
      expect(await owed(id)).toBe(0);
    });

    it('counts a «внесок» in the day’s takings, and not among the goods', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
      const before = (await get('/analytics/summary', store.ownerToken)).json();
      await pay(id, { part: { line_id: line.id, amount_cents: 30000, method: 'cash' }, payments: [] });
      const after = (await get('/analytics/summary', store.ownerToken)).json();
      expect(after.gross_cents - before.gross_cents).toBe(30000);
      expect(after.sales_count - before.sales_count).toBe(1);
      const caps = (after.top_items as Array<{ product_name: string }>).filter((t) => t.product_name === 'Кепка');
      const capsBefore = (before.top_items as Array<{ product_name: string }>).filter((t) => t.product_name === 'Кепка');
      expect(caps).toEqual(capsBefore);
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

    it('pays some units of a line on a registered fiscal receipt', async () => {
      await fiscalService.preflight(store.storeId, store.sellerId);
      const id = await customer();
      const [line] = await give(id, [{ variant_id: bread, quantity: 5 }]);
      const res = await pay(id, { part: { line_id: line.id, quantity: 2 }, payments: cash(9000) });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().fiscal.status).toBe('done');
      expect(res.json().sale).toMatchObject({ total_cents: 9000, fiscal_status: 'done' });
      expect(await owed(id)).toBe(13500);
    });

    it('refuses a «внесок» before anything is written — there is no fiscal document for it yet', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
      const res = await pay(id, { part: { line_id: line.id, amount_cents: 30000, method: 'cash' }, payments: [] });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('prepay_needs_chain');
      expect(res.json().error).toMatch(/поверніть покупцеві/);
      expect(await salesCount(id)).toBe(0);
      expect(await owed(id)).toBe(59000);
    });
  });

  // ── Migration 078 ────────────────────────────────────────────────────────

  describe('migration 078', () => {
    it('counts the units of a line paid before it, so a later void gives back exactly those', async () => {
      await pool.query(`DELETE FROM pos_fiscal_settings WHERE store_id = $1`, [store.storeId]);
      const id = await customer();
      const [line] = await give(id, [{ variant_id: bread, quantity: 2 }]);
      const paid = await pay(id, { line_ids: [line.id], payments: cash(9000) });
      expect(paid.statusCode, paid.body).toBe(200);
      // As a line paid by a build before 078 left it.
      await pool.query(`UPDATE pos_debt_items SET paid_quantity = 0 WHERE id = $1`, [line.id]);

      await pool.query(readMigration('078_pos_debt_partial.sql'));
      expect(Number((await lineRow(line.id)).paid_quantity)).toBe(2);
      // And again: nothing left to backfill.
      await pool.query(readMigration('078_pos_debt_partial.sql'));
      expect(Number((await lineRow(line.id)).paid_quantity)).toBe(2);

      const voided = await post(`/sales/${paid.json().sale.id}/void`, {}, store.ownerToken);
      expect(voided.statusCode, voided.body).toBe(200);
      expect(await owed(id)).toBe(9000);
      expect((await statement(id)).open_lines[0]).toMatchObject({ remaining_quantity: 2, paid_quantity: 0 });
    });
  });
});
