// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.remote-kitchen.test.ts — «Віддалена кухня» (migration 117,
// TechDocs/POS_REMOTE_KITCHEN.md, phase РК1).
//
// What is pinned here: a cafe with no link has no kitchen; the owner marks
// which dishes the kitchen cooks; a request within the auto-confirm threshold
// is quoted by itself, a longer one waits for the kitchen, and a retried tap
// is the same request; the kitchen answers only the revision it saw; the
// phone fallback opens only after the kitchen's time to answer; a paused
// kitchen and a stopped dish are refused by name; payment is the gate — it
// numbers the order and moves the KITCHEN's stock, never the cafe's; a time
// that ran out cannot be paid, unless the sale was made before it ran out;
// each side does only its own steps and a third store sees nothing; a paid
// order cancelled gives the kitchen back exactly what it took.

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
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import * as rk from '../pos/remote-kitchen.service.js';
import { readStoreClock } from '../pos/core/storeClock.js';
import { listOpenOrders } from '../pos/kitchen.service.js';

describe('remote kitchen estimate', () => {
  it('rounds every promise up to five minutes, never below five', () => {
    expect(rk.roundUpToFive(21)).toBe(25);
    expect(rk.roundUpToFive(25)).toBe(25);
    expect(rk.roundUpToFive(0)).toBe(5);
  });

  it('takes the longest dish, plus the queue and the road', () => {
    const est = rk.estimate([{ prepMinutes: 12 }, { prepMinutes: 18 }], 10, 10);
    expect(est).toEqual({ prep: 18, load: 10, transit: 10, total: 40 });
  });

  it('leaves the suggestion empty when a dish has no time set', () => {
    expect(rk.estimate([{ prepMinutes: 12 }, { prepMinutes: null }], 0, 10).total).toBeNull();
  });
});

describe.skipIf(!hasDb)('POS remote kitchen («Віддалена кухня»)', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let kitchen: TestStore;
  let stranger: TestStore;
  let lonely: TestStore;
  let linkId = 0;
  // cafe dishes and their kitchen twins
  let cafePizza = 0;
  let kitchenPizza = 0;
  let cafeRoll = 0;
  let kitchenRoll = 0;
  let kitchenPizzaProduct = 0;
  let kitchenRollProduct = 0;
  let receiptSeq = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('rk_cafe');
    kitchen = await createTestStore('rk_kitchen');
    stranger = await createTestStore('rk_stranger');
    lonely = await createTestStore('rk_lonely');

    ({ variantId: cafePizza } = await seedProduct(cafe.storeId, { name: 'Маргарита', quantity: 5 }));
    ({ variantId: cafeRoll } = await seedProduct(cafe.storeId, { name: 'Філадельфія', quantity: 5 }));
    const kp = await seedProduct(kitchen.storeId, { name: 'Маргарита (кухня)', quantity: 20 });
    const kr = await seedProduct(kitchen.storeId, { name: 'Філадельфія (кухня)', quantity: 20 });
    kitchenPizza = kp.variantId;
    kitchenPizzaProduct = kp.productId;
    kitchenRoll = kr.variantId;
    kitchenRollProduct = kr.productId;
    await pool.query(`UPDATE pos_products SET prep_minutes = 15 WHERE id = $1`, [kitchenPizzaProduct]);
    await pool.query(`UPDATE pos_products SET prep_minutes = 40 WHERE id = $1`, [kitchenRollProduct]);

    const link = await rk.createLink({
      cafe_store_id: cafe.storeId,
      kitchen_store_id: kitchen.storeId,
      kitchen_title: 'Кухня Пульчинелли',
      kitchen_phone: '+380000000000',
      transit_minutes: 10,
    });
    linkId = link.id;
  });

  afterAll(async () => {
    await app?.close();
    for (const s of [cafe, kitchen, stranger, lonely]) await dropTestStore(s?.storeId);
  });

  const ask = (items: Array<{ variant_id: number; quantity: number }>, uuid = randomUUID(), token = cafe.sellerToken) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/remote-kitchen/orders',
      headers: auth(token),
      payload: { client_uuid: uuid, items, guest_label: 'Стіл 3' },
    });
  const step = (token: string, id: number, path: string, payload: Record<string, unknown> = {}, method = 'POST') =>
    app.inject({
      method: method as 'POST',
      url: `/api/pos/remote-kitchen/orders/${id}/${path}`,
      headers: auth(token),
      payload,
    });
  const stockOf = async (variantId: number) =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);
  const sale = async (storeId: number, staffId: number, createdAt?: Date) => {
    receiptSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_sales (store_id, staff_id, receipt_number, created_at)
       VALUES ($1, $2, $3, COALESCE($4, NOW())) RETURNING id`,
      [storeId, staffId, `RK-${Date.now()}-${receiptSeq}`, createdAt ?? null]
    );
    return Number(row.rows[0].id);
  };

  it('a store with no link has no kitchen, and cannot ask one', async () => {
    const setup = await app.inject({
      method: 'GET',
      url: '/api/pos/remote-kitchen/setup',
      headers: auth(lonely.sellerToken),
    });
    expect(setup.statusCode).toBe(200);
    expect(setup.json()).toEqual({ as_cafe: null, as_kitchen: null });
    const res = await ask([{ variant_id: cafePizza, quantity: 1 }], randomUUID(), lonely.sellerToken);
    expect(res.statusCode).toBe(404);
  });

  it('only the owner marks which dishes the kitchen cooks', async () => {
    const asSeller = await app.inject({
      method: 'PUT',
      url: `/api/pos/remote-kitchen/link/items/${cafePizza}`,
      headers: auth(cafe.sellerToken),
      payload: { kitchen_variant_id: kitchenPizza },
    });
    expect(asSeller.statusCode).toBe(403);

    // A kitchen dish must be the kitchen's: the cafe's own variant is refused.
    const wrong = await app.inject({
      method: 'PUT',
      url: `/api/pos/remote-kitchen/link/items/${cafePizza}`,
      headers: auth(cafe.ownerToken),
      payload: { kitchen_variant_id: cafeRoll },
    });
    expect(wrong.statusCode).toBe(404);

    for (const [c, k] of [
      [cafePizza, kitchenPizza],
      [cafeRoll, kitchenRoll],
    ]) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/pos/remote-kitchen/link/items/${c}`,
        headers: auth(cafe.ownerToken),
        payload: { kitchen_variant_id: k },
      });
      expect(res.statusCode).toBe(200);
    }

    const setup = await app.inject({ method: 'GET', url: '/api/pos/remote-kitchen/setup', headers: auth(cafe.sellerToken) });
    const body = setup.json();
    expect(body.as_cafe.link.kitchen_title).toBe('Кухня Пульчинелли');
    expect(body.as_cafe.link.answer_seconds).toBe(60);
    expect(body.as_cafe.link.auto_confirm_max_min).toBe(40);
    expect(body.as_cafe.items.map((i: { cafe_variant_id: number }) => i.cafe_variant_id).sort()).toEqual(
      [cafePizza, cafeRoll].sort()
    );

    const kitchenSetup = await app.inject({
      method: 'GET',
      url: '/api/pos/remote-kitchen/setup',
      headers: auth(kitchen.sellerToken),
    });
    expect(kitchenSetup.json().as_kitchen.status.accepting).toBe(true);
  });

  it('a short order is confirmed by itself, and a retried tap is the same request', async () => {
    const uuid = randomUUID();
    const first = await ask([{ variant_id: cafePizza, quantity: 2 }], uuid);
    expect(first.statusCode).toBe(201);
    const order = first.json();
    // 15 min pizza + 0 queue + 10 road = 25, within the 40-minute threshold.
    expect(order.status).toBe('quoted');
    expect(order.quote_source).toBe('auto');
    expect(order.quoted_minutes).toBe(25);
    expect(order.items[0].kitchen_variant_id).toBe(kitchenPizza);

    const again = await ask([{ variant_id: cafePizza, quantity: 2 }], uuid);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(order.id);
  });

  it('a long order waits for the kitchen, which answers only the revision it saw', async () => {
    const res = await ask([
      { variant_id: cafePizza, quantity: 1 },
      { variant_id: cafeRoll, quantity: 1 },
    ]);
    const order = res.json();
    // 40 min roll + 10 road = 50 > 40: no auto-confirm.
    expect(order.status).toBe('requested');
    expect(order.suggested_minutes).toBe(50);
    expect(order.answer_overdue).toBe(false);

    const inbox = await app.inject({
      method: 'GET',
      url: '/api/pos/remote-kitchen/orders?side=kitchen',
      headers: auth(kitchen.sellerToken),
    });
    expect(inbox.json().orders.map((o: { id: number }) => o.id)).toContain(order.id);

    const stale = await step(kitchen.sellerToken, order.id, 'quote', { minutes: 35, revision: 2 });
    expect(stale.statusCode).toBe(409);

    // The cafe cannot answer for the kitchen.
    const byCafe = await step(cafe.sellerToken, order.id, 'quote', { minutes: 35, revision: 1 });
    expect(byCafe.statusCode).toBe(409);

    const ok = await step(kitchen.sellerToken, order.id, 'quote', { minutes: 33, revision: 1 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('quoted');
    expect(ok.json().quote_source).toBe('kitchen');
    expect(ok.json().quoted_minutes).toBe(45); // 33 + 10, rounded up to 45
  });

  it('the phone fallback opens only once the kitchen is past its time to answer', async () => {
    const order = (await ask([{ variant_id: cafeRoll, quantity: 1 }])).json();
    expect(order.status).toBe('requested');

    const early = await step(cafe.sellerToken, order.id, 'phone-quote', { minutes: 50 });
    expect(early.statusCode).toBe(409);

    await pool.query(`UPDATE pos_remote_orders SET answer_deadline_at = NOW() - interval '1 second' WHERE id = $1`, [
      order.id,
    ]);
    const overdue = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${order.id}`,
      headers: auth(cafe.sellerToken),
    });
    expect(overdue.json().answer_overdue).toBe(true);
    expect(overdue.json().kitchen_phone).toBe('+380000000000');

    const phoned = await step(cafe.sellerToken, order.id, 'phone-quote', { minutes: 48 });
    expect(phoned.statusCode).toBe(200);
    expect(phoned.json().quote_source).toBe('phone');
    expect(phoned.json().quoted_minutes).toBe(50);
  });

  it('payment numbers the order and moves the kitchen’s stock, not the cafe’s', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 3 }])).json();
    expect(order.status).toBe('quoted');
    const kitchenBefore = await stockOf(kitchenPizza);
    const cafeBefore = await stockOf(cafePizza);

    // The kitchen cannot report the cafe's payment.
    const saleId = await sale(cafe.storeId, cafe.sellerId);
    const byKitchen = await step(kitchen.sellerToken, order.id, 'paid', { sale_id: saleId });
    expect(byKitchen.statusCode).toBe(409);

    // Another store's receipt does not pay this order.
    const foreign = await sale(stranger.storeId, stranger.sellerId);
    expect((await step(cafe.sellerToken, order.id, 'paid', { sale_id: foreign })).statusCode).toBe(404);

    const paid = await step(cafe.sellerToken, order.id, 'paid', { sale_id: saleId });
    expect(paid.statusCode).toBe(200);
    const body = paid.json();
    expect(body.status).toBe('cooking');
    expect(body.order_no).toBeGreaterThanOrEqual(1);
    expect(body.promised_at).not.toBeNull();
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore - 3);
    expect(await stockOf(cafePizza)).toBe(cafeBefore);

    // Same sale again: the same order, nothing moves twice.
    const again = await step(cafe.sellerToken, order.id, 'paid', { sale_id: saleId });
    expect(again.statusCode).toBe(200);
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore - 3);
    // A second sale cannot pay it again.
    const other = await sale(cafe.storeId, cafe.sellerId);
    expect((await step(cafe.sellerToken, order.id, 'paid', { sale_id: other })).statusCode).toBe(409);

    // Kitchen: ready, dispatched; cafe: arrived, handed over.
    expect((await step(cafe.sellerToken, order.id, 'ready')).statusCode).toBe(409);
    expect((await step(kitchen.sellerToken, order.id, 'delay', { minutes: 10 })).json().quoted_minutes).toBe(
      body.quoted_minutes + 10
    );
    expect((await step(kitchen.sellerToken, order.id, 'ready')).json().status).toBe('ready');
    expect((await step(kitchen.sellerToken, order.id, 'dispatched')).json().status).toBe('dispatched');
    expect((await step(kitchen.sellerToken, order.id, 'arrived')).statusCode).toBe(409);
    expect((await step(cafe.sellerToken, order.id, 'arrived')).json().status).toBe('arrived');
    const handed = await step(cafe.sellerToken, order.id, 'handed');
    expect(handed.json().status).toBe('handed_over');
    expect(handed.json().closed_at).not.toBeNull();

    const events = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${order.id}/events`,
      headers: auth(kitchen.sellerToken),
    });
    const kinds = events.json().events.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['requested', 'auto_quoted', 'paid', 'delayed', 'ready', 'dispatched', 'arrived', 'handed_over'])
    );
  });

  it('a third store sees nothing of the order', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${order.id}`,
      headers: auth(stranger.sellerToken),
    });
    expect(res.statusCode).toBe(404);
    expect((await step(stranger.sellerToken, order.id, 'guest-declined')).statusCode).toBe(404);
    expect((await step(cafe.sellerToken, order.id, 'guest-declined')).json().status).toBe('guest_declined');
  });

  it('a time that ran out cannot be paid, unless the sale was made before it ran out', async () => {
    const late = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    await pool.query(`UPDATE pos_remote_orders SET quote_expires_at = NOW() - interval '1 minute' WHERE id = $1`, [
      late.id,
    ]);
    const lateSale = await sale(cafe.storeId, cafe.sellerId);
    const refused = await step(cafe.sellerToken, late.id, 'paid', { sale_id: lateSale });
    expect(refused.statusCode).toBe(409);
    const view = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${late.id}`,
      headers: auth(cafe.sellerToken),
    });
    expect(view.json().status).toBe('expired');

    const intime = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    const soldAt = new Date(Date.now() - 2 * 60_000);
    await pool.query(`UPDATE pos_remote_orders SET quote_expires_at = NOW() - interval '1 minute' WHERE id = $1`, [
      intime.id,
    ]);
    const earlySale = await sale(cafe.storeId, cafe.sellerId, soldAt);
    const ok = await step(cafe.sellerToken, intime.id, 'paid', { sale_id: earlySale });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('cooking');
  });

  it('the kitchen marks a dish «немає», and the cashier asks again without it', async () => {
    const order = (
      await ask([
        { variant_id: cafePizza, quantity: 1 },
        { variant_id: cafeRoll, quantity: 1 },
      ])
    ).json();
    const rollLine = order.items.find((i: { cafe_variant_id: number }) => i.cafe_variant_id === cafeRoll);
    const declined = await step(kitchen.sellerToken, order.id, 'decline', {
      problems: [{ item_id: rollLine.id, problem: 'stop' }],
      revision: 1,
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json().status).toBe('declined');
    expect(declined.json().items.find((i: { id: number }) => i.id === rollLine.id).problem).toBe('stop');

    const revised = await step(
      cafe.sellerToken,
      order.id,
      'items',
      { revision: 1, items: [{ variant_id: cafePizza, quantity: 1 }] },
      'PUT'
    );
    expect(revised.statusCode).toBe(200);
    expect(revised.json().revision).toBe(2);
    expect(revised.json().status).toBe('quoted'); // pizza alone is within the threshold
    expect(revised.json().items).toHaveLength(1);
  });

  it('a paused kitchen and a stopped dish are refused, with the phone and the dish named', async () => {
    const pause = await app.inject({
      method: 'PUT',
      url: '/api/pos/remote-kitchen/status',
      headers: auth(kitchen.sellerToken),
      payload: { accepting: false, pause_minutes: 15 },
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().accepting).toBe(false);

    const paused = await ask([{ variant_id: cafePizza, quantity: 1 }]);
    expect(paused.statusCode).toBe(409);
    expect(paused.json()).toMatchObject({ paused: true, kitchen_phone: '+380000000000' });

    // A pause past its end has lifted itself.
    await pool.query(
      `UPDATE pos_kitchen_status SET paused_until = NOW() - interval '1 second' WHERE kitchen_store_id = $1`,
      [kitchen.storeId]
    );
    expect((await ask([{ variant_id: cafePizza, quantity: 1 }])).statusCode).toBe(201);

    // The stop list is the kitchen's own day.
    const today = (await readStoreClock(kitchen.storeId)).today;
    await pool.query(`UPDATE pos_products SET stop_listed_on = $2::date WHERE id = $1`, [kitchenRollProduct, today]);
    const stopped = await ask([{ variant_id: cafeRoll, quantity: 1 }]);
    expect(stopped.statusCode).toBe(409);
    expect(stopped.json()).toMatchObject({ cafe_variant_id: cafeRoll, problem: 'stop' });
    await pool.query(`UPDATE pos_products SET stop_listed_on = NULL WHERE id = $1`, [kitchenRollProduct]);

    // A cafe dish nobody marked is not the kitchen's.
    const { variantId: tea } = await seedProduct(cafe.storeId, { name: 'Чай' });
    const notLinked = await ask([{ variant_id: tea, quantity: 1 }]);
    expect(notLinked.statusCode).toBe(409);
    expect(notLinked.json().problem).toBe('not_linked');
  });

  it('a paid order cancelled gives the kitchen back exactly what it took', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 2 }])).json();
    const before = await stockOf(kitchenPizza);
    await step(cafe.sellerToken, order.id, 'paid', { sale_id: await sale(cafe.storeId, cafe.sellerId) });
    expect(await stockOf(kitchenPizza)).toBe(before - 2);

    expect((await step(cafe.sellerToken, order.id, 'cancel', {})).statusCode).toBe(400); // a reason is required
    const cancelled = await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Згоріла піч' });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('cancelled');
    expect(await stockOf(kitchenPizza)).toBe(before);
    // Idempotent.
    expect((await step(cafe.sellerToken, order.id, 'cancel', { reason: 'ще раз' })).json().status).toBe('cancelled');
    expect(await stockOf(kitchenPizza)).toBe(before);
  });

  it('the owner changes the link’s timers, within limits', async () => {
    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/pos/remote-kitchen/link',
      headers: auth(cafe.ownerToken),
      payload: { answer_seconds: 5 },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/pos/remote-kitchen/link',
      headers: auth(cafe.ownerToken),
      payload: { answer_seconds: 90, auto_confirm_max_min: null },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ answer_seconds: 90, auto_confirm_max_min: null });
    // With auto-confirm off even the short pizza waits for the kitchen.
    expect((await ask([{ variant_id: cafePizza, quantity: 1 }])).json().status).toBe('requested');
    // The owner cannot revoke; that is the super-admin's.
    const revoke = await app.inject({
      method: 'PATCH',
      url: '/api/pos/remote-kitchen/link',
      headers: auth(cafe.ownerToken),
      payload: { status: 'revoked' },
    });
    expect(revoke.statusCode).toBe(400);
    await rk.updateLink(linkId, { auto_confirm_max_min: 40, answer_seconds: 60 });
  });

  // ── РК2: the cafe's own receipt pays the order ───────────────────────

  const checkout = (items: Array<{ variant_id: number; quantity: number }>, remoteOrderId: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(cafe.sellerToken),
      payload: {
        items,
        // Every seeded dish costs 100 ₴; pay the cart exactly.
        payments: [{ method: 'cash', amount_cents: items.reduce((sum, i) => sum + i.quantity * 10000, 0) }],
        remote_order_id: remoteOrderId,
      },
    });
  const orderView = async (id: number) =>
    (await app.inject({ method: 'GET', url: `/api/pos/remote-kitchen/orders/${id}`, headers: auth(cafe.sellerToken) })).json();

  it('one cafe receipt pays the kitchen order: the kitchen’s shelf pays for its dishes, the cafe’s for the rest', async () => {
    // A cafe, so its own board is on — the remote dish must not appear there.
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    const order = (await ask([{ variant_id: cafePizza, quantity: 2 }])).json();
    expect(order.status).toBe('quoted');
    const kitchenBefore = await stockOf(kitchenPizza);
    const pizzaBefore = await stockOf(cafePizza);
    const rollBefore = await stockOf(cafeRoll);

    // Not an id, someone else's order, a cart that does not match: refused, nothing moves.
    expect((await checkout([{ variant_id: cafePizza, quantity: 2 }], 'abc')).statusCode).toBe(400);
    expect((await checkout([{ variant_id: cafePizza, quantity: 2 }], 999999999)).statusCode).toBe(404);
    const wrong = await checkout([{ variant_id: cafePizza, quantity: 1 }], order.id);
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().error).toBe('remote_order_conflict');
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore);
    expect(await stockOf(cafePizza)).toBe(pizzaBefore);
    expect((await orderView(order.id)).status).toBe('quoted');

    const res = await checkout(
      [
        { variant_id: cafePizza, quantity: 2 },
        { variant_id: cafeRoll, quantity: 1 },
      ],
      order.id
    );
    expect(res.statusCode, res.body).toBe(201);
    const saleId = Number(res.json().id);
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore - 2);
    expect(await stockOf(cafePizza)).toBe(pizzaBefore);
    expect(await stockOf(cafeRoll)).toBe(rollBefore - 1);

    const paid = await orderView(order.id);
    expect(paid.status).toBe('cooking');
    expect(paid.cafe_sale_id).toBe(saleId);
    expect(paid.order_no).toBeGreaterThanOrEqual(1);

    // The cafe's board shows its own roll, not the kitchen's pizza.
    const board = await listOpenOrders(cafe.storeId);
    const onBoard = board.orders.find((o) => o.kind === 'sale' && o.id === saleId);
    expect(onBoard?.items.map((i) => i.product_name)).toEqual(['Філадельфія']);

    // The same order cannot be paid by a second receipt.
    expect((await checkout([{ variant_id: cafePizza, quantity: 2 }], order.id)).statusCode).toBe(409);
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore - 2);
  });

  it('a receipt of kitchen dishes only stays off the cafe’s board', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    const res = await checkout([{ variant_id: cafePizza, quantity: 1 }], order.id);
    expect(res.statusCode, res.body).toBe(201);
    const saleId = Number(res.json().id);
    const board = await listOpenOrders(cafe.storeId);
    expect(board.orders.some((o) => o.kind === 'sale' && o.id === saleId)).toBe(false);
  });

  it('voiding the cafe receipt cancels a kitchen order still cooking, and each shelf gets back its own', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 2 }])).json();
    const kitchenBefore = await stockOf(kitchenPizza);
    const pizzaBefore = await stockOf(cafePizza);
    const rollBefore = await stockOf(cafeRoll);
    const res = await checkout(
      [
        { variant_id: cafePizza, quantity: 2 },
        { variant_id: cafeRoll, quantity: 1 },
      ],
      order.id
    );
    expect(res.statusCode, res.body).toBe(201);
    const saleId = Number(res.json().id);

    const voided = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/void`,
      headers: auth(cafe.sellerToken),
    });
    expect(voided.statusCode, voided.body).toBe(200);
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore);
    expect(await stockOf(cafePizza)).toBe(pizzaBefore);
    expect(await stockOf(cafeRoll)).toBe(rollBefore);
    const after = await orderView(order.id);
    expect(after.status).toBe('cancelled');
    expect(after.decline_reason).toBe('Чек кафе скасовано');
  });

  it('an order already on the road is not called back by a void, only noted for the kitchen', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    const res = await checkout([{ variant_id: cafePizza, quantity: 1 }], order.id);
    const saleId = Number(res.json().id);
    await step(kitchen.sellerToken, order.id, 'ready');
    await step(kitchen.sellerToken, order.id, 'dispatched');
    const kitchenAfterDispatch = await stockOf(kitchenPizza);

    const voided = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/void`,
      headers: auth(cafe.sellerToken),
    });
    expect(voided.statusCode, voided.body).toBe(200);
    expect((await orderView(order.id)).status).toBe('dispatched');
    expect(await stockOf(kitchenPizza)).toBe(kitchenAfterDispatch);
    const events = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${order.id}/events`,
      headers: auth(kitchen.sellerToken),
    });
    expect(events.json().events.map((e: { kind: string }) => e.kind)).toContain('cafe_sale_voided');
  });
});
