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
import { createProduct, getCatalog } from '../pos/products.service.js';
import * as modifiers from '../pos/modifiers.service.js';
import { KitchenError, listOpenOrders, setPrepStatus } from '../pos/kitchen.service.js';
import { getPreorder } from '../pos/preorders.service.js';
import { localDateString } from '../pos/core/localDate.js';
import type { CompleteSaleItemInput } from '../pos/types.js';

describe.skipIf(!hasDb)('POS kitchen board', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let boutique: TestStore;
  let latte = 0;
  let latteProduct = 0;
  let croissant = 0;
  let croissantProduct = 0;
  let oat = 0;
  let oatMilk = 0;
  let tea = 0;
  let sugarGroupId = 0;
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
    latteProduct = latteCard.productId;
    const croissantCard = await seedProduct(cafe.storeId, {
      name: 'Круасан',
      priceCents: 5500,
      quantity: 500,
    });
    croissant = croissantCard.variantId;
    croissantProduct = croissantCard.productId;
    shirt = (await seedProduct(boutique.storeId, { name: 'Сорочка', quantity: 50 })).variantId;

    const milk = await modifiers.createGroup(cafe.storeId, {
      name: 'Молоко',
      min_select: 0,
      max_select: 1,
    });
    // The answer carries its own milk (§4.3): 200 мл off the shelf per latte.
    // Through the real service (the fixture seeds through the clothing
    // vertical, which knows no millilitres).
    const oatCard = await createProduct(cafe.storeId, {
      name: 'Молоко вівсяне',
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, cost_cents: 4, quantity: 5000 }],
    });
    oatMilk = (oatCard!.variants[0] as { id: number }).id;
    const withOat = await modifiers.createModifier(cafe.storeId, milk.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: oatMilk,
      component_quantity: 200,
    });
    oat = withOat.modifiers.find((m) => m.name === 'вівсяне')!.id;
    await modifiers.setProductGroups(cafe.storeId, latteCard.productId, [milk.id]);

    // Tea asks a required question, so a line that skips it is refused.
    const teaCard = await seedProduct(cafe.storeId, { name: 'Чай', priceCents: 4000, quantity: 100 });
    tea = teaCard.variantId;
    let sugar = await modifiers.createGroup(cafe.storeId, {
      name: 'Цукор',
      min_select: 1,
      max_select: 1,
    });
    sugar = await modifiers.createModifier(cafe.storeId, sugar.id, { name: 'з цукром', is_default: true });
    sugar = await modifiers.createModifier(cafe.storeId, sugar.id, { name: 'без цукру' });
    sugarGroupId = sugar.id;
    await modifiers.setProductGroups(cafe.storeId, teaCard.productId, [sugar.id]);
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

  const stopList = (productId: number, stop_listed: unknown, token = cafe.sellerToken) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/kitchen/stop-list/${productId}`,
      headers: auth(token),
      payload: { stop_listed },
    });

  it("lets staff pull a dish for the day: the tile greys, the till is refused, a replay is not", async () => {
    const on = await stopList(croissantProduct, true);
    expect(on.statusCode).toBe(200);
    const timezone = (
      await pool.query(`SELECT timezone FROM pos_stores WHERE id = $1`, [cafe.storeId])
    ).rows[0].timezone as string;
    expect(on.json()).toEqual({
      product_id: croissantProduct,
      stop_listed: true,
      stop_listed_on: localDateString(timezone),
    });

    // Still in the catalog — greyed, not gone — with the raw day beside the flag.
    const catalog = await getCatalog(cafe.storeId, {});
    expect(catalog.find((i) => i.variant_id === croissant)).toMatchObject({
      stop_listed: true,
      stop_listed_on: localDateString(timezone),
    });
    expect(catalog.find((i) => i.variant_id === latte)).toMatchObject({
      stop_listed: false,
      stop_listed_on: null,
    });

    await expect(sell(cafe, [{ variant_id: croissant, quantity: 1 }])).rejects.toThrow(
      '«Круасан» сьогодні в стоп-листі'
    );
    const refused = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(cafe.sellerToken),
      payload: {
        items: [{ variant_id: croissant, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toBe('«Круасан» сьогодні в стоп-листі');

    // The goods left while the till was offline: a replay is filed, and as served.
    const replayed = await sell(cafe, [{ variant_id: croissant, quantity: 1 }], {
      offline_replay: true,
    });
    expect(replayed.prep_status).toBe('served');

    const off = await stopList(croissantProduct, false);
    expect(off.json()).toEqual({ product_id: croissantProduct, stop_listed: false, stop_listed_on: null });
    expect((await sell(cafe, [{ variant_id: croissant, quantity: 1 }])).prep_status).toBe('new');
  });

  it("forgets yesterday's stop-list by itself, and refuses the toggle where it makes no sense", async () => {
    await pool.query(`UPDATE pos_products SET stop_listed_on = CURRENT_DATE - 1 WHERE id = $1`, [
      croissantProduct,
    ]);
    const stale = (await getCatalog(cafe.storeId, {})).find((i) => i.variant_id === croissant)!;
    expect(stale.stop_listed).toBe(false);
    expect(stale.stop_listed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await sell(cafe, [{ variant_id: croissant, quantity: 1 }])).prep_status).toBe('new');
    await pool.query(`UPDATE pos_products SET stop_listed_on = NULL WHERE id = $1`, [croissantProduct]);

    const missing = await stopList(999999999, true);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('Товар не знайдено');

    const notBoolean = await stopList(croissantProduct, 'yes');
    expect(notBoolean.statusCode).toBe(400);
    expect(notBoolean.json().error).toBe('stop_listed має бути true або false');

    const shirtProduct = (
      await pool.query(`SELECT product_id FROM pos_variants WHERE id = $1`, [shirt])
    ).rows[0].product_id as number;
    const noKitchen = await stopList(Number(shirtProduct), true, boutique.sellerToken);
    expect(noKitchen.statusCode).toBe(409);
    expect(noKitchen.json().error).toBe('Цей магазин не має кухні');
  });

  it("reports each line's station from its tags, so a ticket knows where to go", async () => {
    const createTag = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/pos/tags', headers: auth(cafe.ownerToken), payload });
    const bar = await createTag({ name: 'Кава', station: 'bar' });
    expect(bar.statusCode).toBe(201);
    expect(bar.json().station).toBe('bar');
    const kitchenTag = await createTag({ name: 'Сніданки', station: 'kitchen' });
    const plain = await createTag({ name: 'Новинки' });
    expect(plain.json().station).toBeNull();

    const invalid = await createTag({ name: 'Гараж', station: 'garage' });
    expect(invalid.statusCode).toBe(400);

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/pos/tags/${bar.json().id}`,
      headers: auth(cafe.ownerToken),
      payload: { station: null },
    });
    expect(cleared.json().station).toBeNull();
    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/pos/tags/${bar.json().id}`,
      headers: auth(cafe.ownerToken),
      payload: { station: 'bar' },
    });
    expect(restored.json().station).toBe('bar');

    const wear = (productId: number, tag_ids: number[]) =>
      app.inject({
        method: 'PUT',
        url: `/api/pos/products/${productId}/tags`,
        headers: auth(cafe.ownerToken),
        payload: { tag_ids },
      });
    await wear(latteProduct, [bar.json().id, plain.json().id]);
    await wear(croissantProduct, [kitchenTag.json().id]);

    const order = await sell(cafe, [
      { variant_id: latte, quantity: 1 },
      { variant_id: croissant, quantity: 1 },
    ]);
    const card = (await listOpenOrders(cafe.storeId)).orders.find((o) => o.id === order.id)!;
    expect(card.items.map((i) => [i.product_name, i.stations])).toEqual([
      ['Латте', ['bar']],
      ['Круасан', ['kitchen']],
    ]);

    // The till reads the same fact from the tag tree it already caches.
    const tags = await app.inject({ method: 'GET', url: '/api/pos/tags', headers: auth(cafe.sellerToken) });
    const byName = Object.fromEntries(
      (tags.json() as Array<{ name: string; station: string | null }>).map((t) => [t.name, t.station])
    );
    expect(byName).toMatchObject({ 'Кава': 'bar', 'Сніданки': 'kitchen', 'Новинки': null });
  });

  const stockOf = async (variantId: number) =>
    Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0]
        .quantity
    );
  const reservedOf = async (variantId: number) =>
    Number(
      (
        await pool.query(
          `SELECT reserved FROM pos_stock_reserved WHERE store_id = $1 AND variant_id = $2`,
          [cafe.storeId, variantId]
        )
      ).rows[0]?.reserved ?? 0
    );

  it('parks a latte on oat milk with its note, holds the milk, and hands it back to ring as one line', async () => {
    // Over the API on purpose: the route used to rebuild the line without
    // its answers, so the service never saw them (К3f, migration 051).
    const parked = await app.inject({
      method: 'POST',
      url: '/api/pos/parked-carts',
      headers: auth(cafe.sellerToken),
      payload: {
        client_uuid: crypto.randomUUID(),
        label: 'Марта, вікно',
        items: [{ variant_id: latte, quantity: 2, modifiers: [oat], note: 'гарячіше' }],
      },
    });
    expect(parked.statusCode).toBe(201);
    const cart = parked.json();
    expect(cart.items[0]).toMatchObject({
      price_cents: 6500,
      line_price_cents: 8000,
      note: 'гарячіше',
      modifiers: [expect.objectContaining({ modifier_id: oat, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 })],
    });
    expect(cart.total_cents).toBe(16000);
    expect(await reservedOf(oatMilk)).toBe(400);

    const picked = await app.inject({
      method: 'POST',
      url: `/api/pos/parked-carts/${cart.id}/pick-up`,
      headers: auth(cafe.sellerToken),
    });
    expect(picked.statusCode).toBe(200);
    const restored = picked.json().items[0] as {
      variant_id: number;
      quantity: number;
      modifiers: Array<{ modifier_id: number }>;
      note: string;
    };
    expect(await reservedOf(oatMilk)).toBe(0);

    // Rung with a walk-in latte on the same answers: one line of three.
    const sale = await sell(cafe, [
      {
        variant_id: restored.variant_id,
        quantity: restored.quantity,
        modifiers: restored.modifiers.map((m) => m.modifier_id),
        note: restored.note,
      },
      { variant_id: latte, quantity: 1, modifiers: [oat], note: 'гарячіше' },
    ]);
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]).toMatchObject({
      quantity: 3,
      unit_price_cents: 8000,
      variant_label: 'M · вівсяне',
      note: 'гарячіше',
    });
  });

  it("refuses a parked line that skips a required question, in the server's words", async () => {
    const park = (items: unknown[]) =>
      app.inject({
        method: 'POST',
        url: '/api/pos/parked-carts',
        headers: auth(cafe.sellerToken),
        payload: { client_uuid: crypto.randomUUID(), label: 'Чай', items },
      });
    const skipped = await park([{ variant_id: tea, quantity: 1 }]);
    expect(skipped.statusCode).toBe(400);
    expect(skipped.json().error).toBe('Оберіть «Цукор»');
    const sugarFree = (await modifiers.getGroup(cafe.storeId, sugarGroupId)).modifiers.find(
      (m) => m.name === 'без цукру'
    )!.id;
    const answered = await park([{ variant_id: tea, quantity: 1, modifiers: [sugarFree] }]);
    expect(answered.statusCode).toBe(201);
    expect(answered.json().items[0].modifiers.map((m: { name: string }) => m.name)).toEqual([
      'без цукру',
    ]);
  });

  it('takes a pre-order at the card price plus the delta, and honours it after the answer changes or disappears', async () => {
    const taken = await app.inject({
      method: 'POST',
      url: '/api/pos/preorders',
      headers: auth(cafe.sellerToken),
      payload: {
        client_uuid: crypto.randomUUID(),
        due_at: new Date(Date.now() + 3_600_000).toISOString(),
        items: [{ variant_id: latte, quantity: 1, modifiers: [oat], note: 'без цукру' }],
      },
    });
    expect(taken.statusCode).toBe(201);
    const preorderId = taken.json().id as number;
    expect(taken.json().quoted_total_cents).toBe(8000);
    expect(taken.json().items[0]).toMatchObject({
      unit_price_cents: 8000,
      current_unit_price_cents: 8000,
      note: 'без цукру',
      modifiers: [expect.objectContaining({ modifier_id: oat, name: 'вівсяне', price_delta_cents: 1500 })],
    });

    // The answer gets dearer: today's figure moves, the promise does not.
    await modifiers.updateModifier(cafe.storeId, oat, { price_delta_cents: 2000 });
    const dearer = (await getPreorder(cafe.storeId, preorderId))!;
    expect(dearer.items[0]).toMatchObject({ unit_price_cents: 8000, current_unit_price_cents: 8500 });
    expect(dearer.current_total_cents).toBe(8500);

    // The answer is deleted: nothing to price today, and the hand-over keeps
    // the name, the price and the note, writes off nothing for it, and nulls
    // the id the FK no longer has.
    await modifiers.deleteModifier(cafe.storeId, oat);
    const orphaned = (await getPreorder(cafe.storeId, preorderId))!;
    expect(orphaned.items[0].current_unit_price_cents).toBeNull();
    expect(orphaned.current_total_cents).toBeNull();

    const milkBefore = await stockOf(oatMilk);
    const sale = await completeSale({
      storeId: cafe.storeId,
      staffId: cafe.sellerId,
      items: [],
      payments: [{ method: 'cash', amount_cents: 8000 }],
      preorder_id: preorderId,
    });
    expect(sale!.items[0]).toMatchObject({
      variant_label: 'M · вівсяне',
      unit_price_cents: 8000,
      note: 'без цукру',
      modifiers: [{ modifier_id: null, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 }],
    });
    expect(await stockOf(oatMilk)).toBe(milkBefore);
    expect(sale!.prep_status).toBe('new');
  });

  it('needs a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/kitchen/orders' });
    expect(res.statusCode).toBe(401);
  });
});
