// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.round-print.test.ts — the print queue of a table's rounds
// (migration 109, TechDocs/POS_TABLES.md §11 «Друк раундів»).
//
// A round fired from anywhere — a waiter's tablet, the bar's till, a guest's
// phone — must come out of the kitchen's (or the bar's) printer, on the desktop
// that holds it. What this pins: one job per station the round's lines are made
// at, a store without stations getting one unheaded ticket, the lease, the
// idempotent confirmation, a cancelled round never printing, and a replayed tap
// never queuing twice.

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
import { cancelRound } from '../pos/rounds.service.js';

const DEVICE_A = 'till-a-0000000000000001';
const DEVICE_B = 'till-b-0000000000000002';

describe.skipIf(!hasDb)('POS round print queue', () => {
  let app: FastifyInstance;
  let routed: TestStore;
  let plain: TestStore;
  let routedHall = 0;
  let plainHall = 0;
  let soup = 0;
  let coffee = 0;
  let cake = 0;
  let plainSoup = 0;
  let tableSeq = 0;

  async function newTable(store: TestStore, hall: number): Promise<number> {
    tableSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, String(tableSeq)]
    );
    return Number(row.rows[0].id);
  }

  async function fireBill(
    store: TestStore,
    hall: number,
    items: Array<{ variant_id: number; quantity: number; note?: string }>,
    clientUuid?: string
  ): Promise<{ billId: number; roundId: number }> {
    const opened = await bills.openBill({ storeId: store.storeId, staffId: store.sellerId, tableId: await newTable(store, hall) });
    for (const item of items) await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, item);
    const res = await fire(store, opened.bill.id, clientUuid);
    expect(res.statusCode).toBe(200);
    const round = await pool.query(`SELECT MAX(id) AS id FROM pos_bill_rounds WHERE bill_id = $1`, [opened.bill.id]);
    return { billId: opened.bill.id, roundId: Number(round.rows[0].id) };
  }

  const fire = (store: TestStore, billId: number, clientUuid?: string) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/fire`,
      headers: auth(store.sellerToken),
      payload: clientUuid ? { client_uuid: clientUuid } : {},
    });

  const queue = (store: TestStore, device: string | null, stations?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/pos/kitchen/print-queue${stations === undefined ? '' : `?stations=${stations}`}`,
      headers: { ...auth(store.sellerToken), ...(device ? { 'x-pos-device-id': device } : {}) },
    });

  const printed = (store: TestStore, roundId: number, station: string) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/kitchen/print-queue/${roundId}/${station}/printed`,
      headers: auth(store.sellerToken),
    });

  /** Mark everything waiting in a store as printed, so each case starts empty. */
  const drain = (store: TestStore) =>
    pool.query(`UPDATE pos_round_prints SET printed_at = NOW() WHERE store_id = $1 AND printed_at IS NULL`, [
      store.storeId,
    ]);

  async function tagStation(store: TestStore, productId: number, name: string, station: string | null) {
    const tag = await pool.query(
      `INSERT INTO pos_tags (store_id, name, station) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, name, station]
    );
    await pool.query(`INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2)`, [productId, tag.rows[0].id]);
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    routed = await createTestStore('rprint');
    plain = await createTestStore('rprintp');
    for (const store of [routed, plain]) {
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    }
    routedHall = Number(
      (await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Тераса') RETURNING id`, [routed.storeId]))
        .rows[0].id
    );
    plainHall = Number(
      (await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`, [plain.storeId]))
        .rows[0].id
    );

    const soupCard = await seedProduct(routed.storeId, { name: 'Бограч', priceCents: 24000, quantity: 500, attributes: {} });
    const coffeeCard = await seedProduct(routed.storeId, { name: 'Еспресо', priceCents: 6000, quantity: 500, attributes: {} });
    const cakeCard = await seedProduct(routed.storeId, { name: 'Торт', priceCents: 9000, quantity: 500, attributes: {} });
    soup = soupCard.variantId;
    coffee = coffeeCard.variantId;
    cake = cakeCard.variantId;
    await tagStation(routed, soupCard.productId, 'Гаряче', 'kitchen');
    await tagStation(routed, coffeeCard.productId, 'Кава', 'bar');
    // «Торт» wears a tag with no station: the kitchen makes what nobody routed.
    await tagStation(routed, cakeCard.productId, 'Десерти', null);

    plainSoup = (await seedProduct(plain.storeId, { name: 'Борщ', priceCents: 15000, quantity: 500, attributes: {} })).variantId;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(routed?.storeId);
    await dropTestStore(plain?.storeId);
    await pool.end();
  });

  it('queues one ticket per station a round is made at, with only that station\'s lines and no prices', async () => {
    await drain(routed);
    const { roundId } = await fireBill(routed, routedHall, [
      { variant_id: soup, quantity: 2, note: 'без перцю' },
      { variant_id: coffee, quantity: 1 },
      { variant_id: cake, quantity: 1 },
    ]);

    const res = await queue(routed, DEVICE_A, 'kitchen,bar');
    expect(res.statusCode).toBe(200);
    const jobs = res.json().jobs as Array<Record<string, any>>;
    const mine = jobs.filter((j) => j.round_id === roundId);
    expect(mine.map((j) => j.station).sort()).toEqual(['bar', 'kitchen']);

    const kitchen = mine.find((j) => j.station === 'kitchen')!;
    expect(kitchen.heading).toBe('kitchen');
    expect(kitchen.hall_name).toBe('Тераса');
    expect(kitchen.round_seq).toBe(1);
    expect(kitchen.staff_name).toBeTruthy();
    expect(kitchen.items.map((i: any) => i.product_name)).toEqual(['Бограч', 'Торт']);
    expect(kitchen.items[0]).toEqual({
      product_name: 'Бограч',
      variant_label: expect.any(String),
      quantity: 2,
      modifiers: [],
      note: 'без перцю',
    });
    const bar = mine.find((j) => j.station === 'bar')!;
    expect(bar.items.map((i: any) => i.product_name)).toEqual(['Еспресо']);
    expect(JSON.stringify(mine)).not.toMatch(/price|cents/);
  });

  it('asks only for the stations a device prints, and leases a job to the first device', async () => {
    await drain(routed);
    const { roundId } = await fireBill(routed, routedHall, [
      { variant_id: soup, quantity: 1 },
      { variant_id: coffee, quantity: 1 },
    ]);

    const barOnly = (await queue(routed, DEVICE_A, 'bar')).json().jobs as Array<Record<string, any>>;
    expect(barOnly.filter((j) => j.round_id === roundId).map((j) => j.station)).toEqual(['bar']);
    // The bar's job is A's for two minutes; B gets only the kitchen's.
    const other = (await queue(routed, DEVICE_B, 'kitchen,bar')).json().jobs as Array<Record<string, any>>;
    expect(other.filter((j) => j.round_id === roundId).map((j) => j.station)).toEqual(['kitchen']);
    // Asking again, A gets its own job back (the same device may retry).
    const again = (await queue(routed, DEVICE_A, 'bar')).json().jobs as Array<Record<string, any>>;
    expect(again.filter((j) => j.round_id === roundId)).toHaveLength(1);

    // A lease two minutes old is given back.
    await pool.query(
      `UPDATE pos_round_prints SET claimed_at = NOW() - INTERVAL '3 minutes' WHERE round_id = $1 AND station = 'bar'`,
      [roundId]
    );
    const taken = (await queue(routed, DEVICE_B, 'bar')).json().jobs as Array<Record<string, any>>;
    expect(taken.filter((j) => j.round_id === roundId)).toHaveLength(1);
  });

  it('a confirmed ticket never comes back, and confirming twice is harmless', async () => {
    await drain(routed);
    const { roundId } = await fireBill(routed, routedHall, [{ variant_id: soup, quantity: 1 }]);
    expect((await queue(routed, DEVICE_A, 'kitchen')).json().jobs).toHaveLength(1);
    expect((await printed(routed, roundId, 'kitchen')).statusCode).toBe(200);
    expect((await printed(routed, roundId, 'kitchen')).statusCode).toBe(200);
    expect((await queue(routed, DEVICE_A, 'kitchen')).json().jobs).toHaveLength(0);
    expect((await printed(routed, roundId, 'bar')).statusCode).toBe(404);
    expect((await printed(routed, roundId, 'grill')).statusCode).toBe(404);
  });

  it('a round cancelled before it printed is never printed', async () => {
    await drain(routed);
    const { billId, roundId } = await fireBill(routed, routedHall, [{ variant_id: soup, quantity: 1 }]);
    await cancelRound({ storeId: routed.storeId, staffId: routed.ownerId, billId, roundId });
    const jobs = (await queue(routed, DEVICE_A, 'kitchen,bar')).json().jobs as Array<Record<string, any>>;
    expect(jobs.filter((j) => j.round_id === roundId)).toHaveLength(0);
  });

  it('the same tap twice queues the round once', async () => {
    await drain(routed);
    const uuid = '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7';
    const { billId, roundId } = await fireBill(routed, routedHall, [{ variant_id: soup, quantity: 1 }], uuid);
    expect((await fire(routed, billId, uuid)).statusCode).toBe(200);
    const rows = await pool.query(`SELECT station FROM pos_round_prints WHERE round_id = $1`, [roundId]);
    expect(rows.rows.map((r) => r.station)).toEqual(['kitchen']);
  });

  it('a round a guest sent straight to the kitchen is signed as the guest', async () => {
    await drain(routed);
    const { roundId } = await fireBill(routed, routedHall, [{ variant_id: soup, quantity: 1 }]);
    await pool.query(`UPDATE pos_bill_rounds SET fired_by = NULL, fired_by_guest = TRUE WHERE id = $1`, [roundId]);
    const jobs = (await queue(routed, DEVICE_A, 'kitchen')).json().jobs as Array<Record<string, any>>;
    expect(jobs.find((j) => j.round_id === roundId)?.staff_name).toMatch(/Гість/);
  });

  it('a store whose tags name no station gets one ticket with every line and no heading', async () => {
    await drain(plain);
    const { roundId } = await fireBill(plain, plainHall, [{ variant_id: plainSoup, quantity: 3 }]);
    const jobs = (await queue(plain, DEVICE_A)).json().jobs as Array<Record<string, any>>;
    const mine = jobs.filter((j) => j.round_id === roundId);
    expect(mine).toHaveLength(1);
    expect(mine[0].station).toBe('kitchen');
    expect(mine[0].heading).toBeNull();
    expect(mine[0].items).toHaveLength(1);
    expect(mine[0].hall_name).toBe('Зала');
  });

  it('asks for a device id and a known station', async () => {
    const missing = await queue(routed, null, 'kitchen');
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toBe('device_id_required');
    expect((await queue(routed, DEVICE_A, 'grill')).statusCode).toBe(400);
  });

  it('nothing fired before the queue existed is printed', async () => {
    await drain(routed);
    const { roundId } = await fireBill(routed, routedHall, [{ variant_id: soup, quantity: 1 }]);
    // As a round from before migration 109: no job row at all.
    await pool.query(`DELETE FROM pos_round_prints WHERE round_id = $1`, [roundId]);
    const jobs = (await queue(routed, DEVICE_A, 'kitchen,bar')).json().jobs as Array<Record<string, any>>;
    expect(jobs.filter((j) => j.round_id === roundId)).toHaveLength(0);
  });
});
