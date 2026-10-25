// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.weighed.test.ts — weighed goods (migration 075,
// TechDocs/grocery/G4_WEIGHED.md): 0,350 кг of cheese at 189,90 ₴/кг is
// quantity 350 in unit 'г' at a price per kilogram, and comes to 66,47 on the
// receipt, in the fiscal payload, in the refund and «під запис».
//
// No vertical sells by weight in this build yet — groceries arrive with
// phase Г4 PR4 — so the suite swaps the clothing definition for one that
// weighs grams and millilitres, the way the vertical tests do.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import * as bills from '../pos/bills.service.js';
import { patchStoreModules } from '../pos/super.service.js';
import { clothingVertical, registerVertical, resetVerticals } from '../pos/verticals/index.js';
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

/** Clothing, but selling by weight in grams and millilitres — a stand-in for groceries. */
const WEIGHING: VerticalDefinition = {
  ...clothingVertical,
  units: ['шт', 'г', 'мл'],
  weighedUnits: ['г', 'мл'],
  productKinds: ['simple', 'composite'],
};

describe.skipIf(!hasDb)('POS weighed goods', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let cheese = 0;
  let bread = 0;
  let customerSeq = 0;

  const post = (url: string, body: Record<string, unknown>, token = store.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos${url}`, headers: auth(token), payload: body });
  const get = (url: string, token = store.sellerToken) =>
    app.inject({ method: 'GET', url: `/api/pos${url}`, headers: auth(token) });

  async function product(body: Record<string, unknown>) {
    const res = await post('/products', body, store.ownerToken);
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as { id: number; variants: Array<{ id: number; price_per: number; unit: string }> };
  }

  const stockOf = async (variantId: number): Promise<number> =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);

  const sell = (items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
    post('/sales/complete', {
      items,
      payments: [{ method: 'cash', amount_cents: 100000 }],
      client_uuid: randomUUID(),
      ...extra,
    });

  const weighing = (variantId: number, grams: number) => ({
    variant_id: variantId,
    quantity: grams,
    weight_source: 'manual',
  });

  beforeAll(async () => {
    registerVertical(WEIGHING);
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('weighed');
    cheese = (
      await product({
        name: 'Сир твердий',
        variants: [{ attributes: {}, unit: 'г', price_cents: 18990, quantity: 5000 }],
      })
    ).variants[0].id;
    bread = (
      await product({
        name: 'Хліб',
        variants: [{ attributes: {}, unit: 'шт', price_cents: 4590, quantity: 100 }],
      })
    ).variants[0].id;
  }, 120000);

  afterAll(async () => {
    resetVerticals();
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  describe('the variant', () => {
    it('is priced per kilogram in a unit the vertical weighs, per piece otherwise', async () => {
      const rows = await pool.query(
        `SELECT id, price_per FROM pos_variants WHERE id = ANY($1::bigint[]) ORDER BY id`,
        [[cheese, bread]]
      );
      expect(rows.rows.map((r) => Number(r.price_per))).toEqual([1000, 1]);
    });

    it('rides to the till with its basis', async () => {
      const res = await get('/catalog?q=Сир');
      const row = (res.json() as Array<{ variant_id: number; price_per: number }>).find((r) => r.variant_id === cheese);
      expect(row?.price_per).toBe(1000);
    });

    it('turns per-piece the moment its unit does, and back', async () => {
      const made = await product({
        name: 'Олія',
        variants: [{ attributes: {}, unit: 'мл', price_cents: 9900, quantity: 0 }],
      });
      const id = made.variants[0].id;
      expect(made.variants[0].price_per).toBe(1000);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/variants/${id}`,
        headers: auth(store.ownerToken),
        payload: { unit: 'шт' },
      });
      expect(res.statusCode, res.body).toBe(200);
      const row = await pool.query(`SELECT price_per, unit FROM pos_variants WHERE id = $1`, [id]);
      expect(row.rows[0]).toMatchObject({ price_per: 1, unit: 'шт' });
    });

    it('is a simple product: a composite is never weighed, nor a part of one', async () => {
      const composite = await post(
        '/products',
        {
          name: 'Кошик на вагу',
          kind: 'composite',
          stock_mode: 'own',
          variants: [{ attributes: {}, unit: 'г', price_cents: 50000, quantity: 0 }],
        },
        store.ownerToken
      );
      expect(composite.statusCode).toBe(400);
      expect(composite.json().error).toMatch(/не продається на вагу/);

      const basket = await post(
        '/products',
        {
          name: 'Кошик',
          kind: 'composite',
          stock_mode: 'derived',
          variants: [
            {
              attributes: {},
              unit: 'шт',
              price_cents: 50000,
              components: [{ component_variant_id: cheese, quantity: 200 }],
            },
          ],
        },
        store.ownerToken
      );
      expect(basket.statusCode).toBe(400);
      expect(basket.json().error).toMatch(/не може бути складником/);
    });
  });

  describe('a sale', () => {
    it('prices 0,350 кг at 189,90 as 66,47 and takes 350 g off the shelf', async () => {
      const before = await stockOf(cheese);
      const res = await sell([weighing(cheese, 350)]);
      expect(res.statusCode, res.body).toBe(201);
      const sale = res.json() as {
        total_cents: number;
        items: Array<{ quantity: number; unit: string; unit_price_cents: number; line_total_cents: number; price_per: number; weight_source: string | null }>;
      };
      expect(sale.total_cents).toBe(6647);
      expect(sale.items[0]).toMatchObject({
        quantity: 350,
        unit: 'г',
        unit_price_cents: 18990,
        line_total_cents: 6647,
        price_per: 1000,
        weight_source: 'manual',
      });
      expect(await stockOf(cheese)).toBe(before - 350);
    });

    it('keeps every weighing its own line, and still merges two loaves into one', async () => {
      const res = await sell([
        weighing(cheese, 350),
        { variant_id: bread, quantity: 1 },
        weighing(cheese, 200),
        { variant_id: bread, quantity: 1 },
      ]);
      expect(res.statusCode, res.body).toBe(201);
      const items = (res.json() as { items: Array<{ variant_id: number; quantity: number; line_total_cents: number }> }).items;
      expect(items.map((i) => [i.variant_id, i.quantity])).toEqual([
        [cheese, 350],
        [bread, 2],
        [cheese, 200],
      ]);
      // R(350) + R(200) = 6647 + 3798; one line of 550 g would be 10 444,5 → 10 445.
      expect(items.filter((i) => i.variant_id === cheese).map((i) => i.line_total_cents)).toEqual([6647, 3798]);
    });

    it('shares a cart discount across a weighed line and a piece, to the kopeck', async () => {
      const res = await sell([weighing(cheese, 350), { variant_id: bread, quantity: 2 }], {
        cart_discount: { type: 'fixed', value: 1000 },
      });
      expect(res.statusCode, res.body).toBe(201);
      const sale = res.json() as { total_cents: number; items: Array<{ line_total_cents: number; line_discount_cents: number }> };
      expect(sale.items.reduce((s, i) => s + i.line_discount_cents, 0)).toBe(1000);
      expect(sale.total_cents).toBe(6647 + 9180 - 1000);
      expect(sale.items.reduce((s, i) => s + i.line_total_cents, 0)).toBe(sale.total_cents);
    });

    it('sells past the shelf: a weighing is never short of grams', async () => {
      const res = await sell([weighing(cheese, 999_999)], {
        payments: [{ method: 'cash', amount_cents: 20_000_000 }],
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(await stockOf(cheese)).toBeLessThan(0);
    });

    it('refuses a weighed line from a till that does not know weighed goods', async () => {
      const res = await sell([{ variant_id: cheese, quantity: 350 }]);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/оновіть застосунок/);
    });

    it('refuses a fraction, a weight past 999,999, a weighing worth nothing and a scale it cannot trust', async () => {
      expect((await sell([{ ...weighing(cheese, 350), quantity: 0.35 }])).json().error).toBe('Invalid cart item');
      expect((await sell([weighing(cheese, 1_000_000)])).json().error).toMatch(/999,999/);
      const crumbs = await product({
        name: 'Сіль',
        variants: [{ attributes: {}, unit: 'г', price_cents: 400, quantity: 1000 }],
      });
      expect((await sell([weighing(crumbs.variants[0].id, 1)])).json().error).toMatch(/0,00/);
      expect((await sell([{ ...weighing(cheese, 350), weight_source: 'scale' }])).json().error).toMatch(
        /поки не підтримується/
      );
    });

    it('ignores a weight source on a piece', async () => {
      const res = await sell([{ variant_id: bread, quantity: 1, weight_source: 'manual' }]);
      expect(res.statusCode, res.body).toBe(201);
      expect((res.json() as { items: Array<{ weight_source: string | null; price_per: number }> }).items[0]).toMatchObject({
        weight_source: null,
        price_per: 1,
      });
    });
  });

  describe('a refund', () => {
    async function soldCheese(grams = 350) {
      const res = await sell([weighing(cheese, grams), { variant_id: bread, quantity: 2 }]);
      expect(res.statusCode, res.body).toBe(201);
      return res.json() as { id: number; items: Array<{ id: number; variant_id: number }> };
    }
    const refund = (saleId: number, items: Array<{ sale_item_id: number; quantity: number }>) =>
      post(`/sales/${saleId}/refunds`, { items, method: 'cash', client_uuid: randomUUID() });

    it('takes a weighed line back only whole', async () => {
      const sale = await soldCheese();
      const line = sale.items.find((i) => i.variant_id === cheese)!;
      const part = await refund(sale.id, [{ sale_item_id: line.id, quantity: 150 }]);
      expect(part.statusCode).toBe(400);
      expect(part.json().error).toMatch(/лише цілим рядком — 0,350 кг/);

      // The shelf is below zero by now (the 999,999 g sale above): a return
      // brings it back up and is never refused for that.
      const before = await stockOf(cheese);
      expect(before).toBeLessThan(0);
      const whole = await refund(sale.id, [{ sale_item_id: line.id, quantity: 350 }]);
      expect(whole.statusCode, whole.body).toBeLessThan(300);
      const row = await pool.query(
        `SELECT total_cents FROM pos_refunds WHERE sale_id = $1 ORDER BY id DESC LIMIT 1`,
        [sale.id]
      );
      expect(Number(row.rows[0].total_cents)).toBe(6647);
      expect(await stockOf(cheese)).toBe(before + 350);
    });

    it('still takes pieces back one by one beside it', async () => {
      const sale = await soldCheese();
      const loaves = sale.items.find((i) => i.variant_id === bread)!;
      const res = await refund(sale.id, [{ sale_item_id: loaves.id, quantity: 1 }]);
      expect(res.statusCode, res.body).toBeLessThan(300);
    });
  });

  describe('«під запис»', () => {
    async function customer(): Promise<number> {
      customerSeq += 1;
      const row = await pool.query(
        `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
         VALUES ($1, $2, $3, 1000000) RETURNING id`,
        [store.storeId, `Сусідка ${customerSeq}`, `+38067100${String(customerSeq).padStart(4, '0')}`]
      );
      return Number(row.rows[0].id);
    }

    it('writes every weighing as its own line at the kilogram price, marked by hand', async () => {
      const id = await customer();
      const res = await post('/debts/issue', {
        customer_id: id,
        client_uuid: randomUUID(),
        items: [weighing(cheese, 350), weighing(cheese, 200), { variant_id: bread, quantity: 1 }],
      });
      expect(res.statusCode, res.body).toBe(201);
      const lines = (res.json() as { lines: Array<{ quantity: number; line_total_cents: number; price_per: number; weight_source: string | null }> }).lines;
      expect(lines.map((l) => [l.quantity, l.line_total_cents, l.price_per, l.weight_source])).toEqual([
        [350, 6647, 1000, 'manual'],
        [200, 3798, 1000, 'manual'],
        [1, 4590, 1, null],
      ]);
    });

    it('refuses a weighed handover from a till that does not know weighed goods', async () => {
      const res = await post('/debts/issue', {
        customer_id: await customer(),
        client_uuid: randomUUID(),
        items: [{ variant_id: cheese, quantity: 350 }],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/оновіть застосунок/);
    });

    it('takes a weighed line back only whole, and pays it with the mark on the receipt', async () => {
      const id = await customer();
      const issued = await post('/debts/issue', {
        customer_id: id,
        client_uuid: randomUUID(),
        items: [weighing(cheese, 350), weighing(cheese, 500)],
      });
      expect(issued.statusCode, issued.body).toBe(201);
      const [first, second] = (issued.json() as { lines: Array<{ id: number }> }).lines;

      const part = await post(`/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: second.id, quantity: 100 }],
      });
      expect(part.statusCode).toBe(409);
      expect(part.json().error).toMatch(/лише цілим рядком — 0,500 кг/);

      const paid = await post(`/debts/customers/${id}/pay`, {
        client_uuid: randomUUID(),
        line_ids: [first.id],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      });
      expect(paid.statusCode, paid.body).toBe(200);
      const sale = (paid.json() as { sale: { total_cents: number; items: Array<Record<string, unknown>> } }).sale;
      expect(sale.total_cents).toBe(6647);
      expect(sale.items[0]).toMatchObject({
        quantity: 350,
        unit_price_cents: 18990,
        line_total_cents: 6647,
        line_discount_cents: 0,
        price_per: 1000,
        weight_source: 'manual',
      });
    });
  });

  describe('«під запис», after the owner changes the card', () => {
    it('repays a gram line as a gram line even when the card is in pieces now', async () => {
      const sausage = (
        await product({
          name: 'Ковбаса',
          variants: [{ attributes: {}, unit: 'г', price_cents: 32000, quantity: 3000 }],
        })
      ).variants[0].id;
      customerSeq += 1;
      const id = Number(
        (
          await pool.query(
            `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
             VALUES ($1, 'Сусід', $2, 1000000) RETURNING id`,
            [store.storeId, `+38067200${String(customerSeq).padStart(4, '0')}`]
          )
        ).rows[0].id
      );
      const issued = await post('/debts/issue', {
        customer_id: id,
        client_uuid: randomUUID(),
        items: [weighing(sausage, 400)],
      });
      expect(issued.statusCode, issued.body).toBe(201);
      const line = (issued.json() as { lines: Array<{ id: number }> }).lines[0];

      const edit = await app.inject({
        method: 'PATCH',
        url: `/api/pos/variants/${sausage}`,
        headers: auth(store.ownerToken),
        payload: { unit: 'шт' },
      });
      expect(edit.statusCode, edit.body).toBe(200);

      const paid = await post(`/debts/customers/${id}/pay`, {
        client_uuid: randomUUID(),
        line_ids: [line.id],
        payments: [{ method: 'cash', amount_cents: 20000 }],
      });
      expect(paid.statusCode, paid.body).toBe(200);
      const sale = (paid.json() as { sale: { total_cents: number; items: Array<Record<string, unknown>> } }).sale;
      // 0,400 кг × 320,00 = 128,00 — locked when the sausage left, per kilogram.
      expect(sale.total_cents).toBe(12800);
      expect(sale.items[0]).toMatchObject({ quantity: 400, unit: 'г', price_per: 1000 });
    });
  });

  describe('where weight makes no sense', () => {
    it('is not promised in a pre-order', async () => {
      const res = await post('/preorders', {
        client_uuid: randomUUID(),
        due_at: new Date(Date.now() + 86_400_000).toISOString(),
        fulfilment: 'pickup',
        recipient_name: 'Оля',
        items: [{ variant_id: cheese, quantity: 350 }],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/передзамовлення/);
    });

    it('is not added to a table\'s bill', async () => {
      const hall = await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`, [
        store.storeId,
      ]);
      const table = await pool.query(
        `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '1') RETURNING id`,
        [store.storeId, hall.rows[0].id]
      );
      const { bill } = await bills.openBill({
        storeId: store.storeId,
        staffId: store.sellerId,
        tableId: Number(table.rows[0].id),
        clientUuid: randomUUID(),
      });
      await expect(
        bills.addDraftItem(store.storeId, store.sellerId, bill.id, { variant_id: cheese, quantity: 350 })
      ).rejects.toThrow(/на рахунок столу він не додається/);
    });

    it('is parked as it was weighed, and the cart\'s label sums it the way a sale does', async () => {
      const res = await post('/parked-carts', {
        client_uuid: randomUUID(),
        label: 'Пані в синьому',
        items: [weighing(cheese, 350), { variant_id: bread, quantity: 2 }],
      });
      expect(res.statusCode, res.body).toBeLessThan(300);
      const cart = res.json() as { total_cents: number; items: Array<{ price_per: number }> };
      expect(cart.items.map((i) => i.price_per)).toEqual([1000, 1]);
      expect(cart.total_cents).toBe(6647 + 9180);
    });
  });

  describe('the owner', () => {
    it('sees a weighing as one purchase among the popular goods, in its own unit', async () => {
      const res = await get('/analytics/summary', store.ownerToken);
      expect(res.statusCode, res.body).toBe(200);
      const top = (res.json() as { top_items: Array<{ product_name: string; qty_sold: number; unit: string; price_per: number }> }).top_items;
      const cheeseRow = top.find((row) => row.product_name === 'Сир твердий');
      expect(cheeseRow).toMatchObject({ unit: 'г', price_per: 1000 });
      // Grams sold put it nowhere near the top by themselves; purchases do.
      expect(cheeseRow!.qty_sold).toBeGreaterThan(1000);
    });

    it('cannot move the store to a vertical under which its prices would mean something else', async () => {
      await expect(patchStoreModules(store.storeId, { vertical: 'cafe' })).rejects.toThrow(/у 1000 разів/);
      const row = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [store.storeId]);
      expect(row.rows[0].vertical).not.toBe('cafe');
    });
  });
});
