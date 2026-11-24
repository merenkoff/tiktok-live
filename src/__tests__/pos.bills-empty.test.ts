// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.bills-empty.test.ts — a bill with nothing on it, and a
// round that a receipt already stands on (TechDocs/POS_TABLES.md §4.1).
//
// Three things are pinned here. The hall map can tell an empty bill from a
// table that is eating (`live_rounds`, and a ready round outranks a cooking
// one). The cron closes an empty bill only after it has sat untouched, and
// re-reads everything under the bill's lock, so a waiter adding the first
// dish at that second keeps the table. And money already on a receipt is
// never undone by a cancel — neither of the round nor of the bill.

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
import { fireRound } from '../pos/rounds.service.js';

describe.skipIf(!hasDb)('POS empty bills', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;
  let hall = 0;
  let otherHall = 0;
  let tea = 0;
  let tableSeq = 0;

  async function newTable(storeId = store.storeId, hallId = hall): Promise<number> {
    tableSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [storeId, hallId, `E${tableSeq}`]
    );
    return Number(row.rows[0].id);
  }

  async function openEmpty(target: TestStore = store, hallId = hall): Promise<number> {
    const opened = await bills.openBill({
      storeId: target.storeId,
      staffId: target.sellerId,
      tableId: await newTable(target.storeId, hallId),
    });
    return opened.bill.id;
  }

  /** A bill with one fired round of tea; answers the bill and its round's line. */
  async function firedBill(): Promise<{ billId: number; roundId: number; lineId: number }> {
    const billId = await openEmpty();
    await bills.addDraftItem(store.storeId, store.sellerId, billId, { variant_id: tea, quantity: 1 });
    const bill = await fireRound({ storeId: store.storeId, staffId: store.sellerId, billId });
    return { billId, roundId: bill.rounds[0].id, lineId: bill.rounds[0].items[0].id };
  }

  /** Make a bill look as if nobody has touched it for `hours`. */
  async function age(billId: number, hours: number): Promise<void> {
    await pool.query(
      `UPDATE pos_bills
          SET opened_at = NOW() - make_interval(hours => $2::int),
              updated_at = NOW() - make_interval(hours => $2::int)
        WHERE id = $1`,
      [billId, hours]
    );
    await pool.query(
      `UPDATE pos_bill_rounds
          SET fired_at = NOW() - make_interval(hours => $2::int),
              cancelled_at = CASE WHEN cancelled_at IS NULL THEN NULL
                                  ELSE NOW() - make_interval(hours => $2::int) END
        WHERE bill_id = $1`,
      [billId, hours]
    );
  }

  const statusOf = async (billId: number) =>
    (await pool.query(`SELECT status, closed_by FROM pos_bills WHERE id = $1`, [billId])).rows[0];

  const pay = (billId: number, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/pay`,
      headers: auth(store.sellerToken),
      payload: body,
    });
  const cancelRoundReq = (billId: number, roundId: number) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/rounds/${roundId}/cancel`,
      headers: auth(store.sellerToken),
    });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('emptybills');
    other = await createTestStore('emptybills_other');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [store.storeId, other.storeId],
    ]);
    const makeHall = async (storeId: number) =>
      Number(
        (
          await pool.query(
            `INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`,
            [storeId]
          )
        ).rows[0].id
      );
    hall = await makeHall(store.storeId);
    otherHall = await makeHall(other.storeId);
    tea = (await seedProduct(store.storeId, { name: 'Чай', priceCents: 4000, quantity: 500 }))
      .variantId;
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
  });

  it('tells the hall map an empty bill from a table that is eating', async () => {
    const empty = await openEmpty();
    const eating = await firedBill();
    const summary = await bills.listOpenBills(store.storeId);
    const emptyRow = summary.find((row) => row.id === empty)!;
    const eatingRow = summary.find((row) => row.id === eating.billId)!;
    expect(emptyRow.live_rounds).toBe(0);
    expect(emptyRow.draft_count).toBe(0);
    expect(eatingRow.live_rounds).toBe(1);

    // A cancelled round is not dinner: the bill reads empty again.
    expect((await cancelRoundReq(eating.billId, eating.roundId)).statusCode).toBe(200);
    const after = (await bills.listOpenBills(store.storeId)).find((r) => r.id === eating.billId)!;
    expect(after.live_rounds).toBe(0);
  });

  it('shows the waiter a ready round before a cooking one', async () => {
    const { billId, roundId } = await firedBill();
    await bills.addDraftItem(store.storeId, store.sellerId, billId, { variant_id: tea, quantity: 2 });
    await fireRound({ storeId: store.storeId, staffId: store.sellerId, billId });
    // The FIRST round is ready, the second still cooking: the tile must say
    // «готово» — that is the one the waiter has to go and fetch.
    await pool.query(`UPDATE pos_bill_rounds SET prep_status = 'ready', ready_at = NOW() WHERE id = $1`, [
      roundId,
    ]);
    const row = (await bills.listOpenBills(store.storeId)).find((r) => r.id === billId)!;
    expect(row.prep_status).toBe('ready');
    expect(row.live_rounds).toBe(2);
  });

  it('refuses to cancel a round a receipt already stands on, and a round of a paid bill', async () => {
    const { billId, roundId, lineId } = await firedBill();
    await bills.addDraftItem(store.storeId, store.sellerId, billId, { variant_id: tea, quantity: 1 });
    const two = await fireRound({ storeId: store.storeId, staffId: store.sellerId, billId });
    const secondLine = two.rounds.find((r) => r.id !== roundId)!.items[0].id;

    const paid = await pay(billId, {
      parts: [{ line_ids: [lineId], payments: [{ method: 'cash', amount_cents: 4000 }] }],
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().bill.status).toBe('open');

    const stockBefore = Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [tea])).rows[0].quantity
    );
    const refused = await cancelRoundReq(billId, roundId);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/Частину раунду вже оплачено/);
    // Nothing went back to the shelf for a plate that is on a fiscal receipt.
    const stockAfter = Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [tea])).rows[0].quantity
    );
    expect(stockAfter).toBe(stockBefore);

    // Pay the rest: the bill closes, and its rounds are a refund's business now.
    const rest = await pay(billId, {
      parts: [{ line_ids: [secondLine], payments: [{ method: 'cash', amount_cents: 4000 }] }],
    });
    expect(rest.json().bill.status).toBe('paid');
    const closed = await cancelRoundReq(billId, two.rounds.find((r) => r.id !== roundId)!.id);
    expect(closed.statusCode).toBe(409);
    expect(closed.json().error).toMatch(/Рахунок уже оплачено/);
  });

  it('refuses to cancel a bill that already took money', async () => {
    const { billId, roundId, lineId } = await firedBill();
    await pay(billId, {
      parts: [{ line_ids: [lineId], payments: [{ method: 'cash', amount_cents: 4000 }] }],
    });
    // The bill above closed as paid; reopen it in a state the old code could
    // leave behind — a paid line under a round cancelled before this fix.
    await pool.query(`UPDATE pos_bills SET status = 'open', closed_at = NULL WHERE id = $1`, [billId]);
    await pool.query(`UPDATE pos_bill_rounds SET cancelled_at = NOW() WHERE id = $1`, [roundId]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Частину рахунку вже оплачено/);
    // And the cron never takes it for empty either.
    await age(billId, 10);
    await bills.autoCancelEmptyBills({ storeId: store.storeId });
    expect((await statusOf(billId)).status).toBe('open');
    await pool.query(`UPDATE pos_bills SET status = 'paid', closed_at = NOW() WHERE id = $1`, [billId]);
  });

  it('closes an empty bill that sat untouched, naming nobody', async () => {
    const idle = await openEmpty();
    const fresh = await openEmpty();
    await age(idle, 4);

    const closed = await bills.autoCancelEmptyBills({ storeId: store.storeId });
    expect(closed).toBeGreaterThanOrEqual(1);
    expect(await statusOf(idle)).toEqual({ status: 'cancelled', closed_by: null });
    expect((await statusOf(fresh)).status).toBe('open');
  });

  it('keeps a bill with a draft, and one touched recently, whatever its age', async () => {
    const withDraft = await openEmpty();
    await bills.addDraftItem(store.storeId, store.sellerId, withDraft, {
      variant_id: tea,
      quantity: 1,
    });
    await age(withDraft, 6);

    // Opened long ago, but the guests were set a minute ago.
    const touched = await openEmpty();
    await age(touched, 6);
    await bills.updateBill(store.storeId, touched, { guests: 3 });

    // Its every round was taken back — but only just now.
    const justCancelled = await firedBill();
    await age(justCancelled.billId, 6);
    await pool.query(`UPDATE pos_bill_rounds SET cancelled_at = NOW() WHERE id = $1`, [
      justCancelled.roundId,
    ]);

    await bills.autoCancelEmptyBills({ storeId: store.storeId });
    expect((await statusOf(withDraft)).status).toBe('open');
    expect((await statusOf(touched)).status).toBe('open');
    expect((await statusOf(justCancelled.billId)).status).toBe('open');
  });

  it('closes a bill whose every round was taken back long ago', async () => {
    const { billId, roundId } = await firedBill();
    expect((await cancelRoundReq(billId, roundId)).statusCode).toBe(200);
    await age(billId, 5);
    await bills.autoCancelEmptyBills({ storeId: store.storeId });
    expect((await statusOf(billId)).status).toBe('cancelled');
  });

  it('touches only the store it is asked about', async () => {
    const theirs = await openEmpty(other, otherHall);
    await age(theirs, 8);
    await bills.autoCancelEmptyBills({ storeId: store.storeId });
    expect((await statusOf(theirs)).status).toBe('open');
    await bills.autoCancelEmptyBills({ storeId: other.storeId });
    expect((await statusOf(theirs)).status).toBe('cancelled');
  });

  it('keeps the table when the first dish lands while the cron is deciding', async () => {
    const billId = await openEmpty();
    await age(billId, 5);

    // A waiter's write holds the bill's lock and adds the first dish…
    const waiter = await pool.connect();
    try {
      await waiter.query('BEGIN');
      await bills.loadOpenBill(waiter, store.storeId, billId);
      await bills.addDraftItemTx(waiter, store.storeId, store.sellerId, billId, {
        variant_id: tea,
        quantity: 1,
      });
      // …while the cron finds the bill empty and waits for that lock.
      const sweep = bills.autoCancelEmptyBills({ storeId: store.storeId });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await waiter.query('COMMIT');
      await sweep;
    } finally {
      waiter.release();
    }
    expect((await statusOf(billId)).status).toBe('open');
  });
});
