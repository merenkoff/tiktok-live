// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.waiter-calls.test.ts — a guest at a table calls a waiter
// or asks for the bill from the QR menu, and a waiter answers «Іду»
// (migration 068, phase Q8), end to end through the real POS plugin. What is
// under test: the owner's switch and the single 404 for every way of being
// wrong; one live call per table and kind however many times it is tapped;
// the minute after an answer; expiry; and that a guest sees only their own
// table's calls and nothing of the waiter.
// TechDocs/POS_QR_MENU.md.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { createHall, createTable } from '../pos/tables.service.js';
import { resetPublicMenuCache } from '../pos/public-menu/menu.service.js';
import { getTableKeys } from '../pos/public-menu/table-keys.js';
import { resetWaiterCallLimits } from '../pos/waiter-calls.service.js';

describe.skipIf(!hasDb)('POS waiter calls (Q8)', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let other: TestStore;
  let token = '';
  let otherToken = '';
  let table5 = 0;
  let table6 = 0;
  let foreignTable = 0;

  const patch = (store: TestStore, payload: Record<string, unknown>, bearer = store.ownerToken) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/public-menu', headers: auth(bearer), payload });
  const settings = async (store: TestStore) =>
    (await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(store.ownerToken) })).json() as Record<
      string,
      unknown
    >;
  const qs = async (tableId: number, store = cafe) => `?t=${tableId}&k=${(await getTableKeys(store.storeId)).get(tableId)}`;
  const call = async (kind: unknown, query?: string, t = token) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/public/menu/${t}/calls${query ?? (await qs(table5))}`,
      headers: { 'content-type': 'application/json' },
      payload: { kind } as never,
    });
  const mine = async (query?: string, t = token) =>
    app.inject({ method: 'GET', url: `/api/pos/public/menu/${t}/calls${query ?? (await qs(table5))}` });
  const cancel = async (kind: string, query?: string, t = token) =>
    app.inject({ method: 'POST', url: `/api/pos/public/menu/${t}/calls/${kind}/cancel${query ?? (await qs(table5))}` });
  const feed = (query = '', bearer = cafe.sellerToken) =>
    app.inject({ method: 'GET', url: `/api/pos/guest-orders${query}`, headers: auth(bearer) });
  const answer = (id: number, bearer = cafe.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos/waiter-calls/${id}/answer`, headers: auth(bearer) });
  const liveCalls = async () =>
    (await feed()).json().calls as Array<{ id: number; kind: string; table_id: number; table_name: string; hall_name: string; has_open_bill: boolean }>;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('wcall_cafe');
    other = await createTestStore('wcall_other');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [[cafe.storeId, other.storeId]]);
    const hall = await createHall(cafe.storeId, { name: 'Тераса' });
    table5 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '5' })).id;
    table6 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '6' })).id;
    const elsewhere = await createHall(other.storeId, { name: 'Чужа зала' });
    foreignTable = (await createTable(other.storeId, { hall_id: elsewhere.id, name: '5' })).id;
    for (const store of [cafe, other]) {
      expect((await patch(store, { enabled: true })).statusCode).toBe(200);
      expect((await patch(store, { call_enabled: true })).statusCode).toBe(200);
    }
    token = String((await settings(cafe)).token);
    otherToken = String((await settings(other)).token);
    await getTableKeys(cafe.storeId);
    await getTableKeys(other.storeId);
  });

  afterAll(async () => {
    resetPublicMenuCache();
    for (const store of [cafe, other]) await dropTestStore(store?.storeId);
    await app?.close();
  });

  beforeEach(async () => {
    resetWaiterCallLimits();
    await pool.query(`DELETE FROM pos_waiter_calls WHERE store_id = ANY($1::bigint[])`, [[cafe.storeId, other.storeId]]);
    resetPublicMenuCache();
  });

  describe('the owner’s switch', () => {
    it('is off by default and the owner’s alone, and tells the page where to call only with the table’s key', async () => {
      const fresh = await createTestStore('wcall_fresh');
      try {
        const res = await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(fresh.ownerToken) });
        expect(res.json().call_enabled).toBe(false);
      } finally {
        await dropTestStore(fresh.storeId);
      }
      expect((await patch(cafe, { call_enabled: true }, cafe.sellerToken)).statusCode).toBe(403);
      expect((await patch(cafe, { call_enabled: 'yes' })).statusCode).toBe(400);

      const keyed = await app.inject({ method: 'GET', url: `/m/${token}${await qs(table5)}` });
      expect(keyed.body).toContain(`data-call-url="/api/pos/public/menu/${token}/calls"`);
      for (const query of ['', `?t=${table5}`, `?t=${table5}&k=wrong`]) {
        expect((await app.inject({ method: 'GET', url: `/m/${token}${query}` })).body, query).not.toContain('data-call-url');
      }
    });
  });

  describe('what a stranger cannot do', () => {
    it('gets the same 404 for a wrong token, key, table or switch — on all three endpoints', async () => {
      const key6 = (await getTableKeys(cafe.storeId)).get(table6);
      const foreignKey = (await getTableKeys(other.storeId)).get(foreignTable);
      const queries = ['', `?t=${table5}`, `?t=${table5}&k=nope`, `?t=${table5}&k=${key6}`, `?t=${foreignTable}&k=${foreignKey}`, '?t=abc&k=x'];
      const bodies = new Set<string>();
      for (const query of queries) {
        for (const res of [await call('waiter', query), await mine(query), await cancel('waiter', query)]) {
          expect(res.statusCode, query).toBe(404);
          bodies.add(res.body);
        }
      }
      for (const res of [await call('waiter', undefined, 'no-such-token-xx'), await call('waiter', undefined, otherToken)]) {
        expect(res.statusCode).toBe(404);
        bodies.add(res.body);
      }
      await patch(cafe, { call_enabled: false });
      resetPublicMenuCache();
      const off = await call('waiter');
      expect(off.statusCode).toBe(404);
      bodies.add(off.body);
      await patch(cafe, { call_enabled: true });
      expect(bodies.size).toBe(1);
      expect((await pool.query(`SELECT COUNT(*) AS n FROM pos_waiter_calls WHERE store_id = $1`, [cafe.storeId])).rows[0].n).toBe('0');
    });

    it('refuses a kind that is not «waiter» or «bill»', async () => {
      expect((await call('dessert')).statusCode).toBe(400);
      expect((await call(undefined)).statusCode).toBe(400);
      expect((await cancel('dessert')).statusCode).toBe(400);
    });
  });

  describe('a call', () => {
    it('is one live call per table and kind, however many times it is tapped — two kinds are two calls', async () => {
      const first = await call('waiter');
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({ kind: 'waiter', status: 'pending', answered_at: null });
      const [a, b] = await Promise.all([call('waiter'), call('waiter')]);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      expect((await call('bill')).json().kind).toBe('bill');
      const rows = await pool.query(`SELECT kind FROM pos_waiter_calls WHERE store_id = $1 ORDER BY kind`, [cafe.storeId]);
      expect(rows.rows.map((r) => r.kind)).toEqual(['bill', 'waiter']);
    });

    it('reaches the waiter with its table and hall, and «Іду» answers it — twice is fine', async () => {
      await call('bill');
      const [live] = await liveCalls();
      expect(live).toMatchObject({ kind: 'bill', table_id: table5, table_name: '5', hall_name: 'Тераса', has_open_bill: false });
      expect((await feed(`?table_id=${table6}`)).json().calls).toEqual([]);

      const first = await answer(live!.id);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ status: 'answered', already: false });
      expect((await answer(live!.id)).json()).toEqual({ status: 'answered', already: true });
      expect(await liveCalls()).toEqual([]);

      // The guest's phone reads «Офіціант іде».
      const seen = (await mine()).json().calls as Array<{ kind: string; status: string; answered_at: string | null }>;
      expect(seen).toEqual([expect.objectContaining({ kind: 'bill', status: 'answered' })]);
      expect(seen[0]!.answered_at).not.toBeNull();
      expect(Object.keys(seen[0]!).sort()).toEqual(['answered_at', 'created_at', 'kind', 'status']);
    });

    it('cannot be called again for a minute after a waiter answered — then it can', async () => {
      await call('waiter');
      const [live] = await liveCalls();
      await answer(live!.id);
      const soon = await call('waiter');
      expect(soon.statusCode).toBe(429);
      // Another kind, or another table, is not held back by it.
      expect((await call('bill')).statusCode).toBe(201);
      expect((await call('waiter', await qs(table6))).statusCode).toBe(201);
      resetWaiterCallLimits();
      expect((await call('waiter')).statusCode).toBe(201);
    });

    it('can be taken back by the guest while it is live, after which «Іду» is a 409', async () => {
      await call('waiter');
      const [live] = await liveCalls();
      expect((await cancel('waiter')).json()).toEqual({ cancelled: true });
      expect((await cancel('waiter')).statusCode).toBe(200);
      expect(await liveCalls()).toEqual([]);
      const late = await answer(live!.id);
      expect(late.statusCode).toBe(409);
      expect(late.json().error).toMatch(/скасував/);
    });

    it('expires after its time: the waiter no longer sees it, the guest reads «expired» and may call again', async () => {
      await call('waiter');
      const [live] = await liveCalls();
      await pool.query(`UPDATE pos_waiter_calls SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [live!.id]);
      expect(await liveCalls()).toEqual([]);
      expect((await mine()).json().calls).toEqual([expect.objectContaining({ kind: 'waiter', status: 'expired' })]);
      expect((await answer(live!.id)).statusCode).toBe(409);
      expect((await call('waiter')).json().status).toBe('pending');
    });

    it('is shown to a guest only at their own table, and to a waiter only of their own store', async () => {
      await call('waiter');
      expect((await mine(await qs(table6))).json().calls).toEqual([]);
      const [live] = await liveCalls();
      expect((await feed('', other.sellerToken)).json().calls).toEqual([]);
      expect((await answer(live!.id, other.sellerToken)).statusCode).toBe(404);
      expect((await feed('', '')).statusCode).toBe(401);
    });
  });
});
