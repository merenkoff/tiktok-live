// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.guest-orders.test.ts — a guest asks for dishes from the QR
// menu and a waiter accepts (migration 058, phase Q6), end to end through the
// real POS plugin. The rule under test: NOTHING a guest sends reaches the
// bill, the stock or the kitchen until a waiter accepts it — and everything a
// stranger with a photographed QR could try is refused with the same 404 or a
// bounded, named error.
// TechDocs/POS_QR_MENU.md.

import crypto from 'crypto';
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
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import * as modifiers from '../pos/modifiers.service.js';
import { createProduct } from '../pos/products.service.js';
import { createHall, createTable } from '../pos/tables.service.js';
import { resetPublicMenuCache } from '../pos/public-menu/menu.service.js';
import { getTableKeys } from '../pos/public-menu/table-keys.js';
import { resetGuestOrderLimits, roundUuidFor } from '../pos/guest-orders.service.js';

describe.skipIf(!hasDb)('POS guest orders (Q6)', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let other: TestStore;
  let boutique: TestStore;
  let token = '';
  let otherToken = '';
  let table5 = 0;
  let table6 = 0;
  let foreignTable = 0;
  let borscht = { productId: 0, variantId: 0 };
  let tea = { productId: 0, variantId: 0 };
  let cheesecake = { productId: 0, variantId: 0 };
  let foreignDish = { productId: 0, variantId: 0 };
  let ingredient = 0;
  let latteS = 0;
  let latteM = 0;
  let oatId = 0;
  let plainId = 0;

  const patch = (store: TestStore, payload: Record<string, unknown>, bearer = store.ownerToken) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/public-menu', headers: auth(bearer), payload });
  const settings = async (store: TestStore) =>
    (await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(store.ownerToken) })).json() as Record<
      string,
      unknown
    >;
  const qs = async (tableId: number, store = cafe) => `?t=${tableId}&k=${(await getTableKeys(store.storeId)).get(tableId)}`;
  const send = async (payload: unknown, query?: string, t = token) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/public/menu/${t}/orders${query ?? (await qs(table5))}`,
      headers: { 'content-type': 'application/json' },
      payload: payload as never,
    });
  const own = async (ids: string[], query?: string, t = token) => {
    const q = query ?? (await qs(table5));
    return app.inject({ method: 'GET', url: `/api/pos/public/menu/${t}/orders${q}${q.includes('?') ? '&' : '?'}ids=${ids.join(',')}` });
  };
  const cancel = async (id: string, query?: string, t = token) =>
    app.inject({ method: 'POST', url: `/api/pos/public/menu/${t}/orders/${id}/cancel${query ?? (await qs(table5))}` });
  const uuid = () => crypto.randomUUID();
  const line = (variantId: number, quantity = 1, extra: Record<string, unknown> = {}) => ({ variant_id: variantId, quantity, ...extra });
  const order = (items: unknown[], id = uuid()) => ({ client_uuid: id, items });

  const waiting = (bearer = cafe.sellerToken, query = '') =>
    app.inject({ method: 'GET', url: `/api/pos/guest-orders${query}`, headers: auth(bearer) });
  const accept = (id: number, payload: Record<string, unknown> = {}, bearer = cafe.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos/guest-orders/${id}/accept`, headers: auth(bearer), payload });
  const reject = (id: number, payload: Record<string, unknown> = {}, bearer = cafe.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos/guest-orders/${id}/reject`, headers: auth(bearer), payload });

  const stockOf = async (variantId: number): Promise<number> =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0]?.quantity ?? 0);
  const counts = async (tableId: number) => ({
    bills: Number((await pool.query(`SELECT COUNT(*) AS n FROM pos_bills WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId])).rows[0].n),
    items: Number(
      (
        await pool.query(
          `SELECT COUNT(*) AS n FROM pos_bill_items i JOIN pos_bills b ON b.id = i.bill_id WHERE b.store_id = $1 AND b.table_id = $2`,
          [cafe.storeId, tableId]
        )
      ).rows[0].n
    ),
    rounds: Number(
      (
        await pool.query(
          `SELECT COUNT(*) AS n FROM pos_bill_rounds r JOIN pos_bills b ON b.id = r.bill_id WHERE b.store_id = $1 AND b.table_id = $2`,
          [cafe.storeId, tableId]
        )
      ).rows[0].n
    ),
  });
  const orderId = async (clientUuid: string): Promise<number> =>
    Number((await pool.query(`SELECT id FROM pos_guest_orders WHERE store_id = $1 AND client_uuid = $2`, [cafe.storeId, clientUuid])).rows[0].id);
  /** Free a table of whatever the last test left on it. */
  async function clearTable(tableId: number) {
    await pool.query(`DELETE FROM pos_guest_orders WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId]);
    const bills = await pool.query(`SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId]);
    for (const b of bills.rows) {
      await pool.query(`UPDATE pos_bill_items SET sale_id = NULL WHERE bill_id = $1`, [b.id]);
      await pool.query(`DELETE FROM pos_bill_items WHERE bill_id = $1`, [b.id]);
      await pool.query(`DELETE FROM pos_bill_rounds WHERE bill_id = $1`, [b.id]);
    }
    await pool.query(`DELETE FROM pos_bills WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId]);
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('gord_cafe');
    other = await createTestStore('gord_other');
    boutique = await createTestStore('gord_boutique');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [[cafe.storeId, other.storeId]]);

    const hall = await createHall(cafe.storeId, { name: 'Зала' });
    table5 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '5' })).id;
    table6 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '6' })).id;
    const elsewhere = await createHall(other.storeId, { name: 'Чужа зала' });
    foreignTable = (await createTable(other.storeId, { hall_id: elsewhere.id, name: '5' })).id;

    borscht = await seedProduct(cafe.storeId, { name: 'Борщ', priceCents: 19000, quantity: 500 });
    tea = await seedProduct(cafe.storeId, { name: 'Чай', priceCents: 4000, quantity: 500 });
    cheesecake = await seedProduct(cafe.storeId, { name: 'Сирник', priceCents: 9000, quantity: 0 });
    foreignDish = await seedProduct(other.storeId, { name: 'Чужа страва', priceCents: 1000, quantity: 50 });
    const oat = await createProduct(cafe.storeId, {
      name: 'Молоко вівсяне',
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, quantity: 5000 }],
    });
    ingredient = (oat!.variants[0] as { id: number }).id;

    // A latte with two sizes and ONE REQUIRED question, so the group rules have something to refuse.
    const latte = await createProduct(cafe.storeId, {
      name: 'Латте',
      variants: [
        { attributes: { size: 'S' }, price_cents: 5000, quantity: 100 },
        { attributes: { size: 'M' }, price_cents: 6000, quantity: 100 },
      ],
    });
    // By caption, not by position: the card does not promise the order it lists its sizes in.
    const sizes = await pool.query(`SELECT id, label FROM pos_variants WHERE product_id = $1`, [latte!.id]);
    latteS = Number(sizes.rows.find((r) => r.label === 'S').id);
    latteM = Number(sizes.rows.find((r) => r.label === 'M').id);
    let milk = await modifiers.createGroup(cafe.storeId, { name: 'Молоко', min_select: 1, max_select: 1 });
    milk = await modifiers.createModifier(cafe.storeId, milk.id, { name: 'звичайне', is_default: true });
    milk = await modifiers.createModifier(cafe.storeId, milk.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: ingredient,
      component_quantity: 200,
    });
    await modifiers.setProductGroups(cafe.storeId, latte!.id, [milk.id]);
    const groups = await pool.query(`SELECT id, name FROM pos_modifiers WHERE group_id = $1 ORDER BY id`, [milk.id]);
    plainId = Number(groups.rows.find((r) => r.name === 'звичайне').id);
    oatId = Number(groups.rows.find((r) => r.name === 'вівсяне').id);

    expect((await patch(cafe, { enabled: true })).statusCode).toBe(200);
    expect((await patch(other, { enabled: true })).statusCode).toBe(200);
    expect((await patch(cafe, { ordering_enabled: true })).statusCode).toBe(200);
    expect((await patch(other, { ordering_enabled: true })).statusCode).toBe(200);
    token = String((await settings(cafe)).token);
    otherToken = String((await settings(other)).token);
    await getTableKeys(cafe.storeId);
    await getTableKeys(other.storeId);
  });

  afterAll(async () => {
    resetPublicMenuCache();
    for (const store of [cafe, other, boutique]) await dropTestStore(store?.storeId);
    await app?.close();
  });

  beforeEach(async () => {
    resetGuestOrderLimits();
    await clearTable(table5);
    await clearTable(table6);
    await pool.query(`UPDATE pos_products SET stop_listed_on = NULL WHERE store_id = $1`, [cafe.storeId]);
    resetPublicMenuCache();
  });

  describe('the owner’s ordering switch', () => {
    it('is off by default, is the owner’s alone, and has a kitchen for a precondition', async () => {
      expect((await settings(boutique)).ordering_enabled).toBe(false);
      expect((await patch(boutique, { ordering_enabled: true })).statusCode).toBe(409);
      expect((await patch(cafe, { ordering_enabled: true }, cafe.sellerToken)).statusCode).toBe(403);
      expect((await patch(cafe, { ordering_enabled: 'yes' })).statusCode).toBe(400);
      const off = await patch(cafe, { ordering_enabled: false });
      expect(off.json()).toMatchObject({ ordering_enabled: false, enabled: true });
      expect((await patch(cafe, { ordering_enabled: true })).json().ordering_enabled).toBe(true);
    });

    it('puts «Додати» and a cart on the page only for a QR that carries this table’s key', async () => {
      const keyed = await app.inject({ method: 'GET', url: `/m/${token}${await qs(table5)}` });
      expect(keyed.body).toContain(`data-order-url="/api/pos/public/menu/${token}/orders"`);
      expect(keyed.body).toContain('data-add=');
      expect(keyed.body).toContain('data-cart-open');
      for (const query of ['', `?t=${table5}`, `?t=${table5}&k=wrong`]) {
        const res = await app.inject({ method: 'GET', url: `/m/${token}${query}` });
        expect(res.body, query).not.toContain('data-order-url');
        expect(res.body, query).not.toContain('data-add=');
      }
      await patch(cafe, { ordering_enabled: false });
      resetPublicMenuCache();
      expect((await app.inject({ method: 'GET', url: `/m/${token}${await qs(table5)}` })).body).not.toContain('data-add=');
      await patch(cafe, { ordering_enabled: true });
    });
  });

  describe('what a stranger cannot do', () => {
    it('gets the same 404 for a wrong token, key, table or switch — on all three endpoints', async () => {
      const good = await qs(table5);
      const key6 = (await getTableKeys(cafe.storeId)).get(table6);
      const foreignKey = (await getTableKeys(other.storeId)).get(foreignTable);
      const queries = [
        '',
        `?t=${table5}`,
        `?t=${table5}&k=`,
        `?t=${table5}&k=nope`,
        `?t=${table5}&k=${key6}`,
        `?t=${foreignTable}&k=${foreignKey}`,
        `?t=abc&k=x`,
      ];
      const bodies = new Set<string>();
      const id = uuid();
      for (const query of queries) {
        for (const res of [await send(order([line(borscht.variantId)]), query), await own([id], query), await cancel(id, query)]) {
          expect(res.statusCode, query).toBe(404);
          bodies.add(res.body);
        }
      }
      for (const res of [
        await send(order([line(borscht.variantId)]), good, 'no-such-token-xx'),
        await send(order([line(borscht.variantId)]), good, otherToken), // right key, another store's menu
      ]) {
        expect(res.statusCode).toBe(404);
        bodies.add(res.body);
      }
      expect(bodies.size).toBe(1);
      expect((await pool.query(`SELECT COUNT(*) AS n FROM pos_guest_orders WHERE store_id = $1`, [cafe.storeId])).rows[0].n).toBe('0');

      await patch(cafe, { ordering_enabled: false });
      resetPublicMenuCache();
      const off = await send(order([line(borscht.variantId)]));
      expect(off.statusCode).toBe(404);
      expect(bodies.has(off.body)).toBe(true);
      await patch(cafe, { ordering_enabled: true });
    });

    it('cannot send a dish the menu does not offer, or one that cannot be had today', async () => {
      const cases: Array<[string, unknown, number]> = [
        ['a dish of another restaurant', line(foreignDish.variantId), 400],
        ['an ingredient (not for sale)', line(ingredient), 400],
        ['an id that is no dish', line(99999999), 400],
        ['a dish with no stock', line(cheesecake.variantId), 409],
      ];
      for (const [name, item, status] of cases) {
        const res = await send(order([item]));
        expect(res.statusCode, name).toBe(status);
      }
      // A stopped dish is refused with its name.
      await app.inject({
        method: 'POST',
        url: `/api/pos/kitchen/stop-list/${borscht.productId}`,
        headers: auth(cafe.sellerToken),
        payload: { stop_listed: true },
      });
      resetPublicMenuCache();
      const stopped = await send(order([line(borscht.variantId)]));
      expect(stopped.statusCode).toBe(409);
      expect(stopped.json().error).toContain('Борщ');
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
    });

    it('is held to the same answers a waiter’s tap is: a required question, a foreign answer, a repeated one', async () => {
      const noAnswer = await send(order([line(latteS)]));
      expect(noAnswer.statusCode).toBe(400);
      expect(noAnswer.json().error).toContain('Молоко');
      expect((await send(order([line(latteS, 1, { modifiers: [oatId, plainId] })]))).statusCode).toBe(400); // max 1
      expect((await send(order([line(latteS, 1, { modifiers: [oatId, oatId] })]))).statusCode).toBe(400);
      expect((await send(order([line(borscht.variantId, 1, { modifiers: [oatId] })]))).statusCode).toBe(400); // not this dish's
      expect((await send(order([line(latteS, 1, { modifiers: ['x'] })]))).statusCode).toBe(400);
      const ok = await send(order([line(latteM, 2, { modifiers: [oatId], note: 'гарячіше' })]));
      expect(ok.statusCode).toBe(201);
      expect(ok.json().lines).toEqual([{ name: 'Латте', caption: 'M · вівсяне', quantity: 2, note: 'гарячіше' }]);
    });

    it('is bounded: lines, quantity, size of the body, and how many requests one table may have waiting', async () => {
      expect((await send(order([]))).statusCode).toBe(400);
      expect((await send({ client_uuid: uuid() })).statusCode).toBe(400);
      expect((await send({ client_uuid: 'not-a-uuid', items: [line(borscht.variantId)] })).statusCode).toBe(400);
      expect((await send(order(Array.from({ length: 31 }, () => line(borscht.variantId))))).statusCode).toBe(400);
      for (const quantity of [0, 21, 1.5, '3x', -1]) {
        expect((await send(order([line(borscht.variantId, quantity as number)]))).statusCode, String(quantity)).toBe(400);
      }
      expect((await send(order([line(borscht.variantId, 1, { note: 'x'.repeat(121) })]))).statusCode).toBe(400);
      const huge = await send(order([line(borscht.variantId, 1, { note: 'x'.repeat(9000) })]));
      expect(huge.statusCode).toBe(413);

      for (let i = 0; i < 3; i += 1) expect((await send(order([line(tea.variantId)]))).statusCode).toBe(201);
      const fourth = await send(order([line(tea.variantId)]));
      expect(fourth.statusCode).toBe(429);
      // Another table is not held up by this one.
      expect((await send(order([line(tea.variantId)]), await qs(table6))).statusCode).toBe(201);
    });

    it('is throttled per table over a window, and the throttle does not bite a retry of a request it has already let in', async () => {
      const first = order([line(tea.variantId)]);
      expect((await send(first)).statusCode).toBe(201);
      for (let i = 0; i < 7; i += 1) {
        const res = await send(order([line(tea.variantId)]));
        expect([201, 429]).toContain(res.statusCode);
        if (res.statusCode === 201) {
          const id = res.json().client_uuid as string;
          await cancel(id); // keeps the pending cap out of the way of what this test measures
        }
      }
      // A replay of `first` is the same request, whatever the allowance says.
      const replay = await send(first);
      expect(replay.statusCode).toBe(201);
      expect(replay.json().client_uuid).toBe(first.client_uuid);
    });
  });

  describe('a request', () => {
    it('touches neither the bill, nor the stock, nor the kitchen', async () => {
      const before = await stockOf(borscht.variantId);
      const res = await send(order([line(borscht.variantId, 3), line(tea.variantId)]));
      expect(res.statusCode).toBe(201);
      const view = res.json();
      expect(Object.keys(view).sort()).toEqual(['client_uuid', 'created_at', 'expires_at', 'lines', 'reason', 'status']);
      expect(view.status).toBe('pending');
      expect(view.lines.map((l: { name: string; quantity: number }) => [l.name, l.quantity])).toEqual([['Борщ', 3], ['Чай', 1]]);
      expect(JSON.stringify(view)).not.toMatch(/display_name|staff|store_id|table_id|bill/);
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
      expect(await stockOf(borscht.variantId)).toBe(before);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is idempotent on its uuid: a retry is the same request, and another table cannot claim it', async () => {
      const body = order([line(borscht.variantId)]);
      const a = await send(body);
      const b = await send(body);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      expect(b.json().client_uuid).toBe(a.json().client_uuid);
      expect((await pool.query(`SELECT COUNT(*) AS n FROM pos_guest_orders WHERE client_uuid = $1`, [body.client_uuid])).rows[0].n).toBe('1');
      expect((await send(body, await qs(table6))).statusCode).toBe(409);
      // Two taps racing land on one row.
      const race = order([line(tea.variantId)]);
      const [x, y] = await Promise.all([send(race), send(race)]);
      expect([x.statusCode, y.statusCode].sort()).toEqual([201, 201]);
      expect((await pool.query(`SELECT COUNT(*) AS n FROM pos_guest_orders WHERE client_uuid = $1`, [race.client_uuid])).rows[0].n).toBe('1');
    });

    it('is shown only to the phone that knows its uuid, and only at its own table', async () => {
      const mine = order([line(borscht.variantId)]);
      const theirs = order([line(tea.variantId)]);
      await send(mine);
      await send(theirs, await qs(table6));
      const seen = (await own([mine.client_uuid, theirs.client_uuid, 'junk', ''])).json().orders as Array<{ client_uuid: string }>;
      expect(seen.map((o) => o.client_uuid)).toEqual([mine.client_uuid]);
      // A list of ids is capped, and junk in it is ignored.
      const many = await own(Array.from({ length: 40 }, () => uuid()));
      expect(many.statusCode).toBe(200);
      expect(many.json().orders).toEqual([]);
    });

    it('can be cancelled by the guest while it waits, and twice, but not after a waiter took it', async () => {
      const a = order([line(borscht.variantId)]);
      await send(a);
      const first = await cancel(a.client_uuid);
      expect(first.statusCode).toBe(200);
      expect(first.json().status).toBe('cancelled');
      expect((await cancel(a.client_uuid)).statusCode).toBe(200);
      expect((await cancel(uuid())).statusCode).toBe(404);
      expect((await cancel('nope')).statusCode).toBe(404);
      expect((await waiting()).json().orders).toEqual([]);

      const b = order([line(borscht.variantId)]);
      await send(b);
      expect((await accept(await orderId(b.client_uuid))).statusCode).toBe(200);
      const late = await cancel(b.client_uuid);
      expect(late.statusCode).toBe(409);
      expect(late.json().error).toContain('офіціант');
    });

    it('is refused by accept the moment it is past its time, even if nobody has looked at it since', async () => {
      const a = order([line(borscht.variantId)]);
      await send(a);
      const id = await orderId(a.client_uuid);
      await pool.query(`UPDATE pos_guest_orders SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [id]);
      // Straight to accept: no read has marked it expired yet, so this is accept's own check.
      const late = await accept(id);
      expect(late.statusCode).toBe(409);
      expect(late.json().error).toContain('застарів');
      expect((await pool.query(`SELECT status FROM pos_guest_orders WHERE id = $1`, [id])).rows[0].status).toBe('expired');
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
    });

    it('goes stale: after its time it is no request — for the guest, for the waiter, and for accept', async () => {
      const a = order([line(borscht.variantId)]);
      await send(a);
      const id = await orderId(a.client_uuid);
      await pool.query(`UPDATE pos_guest_orders SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [id]);
      expect((await own([a.client_uuid])).json().orders[0].status).toBe('expired');
      expect((await waiting()).json().orders).toEqual([]);
      const late = await accept(id);
      expect(late.statusCode).toBe(409);
      expect(late.json().error).toContain('застарів');
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
    });
  });

  describe('the waiter’s side', () => {
    it('asks for a session, and shows a waiter only their own store’s requests', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/pos/guest-orders' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/pos/guest-orders/1/accept', payload: {} })).statusCode).toBe(401);
      const a = order([line(borscht.variantId)]);
      await send(a);
      expect((await waiting(other.sellerToken)).json().orders).toEqual([]);
      const id = await orderId(a.client_uuid);
      expect((await accept(id, {}, other.sellerToken)).statusCode).toBe(404);
      expect((await reject(id, {}, other.sellerToken)).statusCode).toBe(404);
      expect((await accept(99999999)).statusCode).toBe(404);
      expect((await accept(Number('abc') as number)).statusCode).toBe(404);
    });

    it('lists what is waiting with its table and lines, and names a line that can no longer be had', async () => {
      await send(order([line(borscht.variantId, 2), line(tea.variantId)]));
      await send(order([line(tea.variantId)]), await qs(table6));
      const all = (await waiting()).json().orders;
      expect(all).toHaveLength(2);
      expect(all[0]).toMatchObject({ table_name: '5', hall_name: 'Зала', has_open_bill: false });
      expect(all[0].lines.map((l: { name: string; quantity: number; problem: string | null }) => [l.name, l.quantity, l.problem])).toEqual([
        ['Борщ', 2, null],
        ['Чай', 1, null],
      ]);
      expect((await waiting(cafe.sellerToken, `?table_id=${table6}`)).json().orders).toHaveLength(1);
      expect((await waiting(cafe.sellerToken, '?table_id=x')).statusCode).toBe(400);

      await app.inject({
        method: 'POST',
        url: `/api/pos/kitchen/stop-list/${tea.productId}`,
        headers: auth(cafe.sellerToken),
        payload: { stop_listed: true },
      });
      const after = (await waiting()).json().orders[0];
      expect(after.lines.find((l: { name: string }) => l.name === 'Чай').problem).toBe('сьогодні в стоп-листі');
    });

    it('accepts onto a free table: opens the bill, puts the lines in under THE WAITER, sends the round, moves the stock once', async () => {
      const beforeBorscht = await stockOf(borscht.variantId);
      const req = order([line(borscht.variantId, 2), line(tea.variantId)]);
      await send(req);
      const id = await orderId(req.client_uuid);

      const res = await accept(id, { guests: 3 });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ fired: true, warning: null, already: false });
      expect(body.bill.status).toBe('open');
      expect(body.bill.table_id).toBe(table5);
      expect(body.bill.guests).toBe(3);
      expect(body.bill.opened_by).toBe(cafe.sellerId);
      expect(body.bill.draft).toEqual([]);
      expect(body.bill.rounds).toHaveLength(1);
      expect(body.bill.rounds[0].fired_by).toBe(cafe.sellerId);
      expect(body.bill.rounds[0].items.map((i: { product_name: string; quantity: number; added_by: number }) => [i.product_name, i.quantity, i.added_by])).toEqual([
        ['Борщ', 2, cafe.sellerId],
        ['Чай', 1, cafe.sellerId],
      ]);
      expect(body.bill.fired_total_cents).toBe(2 * 19000 + 4000);
      expect(await stockOf(borscht.variantId)).toBe(beforeBorscht - 2);

      const row = (await pool.query(`SELECT status, bill_id, decided_by FROM pos_guest_orders WHERE id = $1`, [id])).rows[0];
      expect(row).toMatchObject({ status: 'accepted', decided_by: String(cafe.sellerId) });
      expect(Number(row.bill_id)).toBe(body.bill.id);
      // The guest's phone reads the answer.
      expect((await own([req.client_uuid])).json().orders[0].status).toBe('accepted');
      expect((await waiting()).json().orders).toEqual([]);
    });

    it('answers a second accept with the same bill and does nothing again', async () => {
      const req = order([line(borscht.variantId)]);
      await send(req);
      const id = await orderId(req.client_uuid);
      expect((await accept(id)).json().fired).toBe(true);
      const stock = await stockOf(borscht.variantId);
      const again = await accept(id);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ already: true, fired: false });
      expect(await counts(table5)).toEqual({ bills: 1, items: 1, rounds: 1 });
      expect(await stockOf(borscht.variantId)).toBe(stock);
      // Two waiters tapping at once: still one round.
      const req2 = order([line(tea.variantId)]);
      await send(req2);
      const id2 = await orderId(req2.client_uuid);
      const [x, y] = await Promise.all([accept(id2), accept(id2)]);
      expect([x.statusCode, y.statusCode]).toEqual([200, 200]);
      expect((await counts(table5)).rounds).toBe(2);
    });

    it('adds to a bill that is already open — and leaves the waiter’s own unsent lines in the draft, unfired', async () => {
      const bill = (await app.inject({ method: 'POST', url: '/api/pos/bills', headers: auth(cafe.sellerToken), payload: { table_id: table5 } })).json().bill;
      await app.inject({
        method: 'POST',
        url: `/api/pos/bills/${bill.id}/items`,
        headers: auth(cafe.sellerToken),
        payload: { variant_id: tea.variantId, quantity: 4 },
      });
      const req = order([line(borscht.variantId)]);
      await send(req);
      const res = await accept(await orderId(req.client_uuid));
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.bill.id).toBe(bill.id);
      expect(body.fired).toBe(false);
      expect(body.warning).toContain('чернетці');
      expect(body.bill.rounds).toEqual([]);
      expect(body.bill.draft.map((l: { product_name: string; quantity: number }) => [l.product_name, l.quantity]).sort()).toEqual([
        ['Борщ', 1],
        ['Чай', 4],
      ]);
      expect((await counts(table5)).rounds).toBe(0);
    });

    it('merges a request into the waiter’s identical draft line, the way a second tap would', async () => {
      const bill = (await app.inject({ method: 'POST', url: '/api/pos/bills', headers: auth(cafe.sellerToken), payload: { table_id: table5 } })).json().bill;
      await app.inject({
        method: 'POST',
        url: `/api/pos/bills/${bill.id}/items`,
        headers: auth(cafe.sellerToken),
        payload: { variant_id: tea.variantId, quantity: 1 },
      });
      const req = order([line(tea.variantId, 2)]);
      await send(req);
      const res = await accept(await orderId(req.client_uuid));
      expect(res.json().bill.draft.map((l: { quantity: number }) => l.quantity)).toEqual([3]);
    });

    it('is ATOMIC: a dish that ran out refuses the whole accept, opens no bill, names the line — and the rest can be accepted without it', async () => {
      const req = order([line(borscht.variantId), line(tea.variantId, 2)]);
      await send(req);
      const id = await orderId(req.client_uuid);
      const items = (await pool.query(`SELECT id, product_name FROM pos_guest_order_items WHERE order_id = $1 ORDER BY id`, [id])).rows;
      const teaItem = Number(items.find((r) => r.product_name === 'Чай').id);

      await app.inject({
        method: 'POST',
        url: `/api/pos/kitchen/stop-list/${tea.productId}`,
        headers: auth(cafe.sellerToken),
        payload: { stop_listed: true },
      });
      const refused = await accept(id);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ item_id: teaItem });
      expect(refused.json().error).toContain('Чай');
      // Nothing half-done: no bill for the table, no lines, and the request is still waiting.
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
      expect((await pool.query(`SELECT status FROM pos_guest_orders WHERE id = $1`, [id])).rows[0].status).toBe('pending');

      const partial = await accept(id, { exclude_item_ids: [teaItem] });
      expect(partial.statusCode).toBe(200);
      expect(partial.json().bill.rounds[0].items.map((i: { product_name: string }) => i.product_name)).toEqual(['Борщ']);
    });

    it('refuses to accept what the waiter has struck out entirely, and junk exclusions', async () => {
      const req = order([line(borscht.variantId)]);
      await send(req);
      const id = await orderId(req.client_uuid);
      const only = Number((await pool.query(`SELECT id FROM pos_guest_order_items WHERE order_id = $1`, [id])).rows[0].id);
      const none = await accept(id, { exclude_item_ids: [only] });
      expect(none.statusCode).toBe(400);
      expect(none.json().error).toContain('відхиліть');
      expect((await accept(id, { exclude_item_ids: 'all' })).statusCode).toBe(400);
      expect((await accept(id, { exclude_item_ids: ['x'] })).statusCode).toBe(400);
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
    });

    it('refuses a table that has been taken off the plan since', async () => {
      const req = order([line(borscht.variantId)]);
      await send(req);
      const id = await orderId(req.client_uuid);
      await pool.query(`UPDATE pos_tables SET is_active = FALSE WHERE id = $1`, [table5]);
      try {
        const res = await accept(id);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toContain('прибрано');
      } finally {
        await pool.query(`UPDATE pos_tables SET is_active = TRUE WHERE id = $1`, [table5]);
      }
    });

    it('rejects with a reason the guest can read, twice over, and then refuses to accept it', async () => {
      const req = order([line(borscht.variantId)]);
      await send(req);
      const id = await orderId(req.client_uuid);
      const rejected = await reject(id, { reason: 'Борщ закінчився' });
      expect(rejected.statusCode).toBe(200);
      expect(rejected.json()).toEqual({ status: 'rejected' });
      expect((await reject(id)).statusCode).toBe(200);
      const view = (await own([req.client_uuid])).json().orders[0];
      expect(view).toMatchObject({ status: 'rejected', reason: 'Борщ закінчився' });
      const late = await accept(id);
      expect(late.statusCode).toBe(409);
      expect((await cancel(req.client_uuid)).statusCode).toBe(409);
      expect(await counts(table5)).toEqual({ bills: 0, items: 0, rounds: 0 });
      // The body is checked before the state: a reason that is not text is a 400 even on a settled request.
      expect((await reject(id, { reason: 5 })).statusCode).toBe(400);
    });

    it('cannot reject a request that was already accepted', async () => {
      const req = order([line(borscht.variantId)]);
      await send(req);
      const id = await orderId(req.client_uuid);
      await accept(id);
      const res = await reject(id);
      expect(res.statusCode).toBe(409);
    });
  });

  it('fires an accepted request’s round under a stable uuid, so a retried accept can never fire twice', () => {
    expect(roundUuidFor(7)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(roundUuidFor(7)).toBe(roundUuidFor(7));
    expect(roundUuidFor(7)).not.toBe(roundUuidFor(8));
  });
});
