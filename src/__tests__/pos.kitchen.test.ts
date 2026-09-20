// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.kitchen.test.ts — the kitchen board (migration 049, café
// phase К3a): a paid café order is `new`, «Готово» makes it `ready`, «Видано»
// makes it `served`, and nothing else moves it. See TechDocs/POS_CAFE.md §10,
// POS_VERTICALS.md §7n.

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
import { completeSale, getSale, listSales, voidSale } from '../pos/sales.service.js';
import * as modifiers from '../pos/modifiers.service.js';
import { KitchenError, listOpenOrders, setPrepStatus } from '../pos/kitchen.service.js';
import type { CompleteSaleItemInput } from '../pos/types.js';

describe.skipIf(!hasDb)('POS kitchen board', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let boutique: TestStore;
  let latte = 0;
  let croissant = 0;
  let oat = 0;
  let shirt = 0;

  async function sell(
    store: TestStore,
    items: CompleteSaleItemInput[],
    extra: { offline_replay?: boolean } = {}
  ) {
    const sale = await completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items,
      payments: [{ method: 'cash', amount_cents: 100000 }],
      ...extra,
    });
    return sale!;
  }

  const board = async () =>
    app.inject({ method: 'GET', url: '/api/pos/kitchen/orders', headers: auth(cafe.sellerToken) });
  const tap = (saleId: number, prep_status: unknown, token = cafe.sellerToken) =>
    app.inject({
      method: 'PATCH',
      url: `/api/pos/sales/${saleId}/prep`,
      headers: auth(token),
      payload: { prep_status },
    });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('kitchen');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    boutique = await createTestStore('kitchen2');

    const latteCard = await seedProduct(cafe.storeId, {
      name: 'Латте',
      priceCents: 6500,
      quantity: 500,
      attributes: { size: 'M' },
    });
    latte = latteCard.variantId;
    croissant = (
      await seedProduct(cafe.storeId, { name: 'Круасан', priceCents: 5500, quantity: 500 })
    ).variantId;
    shirt = (await seedProduct(boutique.storeId, { name: 'Сорочка', quantity: 50 })).variantId;

    const milk = await modifiers.createGroup(cafe.storeId, {
      name: 'Молоко',
      min_select: 0,
      max_select: 1,
    });
    const withOat = await modifiers.createModifier(cafe.storeId, milk.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
    });
    oat = withOat.modifiers.find((m) => m.name === 'вівсяне')!.id;
    await modifiers.setProductGroups(cafe.storeId, latteCard.productId, [milk.id]);
  }, 60000);

  afterAll(async () => {
    await app?.close();
    if (cafe) await dropTestStore(cafe.storeId);
    if (boutique) await dropTestStore(boutique.storeId);
  });

  it('puts a café sale on the board as new; a boutique sale is served at the till', async () => {
    const order = await sell(cafe, [{ variant_id: latte, quantity: 1 }]);
    expect(order.prep_status).toBe('new');
    expect(order.ready_at).toBeNull();
    expect(order.served_at).toBeNull();

    const boutiqueSale = await sell(boutique, [{ variant_id: shirt, quantity: 1 }]);
    expect(boutiqueSale.prep_status).toBe('served');
    expect(boutiqueSale.served_at).not.toBeNull();

    // The three fields travel with the list too.
    const listed = (await listSales(cafe.storeId)).find((s) => s.id === order.id);
    expect(listed).toMatchObject({ prep_status: 'new', ready_at: null, served_at: null });
  });

  it('stamps a replayed offline sale as already handed over', async () => {
    const replayed = await sell(cafe, [{ variant_id: croissant, quantity: 1 }], {
      offline_replay: true,
    });
    expect(replayed.prep_status).toBe('served');
    expect(replayed.served_at).not.toBeNull();
    const { orders } = await listOpenOrders(cafe.storeId);
    expect(orders.map((o) => o.id)).not.toContain(replayed.id);
  });

  it("lists today's open orders oldest first, with the answers by name and the kitchen note", async () => {
    const first = await sell(cafe, [
      { variant_id: latte, quantity: 2, modifiers: [oat], note: 'гарячіше' },
      { variant_id: croissant, quantity: 1 },
    ]);
    const second = await sell(cafe, [{ variant_id: croissant, quantity: 3 }]);

    const res = await board();
    expect(res.statusCode).toBe(200);
    const body = res.json() as { orders: Array<Record<string, unknown>>; now: string };
    expect(new Date(body.now).getTime()).toBeGreaterThan(Date.now() - 5000);
    const ids = body.orders.map((o) => o.id);
    expect(ids.indexOf(first.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));

    const card = body.orders.find((o) => o.id === first.id)!;
    expect(card).toMatchObject({
      order_no: first.order_no,
      receipt_number: first.receipt_number,
      prep_status: 'new',
      ready_at: null,
      staff_name: 'Test Seller',
    });
    expect(card.items).toEqual([
      expect.objectContaining({
        product_name: 'Латте',
        variant_label: 'M · вівсяне',
        quantity: 2,
        modifiers: [{ group_name: 'Молоко', name: 'вівсяне' }],
        note: 'гарячіше',
      }),
      expect.objectContaining({ product_name: 'Круасан', quantity: 1, modifiers: [], note: '' }),
    ]);
  });

  it("leaves a voided sale and yesterday's order off the board without touching them", async () => {
    const cancelled = await sell(cafe, [{ variant_id: croissant, quantity: 1 }]);
    await voidSale({ storeId: cafe.storeId, saleId: cancelled.id, staffId: cafe.sellerId });

    const stale = await sell(cafe, [{ variant_id: croissant, quantity: 1 }]);
    await pool.query(`UPDATE pos_sales SET created_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [
      stale.id,
    ]);

    const { orders } = await listOpenOrders(cafe.storeId);
    const ids = orders.map((o) => o.id);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).not.toContain(stale.id);
    // Nothing swept it: it is still `new`, just not today's.
    expect((await getSale(cafe.storeId, stale.id))!.prep_status).toBe('new');
  });

  it('takes two taps: «Готово» stamps ready_at, «Видано» stamps served_at and clears the board', async () => {
    const order = await sell(cafe, [{ variant_id: latte, quantity: 1 }]);

    const ready = await tap(order.id, 'ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ id: order.id, prep_status: 'ready', served_at: null });
    expect(ready.json().ready_at).not.toBeNull();
    const onShelf = (await listOpenOrders(cafe.storeId)).orders.find((o) => o.id === order.id);
    expect(onShelf).toMatchObject({ prep_status: 'ready', ready_at: ready.json().ready_at });

    const served = await tap(order.id, 'served');
    expect(served.statusCode).toBe(200);
    expect(served.json()).toMatchObject({ prep_status: 'served', ready_at: ready.json().ready_at });
    expect(served.json().served_at).not.toBeNull();
    const ids = (await listOpenOrders(cafe.storeId)).orders.map((o) => o.id);
    expect(ids).not.toContain(order.id);
  });

  it('answers a re-tap of the same state with 200 and nothing changed', async () => {
    const order = await sell(cafe, [{ variant_id: latte, quantity: 1 }]);
    const once = await tap(order.id, 'ready');
    const again = await tap(order.id, 'ready');
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(once.json());

    const servedOnce = await tap(order.id, 'served');
    const servedAgain = await tap(order.id, 'served');
    expect(servedAgain.statusCode).toBe(200);
    expect(servedAgain.json()).toEqual(servedOnce.json());
  });

  it("refuses a skipped or reversed step in the kitchen's words", async () => {
    const order = await sell(cafe, [{ variant_id: latte, quantity: 1 }]);

    const skipped = await tap(order.id, 'served');
    expect(skipped.statusCode).toBe(409);
    expect(skipped.json().error).toBe('Спершу натисніть „Готово“');

    await tap(order.id, 'ready');
    await tap(order.id, 'served');
    const reversed = await tap(order.id, 'ready');
    expect(reversed.statusCode).toBe(409);
    expect(reversed.json().error).toBe('Замовлення вже видано');

    const cancelled = await sell(cafe, [{ variant_id: croissant, quantity: 1 }]);
    await voidSale({ storeId: cafe.storeId, saleId: cancelled.id, staffId: cafe.sellerId });
    const onVoided = await tap(cancelled.id, 'ready');
    expect(onVoided.statusCode).toBe(409);
    expect(onVoided.json().error).toBe('Чек скасовано');
  });

  it("answers 404 for another store's order, 400 for a status the board does not have, and 409 for a store with no kitchen", async () => {
    const theirs = await sell(boutique, [{ variant_id: shirt, quantity: 1 }]);
    const foreign = await tap(theirs.id, 'ready');
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error).toBe('Замовлення не знайдено');

    const order = await sell(cafe, [{ variant_id: latte, quantity: 1 }]);
    const bad = await tap(order.id, 'new');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('prep_status має бути ready або served');

    const noKitchen = await app.inject({
      method: 'GET',
      url: '/api/pos/kitchen/orders',
      headers: auth(boutique.sellerToken),
    });
    expect(noKitchen.statusCode).toBe(409);
    expect(noKitchen.json().error).toBe('Цей магазин не має кухні');
    await expect(listOpenOrders(boutique.storeId)).rejects.toBeInstanceOf(KitchenError);
    await expect(setPrepStatus({ storeId: cafe.storeId, saleId: 0, status: 'ready' })).rejects.toThrow(
      'Замовлення не знайдено'
    );
  });

  it('needs a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/kitchen/orders' });
    expect(res.statusCode).toBe(401);
  });
});
