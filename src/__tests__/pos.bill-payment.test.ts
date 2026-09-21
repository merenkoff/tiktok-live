// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.bill-payment.test.ts — paying a bill (phase К4d).
//
// The one thing everything else rests on: the round already moved the stock,
// so paying copies the snapshot across and moves nothing. What that buys is
// a refund that reverses exactly what the kitchen took.
// Plus the two shapes of a split, which the schema — not taste — decides:
// by dishes is N sales, by sum is N payments on one.
// See TechDocs/POS_TABLES.md §4.4, §9.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
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
import * as bills from '../pos/bills.service.js';
import { shareDiscount } from '../pos/bill-payment.service.js';
import { fireRound } from '../pos/rounds.service.js';
import { getSale, refundSale } from '../pos/sales.service.js';

describe.skipIf(!hasDb)('POS bill payment', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let hall = 0;
  let tea = 0;
  let cake = 0;
  let tableSeq = 0;

  const stockOf = async (variantId: number): Promise<number> =>
    Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId]))
        .rows[0]?.quantity ?? 0
    );

  /** A bill whose lines are all fired, ready to pay. */
  async function firedBill(
    items: Array<{ variant_id: number; quantity: number }>
  ): Promise<bills.Bill> {
    tableSeq += 1;
    const table = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, `P${tableSeq}`]
    );
    const opened = await bills.openBill({
      storeId: store.storeId,
      staffId: store.sellerId,
      tableId: Number(table.rows[0].id),
    });
    for (const item of items) {
      await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, item);
    }
    return fireRound({
      storeId: store.storeId,
      staffId: store.sellerId,
      billId: opened.bill.id,
    });
  }

  const pay = (billId: number, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/pay`,
      headers: auth(store.sellerToken),
      payload: body,
    });
  const cash = (amount: number) => [{ method: 'cash' as const, amount_cents: amount }];

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('billpay');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    hall = Number(
      (
        await pool.query(
          `INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`,
          [store.storeId]
        )
      ).rows[0].id
    );
    tea = (await seedProduct(store.storeId, { name: 'Чай', priceCents: 4000, quantity: 500 }))
      .variantId;
    cake = (await seedProduct(store.storeId, { name: 'Торт', priceCents: 6000, quantity: 500 }))
      .variantId;
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  it('pays the whole bill without moving stock a second time', async () => {
    const bill = await firedBill([
      { variant_id: tea, quantity: 2 },
      { variant_id: cake, quantity: 1 },
    ]);
    const beforeTea = await stockOf(tea);
    const beforeCake = await stockOf(cake);

    const res = await pay(bill.id, { payments: cash(14000) });
    expect(res.statusCode).toBe(200);
    const { bill: paid, sale_ids } = res.json();
    expect(sale_ids).toHaveLength(1);
    expect(paid.status).toBe('paid');
    expect(paid.closed_at).not.toBeNull();

    // The round took the stock; paying must not take it again.
    expect(await stockOf(tea)).toBe(beforeTea);
    expect(await stockOf(cake)).toBe(beforeCake);

    const sale = await getSale(store.storeId, sale_ids[0]);
    expect(sale!.total_cents).toBe(4000 * 2 + 6000);
    // Both directions of the link are written.
    const teaLine = sale!.items.find((i) => i.variant_id === tea)!;
    const linked = await pool.query(
      `SELECT bill_item_id FROM pos_sale_items WHERE id = $1`,
      [teaLine.id]
    );
    expect(linked.rows[0].bill_item_id).not.toBeNull();
    const back = await pool.query(
      `SELECT COUNT(*) AS n FROM pos_bill_items WHERE bill_id = $1 AND sale_id IS NULL`,
      [bill.id]
    );
    expect(Number(back.rows[0].n)).toBe(0);

    // The table is free the moment the bill closes.
    const open = await bills.listOpenBills(store.storeId);
    expect(open.find((b) => b.id === bill.id)).toBeUndefined();
  });

  it('refunds exactly what the round took', async () => {
    const bill = await firedBill([{ variant_id: tea, quantity: 3 }]);
    const { sale_ids } = (await pay(bill.id, { payments: cash(12000) })).json();
    const sale = await getSale(store.storeId, sale_ids[0]);
    const line = sale!.items[0];
    const before = await stockOf(tea);

    await refundSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      saleId: sale!.id,
      items: [{ sale_item_id: line.id, quantity: 1 }],
      method: 'cash',
    });
    // The snapshot copied off the bill line is what makes this exact.
    expect(await stockOf(tea)).toBe(before + 1);
  });

  it('splits by dishes into one sale per part', async () => {
    const bill = await firedBill([
      { variant_id: tea, quantity: 1 },
      { variant_id: cake, quantity: 1 },
    ]);
    const lines = bill.rounds[0].items;
    const teaLine = lines.find((l) => l.variant_id === tea)!;
    const cakeLine = lines.find((l) => l.variant_id === cake)!;

    const res = await pay(bill.id, {
      parts: [
        { line_ids: [teaLine.id], payments: cash(4000) },
        { line_ids: [cakeLine.id], payments: cash(6000) },
      ],
    });
    expect(res.statusCode).toBe(200);
    const { bill: paid, sale_ids } = res.json();
    expect(sale_ids).toHaveLength(2);
    expect(paid.status).toBe('paid');

    const first = await getSale(store.storeId, sale_ids[0]);
    const second = await getSale(store.storeId, sale_ids[1]);
    expect(first!.total_cents).toBe(4000);
    expect(second!.total_cents).toBe(6000);
    // Each part is its own receipt, which is the whole reason it is its own
    // sale: one sale may carry only one fiscal document.
    expect(first!.receipt_number).not.toBe(second!.receipt_number);
  });

  it('splits by sum as several payments on one receipt', async () => {
    const bill = await firedBill([{ variant_id: cake, quantity: 1 }]);
    const res = await pay(bill.id, {
      payments: [
        { method: 'cash', amount_cents: 2000 },
        { method: 'card', amount_cents: 4000 },
      ],
    });
    expect(res.statusCode).toBe(200);
    const { sale_ids } = res.json();
    expect(sale_ids).toHaveLength(1);
    const sale = await getSale(store.storeId, sale_ids[0]);
    expect(sale!.payments).toHaveLength(2);
    expect(sale!.total_cents).toBe(6000);
  });

  it('shares one discount across the parts instead of running it N times', async () => {
    // The unit first: a tenth off 10000 split 4000/6000 is 400 + 600, and the
    // rounding remainder lands on the last part that owes anything.
    expect(shareDiscount([4000, 6000], 1000)).toEqual([400, 600]);
    expect(shareDiscount([3333, 3333, 3334], 1000).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shareDiscount([0, 0], 500)).toEqual([0, 0]);

    const bill = await firedBill([
      { variant_id: tea, quantity: 1 },
      { variant_id: cake, quantity: 1 },
    ]);
    const lines = bill.rounds[0].items;
    const res = await pay(bill.id, {
      cart_discount: { type: 'percent', value: 10 },
      parts: [
        { line_ids: [lines.find((l) => l.variant_id === tea)!.id], payments: cash(3600) },
        { line_ids: [lines.find((l) => l.variant_id === cake)!.id], payments: cash(5400) },
      ],
    });
    const { sale_ids } = res.json();
    const totals = await Promise.all(
      sale_ids.map(async (id: number) => (await getSale(store.storeId, id))!.total_cents)
    );
    // Σ of the parts is the discount on the whole — 10 % off 10000 — and not
    // 10 % applied twice to two different bases.
    expect(totals.reduce((a: number, b: number) => a + b, 0)).toBe(9000);
  });

  it('refuses to pay a bill with an unfired draft', async () => {
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    await bills.addDraftItem(store.storeId, store.sellerId, bill.id, {
      variant_id: cake,
      quantity: 1,
    });
    const res = await pay(bill.id, { payments: cash(4000) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/невідправлені позиції/);
  });

  it('leaves nothing to pay twice', async () => {
    const bill = await firedBill([{ variant_id: tea, quantity: 1 }]);
    expect((await pay(bill.id, { payments: cash(4000) })).statusCode).toBe(200);
    const again = await pay(bill.id, { payments: cash(4000) });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/уже оплачено/);
  });

  it('does not charge for a cancelled round', async () => {
    const bill = await firedBill([{ variant_id: cake, quantity: 1 }]);
    const withSecond = await bills.addDraftItem(store.storeId, store.sellerId, bill.id, {
      variant_id: tea,
      quantity: 1,
    });
    const fired = await fireRound({
      storeId: store.storeId,
      staffId: store.sellerId,
      billId: withSecond.id,
    });
    const second = fired.rounds[1];
    await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${bill.id}/rounds/${second.id}/cancel`,
      headers: auth(store.sellerToken),
    });

    const { sale_ids, bill: paid } = (await pay(bill.id, { payments: cash(6000) })).json();
    const sale = await getSale(store.storeId, sale_ids[0]);
    // Only the cake: the tea went back on the shelf when its round was cancelled.
    expect(sale!.total_cents).toBe(6000);
    expect(sale!.items).toHaveLength(1);
    expect(paid.status).toBe('paid');
  });
});
