// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.guest-orders-auto.test.ts — a guest's order sent straight
// to the kitchen when the owner has switched that on (migration 068, phase
// Q9), end to end through the real POS plugin. What is under test:
//
//   - the owner's switch: modes, the limit, and the confirmation of the risks
//     the server insists on before raising the mode;
//   - `reorders` goes past the waiter only when a waiter already opened the
//     table's bill, `all` always, and nothing dearer than the limit does;
//   - an auto-sent order is a round of its OWN rows: the waiter's unsent draft
//     is neither fired nor merged into;
//   - a line that cannot go turns the whole order into an ordinary request,
//     never half of one;
//   - the waiter's notice and «Бачу», which also gives a guest-opened table to
//     the waiter;
//   - who the bill, the kitchen board and the stock say did it.
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
import { GUEST_AUTHOR_NAME } from '../pos/guest-author.js';
import { readStoreClock } from '../pos/core/storeClock.js';

describe.skipIf(!hasDb)('POS guest orders sent straight to the kitchen (Q9)', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let token = '';
  let table5 = 0;
  let table6 = 0;
  let borscht = { productId: 0, variantId: 0 };
  let tea = { productId: 0, variantId: 0 };
  let latteM = 0;
  let oatId = 0;
  let ingredient = 0;

  const patch = (payload: Record<string, unknown>, bearer = cafe.ownerToken) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/public-menu', headers: auth(bearer), payload });
  const settings = async () =>
    (await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(cafe.ownerToken) })).json() as Record<
      string,
      unknown
    >;
  const qs = async (tableId: number) => `?t=${tableId}&k=${(await getTableKeys(cafe.storeId)).get(tableId)}`;
  const send = async (items: unknown[], tableId = table5, id = crypto.randomUUID()) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/public/menu/${token}/orders${await qs(tableId)}`,
      headers: { 'content-type': 'application/json' },
      payload: { client_uuid: id, items } as never,
    });
  const line = (variantId: number, quantity = 1, extra: Record<string, unknown> = {}) => ({
    variant_id: variantId,
    quantity,
    ...extra,
  });
  const feed = (query = '', bearer = cafe.sellerToken) =>
    app.inject({ method: 'GET', url: `/api/pos/guest-orders${query}`, headers: auth(bearer) });
  const seen = (id: number, bearer = cafe.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos/guest-orders/${id}/seen`, headers: auth(bearer) });
  const openBill = (tableId: number, bearer = cafe.sellerToken) =>
    app.inject({ method: 'POST', url: '/api/pos/bills', headers: auth(bearer), payload: { table_id: tableId } });
  const addDraft = (billId: number, payload: Record<string, unknown>, bearer = cafe.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos/bills/${billId}/items`, headers: auth(bearer), payload });
  const getBill = (billId: number) =>
    app.inject({ method: 'GET', url: `/api/pos/bills/${billId}`, headers: auth(cafe.sellerToken) });

  const stockOf = async (variantId: number): Promise<number> =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0]?.quantity ?? 0);
  const orderRow = async (clientUuid: string) =>
    (await pool.query(`SELECT * FROM pos_guest_orders WHERE store_id = $1 AND client_uuid = $2`, [cafe.storeId, clientUuid]))
      .rows[0];
  const billsOf = async (tableId: number) =>
    (await pool.query(`SELECT * FROM pos_bills WHERE store_id = $1 AND table_id = $2 ORDER BY id`, [cafe.storeId, tableId]))
      .rows;
  const roundsOf = async (billId: number) =>
    (await pool.query(`SELECT * FROM pos_bill_rounds WHERE bill_id = $1 ORDER BY seq`, [billId])).rows;

  async function clearTable(tableId: number) {
    await pool.query(`DELETE FROM pos_guest_orders WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId]);
    const rows = await pool.query(`SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId]);
    for (const b of rows.rows) {
      await pool.query(`DELETE FROM pos_bill_item_components WHERE bill_item_id IN (SELECT id FROM pos_bill_items WHERE bill_id = $1)`, [b.id]);
      await pool.query(`DELETE FROM pos_bill_items WHERE bill_id = $1`, [b.id]);
      await pool.query(`DELETE FROM pos_bill_rounds WHERE bill_id = $1`, [b.id]);
    }
    await pool.query(`DELETE FROM pos_bills WHERE store_id = $1 AND table_id = $2`, [cafe.storeId, tableId]);
  }

  /** Put the store in a mode the way the owner's card does: lowering to `off` first, then raising with the confirmation. */
  async function mode(next: 'off' | 'reorders' | 'all', limitCents = 200000) {
    expect((await patch({ auto_kitchen: 'off' })).statusCode).toBe(200);
    expect((await patch({ auto_limit_cents: limitCents })).statusCode).toBe(200);
    if (next !== 'off') expect((await patch({ auto_kitchen: next, auto_kitchen_ack: true })).statusCode).toBe(200);
    resetPublicMenuCache();
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('goauto_cafe');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    const hall = await createHall(cafe.storeId, { name: 'Зала' });
    table5 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '5' })).id;
    table6 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '6' })).id;

    borscht = await seedProduct(cafe.storeId, { name: 'Борщ', priceCents: 19000, quantity: 500 });
    tea = await seedProduct(cafe.storeId, { name: 'Чай', priceCents: 4000, quantity: 500 });
    const oat = await createProduct(cafe.storeId, {
      name: 'Молоко вівсяне',
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, quantity: 5000 }],
    });
    ingredient = (oat!.variants[0] as { id: number }).id;
    const latte = await createProduct(cafe.storeId, {
      name: 'Латте',
      variants: [
        { attributes: { size: 'S' }, price_cents: 5000, quantity: 100 },
        { attributes: { size: 'M' }, price_cents: 6000, quantity: 100 },
      ],
    });
    const sizes = await pool.query(`SELECT id, label FROM pos_variants WHERE product_id = $1`, [latte!.id]);
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
    const answers = await pool.query(`SELECT id, name FROM pos_modifiers WHERE group_id = $1`, [milk.id]);
    oatId = Number(answers.rows.find((r) => r.name === 'вівсяне').id);

    expect((await patch({ enabled: true })).statusCode).toBe(200);
    expect((await patch({ ordering_enabled: true })).statusCode).toBe(200);
    token = String((await settings()).token);
    await getTableKeys(cafe.storeId);
  });

  afterAll(async () => {
    resetPublicMenuCache();
    await dropTestStore(cafe?.storeId);
    await app?.close();
  });

  beforeEach(async () => {
    resetGuestOrderLimits();
    await clearTable(table5);
    await clearTable(table6);
    await pool.query(`UPDATE pos_products SET stop_listed_on = NULL WHERE store_id = $1`, [cafe.storeId]);
    await mode('off');
  });

  describe('the owner’s switch', () => {
    it('is off by default, with a limit, and only the owner may touch it', async () => {
      const fresh = await createTestStore('goauto_fresh');
      try {
        const res = await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(fresh.ownerToken) });
        expect(res.json()).toMatchObject({ auto_kitchen: 'off', auto_limit_cents: 200000, auto_ack_at: null, call_enabled: false });
      } finally {
        await dropTestStore(fresh.storeId);
      }
      expect((await patch({ auto_kitchen: 'all', auto_kitchen_ack: true }, cafe.sellerToken)).statusCode).toBe(403);
    });

    it('refuses to raise the mode without the owner confirming the risks, and records who confirmed and when', async () => {
      const bare = await patch({ auto_kitchen: 'reorders' });
      expect(bare.statusCode).toBe(400);
      expect(bare.json().error).toMatch(/ризики/);
      expect((await settings()).auto_kitchen).toBe('off');

      const before = Date.now();
      const raised = await patch({ auto_kitchen: 'reorders', auto_kitchen_ack: true });
      expect(raised.statusCode).toBe(200);
      expect(raised.json().auto_kitchen).toBe('reorders');
      expect(new Date(String(raised.json().auto_ack_at)).getTime()).toBeGreaterThanOrEqual(before - 1000);
      const who = await pool.query(`SELECT public_menu_auto_ack_by FROM pos_stores WHERE id = $1`, [cafe.storeId]);
      expect(Number(who.rows[0].public_menu_auto_ack_by)).toBe(cafe.ownerId);

      // reorders → all is a raise too.
      expect((await patch({ auto_kitchen: 'all' })).statusCode).toBe(400);
      expect((await patch({ auto_kitchen: 'all', auto_kitchen_ack: true })).json().auto_kitchen).toBe('all');
      // Lowering never needs it: the safer setting is always one tap away.
      expect((await patch({ auto_kitchen: 'reorders' })).json().auto_kitchen).toBe('reorders');
      expect((await patch({ auto_kitchen: 'off' })).json().auto_kitchen).toBe('off');
    });

    it('validates the mode, the confirmation and the limit', async () => {
      expect((await patch({ auto_kitchen: 'sometimes' })).statusCode).toBe(400);
      expect((await patch({ auto_kitchen: 'all', auto_kitchen_ack: 'yes' })).statusCode).toBe(400);
      expect((await patch({ auto_limit_cents: 99 })).statusCode).toBe(400);
      expect((await patch({ auto_limit_cents: 10_000_001 })).statusCode).toBe(400);
      expect((await patch({ auto_limit_cents: 1500.5 })).statusCode).toBe(400);
      expect((await patch({ auto_limit_cents: 150000 })).json().auto_limit_cents).toBe(150000);
    });

    it('needs ordering on, and switching ordering off switches auto-sending off with it', async () => {
      await mode('all');
      const off = await patch({ ordering_enabled: false });
      expect(off.json()).toMatchObject({ ordering_enabled: false, auto_kitchen: 'off' });
      const refused = await patch({ auto_kitchen: 'reorders', auto_kitchen_ack: true });
      expect(refused.statusCode).toBe(409);
      // Back on: ordering returns, auto-sending does not quietly come back.
      expect((await patch({ ordering_enabled: true })).json()).toMatchObject({ ordering_enabled: true, auto_kitchen: 'off' });
    });

    it('tells the page what the cart should say — only for a QR with the table’s key', async () => {
      await mode('reorders', 150000);
      const keyed = await app.inject({ method: 'GET', url: `/m/${token}${await qs(table5)}` });
      expect(keyed.body).toContain('data-order-auto="reorders"');
      expect(keyed.body).toContain('data-order-limit="150000"');
      const bare = await app.inject({ method: 'GET', url: `/m/${token}?t=${table5}` });
      expect(bare.body).not.toContain('data-order-auto');
      await mode('off');
      expect((await app.inject({ method: 'GET', url: `/m/${token}${await qs(table5)}` })).body).not.toContain('data-order-auto');
    });
  });

  describe('«reorders»', () => {
    it('leaves a first order at an empty table to the waiter, exactly as with the switch off', async () => {
      await mode('reorders');
      const res = await send([line(borscht.variantId)]);
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('pending');
      expect(await billsOf(table5)).toHaveLength(0);
    });

    it('sends a reorder at a table a waiter seated: its own round, fired by the guest, stock moved — and the waiter’s draft untouched', async () => {
      await mode('reorders');
      const bill = (await openBill(table5)).json().bill as { id: number };
      // The waiter is typing: one borscht in the draft, not sent yet.
      expect((await addDraft(bill.id, { variant_id: borscht.variantId, quantity: 1 })).statusCode).toBeLessThan(300);
      const borschtBefore = await stockOf(borscht.variantId);
      const teaBefore = await stockOf(tea.variantId);
      const oatBefore = await stockOf(ingredient);

      const res = await send([line(borscht.variantId, 2), line(tea.variantId), line(latteM, 1, { modifiers: [oatId] })]);
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('sent');

      const row = await orderRow(res.json().client_uuid);
      expect(row.status).toBe('sent');
      expect(Number(row.bill_id)).toBe(bill.id);
      expect(Number(row.total_cents)).toBe(19000 * 2 + 4000 + 6000 + 1500);

      const rounds = await roundsOf(bill.id);
      expect(rounds).toHaveLength(1);
      expect(rounds[0].fired_by).toBeNull();
      expect(rounds[0].fired_by_guest).toBe(true);
      expect(Number(rounds[0].guest_order_id)).toBe(Number(row.id));
      expect(rounds[0].client_uuid).toBe(roundUuidFor(Number(row.id)));
      expect(Number(row.round_id)).toBe(Number(rounds[0].id));

      const view = (await getBill(bill.id)).json() as {
        draft: Array<{ variant_id: number; quantity: number; added_by: number | null }>;
        rounds: Array<{ fired_by: number | null; fired_by_name: string; items: Array<{ variant_id: number; quantity: number; added_by: number | null; added_by_name: string }> }>;
        opened_by: number | null;
      };
      // The waiter's line is still a draft of ONE, under the waiter — not merged with the guest's two, not fired.
      expect(view.draft).toEqual([expect.objectContaining({ variant_id: borscht.variantId, quantity: 1, added_by: cafe.sellerId })]);
      expect(view.rounds[0]).toMatchObject({ fired_by: null, fired_by_name: GUEST_AUTHOR_NAME });
      expect(view.rounds[0]!.items.map((i) => [i.variant_id, i.quantity, i.added_by, i.added_by_name])).toEqual([
        [borscht.variantId, 2, null, GUEST_AUTHOR_NAME],
        [tea.variantId, 1, null, GUEST_AUTHOR_NAME],
        [latteM, 1, null, GUEST_AUTHOR_NAME],
      ]);
      expect(view.opened_by).toBe(cafe.sellerId);

      // Stock moved for what the guest sent, and only that: the draft borscht took nothing.
      expect(await stockOf(borscht.variantId)).toBe(borschtBefore - 2);
      expect(await stockOf(tea.variantId)).toBe(teaBefore - 1);
      expect(await stockOf(ingredient)).toBe(oatBefore - 200);
      const movements = await pool.query(
        `SELECT staff_id FROM pos_stock_movements WHERE reference_type = 'bill_round' AND reference_id = $1`,
        [rounds[0].id]
      );
      expect(movements.rows.length).toBeGreaterThan(0);
      expect(movements.rows.every((m) => m.staff_id === null)).toBe(true);
    });

    it('is the kitchen board’s round like any other, signed by the guest', async () => {
      await mode('reorders');
      const bill = (await openBill(table5)).json().bill as { id: number };
      expect((await send([line(tea.variantId)])).json().status).toBe('sent');
      const board = await app.inject({ method: 'GET', url: '/api/pos/kitchen/orders', headers: auth(cafe.sellerToken) });
      expect(board.statusCode).toBe(200);
      const orders = (board.json().orders ?? board.json()) as Array<{ kind: string; title: string; staff_name: string }>;
      const round = orders.find((o) => o.kind === 'round' && o.title.startsWith('Стіл 5'));
      expect(round).toMatchObject({ staff_name: GUEST_AUTHOR_NAME });
      expect(bill.id).toBeGreaterThan(0);
    });

    it('is idempotent on the uuid: a retry is the same order and fires nothing a second time', async () => {
      await mode('reorders');
      const bill = (await openBill(table5)).json().bill as { id: number };
      const id = crypto.randomUUID();
      const first = await send([line(borscht.variantId)], table5, id);
      const again = await send([line(borscht.variantId)], table5, id);
      expect(first.json().status).toBe('sent');
      expect(again.statusCode).toBe(201);
      expect(again.json().status).toBe('sent');
      expect(await roundsOf(bill.id)).toHaveLength(1);
    });

    it('leaves an order above the limit to the waiter', async () => {
      await mode('reorders', 20000);
      await openBill(table5);
      const cheap = await send([line(borscht.variantId)]); // 190 ₴ ≤ 200 ₴
      const dear = await send([line(borscht.variantId), line(tea.variantId)]); // 230 ₴ > 200 ₴
      expect(cheap.json().status).toBe('sent');
      expect(dear.json().status).toBe('pending');
      expect(Number((await orderRow(dear.json().client_uuid)).total_cents)).toBe(23000);
    });

    it('turns the WHOLE order into a request for the waiter when one dish cannot go — no half of it in the kitchen', async () => {
      await mode('reorders');
      const bill = (await openBill(table5)).json().bill as { id: number };
      const teaBefore = await stockOf(tea.variantId);
      // The menu the guest ordered from was read before the stop: the request passes the menu check,
      // the kitchen-side check refuses the dish.
      resetPublicMenuCache();
      await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` });
      const { today } = await readStoreClock(cafe.storeId);
      await pool.query(`UPDATE pos_products SET stop_listed_on = $2 WHERE id = $1`, [borscht.productId, today]);
      const res = await send([line(tea.variantId), line(borscht.variantId)]);
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('pending');
      expect(await roundsOf(bill.id)).toHaveLength(0);
      expect((await getBill(bill.id)).json().draft).toEqual([]);
      expect(await stockOf(tea.variantId)).toBe(teaBefore);
      // And the waiter sees it as an ordinary request, the stopped dish named.
      const waiting = (await feed()).json() as { orders: Array<{ lines: Array<{ name: string; problem: string | null }> }> };
      expect(waiting.orders).toHaveLength(1);
      expect(waiting.orders[0]!.lines.find((l) => l.name === 'Борщ')?.problem).toMatch(/стоп/);
    });
  });

  describe('«all»', () => {
    it('opens the bill of an empty table by itself, with no waiter behind it, and fires the round', async () => {
      await mode('all');
      const res = await send([line(tea.variantId, 2)]);
      expect(res.json().status).toBe('sent');
      const [bill] = await billsOf(table5);
      expect(bill).toBeDefined();
      expect(bill.opened_by).toBeNull();
      expect(bill.opened_by_guest).toBe(true);
      expect(await roundsOf(Number(bill.id))).toHaveLength(1);

      const view = (await getBill(Number(bill.id))).json();
      expect(view).toMatchObject({ opened_by: null, opened_by_name: GUEST_AUTHOR_NAME });
      const map = await app.inject({ method: 'GET', url: '/api/pos/bills', headers: auth(cafe.sellerToken) });
      const tile = (map.json().bills ?? map.json()) as Array<{ table_id: number; opened_by: number | null; opened_by_name: string }>;
      expect(tile.find((b) => b.table_id === table5)).toMatchObject({ opened_by: null, opened_by_name: GUEST_AUTHOR_NAME });
    });
  });

  describe('the waiter’s notice and «Бачу»', () => {
    it('shows an auto-sent order until a waiter says «Бачу», then not', async () => {
      await mode('all');
      const res = await send([line(tea.variantId), line(borscht.variantId)]);
      const id = Number((await orderRow(res.json().client_uuid)).id);

      const before = (await feed()).json() as { orders: unknown[]; sent: Array<Record<string, unknown>>; calls: unknown[] };
      expect(before.orders).toEqual([]);
      expect(before.calls).toEqual([]);
      expect(before.sent).toEqual([
        expect.objectContaining({
          id,
          table_id: table5,
          table_name: '5',
          round_seq: 1,
          bill_opened_by_guest: true,
          total_cents: 23000,
          lines: [
            expect.objectContaining({ name: 'Чай', quantity: 1 }),
            expect.objectContaining({ name: 'Борщ', quantity: 1 }),
          ],
        }),
      ]);
      expect((await feed(`?table_id=${table6}`)).json().sent).toEqual([]);

      const ack = await seen(id);
      expect(ack.statusCode).toBe(200);
      expect(ack.json()).toMatchObject({ seen: true });
      expect((await feed()).json().sent).toEqual([]);
      // Twice is fine.
      expect((await seen(id)).statusCode).toBe(200);
    });

    it('gives a table a guest’s order opened to the first waiter who says «Бачу» — and only that one', async () => {
      await mode('all');
      const res = await send([line(tea.variantId)]);
      const id = Number((await orderRow(res.json().client_uuid)).id);
      await seen(id, cafe.sellerToken);
      const [bill] = await billsOf(table5);
      expect(Number(bill.opened_by)).toBe(cafe.sellerId);
      // A second order at the now-seated table is a reorder; the owner's «Бачу» does not take the table over.
      const next = await send([line(tea.variantId)]);
      await seen(Number((await orderRow(next.json().client_uuid)).id), cafe.ownerToken);
      expect(Number((await billsOf(table5))[0].opened_by)).toBe(cafe.sellerId);
    });

    it('refuses «Бачу» on a request that waits for acceptance, and on another store’s order', async () => {
      const res = await send([line(tea.variantId)]);
      const id = Number((await orderRow(res.json().client_uuid)).id);
      expect((await seen(id)).statusCode).toBe(409);
      const stranger = await createTestStore('goauto_stranger');
      try {
        await mode('all');
        const sent = await send([line(tea.variantId)], table6);
        const sentId = Number((await orderRow(sent.json().client_uuid)).id);
        expect((await seen(sentId, stranger.sellerToken)).statusCode).toBe(404);
      } finally {
        await dropTestStore(stranger.storeId);
      }
    });

    it('stops showing the notice once the bill is paid or cancelled', async () => {
      await mode('all');
      await send([line(tea.variantId)]);
      const [bill] = await billsOf(table5);
      await pool.query(`UPDATE pos_bills SET status = 'cancelled' WHERE id = $1`, [bill.id]);
      expect((await feed()).json().sent).toEqual([]);
    });

    it('cancelling an auto-sent round gives the stock back, as for a waiter’s', async () => {
      await mode('all');
      const before = await stockOf(tea.variantId);
      await send([line(tea.variantId, 3)]);
      const [bill] = await billsOf(table5);
      const [round] = await roundsOf(Number(bill.id));
      expect(await stockOf(tea.variantId)).toBe(before - 3);
      const cancel = await app.inject({
        method: 'POST',
        url: `/api/pos/bills/${bill.id}/rounds/${round.id}/cancel`,
        headers: auth(cafe.sellerToken),
      });
      expect(cancel.statusCode).toBe(200);
      expect(await stockOf(tea.variantId)).toBe(before);
    });

    it('cannot be accepted or cancelled by the guest — it is already in the kitchen', async () => {
      await mode('all');
      const res = await send([line(tea.variantId)]);
      const id = Number((await orderRow(res.json().client_uuid)).id);
      const accept = await app.inject({ method: 'POST', url: `/api/pos/guest-orders/${id}/accept`, headers: auth(cafe.sellerToken), payload: {} });
      expect(accept.statusCode).toBe(409);
      expect(accept.json().error).toMatch(/на кухні/);
      const cancel = await app.inject({
        method: 'POST',
        url: `/api/pos/public/menu/${token}/orders/${res.json().client_uuid}/cancel${await qs(table5)}`,
      });
      expect(cancel.statusCode).toBe(409);
      expect(cancel.json().error).toMatch(/на кухні/);
    });
  });
});
