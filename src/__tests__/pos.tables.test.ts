// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.tables.test.ts — the room (migration 052, phase К4a).
//
// Halls and tables only; the bill that sits on one is К4b. What this pins:
// a store with no halls gets an empty list rather than a refusal, a table is
// named uniquely per store, the layout is written in one batch that fails
// whole, and a table some bill sat at is retired instead of deleted — which
// is the rule that keeps the history behind a sale readable.
// See TechDocs/POS_TABLES.md §8.1, §10.

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
  type TestStore,
} from './helpers/pos-fixtures.js';
import { listHalls } from '../pos/tables.service.js';

describe.skipIf(!hasDb)('POS halls and tables', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;
  let mainHall = 0;
  let terrace = 0;
  let otherHall = 0;

  const get = (token: string) =>
    app.inject({ method: 'GET', url: '/api/pos/halls', headers: auth(token) });
  const post = (url: string, payload: unknown, token = store.ownerToken) =>
    app.inject({ method: 'POST', url: `/api/pos${url}`, headers: auth(token), payload });
  const patch = (url: string, payload: unknown, token = store.ownerToken) =>
    app.inject({ method: 'PATCH', url: `/api/pos${url}`, headers: auth(token), payload });
  const del = (url: string, token = store.ownerToken) =>
    app.inject({ method: 'DELETE', url: `/api/pos${url}`, headers: auth(token) });

  /** A bill on `tableId`, inserted straight — the service that opens one is К4b. */
  async function seatBill(tableId: number, billNo: number): Promise<number> {
    const row = await pool.query(
      `INSERT INTO pos_bills (store_id, table_id, bill_no, opened_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [store.storeId, tableId, billNo, store.sellerId]
    );
    return Number(row.rows[0].id);
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('tables');
    other = await createTestStore('tables2');
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
  });

  it('answers an empty room with an empty list, not a refusal', async () => {
    const res = await get(store.ownerToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ halls: [] });
  });

  it('creates halls and shows them to the waiter, not only the owner', async () => {
    const first = await post('/halls', { name: 'Зала', sort_order: 1 });
    expect(first.statusCode).toBe(200);
    mainHall = first.json().id;
    const second = await post('/halls', { name: 'Тераса', sort_order: 2 });
    terrace = second.json().id;
    otherHall = (
      await app.inject({
        method: 'POST',
        url: '/api/pos/halls',
        headers: auth(other.ownerToken),
        payload: { name: 'Зала' },
      })
    ).json().id;

    // §4.7 — everyone sees every table, so a seller reads the map too.
    const seen = await get(store.sellerToken);
    expect(seen.statusCode).toBe(200);
    expect(seen.json().halls.map((h: { name: string }) => h.name)).toEqual(['Зала', 'Тераса']);
    expect(seen.json().halls[0].tables).toEqual([]);
  });

  it('refuses furniture changes to a seller', async () => {
    const res = await post('/halls', { name: 'Кухня' }, store.sellerToken);
    expect(res.statusCode).toBe(403);
  });

  it('names a table uniquely per store, and only per store', async () => {
    const five = await post('/tables', { hall_id: mainHall, name: '5', seats: 4 });
    expect(five.statusCode).toBe(200);
    expect(five.json()).toMatchObject({ name: '5', seats: 4, shape: 'rect', is_active: true });

    const again = await post('/tables', { hall_id: terrace, name: '5' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/уже є/);

    // The neighbouring restaurant has its own fifth table.
    const elsewhere = await app.inject({
      method: 'POST',
      url: '/api/pos/tables',
      headers: auth(other.ownerToken),
      payload: { hall_id: otherHall, name: '5' },
    });
    expect(elsewhere.statusCode).toBe(200);
  });

  it('refuses input that cannot be a floor plan', async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ hall_id: mainHall, name: '  ' }, /назв/i],
      [{ hall_id: mainHall, name: 'A', width: 0 }, /Ширина/],
      [{ hall_id: mainHall, name: 'B', pos_x: -1 }, /Координата X/],
      [{ hall_id: mainHall, name: 'C', shape: 'oval' }, /rect або round/],
      [{ hall_id: mainHall, name: 'D', seats: 0 }, /місць/],
    ];
    for (const [payload, message] of cases) {
      const res = await post('/tables', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(message);
    }
    // A hall of another store is 404, never 403: we do not confirm it exists.
    const foreign = await post('/tables', { hall_id: otherHall, name: 'E' });
    expect(foreign.statusCode).toBe(404);
  });

  it('moves a table between halls and retires it without deleting', async () => {
    const six = (await post('/tables', { hall_id: mainHall, name: '6' })).json();
    const moved = await patch(`/tables/${six.id}`, { hall_id: terrace, seats: 6 });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ hall_id: terrace, seats: 6 });

    const off = await patch(`/tables/${six.id}`, { is_active: false });
    expect(off.json().is_active).toBe(false);
    // Retired tables sort behind the live ones, they do not disappear.
    const halls = await listHalls(store.storeId);
    const onTerrace = halls.find((h) => h.id === terrace)!.tables;
    expect(onTerrace.map((t) => t.name)).toContain('6');
  });

  it('writes a dragged layout in one batch, and fails it whole', async () => {
    const a = (await post('/tables', { hall_id: mainHall, name: '10' })).json();
    const b = (await post('/tables', { hall_id: mainHall, name: '11' })).json();

    const ok = await patch('/tables/positions', {
      positions: [
        { id: a.id, pos_x: 3, pos_y: 4, width: 2, height: 2 },
        { id: b.id, pos_x: 7, pos_y: 1, width: 3, height: 2 },
      ],
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().tables).toHaveLength(2);

    // One id this store does not own refuses the whole batch — a partial save
    // the editor cannot see is worse than a refusal it can.
    const bad = await patch('/tables/positions', {
      positions: [
        { id: a.id, pos_x: 99, pos_y: 99, width: 1, height: 1 },
        { id: 999_999_999, pos_x: 1, pos_y: 1, width: 1, height: 1 },
      ],
    });
    expect(bad.statusCode).toBe(404);
    const still = await pool.query(`SELECT pos_x FROM pos_tables WHERE id = $1`, [a.id]);
    expect(Number(still.rows[0].pos_x)).toBe(3);
  });

  it('deletes a table nobody sat at, and refuses one that seated a bill', async () => {
    const spare = (await post('/tables', { hall_id: terrace, name: '20' })).json();
    expect((await del(`/tables/${spare.id}`)).statusCode).toBe(200);

    const seated = (await post('/tables', { hall_id: terrace, name: '21' })).json();
    await seatBill(seated.id, 1);
    const refused = await del(`/tables/${seated.id}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/Вимкніть стіл/);

    const alive = await pool.query(`SELECT 1 FROM pos_tables WHERE id = $1`, [seated.id]);
    expect(alive.rowCount).toBe(1);

    // And the hall holding it is just as undeletable, for the same reason.
    const hall = await del(`/halls/${terrace}`);
    expect(hall.statusCode).toBe(409);
    expect(hall.json().error).toMatch(/Вимкніть зал/);
  });

  it('keeps one open bill per table at the level of the database', async () => {
    const twoTop = (await post('/tables', { hall_id: mainHall, name: '30' })).json();
    await seatBill(twoTop.id, 2);
    await expect(seatBill(twoTop.id, 3)).rejects.toThrow();

    // A paid bill frees the table; the partial index only guards `open`.
    await pool.query(`UPDATE pos_bills SET status = 'paid' WHERE table_id = $1`, [twoTop.id]);
    await expect(seatBill(twoTop.id, 4)).resolves.toBeGreaterThan(0);
  });

  it('404s on a hall of another store rather than admitting it exists', async () => {
    expect((await patch(`/halls/${otherHall}`, { name: 'Мій' })).statusCode).toBe(404);
    expect((await del(`/halls/${otherHall}`)).statusCode).toBe(404);
    expect((await patch(`/tables/${999_999_999}`, { seats: 2 })).statusCode).toBe(404);
  });
});
