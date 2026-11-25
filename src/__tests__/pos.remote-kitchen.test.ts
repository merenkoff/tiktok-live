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
import * as modifiers from '../pos/modifiers.service.js';
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
  // The cafe's own dish, never linked to the kitchen: what a mixed receipt sells beside a kitchen order.
  let cafeLatte = 0;
  let kitchenRoll = 0;
  let kitchenPizzaProduct = 0;
  let kitchenRollProduct = 0;
  let cafePizzaProduct = 0;
  let receiptSeq = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('rk_cafe');
    kitchen = await createTestStore('rk_kitchen');
    stranger = await createTestStore('rk_stranger');
    lonely = await createTestStore('rk_lonely');

    // Both ends cook (`createLink` refuses any other store): a café and a
    // kitchen of the café vertical.
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [cafe.storeId, kitchen.storeId],
    ]);
    ({ variantId: cafePizza, productId: cafePizzaProduct } = await seedProduct(cafe.storeId, {
      name: 'Маргарита',
      quantity: 5,
    }));
    ({ variantId: cafeRoll } = await seedProduct(cafe.storeId, { name: 'Філадельфія', quantity: 5 }));
    ({ variantId: cafeLatte } = await seedProduct(cafe.storeId, { name: 'Лате', quantity: 5 }));
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
    expect(setup.json()).toEqual({ as_cafe: null, as_kitchen: null, cafe_orders: false });
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

  it('the kitchen corrects a time the server confirmed by itself, once; its own answer stands', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    expect(order.quote_source).toBe('auto');
    const changed = await step(kitchen.sellerToken, order.id, 'quote', { minutes: 30, revision: order.revision });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json()).toMatchObject({ status: 'quoted', quote_source: 'kitchen', quoted_minutes: 40 });
    const again = await step(kitchen.sellerToken, order.id, 'quote', { minutes: 20, revision: order.revision });
    expect(again.statusCode).toBe(409);
    const events = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${order.id}/events`,
      headers: auth(kitchen.sellerToken),
    });
    expect(events.json().events.map((e: { kind: string }) => e.kind)).toContain('requoted');
    await step(cafe.sellerToken, order.id, 'guest-declined');
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
    // The cafe's setup says so too, so the roll's tile reads «немає на кухні» before anyone asks.
    const setupItems = async () =>
      (
        await app.inject({ method: 'GET', url: '/api/pos/remote-kitchen/setup', headers: auth(cafe.sellerToken) })
      ).json().as_cafe.items as Array<{ cafe_variant_id: number; available: boolean }>;
    expect((await setupItems()).find((i) => i.cafe_variant_id === cafeRoll)?.available).toBe(false);
    expect((await setupItems()).find((i) => i.cafe_variant_id === cafePizza)?.available).toBe(true);
    await pool.query(`UPDATE pos_products SET stop_listed_on = NULL WHERE id = $1`, [kitchenRollProduct]);
    expect((await setupItems()).find((i) => i.cafe_variant_id === cafeRoll)?.available).toBe(true);

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

  it('the cafe’s tracker keeps a kitchen’s cancel until a cashier says the guest got the money back', async () => {
    const cafeSide = async () =>
      (
        await app.inject({
          method: 'GET',
          url: '/api/pos/remote-kitchen/orders?side=cafe',
          headers: auth(cafe.sellerToken),
        })
      ).json().orders as Array<{ id: number; status: string; cancelled_by: string | null; cancel_seen_at: string | null; delayed_minutes: number }>;
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    await step(cafe.sellerToken, order.id, 'paid', { sale_id: await sale(cafe.storeId, cafe.sellerId) });

    // «+10 хв» twice: the cafe reads one sum, and the promise moved with it.
    const promised = Date.parse((await orderView(order.id)).promised_at);
    await step(kitchen.sellerToken, order.id, 'delay', { minutes: 10 });
    await step(kitchen.sellerToken, order.id, 'delay', { minutes: 5 });
    const late = (await cafeSide()).find((o) => o.id === order.id)!;
    expect(late.delayed_minutes).toBe(15);
    expect(Date.parse((await orderView(order.id)).promised_at) - promised).toBe(15 * 60_000);

    await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Згоріла піч' });
    const cancelled = (await cafeSide()).find((o) => o.id === order.id)!;
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelled_by: 'kitchen', cancel_seen_at: null });

    // Hours later, unanswered, it is still on the cafe's till — and only there.
    await pool.query(`UPDATE pos_remote_orders SET updated_at = NOW() - interval '5 hours' WHERE id = $1`, [order.id]);
    expect((await cafeSide()).some((o) => o.id === order.id)).toBe(true);
    const kitchenSide = await app.inject({
      method: 'GET',
      url: '/api/pos/remote-kitchen/orders?side=kitchen',
      headers: auth(kitchen.sellerToken),
    });
    expect(kitchenSide.json().orders.some((o: { id: number }) => o.id === order.id)).toBe(false);

    // Only the cafe answers it.
    expect((await step(kitchen.sellerToken, order.id, 'cancel-seen')).statusCode).toBe(409);
    expect((await step(stranger.sellerToken, order.id, 'cancel-seen')).statusCode).toBe(404);
    const seen = await step(cafe.sellerToken, order.id, 'cancel-seen');
    expect(seen.statusCode, seen.body).toBe(200);
    expect(seen.json().cancel_seen_at).not.toBeNull();
    expect((await step(cafe.sellerToken, order.id, 'cancel-seen')).json().cancel_seen_at).toBe(seen.json().cancel_seen_at);
    await pool.query(`UPDATE pos_remote_orders SET updated_at = NOW() - interval '5 hours' WHERE id = $1`, [order.id]);
    expect((await cafeSide()).some((o) => o.id === order.id)).toBe(false);

    // The cafe's own cancel is no news to the cafe.
    const own = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    await step(cafe.sellerToken, own.id, 'paid', { sale_id: await sale(cafe.storeId, cafe.sellerId) });
    expect((await step(cafe.sellerToken, own.id, 'cancel', { reason: 'Гість передумав' })).json().cancelled_by).toBe('cafe');
    expect((await step(cafe.sellerToken, own.id, 'cancel-seen')).statusCode).toBe(409);
  });

  it('names the cafe’s receipt to the cafe only, so a kitchen’s cancel can be refunded from it', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    const saleId = await sale(cafe.storeId, cafe.sellerId);
    const receipt = (await pool.query(`SELECT receipt_number FROM pos_sales WHERE id = $1`, [saleId])).rows[0].receipt_number;
    await step(cafe.sellerToken, order.id, 'paid', { sale_id: saleId });
    const cafeSide = await app.inject({
      method: 'GET',
      url: '/api/pos/remote-kitchen/orders?side=cafe',
      headers: auth(cafe.sellerToken),
    });
    expect(cafeSide.json().orders.find((o: { id: number }) => o.id === order.id).cafe_receipt_number).toBe(receipt);
    const kitchenView = await app.inject({
      method: 'GET',
      url: `/api/pos/remote-kitchen/orders/${order.id}`,
      headers: auth(kitchen.sellerToken),
    });
    expect(kitchenView.json().cafe_receipt_number).toBeNull();
    await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Немає тіста' });
    await step(cafe.sellerToken, order.id, 'cancel-seen');
  });

  it('the cafe says «Привезли» for an order the kitchen never moved, but only well past its promise', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    await step(cafe.sellerToken, order.id, 'paid', { sale_id: await sale(cafe.storeId, cafe.sellerId) });
    expect((await orderView(order.id)).status).toBe('cooking');

    // On time, or only a little late: the pizza may still be in the oven.
    const early = await step(cafe.sellerToken, order.id, 'arrived');
    expect(early.statusCode).toBe(409);
    expect(early.json().error).toContain(`${rk.LATE_ARRIVAL_MINUTES} хв`);
    await pool.query(`UPDATE pos_remote_orders SET promised_at = NOW() - make_interval(mins => $2) WHERE id = $1`, [
      order.id,
      rk.LATE_ARRIVAL_MINUTES - 2,
    ]);
    expect((await step(cafe.sellerToken, order.id, 'arrived')).statusCode).toBe(409);

    // Well past it, the cook forgot to tap: the cafe closes what it can see.
    await pool.query(`UPDATE pos_remote_orders SET promised_at = NOW() - make_interval(mins => $2) WHERE id = $1`, [
      order.id,
      rk.LATE_ARRIVAL_MINUTES + 1,
    ]);
    const arrived = await step(cafe.sellerToken, order.id, 'arrived');
    expect(arrived.statusCode, arrived.body).toBe(200);
    expect(arrived.json()).toMatchObject({ status: 'arrived', ready_at: null, dispatched_at: null });
    expect(arrived.json().arrived_at).not.toBeNull();
    const journal = await pool.query(
      `SELECT payload FROM pos_remote_order_events WHERE remote_order_id = $1 AND kind = 'arrived'`,
      [order.id]
    );
    expect(journal.rows[0].payload).toEqual({ kitchen_unmarked: true });
    // Gone from the kitchen's board, which shows only what it still has to make.
    const board = await app.inject({
      method: 'GET',
      url: '/api/pos/kitchen/orders?with=remote',
      headers: auth(kitchen.sellerToken),
    });
    expect(board.json().orders.some((o: { kind: string; id: number }) => o.kind === 'remote' && o.id === order.id)).toBe(false);
    expect((await step(cafe.sellerToken, order.id, 'handed')).statusCode).toBe(200);
  });

  it('keeps a cafe following its orders after the link is revoked, while «З кухні» is gone', async () => {
    const setupOf = async (token: string) =>
      (await app.inject({ method: 'GET', url: '/api/pos/remote-kitchen/setup', headers: auth(token) })).json();
    expect((await setupOf(lonely.sellerToken)).cafe_orders).toBe(false);

    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    await step(cafe.sellerToken, order.id, 'paid', { sale_id: await sale(cafe.storeId, cafe.sellerId) });
    await rk.updateLink(linkId, { status: 'revoked' }, { allowRevoke: true });
    try {
      const setup = await setupOf(cafe.sellerToken);
      expect(setup.as_cafe).toBeNull();
      expect(setup.cafe_orders).toBe(true);
    } finally {
      await rk.updateLink(linkId, { status: 'active' }, { allowRevoke: true });
    }
    await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Кінець сезону' });
    await step(cafe.sellerToken, order.id, 'cancel-seen');
  });

  it('cuts the oldest finished orders, never the newest live one, and still answers oldest first', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    await step(cafe.sellerToken, order.id, 'paid', { sale_id: await sale(cafe.storeId, cafe.sellerId) });
    // Earlier tests left finished orders in the cafe's three-hour window.
    const mustShow = (o: rk.RemoteOrderView) =>
      (rk.LIVE_STATUSES as readonly string[]).includes(o.status) ||
      (o.status === 'cancelled' && o.cancelled_by === 'kitchen' && o.cancel_seen_at == null);
    const all = await rk.listOrders(cafe.storeId, 'cafe');
    expect(all.filter((o) => !mustShow(o)).length).toBeGreaterThan(0);
    const kept = all.filter(mustShow).length;

    const cut = await rk.listOrders(cafe.storeId, 'cafe', { limit: kept });
    expect(cut).toHaveLength(kept);
    expect(cut.map((o) => o.id)).toContain(order.id);
    expect(cut.every(mustShow)).toBe(true);
    const times = cut.map((o) => Date.parse(o.requested_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Тест' });
    await step(cafe.sellerToken, order.id, 'cancel-seen');
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
    const latteBefore = await stockOf(cafeLatte);

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
        { variant_id: cafeLatte, quantity: 1 },
      ],
      order.id
    );
    expect(res.statusCode, res.body).toBe(201);
    const saleId = Number(res.json().id);
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore - 2);
    expect(await stockOf(cafePizza)).toBe(pizzaBefore);
    expect(await stockOf(cafeLatte)).toBe(latteBefore - 1);

    const paid = await orderView(order.id);
    expect(paid.status).toBe('cooking');
    expect(paid.cafe_sale_id).toBe(saleId);
    expect(paid.order_no).toBeGreaterThanOrEqual(1);

    // The cafe's board shows its own latte, not the kitchen's pizza.
    const board = await listOpenOrders(cafe.storeId);
    const onBoard = board.orders.find((o) => o.kind === 'sale' && o.id === saleId);
    expect(onBoard?.items.map((i) => i.product_name)).toEqual(['Лате']);

    // The same order cannot be paid by a second receipt.
    expect((await checkout([{ variant_id: cafePizza, quantity: 2 }], order.id)).statusCode).toBe(409);
    expect(await stockOf(kitchenPizza)).toBe(kitchenBefore - 2);
  });

  it('never sells a dish the kitchen cooks without the kitchen’s order — the receipt says so in words', async () => {
    const pizzaBefore = await stockOf(cafePizza);
    const plain = await checkout([{ variant_id: cafePizza, quantity: 1 }], null);
    expect(plain.statusCode).toBe(409);
    expect(plain.json()).toMatchObject({ error: 'remote_order_conflict' });
    expect(plain.json().message).toContain('«Маргарита» готує віддалена кухня');
    expect(await stockOf(cafePizza)).toBe(pizzaBefore);
    // The cafe's own dish sells as ever.
    expect((await checkout([{ variant_id: cafeLatte, quantity: 1 }], null)).statusCode).toBe(201);
    // A paused link still owns the dish: the kitchen is only off for now.
    await rk.updateLink(linkId, { status: 'paused' });
    try {
      expect((await checkout([{ variant_id: cafePizza, quantity: 1 }], null)).statusCode).toBe(409);
    } finally {
      await rk.updateLink(linkId, { status: 'active' });
    }
  });

  it('records, never judges, a kitchen dish a till sold offline hours ago', async () => {
    const replay = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(cafe.sellerToken),
      payload: {
        items: [{ variant_id: cafePizza, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        client_uuid: randomUUID(),
        offline_replay: true,
      },
    });
    expect(replay.statusCode, replay.body).toBe(201);
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
    const latteBefore = await stockOf(cafeLatte);
    const res = await checkout(
      [
        { variant_id: cafePizza, quantity: 2 },
        { variant_id: cafeLatte, quantity: 1 },
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
    expect(await stockOf(cafeLatte)).toBe(latteBefore);
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

  it('the kitchen’s board shows a paid order as a third kind, only to a board that asks', async () => {
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [kitchen.storeId]);
    const order = (await ask([{ variant_id: cafePizza, quantity: 2 }])).json();
    const res = await checkout([{ variant_id: cafePizza, quantity: 2 }], order.id);
    expect(res.statusCode, res.body).toBe(201);

    // An older board never sees it: its tap would go to `/sales/:id/prep`.
    const plain = await listOpenOrders(kitchen.storeId);
    expect(plain.orders.some((o) => o.kind === 'remote')).toBe(false);

    const board = await app.inject({
      method: 'GET',
      url: '/api/pos/kitchen/orders?with=remote',
      headers: auth(kitchen.sellerToken),
    });
    expect(board.statusCode, board.body).toBe(200);
    const card = board.json().orders.find((o: { kind: string; id: number }) => o.kind === 'remote' && o.id === order.id);
    expect(card.prep_status).toBe('new');
    expect(card.title).toMatch(/П-\d+$/);
    expect(card.promised_at).not.toBeNull();
    // Due at the kitchen one road earlier than at the guest.
    const transit = (await orderView(order.id)).transit_minutes ?? 0;
    expect(Date.parse(card.promised_at) - Date.parse(card.cook_by)).toBe(transit * 60_000);
    expect(card.items).toEqual([expect.objectContaining({ quantity: 2 })]);

    await step(kitchen.sellerToken, order.id, 'ready');
    const ready = await listOpenOrders(kitchen.storeId, { withRemote: true });
    expect(ready.orders.find((o) => o.kind === 'remote' && o.id === order.id)?.prep_status).toBe('ready');

    await step(kitchen.sellerToken, order.id, 'dispatched');
    const gone = await listOpenOrders(kitchen.storeId, { withRemote: true });
    expect(gone.orders.some((o) => o.kind === 'remote' && o.id === order.id)).toBe(false);
  });
  it('a paid order prints one ticket on the kitchen’s desktop, and a cancel after it prints «СКАСОВАНО»', async () => {
    await pool.query(`DELETE FROM pos_remote_order_prints WHERE store_id = $1`, [kitchen.storeId]);
    const queue = (token: string, device = 'kitchen-pc') =>
      app.inject({
        method: 'GET',
        url: '/api/pos/remote-kitchen/print-queue',
        headers: { ...auth(token), 'x-pos-device-id': device },
      });
    const printed = (id: number, kind: string) =>
      app.inject({
        method: 'POST',
        url: `/api/pos/remote-kitchen/print-queue/${id}/printed?kind=${kind}`,
        headers: { ...auth(kitchen.sellerToken), 'x-pos-device-id': 'kitchen-pc' },
      });

    const order = (await ask([{ variant_id: cafePizza, quantity: 2 }])).json();
    expect((await checkout([{ variant_id: cafePizza, quantity: 2 }], order.id)).statusCode).toBe(201);

    // The cafe has no ticket of its own to take; a device id is required.
    expect((await queue(cafe.sellerToken)).json().jobs).toEqual([]);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/pos/remote-kitchen/print-queue', headers: auth(kitchen.sellerToken) })
      ).statusCode
    ).toBe(400);

    const taken = (await queue(kitchen.sellerToken)).json().jobs;
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({
      remote_order_id: order.id,
      kind: 'fire',
      guest_label: 'Стіл 3',
      items: [expect.objectContaining({ product_name: expect.any(String), quantity: 2, modifiers: [] })],
    });
    expect(taken[0].order_no).toBeGreaterThanOrEqual(1);
    expect(taken[0].promised_at).not.toBeNull();
    // Leased: a second desktop gets nothing while the first may be printing.
    expect((await queue(kitchen.sellerToken, 'other-pc')).json().jobs).toEqual([]);
    expect((await printed(order.id, 'fire')).statusCode).toBe(200);
    expect((await queue(kitchen.sellerToken)).json().jobs).toEqual([]);

    await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Згоріла піч' });
    const cancel = (await queue(kitchen.sellerToken)).json().jobs;
    expect(cancel).toEqual([expect.objectContaining({ remote_order_id: order.id, kind: 'cancel' })]);
    expect((await printed(order.id, 'cancel')).statusCode).toBe(200);
    expect((await printed(999999999, 'fire')).statusCode).toBe(404);
  });

  it('an order cancelled before the kitchen took its ticket prints nothing', async () => {
    await pool.query(`DELETE FROM pos_remote_order_prints WHERE store_id = $1`, [kitchen.storeId]);
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    expect((await checkout([{ variant_id: cafePizza, quantity: 1 }], order.id)).statusCode).toBe(201);
    await step(kitchen.sellerToken, order.id, 'cancel', { reason: 'Немає тіста' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/remote-kitchen/print-queue',
      headers: { ...auth(kitchen.sellerToken), 'x-pos-device-id': 'kitchen-pc' },
    });
    expect(res.json().jobs).toEqual([]);
  });

  // ── the module's line with everything else (§11) ──────────────────

  it('links only two stores that cook — never a boutique by a mistyped id', async () => {
    await expect(
      rk.createLink({
        cafe_store_id: cafe.storeId,
        kitchen_store_id: lonely.storeId,
        kitchen_title: 'Не кухня',
      })
    ).rejects.toThrow(/Кухнею може бути лише заклад із кухнею/);
    await expect(
      rk.createLink({
        cafe_store_id: lonely.storeId,
        kitchen_store_id: kitchen.storeId,
        kitchen_title: 'Кухня',
      })
    ).rejects.toThrow(/Просити кухню може лише заклад із кухнею/);
  });

  it('the receipt names which line is the kitchen’s, so the cafe’s own kitchen ticket leaves it out', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(cafe.sellerToken),
      payload: {
        items: [
          { variant_id: cafePizza, quantity: 1 },
          { variant_id: cafeLatte, quantity: 1 },
        ],
        payments: [{ method: 'cash', amount_cents: 20000 }],
        remote_order_id: order.id,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const sale = await app.inject({ method: 'GET', url: `/api/pos/sales/${res.json().id}`, headers: auth(cafe.sellerToken) });
    const items = sale.json().items as Array<{ variant_id: number; remote_order_item_id?: number }>;
    expect(items.find((i) => i.variant_id === cafePizza)?.remote_order_item_id).toEqual(expect.any(Number));
    expect(items.find((i) => i.variant_id === cafeLatte)).not.toHaveProperty('remote_order_item_id');
  });

  it('the board taps a cafe’s order through the KITCHEN’s own route, never the module’s', async () => {
    const order = (await ask([{ variant_id: cafePizza, quantity: 1 }])).json();
    expect((await checkout([{ variant_id: cafePizza, quantity: 1 }], order.id)).statusCode).toBe(201);
    const tap = (token: string, prep_status: string, id = order.id) =>
      app.inject({
        method: 'PATCH',
        url: `/api/pos/kitchen/remote-orders/${id}/prep`,
        headers: auth(token),
        payload: { prep_status },
      });

    expect((await tap(kitchen.sellerToken, 'cooked')).statusCode).toBe(400);
    // The cafe is the other side; a third store does not see it at all.
    expect((await tap(cafe.sellerToken, 'ready')).statusCode).toBe(409);
    expect((await tap(stranger.sellerToken, 'ready')).statusCode).toBe(404);

    const ready = await tap(kitchen.sellerToken, 'ready');
    expect(ready.statusCode, ready.body).toBe(200);
    expect(ready.json()).toMatchObject({ id: order.id, prep_status: 'ready' });
    // A slow tablet repeating the tap gets the same answer.
    expect((await tap(kitchen.sellerToken, 'ready')).json().prep_status).toBe('ready');

    // «+10 хв» from the board: the promise moves at the cafe too.
    const delay = (token: string, minutes: unknown) =>
      app.inject({
        method: 'POST',
        url: `/api/pos/kitchen/remote-orders/${order.id}/delay`,
        headers: auth(token),
        payload: { minutes },
      });
    const before = Date.parse((await orderView(order.id)).promised_at as string);
    expect((await delay(kitchen.sellerToken, 0)).statusCode).toBe(409);
    expect((await delay(cafe.sellerToken, 10)).statusCode).toBe(409);
    expect((await delay(stranger.sellerToken, 10)).statusCode).toBe(404);
    const late = await delay(kitchen.sellerToken, 10);
    expect(late.statusCode, late.body).toBe(200);
    expect(Date.parse(late.json().promised_at) - before).toBe(10 * 60_000);

    const handed = await tap(kitchen.sellerToken, 'served');
    expect(handed.statusCode, handed.body).toBe(200);
    expect(handed.json()).toMatchObject({ prep_status: 'served', served_at: expect.any(String) });
    expect((await orderView(order.id)).status).toBe('dispatched');
  });

  it('the login says which store is a kitchen, so only its desktop drains the kitchen’s printer queue', async () => {
    const me = (token: string) => app.inject({ method: 'GET', url: '/api/pos/me', headers: auth(token) });
    expect((await me(kitchen.sellerToken)).json().store.remote_kitchen).toBe(true);
    expect((await me(cafe.sellerToken)).json().store.remote_kitchen).toBe(false);
    expect((await me(lonely.sellerToken)).json().store.remote_kitchen).toBe(false);
  });

  it('never lets the module into a store without the café vertical’s module', async () => {
    const entry = (id: string, path: string) => ({
      url: `https://cdn.example.com/${id}/remote-entry.js`,
      title: id,
      routePath: path,
      nav: [{ label: id, location: 'cashier-primary', order: 1 }],
    });
    const alone = await app.inject({
      method: 'PATCH',
      url: '/api/pos/store',
      headers: auth(lonely.ownerToken),
      payload: { module_remotes: { 'remote-kitchen': entry('remote-kitchen', '/remote-kitchen') } },
    });
    expect(alone.statusCode).toBe(400);
    expect(alone.json().error).toMatch(/"remote-kitchen" needs "vertical-cafe"/);
  });

  it('closes «Віддалена кухня» for a cashier the owner kept off it — the receipt stays open', async () => {
    await pool.query(`UPDATE pos_staff SET blocked_sections = ARRAY['remote-kitchen'] WHERE id = $1`, [cafe.sellerId]);
    try {
      const res = await ask([{ variant_id: cafePizza, quantity: 1 }]);
      expect(res.statusCode).toBe(403);
      expect(res.json().code ?? res.json().error).toMatch(/section_closed|закрив/);
      // Setup draws nothing by itself and stays readable.
      const setup = await app.inject({ method: 'GET', url: '/api/pos/remote-kitchen/setup', headers: auth(cafe.sellerToken) });
      expect(setup.statusCode).toBe(200);
    } finally {
      await pool.query(`UPDATE pos_staff SET blocked_sections = '{}' WHERE id = $1`, [cafe.sellerId]);
    }
  });

  // Last: it hangs a question on the cafe's pizza.
  it('a pizza with other answers than the kitchen was asked about does not pay the order', async () => {
    let group = await modifiers.createGroup(cafe.storeId, { name: 'Борти', min_select: 0, max_select: 1 });
    group = await modifiers.createModifier(cafe.storeId, group.id, { name: 'сирні', price_delta_cents: 2000 });
    const cheese = group.modifiers[0];
    await modifiers.setProductGroups(cafe.storeId, cafePizzaProduct, [group.id]);
    try {
      // The till sends the answer as its cart line holds it, the name as typed there.
      const order = (
        await app.inject({
          method: 'POST',
          url: '/api/pos/remote-kitchen/orders',
          headers: auth(cafe.sellerToken),
          payload: {
            client_uuid: randomUUID(),
            items: [
              {
                variant_id: cafePizza,
                quantity: 1,
                modifiers: [{ id: cheese.id, group_name: 'Борти', name: 'як завгодно', price_delta_cents: 0 }],
              },
            ],
          },
        })
      ).json();
      const pay = (lineModifiers: number[], amount: number) =>
        app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(cafe.sellerToken),
          payload: {
            items: [{ variant_id: cafePizza, quantity: 1, modifiers: lineModifiers }],
            payments: [{ method: 'cash', amount_cents: amount }],
            remote_order_id: order.id,
          },
        });

      // The plain pizza is not the one with cheese crust: refused, nothing paid.
      const plain = await pay([], 10000);
      expect(plain.statusCode).toBe(409);
      expect(plain.json().error).toBe('remote_order_conflict');
      expect((await orderView(order.id)).status).toBe('quoted');

      const right = await pay([cheese.id], 12000);
      expect(right.statusCode, right.body).toBe(201);
      // The kitchen cooks from the RECEIPT's answers, not the text the till sent.
      const stored = await pool.query(
        `SELECT modifiers FROM pos_remote_order_items WHERE remote_order_id = $1`,
        [order.id]
      );
      expect(stored.rows[0].modifiers).toEqual([
        expect.objectContaining({ modifier_id: cheese.id, group_name: 'Борти', name: 'сирні', price_delta_cents: 2000 }),
      ]);
    } finally {
      await modifiers.setProductGroups(cafe.storeId, cafePizzaProduct, []);
    }
  });

  // РК4-мінімум: the module switched on without a hand-written API call.
  describe('setting it up from the screens', () => {
    const PASSWORD = 'rk4-super-password';
    let saved: string | undefined;
    let superToken = '';

    beforeAll(async () => {
      saved = process.env.POS_SUPER_PASSWORD;
      process.env.POS_SUPER_PASSWORD = PASSWORD;
      const login = await app.inject({ method: 'POST', url: '/api/pos/super/login', payload: { password: PASSWORD } });
      superToken = login.json().token;
    });

    afterAll(() => {
      if (saved === undefined) delete process.env.POS_SUPER_PASSWORD;
      else process.env.POS_SUPER_PASSWORD = saved;
    });

    it('the super-admin sees both ends of a store’s links, named', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/super/remote-kitchen/links?store_id=${kitchen.storeId}`,
        headers: { 'x-pos-super-token': superToken },
      });
      expect(res.statusCode).toBe(200);
      const links = res.json().links as Array<Record<string, unknown>>;
      const ours = links.find((l) => l.id === linkId);
      expect(ours).toMatchObject({ cafe_store_id: cafe.storeId, kitchen_store_id: kitchen.storeId });
      expect(typeof ours?.cafe_name).toBe('string');
      expect(typeof ours?.kitchen_name).toBe('string');

      const none = await app.inject({
        method: 'GET',
        url: `/api/pos/super/remote-kitchen/links?store_id=${lonely.storeId}`,
        headers: { 'x-pos-super-token': superToken },
      });
      expect(none.json()).toEqual({ links: [] });
      const anon = await app.inject({
        method: 'GET',
        url: `/api/pos/super/remote-kitchen/links?store_id=${kitchen.storeId}`,
        headers: auth(cafe.ownerToken),
      });
      expect(anon.statusCode).toBe(401);
    });

    it('imports the kitchen’s dishes as the cafe’s cards at the cafe’s price, once', async () => {
      const extra = await seedProduct(kitchen.storeId, { name: 'Карбонара', quantity: 20 });
      const imp = (dishes: unknown, token = cafe.ownerToken) =>
        app.inject({
          method: 'POST',
          url: '/api/pos/remote-kitchen/link/import',
          headers: auth(token),
          payload: { dishes },
        });

      // A seller does not shape the catalogue; a price is the cafe's to name.
      expect((await imp([{ kitchen_variant_id: extra.variantId, price_cents: 23000 }], cafe.sellerToken)).statusCode).toBe(403);
      expect((await imp([{ kitchen_variant_id: extra.variantId }])).statusCode).toBe(400);
      // Another store's dish is not this kitchen's.
      const foreign = await seedProduct(stranger.storeId, { name: 'Чужа', quantity: 1 });
      expect((await imp([{ kitchen_variant_id: foreign.variantId, price_cents: 100 }])).statusCode).toBe(404);

      const first = await imp([{ kitchen_variant_id: extra.variantId, price_cents: 23000 }]);
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toMatchObject({ created: 1, linked: 1, skipped: 0 });
      const card = await pool.query(
        `SELECT v.id, v.price_cents, s.quantity
           FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
           LEFT JOIN pos_stock s ON s.variant_id = v.id
          WHERE p.store_id = $1 AND p.name LIKE 'Карбонара%'`,
        [cafe.storeId]
      );
      // Named after the dish and its size, as the cashier reads it.
      expect(card.rows).toHaveLength(1);
      expect(Number(card.rows[0].price_cents)).toBe(23000);
      expect(Number(card.rows[0].quantity)).toBe(rk.KITCHEN_DISH_STOCK);
      const items = first.json().items as Array<{ cafe_variant_id: number; kitchen_variant_id: number }>;
      expect(items).toContainEqual(
        expect.objectContaining({ cafe_variant_id: Number(card.rows[0].id), kitchen_variant_id: extra.variantId })
      );

      // Twice changes nothing.
      const again = await imp([{ kitchen_variant_id: extra.variantId, price_cents: 99900 }]);
      expect(again.json()).toMatchObject({ created: 0, linked: 0, skipped: 1 });
      const count = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_products WHERE store_id = $1 AND name LIKE 'Карбонара%'`, [
        cafe.storeId,
      ]);
      expect(count.rows[0].n).toBe(1);

      // The kitchen's «Точки» lists the dish under this cafe, with no cafe price in sight.
      const points = await app.inject({
        method: 'GET',
        url: '/api/pos/remote-kitchen/kitchen/cafes',
        headers: auth(kitchen.sellerToken),
      });
      expect(points.statusCode).toBe(200);
      const body = points.json();
      expect(body.status).toHaveProperty('accepting');
      const ours = (body.cafes as Array<{ link_id: number; dishes: Array<{ variant_id: number }> }>).find(
        (c) => c.link_id === linkId
      );
      expect(ours?.dishes.map((d) => d.variant_id)).toContain(extra.variantId);
      expect(JSON.stringify(body)).not.toContain('price');

      // A store that is no kitchen has no «Точки».
      const notKitchen = await app.inject({
        method: 'GET',
        url: '/api/pos/remote-kitchen/kitchen/cafes',
        headers: auth(lonely.sellerToken),
      });
      expect(notKitchen.statusCode).toBe(404);

      await pool.query(`DELETE FROM pos_kitchen_link_items WHERE link_id = $1 AND kitchen_variant_id = $2`, [
        linkId,
        extra.variantId,
      ]);
    });

    const importAs = (dishes: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/pos/remote-kitchen/link/import',
        headers: auth(cafe.ownerToken),
        payload: { dishes },
      });

    // An ingredient or a semi-finished good is the kitchen's stock, not a dish
    // a cafe can sell: neither offered in the list nor taken by the import.
    it('offers and imports only dishes of the kitchen’s menu, never an ingredient', async () => {
      const flour = await seedProduct(kitchen.storeId, { name: 'Борошно', quantity: 1000 });
      await pool.query(`UPDATE pos_products SET sellable = false WHERE id = $1`, [flour.productId]);
      const hidden = await seedProduct(kitchen.storeId, { name: 'Корковий збір кухні', quantity: 1000 });
      await pool.query(`UPDATE pos_products SET menu_hidden = true WHERE id = $1`, [hidden.productId]);

      const list = await app.inject({
        method: 'GET',
        url: '/api/pos/remote-kitchen/link/dishes',
        headers: auth(cafe.ownerToken),
      });
      const offered = (list.json().dishes as Array<{ variant_id: number }>).map((d) => d.variant_id);
      expect(offered).toContain(kitchenPizza);
      expect(offered).not.toContain(flour.variantId);
      expect(offered).not.toContain(hidden.variantId);

      for (const id of [flour.variantId, hidden.variantId]) {
        const res = await importAs([{ kitchen_variant_id: id, price_cents: 1000 }]);
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/не страва меню кухні/);
      }
      const made = await pool.query(
        `SELECT COUNT(*)::int AS n FROM pos_products WHERE store_id = $1 AND (name LIKE 'Борошно%' OR name LIKE 'Корковий%')`,
        [cafe.storeId]
      );
      expect(made.rows[0].n).toBe(0);
    });

    // A cafe card of the same name is reused — so it must be sellable at the
    // till (a zero-stock tile is grey), and its own price is said, not dropped.
    it('reuses a cafe card of that name: tops its stock up and reports the price it kept', async () => {
      const dish = await seedProduct(kitchen.storeId, { name: 'Лазанья', quantity: 20 });
      const label = String(
        (await pool.query(`SELECT label FROM pos_variants WHERE id = $1`, [dish.variantId])).rows[0].label ?? ''
      ).trim();
      const name = label ? `Лазанья (${label})` : 'Лазанья';
      const own = await seedProduct(cafe.storeId, { name, priceCents: 18000, quantity: 0 });
      // An ingredient card of the same name is never the one reused.
      const ingredient = await seedProduct(cafe.storeId, { name, quantity: 0 });
      await pool.query(`UPDATE pos_products SET sellable = false WHERE id = $1`, [ingredient.productId]);

      const res = await importAs([{ kitchen_variant_id: dish.variantId, price_cents: 23000 }]);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ created: 0, linked: 1, kept_prices: [{ name, price_cents: 18000 }] });
      const items = res.json().items as Array<{ cafe_variant_id: number; kitchen_variant_id: number }>;
      expect(items).toContainEqual(
        expect.objectContaining({ cafe_variant_id: own.variantId, kitchen_variant_id: dish.variantId })
      );
      expect(await stockOf(own.variantId)).toBe(rk.KITCHEN_DISH_STOCK);
      expect(Number((await pool.query(`SELECT price_cents FROM pos_variants WHERE id = $1`, [own.variantId])).rows[0].price_cents)).toBe(18000);
      expect(await stockOf(ingredient.variantId)).toBe(0);
    });

    // A table's round goes to THIS store's kitchen: a dish the remote kitchen
    // cooks is sold at the till, through «З кухні», never on a table's bill.
    it('refuses a dish the remote kitchen cooks on a table’s bill, and takes any other', async () => {
      const hall = Number(
        (await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Тераса') RETURNING id`, [cafe.storeId]))
          .rows[0].id
      );
      const table = Number(
        (
          await pool.query(`INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '4') RETURNING id`, [
            cafe.storeId,
            hall,
          ])
        ).rows[0].id
      );
      const seated = await app.inject({
        method: 'POST',
        url: '/api/pos/bills',
        headers: auth(cafe.sellerToken),
        payload: { table_id: table },
      });
      expect(seated.statusCode, seated.body).toBe(200);
      const billId = seated.json().bill.id;
      const add = (variantId: number) =>
        app.inject({
          method: 'POST',
          url: `/api/pos/bills/${billId}/items`,
          headers: auth(cafe.sellerToken),
          payload: { variant_id: variantId, quantity: 1 },
        });

      const pizza = await add(cafePizza);
      expect(pizza.statusCode).toBeGreaterThanOrEqual(400);
      expect(pizza.json().error).toMatch(/готує віддалена кухня/);
      const lemonade = await seedProduct(cafe.storeId, { name: 'Лимонад', quantity: 10 });
      expect((await add(lemonade.variantId)).statusCode).toBe(200);
    });
  });
});
