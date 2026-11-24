// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.serving.test.ts — «Роздача» (migration 115,
// TechDocs/POS_PASS.md).
//
// A round goes to the kitchen whole and comes out in parts, carried by
// different waiters. What is pinned here: a part of a line can be carried and
// everyone (the board, the bill, the feed) reads the same number; the last
// plate closes the round without pretending the kitchen said «Готово»; two
// waiters can never carry the same last borscht; a tray is all or nothing and
// a repeated request is the same tray; «Повернути» is narrow; the kitchen's
// «Видано» carries the rest as its own rows; a round with a carried plate
// cannot be cancelled; and «Роздача» never comes without «Столи».

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  issueToken,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import * as bills from '../pos/bills.service.js';
import { fireRound } from '../pos/rounds.service.js';

describe.skipIf(!hasDb)('POS serving («Роздача»)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;
  let hall = 0;
  let soup = 0;
  let tea = 0;
  let tableSeq = 0;
  let secondWaiterId = 0;
  let secondWaiterToken = '';

  async function newTable(): Promise<number> {
    tableSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, `S${tableSeq}`]
    );
    return Number(row.rows[0].id);
  }

  /** A table with one fired round: 3 soups and 1 tea, unless told otherwise. */
  async function round(
    lines: Array<{ variant_id: number; quantity: number }> = [
      { variant_id: soup, quantity: 3 },
      { variant_id: tea, quantity: 1 },
    ]
  ): Promise<{ billId: number; roundId: number; soupLine: number; teaLine: number; lines: number[] }> {
    const opened = await bills.openBill({ storeId: store.storeId, staffId: store.sellerId, tableId: await newTable() });
    for (const line of lines) {
      await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, line);
    }
    const fired = await fireRound({ storeId: store.storeId, staffId: store.sellerId, billId: opened.bill.id });
    const r = fired.rounds[fired.rounds.length - 1];
    const lineOf = (variant: number) => r.items.find((i) => i.variant_id === variant)?.id ?? 0;
    return {
      billId: opened.bill.id,
      roundId: r.id,
      soupLine: lineOf(soup),
      teaLine: lineOf(tea),
      lines: r.items.map((i) => i.id),
    };
  }

  const serve = (token: string, items: Array<{ bill_item_id: number; quantity: number }>, uuid = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/serving/serve',
      headers: auth(token),
      payload: { client_uuid: uuid, items },
    });
  const undo = (token: string, ids: number[]) =>
    app.inject({ method: 'POST', url: '/api/pos/serving/undo', headers: auth(token), payload: { event_ids: ids } });
  const tap = (roundId: number, prep_status: 'ready' | 'served') =>
    app.inject({
      method: 'PATCH',
      url: `/api/pos/kitchen/rounds/${roundId}/prep`,
      headers: auth(store.sellerToken),
      payload: { prep_status },
    });
  const roundRow = async (roundId: number) =>
    (await pool.query(`SELECT prep_status, ready_at, served_at FROM pos_bill_rounds WHERE id = $1`, [roundId])).rows[0];
  const boardItem = async (lineId: number) => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/kitchen/orders', headers: auth(store.sellerToken) });
    for (const order of res.json().orders as Array<{ kind: string; items: Array<{ id: number; served_quantity?: number }> }>) {
      if (order.kind !== 'round') continue;
      const item = order.items.find((i) => i.id === lineId);
      if (item) return item;
    }
    return null;
  };

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('serving');
    other = await createTestStore('serving_other');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [store.storeId, other.storeId],
    ]);
    hall = Number(
      (await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`, [store.storeId]))
        .rows[0].id
    );
    soup = (await seedProduct(store.storeId, { name: 'Борщ', priceCents: 12000, quantity: 500 })).variantId;
    tea = (await seedProduct(store.storeId, { name: 'Чай', priceCents: 4000, quantity: 500 })).variantId;
    const waiter = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, pin_hash) VALUES ($1, 'seller', 'Олена', 'x') RETURNING id`,
      [store.storeId]
    );
    secondWaiterId = Number(waiter.rows[0].id);
    secondWaiterToken = await issueToken(store.storeId, secondWaiterId);
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
  });

  it('carries part of a line, and the board, the bill and the feed read the same number', async () => {
    const r = await round();
    const res = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }]);
    expect(res.statusCode).toBe(200);
    expect(res.json().replay).toBe(false);
    expect(res.json().lines).toEqual([{ bill_item_id: r.soupLine, quantity: 3, served_quantity: 1 }]);
    expect(res.json().rounds).toEqual([{ id: r.roundId, prep_status: 'new', served_at: null }]);

    expect((await boardItem(r.soupLine))?.served_quantity).toBe(1);
    const bill = await bills.getBill(store.storeId, r.billId);
    expect(bill.rounds[0].items.find((i) => i.id === r.soupLine)?.served_quantity).toBe(1);
    expect(bill.draft.every((l) => l.served_quantity === undefined)).toBe(true);

    const feed = await app.inject({ method: 'GET', url: '/api/pos/serving', headers: auth(store.sellerToken) });
    const table = feed.json().tables.find((t: { bill_id: number }) => t.bill_id === r.billId);
    expect(table.to_serve).toBe(3); // 2 soups + 1 tea
    expect(table.rounds[0].items.find((i: { id: number }) => i.id === r.soupLine).served_quantity).toBe(1);
  });

  it('closes a round from «new» when the last plate goes, without inventing «Готово»', async () => {
    const r = await round();
    const res = await serve(store.sellerToken, [
      { bill_item_id: r.soupLine, quantity: 3 },
      { bill_item_id: r.teaLine, quantity: 1 },
    ]);
    expect(res.statusCode).toBe(200);
    const row = await roundRow(r.roundId);
    expect(row.prep_status).toBe('served');
    expect(row.served_at).not.toBeNull();
    // Undoing that tap must still know the kitchen never said «Готово».
    expect(row.ready_at).toBeNull();
    expect(await boardItem(r.soupLine)).toBeNull();
  });

  it('closes a «ready» round too, keeping when it was ready', async () => {
    const r = await round();
    expect((await tap(r.roundId, 'ready')).statusCode).toBe(200);
    await serve(store.sellerToken, [
      { bill_item_id: r.soupLine, quantity: 3 },
      { bill_item_id: r.teaLine, quantity: 1 },
    ]);
    const row = await roundRow(r.roundId);
    expect(row.prep_status).toBe('served');
    expect(row.ready_at).not.toBeNull();
  });

  it('refuses more than is left, naming who carried it', async () => {
    const r = await round();
    expect((await serve(store.sellerToken, [{ bill_item_id: r.teaLine, quantity: 1 }])).statusCode).toBe(200);
    const again = await serve(secondWaiterToken, [{ bill_item_id: r.teaLine, quantity: 1 }]);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('over_served');
    expect(again.json().error).toMatch(/«Чай» уже винесено — Test Seller о \d\d:\d\d/);
    expect(again.json()).toMatchObject({ bill_item_id: r.teaLine, quantity: 1, served_quantity: 1 });

    const partial = await serve(secondWaiterToken, [{ bill_item_id: r.soupLine, quantity: 4 }]);
    expect(partial.statusCode).toBe(409);
    expect(partial.json().error).toBe('«Борщ»: лишилось винести лише 3');
  });

  it('gives the last plate to one of two waiters tapping at once', async () => {
    const r = await round([{ variant_id: tea, quantity: 1 }]);
    const [a, b] = await Promise.all([
      serve(store.sellerToken, [{ bill_item_id: r.teaLine, quantity: 1 }]),
      serve(secondWaiterToken, [{ bill_item_id: r.teaLine, quantity: 1 }]),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const sum = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS n FROM pos_bill_item_serves WHERE bill_item_id = $1 AND undone_at IS NULL`,
      [r.teaLine]
    );
    expect(sum.rows[0].n).toBe(1);
  });

  it('answers a repeated request with the same tray, not a second one', async () => {
    const r = await round();
    const uuid = randomUUID();
    const first = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }], uuid);
    const second = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }], uuid);
    expect(second.statusCode).toBe(200);
    expect(second.json().replay).toBe(true);
    expect(second.json().events.map((e: { id: number }) => e.id)).toEqual(
      first.json().events.map((e: { id: number }) => e.id)
    );
    expect(second.json().lines[0].served_quantity).toBe(1);
  });

  it('carries a tray across two tables all or nothing', async () => {
    const a = await round();
    const b = await round([{ variant_id: tea, quantity: 1 }]);
    await serve(store.sellerToken, [{ bill_item_id: b.teaLine, quantity: 1 }]);
    const res = await serve(secondWaiterToken, [
      { bill_item_id: a.soupLine, quantity: 1 },
      { bill_item_id: b.teaLine, quantity: 1 },
    ]);
    expect(res.statusCode).toBe(409);
    const bill = await bills.getBill(store.storeId, a.billId);
    expect(bill.rounds[0].items.find((i) => i.id === a.soupLine)?.served_quantity).toBe(0);
  });

  it('refuses a draft line, a cancelled round, another store and a bad key', async () => {
    const opened = await bills.openBill({ storeId: store.storeId, staffId: store.sellerId, tableId: await newTable() });
    const draft = await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, { variant_id: tea, quantity: 1 });
    const draftLine = draft.draft[0].id;
    const notFired = await serve(store.sellerToken, [{ bill_item_id: draftLine, quantity: 1 }]);
    expect(notFired.statusCode).toBe(409);
    expect(notFired.json().code).toBe('line_not_fired');

    const r = await round();
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${r.billId}/rounds/${r.roundId}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(cancelled.statusCode).toBe(200);
    const onCancelled = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }]);
    expect(onCancelled.statusCode).toBe(409);
    expect(onCancelled.json().code).toBe('round_cancelled');

    const foreign = await serve(other.sellerToken, [{ bill_item_id: r.teaLine, quantity: 1 }]);
    expect(foreign.statusCode).toBe(404);

    const badKey = await app.inject({
      method: 'POST',
      url: '/api/pos/serving/serve',
      headers: auth(store.sellerToken),
      payload: { client_uuid: 'nope', items: [{ bill_item_id: r.teaLine, quantity: 1 }] },
    });
    expect(badKey.statusCode).toBe(400);
  });

  it('takes back one’s own tap, reopening a round the tap had closed', async () => {
    const r = await round([{ variant_id: tea, quantity: 1 }]);
    const done = await serve(store.sellerToken, [{ bill_item_id: r.teaLine, quantity: 1 }]);
    expect((await roundRow(r.roundId)).prep_status).toBe('served');
    const eventId = done.json().events[0].id;

    const back = await undo(store.sellerToken, [eventId]);
    expect(back.statusCode).toBe(200);
    expect(back.json().undone).toEqual([eventId]);
    expect(back.json().lines[0].served_quantity).toBe(0);
    const row = await roundRow(r.roundId);
    expect(row.prep_status).toBe('new');
    expect(row.served_at).toBeNull();

    // Twice is harmless.
    const twice = await undo(store.sellerToken, [eventId]);
    expect(twice.statusCode).toBe(200);
    expect(twice.json().undone).toEqual([]);
  });

  it('lets only the waiter (or the owner) take a tap back, and only for ten minutes', async () => {
    const r = await round();
    const done = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }]);
    const eventId = done.json().events[0].id;

    const notYours = await undo(secondWaiterToken, [eventId]);
    expect(notYours.statusCode).toBe(409);
    expect(notYours.json().code).toBe('undo_not_yours');

    expect((await undo(store.ownerToken, [eventId])).statusCode).toBe(200);

    const late = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }]);
    const lateId = late.json().events[0].id;
    await pool.query(`UPDATE pos_bill_item_serves SET served_at = NOW() - INTERVAL '11 minutes' WHERE id = $1`, [lateId]);
    const expired = await undo(store.sellerToken, [lateId]);
    expect(expired.statusCode).toBe(409);
    expect(expired.json().code).toBe('undo_expired');

    const history = await app.inject({
      method: 'GET',
      url: `/api/pos/serving/bills/${r.billId}`,
      headers: auth(store.sellerToken),
    });
    const rows = history.json().history as Array<{ id: number; undoable: boolean; undone_at: string | null }>;
    expect(rows.find((h) => h.id === lateId)?.undoable).toBe(false);
    expect(rows.find((h) => h.id === eventId)?.undone_at).not.toBeNull();
  });

  it('makes the kitchen’s «Видано» carry the rest as its own rows', async () => {
    const r = await round();
    const mine = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }]);

    const early = await tap(r.roundId, 'served');
    expect(early.statusCode).toBe(409);
    expect(early.json().error).toMatch(/Спершу натисніть/);

    expect((await tap(r.roundId, 'ready')).statusCode).toBe(200);
    const handed = await tap(r.roundId, 'served');
    expect(handed.statusCode).toBe(200);
    expect(handed.json().prep_status).toBe('served');

    const kitchenRows = await pool.query(
      `SELECT bill_item_id, quantity, served_by FROM pos_bill_item_serves
        WHERE round_id = $1 AND source = 'kitchen' ORDER BY bill_item_id`,
      [r.roundId]
    );
    expect(kitchenRows.rows.map((row) => [Number(row.bill_item_id), row.quantity])).toEqual(
      [
        [r.soupLine, 2],
        [r.teaLine, 1],
      ].sort((a, b) => a[0] - b[0])
    );
    expect(Number(kitchenRows.rows[0].served_by)).toBe(store.sellerId);

    // A second «Видано» writes nothing more.
    expect((await tap(r.roundId, 'served')).statusCode).toBe(200);
    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_bill_item_serves WHERE round_id = $1`, [r.roundId]);
    expect(count.rows[0].n).toBe(3);

    // The waiter's own tap is no longer theirs to take back.
    const back = await undo(store.sellerToken, [mine.json().events[0].id]);
    expect(back.statusCode).toBe(409);
    expect(back.json().code).toBe('undo_after_kitchen');

    const history = await app.inject({
      method: 'GET',
      url: `/api/pos/serving/bills/${r.billId}`,
      headers: auth(store.sellerToken),
    });
    const kitchen = (history.json().history as Array<{ source: string; served_by_name: string }>).filter(
      (h) => h.source === 'kitchen'
    );
    expect(kitchen).toHaveLength(2);
    expect(kitchen[0].served_by_name).toBe('Кухня · Test Seller');
  });

  it('refuses to cancel a round a plate of which was carried, until the tap is taken back', async () => {
    const r = await round();
    const done = await serve(store.sellerToken, [{ bill_item_id: r.teaLine, quantity: 1 }]);
    const cancel = () =>
      app.inject({
        method: 'POST',
        url: `/api/pos/bills/${r.billId}/rounds/${r.roundId}/cancel`,
        headers: auth(store.sellerToken),
      });
    const refused = await cancel();
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/З раунду вже винесли страви/);
    expect((await undo(store.sellerToken, [done.json().events[0].id])).statusCode).toBe(200);
    expect((await cancel()).statusCode).toBe(200);
  });

  it('reads a round handed over before «Роздача» as carried whole', async () => {
    const r = await round();
    await pool.query(`UPDATE pos_bill_rounds SET prep_status = 'served', served_at = NOW() WHERE id = $1`, [r.roundId]);
    const bill = await bills.getBill(store.storeId, r.billId);
    expect(bill.rounds[0].items.find((i) => i.id === r.soupLine)?.served_quantity).toBe(3);
    const res = await serve(store.sellerToken, [{ bill_item_id: r.soupLine, quantity: 1 }]);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/уже винесено — кухня/);
  });

  it('lists only open bills, and a paid one leaves the feed', async () => {
    const r = await round([{ variant_id: tea, quantity: 1 }]);
    const listed = async () =>
      (
        (await app.inject({ method: 'GET', url: '/api/pos/serving', headers: auth(store.sellerToken) })).json()
          .tables as Array<{ bill_id: number }>
      ).some((t) => t.bill_id === r.billId);
    expect(await listed()).toBe(true);
    const paid = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${r.billId}/pay`,
      headers: auth(store.sellerToken),
      payload: { parts: [{ payments: [{ method: 'cash', amount_cents: 4000 }] }] },
    });
    expect(paid.statusCode).toBe(200);
    expect(await listed()).toBe(false);
  });

  it('keeps the books straight: never more carried than fired, a closed round carried whole', async () => {
    const over = await pool.query(
      `SELECT i.id FROM pos_bill_items i
        WHERE i.store_id = $1 AND i.quantity < COALESCE((SELECT SUM(e.quantity) FROM pos_bill_item_serves e
                                                         WHERE e.bill_item_id = i.id AND e.undone_at IS NULL), 0)`,
      [store.storeId]
    );
    expect(over.rows).toEqual([]);
    // A round still open has something left to carry.
    const openButDone = await pool.query(
      `SELECT r.id FROM pos_bill_rounds r
        WHERE r.store_id = $1 AND r.cancelled_at IS NULL AND r.prep_status <> 'served'
          AND NOT EXISTS (SELECT 1 FROM pos_bill_items i WHERE i.round_id = r.id
                           AND i.quantity > COALESCE((SELECT SUM(e.quantity) FROM pos_bill_item_serves e
                                                       WHERE e.bill_item_id = i.id AND e.undone_at IS NULL), 0))`,
      [store.storeId]
    );
    expect(openButDone.rows).toEqual([]);
    // A served round with rows is carried whole; one without rows is from before 115.
    const servedShort = await pool.query(
      `SELECT r.id FROM pos_bill_rounds r
        WHERE r.store_id = $1 AND r.prep_status = 'served'
          AND EXISTS (SELECT 1 FROM pos_bill_item_serves e WHERE e.round_id = r.id AND e.undone_at IS NULL)
          AND EXISTS (SELECT 1 FROM pos_bill_items i WHERE i.round_id = r.id
                       AND i.quantity > COALESCE((SELECT SUM(e.quantity) FROM pos_bill_item_serves e
                                                   WHERE e.bill_item_id = i.id AND e.undone_at IS NULL), 0))`,
      [store.storeId]
    );
    expect(servedShort.rows).toEqual([]);
  });

  it('never lets «Роздача» into a store without «Столи»', async () => {
    const entry = (id: string, path: string) => ({
      url: `https://cdn.example.com/${id}/remote-entry.js`,
      title: id,
      routePath: path,
      nav: [{ label: id, location: 'cashier-primary', order: 1 }],
    });
    const alone = await app.inject({
      method: 'PATCH',
      url: '/api/pos/store',
      headers: auth(other.ownerToken),
      payload: { module_remotes: { pass: entry('pass', '/pass') } },
    });
    expect(alone.statusCode).toBe(400);
    expect(alone.json().error).toMatch(/"pass" needs "tables"/);

    const together = await app.inject({
      method: 'PATCH',
      url: '/api/pos/store',
      headers: auth(other.ownerToken),
      payload: { module_remotes: { pass: entry('pass', '/pass'), tables: entry('tables', '/tables') } },
    });
    expect(together.statusCode).toBe(200);
  });

  it('closes «Роздача» for a seller the owner kept off it', async () => {
    await pool.query(`UPDATE pos_staff SET blocked_sections = ARRAY['pass'] WHERE id = $1`, [secondWaiterId]);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/pos/serving', headers: auth(secondWaiterToken) });
      expect(res.statusCode).toBe(403);
      expect(res.json().code ?? res.json().error).toMatch(/section_closed|закрив/);
    } finally {
      await pool.query(`UPDATE pos_staff SET blocked_sections = '{}' WHERE id = $1`, [secondWaiterId]);
    }
  });
});
