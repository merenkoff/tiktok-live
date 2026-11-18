// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A purchase price to the kopeck per kilogram (migration 103, `src/pos/cost.ts`).
//
// Whole kopecks per gram moved a kilogram's price in steps of 10 ₴: sugar at
// 35,50 ₴/кг was stored as «4 kopecks a gram», and every food cost built on it
// was wrong by that much. What these tests hold:
//
//   · the precise figure survives the whole road — the card, a receipt, a
//     production document, the tech card, the café's analytics;
//   · the rounded `cost_cents` still follows it, in both directions, so a till
//     or a script written before the migration neither breaks nor coarsens a
//     price it did not mean to change;
//   · a marketer sees neither figure.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { getCafeAnalytics } from '../pos/cafe-analytics.service.js';
import {
  costMilliFromInput,
  foodCostBps,
  lineCostCents,
  milliToCents,
  unitCostMilliFromInput,
} from '../pos/cost.js';
import { completeSale } from '../pos/sales.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe('cost: thousandths of a kopeck per base unit', () => {
  it('rounds a sum once, half up', () => {
    expect(milliToCents(63_900)).toBe(64);
    expect(milliToCents(499)).toBe(0);
    expect(milliToCents(500)).toBe(1);
    // 18 г of sugar at 35,50 ₴/кг: 63,9 kopecks — not 18 × «4 kopecks» = 72.
    expect(lineCostCents(18, 3550)).toBe(64);
    expect(foodCostBps(217_930, 1000)).toBe(2179);
  });

  it('reads a request that carries either figure', () => {
    expect(costMilliFromInput({ cost_milli: 3550 })).toBe(3550);
    expect(costMilliFromInput({ cost_milli: 3550, cost_cents: 9 })).toBe(3550);
    expect(costMilliFromInput({ cost_cents: 5 })).toBe(5000);
    expect(costMilliFromInput({})).toBeUndefined();
    // An older client sends back the rounded figure it read: not a new price.
    expect(costMilliFromInput({ cost_cents: 4 }, 3550)).toBeUndefined();
    expect(costMilliFromInput({ cost_cents: 5 }, 3550)).toBe(5000);
    expect(() => costMilliFromInput({ cost_milli: 1.5 })).toThrow(/ціле число/);
    expect(() => costMilliFromInput({ cost_cents: -1 })).toThrow(/ціле число/);
  });

  it('lets a document line clear its price, and leaves it when nothing is said', () => {
    expect(unitCostMilliFromInput({})).toBeUndefined();
    expect(unitCostMilliFromInput({ unit_cost_milli: null })).toBeNull();
    expect(unitCostMilliFromInput({ unit_cost_cents: null })).toBeNull();
    expect(unitCostMilliFromInput({ unit_cost_cents: 4 })).toBe(4000);
    expect(unitCostMilliFromInput({ unit_cost_milli: 3550, unit_cost_cents: 4 })).toBe(3550);
  });
});

describe.skipIf(!hasDb)('POS purchase price: to the kopeck per kilogram', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let sugar = 0;
  let sugarProduct = 0;
  let tea = 0;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url: `/api/pos${url}`, headers: auth(token), payload: payload as object });

  const variantRow = async (id: number) =>
    (await pool.query(`SELECT cost_cents, cost_milli FROM pos_variants WHERE id = $1`, [id])).rows[0];

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('costmilli');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);

    const made = await call('POST', '/products', store.ownerToken, {
      name: 'Цукор',
      sellable: false,
      // 35,50 ₴/кг = 3550 kopecks a kilogram = 3550 thousandths a gram.
      variants: [{ attributes: {}, unit: 'г', price_cents: 0, cost_milli: 3550, quantity: 0 }],
    });
    expect(made.statusCode).toBe(201);
    sugarProduct = Number(made.json().id);
    sugar = Number(made.json().variants[0].id);

    const dish = await call('POST', '/products', store.ownerToken, {
      name: 'Чай солодкий',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [{ attributes: {}, price_cents: 4000, components: [{ component_variant_id: sugar, quantity: 18 }] }],
    });
    expect(dish.statusCode).toBe(201);
    tea = Number(dish.json().variants[0].id);
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await app?.close();
  });

  it('keeps the price as typed, with its rounded copy beside it', async () => {
    const card = (await call('GET', `/products/${sugarProduct}`, store.ownerToken)).json();
    expect(card.variants[0]).toMatchObject({ cost_milli: 3550, cost_cents: 4 });
  });

  it('costs a dish from the precise price: 18 г is 0,64 ₴, not 0,72', async () => {
    const cards = (await call('GET', '/products/tech-cards', store.ownerToken)).json();
    const row = cards.find((c: { variant_id: number }) => c.variant_id === tea);
    expect(row).toMatchObject({ cost_milli: 63_900, cost_cents: 64, food_cost_bps: 160, has_unpriced_leaf: false });
  });

  it('an older client saving the card does not coarsen the price it only read', async () => {
    // It read `cost_cents: 4` and sends it back with the field it did change.
    const res = await call('PATCH', `/variants/${sugar}`, store.ownerToken, { cost_cents: 4, sku: 'SUG-1' });
    expect(res.statusCode).toBe(200);
    expect(await variantRow(sugar)).toMatchObject({ cost_milli: '3550', cost_cents: 4 });

    // A figure it did type is a new price, in the only precision it has.
    await call('PATCH', `/variants/${sugar}`, store.ownerToken, { cost_cents: 5 });
    expect(await variantRow(sugar)).toMatchObject({ cost_milli: '5000', cost_cents: 5 });

    await call('PATCH', `/variants/${sugar}`, store.ownerToken, { cost_milli: 3550 });
    expect(await variantRow(sugar)).toMatchObject({ cost_milli: '3550', cost_cents: 4 });
  });

  it('refuses a price that is not a whole number of thousandths', async () => {
    const res = await call('PATCH', `/variants/${sugar}`, store.ownerToken, { cost_milli: 12.5 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Закупівельна ціна/);
    expect(await variantRow(sugar)).toMatchObject({ cost_milli: '3550' });
  });

  it('plain SQL that knows only the old column still lands on both', async () => {
    const product = await pool.query(`INSERT INTO pos_products (store_id, name) VALUES ($1, 'Сіль') RETURNING id`, [
      store.storeId,
    ]);
    const inserted = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
       VALUES ($1, $2, '{}'::jsonb, '', 'г', 0, 2) RETURNING id`,
      [store.storeId, product.rows[0].id]
    );
    const salt = Number(inserted.rows[0].id);
    expect(await variantRow(salt)).toMatchObject({ cost_milli: '2000', cost_cents: 2 });

    await pool.query(`UPDATE pos_variants SET cost_cents = 7 WHERE id = $1`, [salt]);
    expect(await variantRow(salt)).toMatchObject({ cost_milli: '7000', cost_cents: 7 });

    await pool.query(`UPDATE pos_variants SET cost_milli = 7300 WHERE id = $1`, [salt]);
    expect(await variantRow(salt)).toMatchObject({ cost_milli: '7300', cost_cents: 7 });
    // Writing the rounded figure it already has changes nothing.
    await pool.query(`UPDATE pos_variants SET cost_cents = 7, updated_at = NOW() WHERE id = $1`, [salt]);
    expect(await variantRow(salt)).toMatchObject({ cost_milli: '7300', cost_cents: 7 });
    // Half a kopeck and up rounds up; below it the old column reads 0 and the sum still has the price.
    await pool.query(`UPDATE pos_variants SET cost_milli = 500 WHERE id = $1`, [salt]);
    expect(await variantRow(salt)).toMatchObject({ cost_milli: '500', cost_cents: 1 });
    await pool.query(`UPDATE pos_variants SET cost_milli = 300 WHERE id = $1`, [salt]);
    expect(await variantRow(salt)).toMatchObject({ cost_milli: '300', cost_cents: 0 });
  });

  it('a receipt at 42,75 ₴/кг sets exactly that: on the line, the movement and the card', async () => {
    const doc = (await call('POST', '/stock/documents', store.ownerToken, { type: 'receipt' })).json();
    const line = await call('POST', `/stock/documents/${doc.id}/lines`, store.ownerToken, {
      variant_id: sugar,
      quantity: 5000,
      unit_cost_milli: 4275,
    });
    expect(line.statusCode).toBe(201);
    expect(line.json()).toMatchObject({ unit_cost_milli: 4275, unit_cost_cents: 4 });

    // An older stock screen retypes the line with the only figure it knows.
    const patched = await call('PATCH', `/stock/documents/${doc.id}/lines/${line.json().id}`, store.ownerToken, {
      unit_cost_cents: 5,
    });
    expect(patched.json()).toMatchObject({ unit_cost_milli: 5000, unit_cost_cents: 5 });
    await call('PATCH', `/stock/documents/${doc.id}/lines/${line.json().id}`, store.ownerToken, { unit_cost_milli: 4275 });

    expect((await call('POST', `/stock/documents/${doc.id}/post`, store.ownerToken)).statusCode).toBe(200);
    expect(await variantRow(sugar)).toMatchObject({ cost_milli: '4275', cost_cents: 4 });
    const movement = await pool.query(
      `SELECT unit_cost_milli, unit_cost_cents FROM pos_stock_movements
       WHERE store_id = $1 AND variant_id = $2 AND reason = 'receipt' ORDER BY id DESC LIMIT 1`,
      [store.storeId, sugar]
    );
    expect(movement.rows[0]).toMatchObject({ unit_cost_milli: '4275', unit_cost_cents: 4 });

    const onHand = (await call('GET', '/stock/reports/on-hand', store.ownerToken)).json();
    expect(onHand.find((r: { variant_id: number }) => r.variant_id === sugar)).toMatchObject({
      quantity: 5000,
      cost_milli: 4275,
      cost_cents: 4,
    });
  });

  it('production writes the exact sum of its ingredients — nothing is rounded on the way', async () => {
    const made = await call('POST', '/products', store.ownerToken, {
      name: 'Сироп, порція',
      kind: 'composite',
      stock_mode: 'own',
      sellable: false,
      variants: [{ attributes: {}, price_cents: 0, components: [{ component_variant_id: sugar, quantity: 33 }] }],
    });
    const syrup = Number(made.json().variants[0].id);
    const doc = (await call('POST', '/stock/documents', store.ownerToken, { type: 'production' })).json();
    const line = await call('POST', `/stock/documents/${doc.id}/lines`, store.ownerToken, { variant_id: syrup, quantity: 4 });
    expect(line.statusCode).toBe(201);
    expect((await call('POST', `/stock/documents/${doc.id}/post`, store.ownerToken)).statusCode).toBe(200);

    // 33 г × 4,275 коп = 141,075 коп a portion.
    expect(await variantRow(syrup)).toMatchObject({ cost_milli: '141075', cost_cents: 141 });
    const posted = (await call('GET', `/stock/documents/${doc.id}`, store.ownerToken)).json();
    expect(posted.lines[0]).toMatchObject({ unit_cost_milli: 141_075, unit_cost_cents: 141 });
  });

  it('the café’s food cost adds the precise figures up and rounds once', async () => {
    await completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items: [{ variant_id: tea, quantity: 7 }],
      payments: [{ method: 'cash', amount_cents: 28_000 }],
    });
    const figures = await getCafeAnalytics(store.storeId);
    // 7 чаїв × 18 г × 4,275 коп = 538,65 коп → 539. Whole kopecks a gram gave 7 × 18 × 4 = 504.
    expect(figures.food_cost).toMatchObject({ revenue_cents: 28_000, cost_cents: 539, unpriced_lines: 0 });
    expect(figures.menu.rows.find((r) => r.variant_id === tea)).toMatchObject({ cost_cents: 539 });
  });

  it('a price below half a kopeck a gram is a price, not «unknown»', async () => {
    const made = await call('POST', '/products', store.ownerToken, {
      name: 'Вода',
      sellable: false,
      // 3 ₴ a litre: 0,3 kopecks a millilitre.
      variants: [{ attributes: {}, unit: 'мл', price_cents: 0, cost_milli: 300, quantity: 0 }],
    });
    const water = Number(made.json().variants[0].id);
    const dish = await call('POST', '/products', store.ownerToken, {
      name: 'Окріп',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [{ attributes: {}, price_cents: 1000, components: [{ component_variant_id: water, quantity: 250 }] }],
    });
    const cards = (await call('GET', '/products/tech-cards', store.ownerToken)).json();
    const row = cards.find((c: { variant_id: number }) => c.variant_id === Number(dish.json().variants[0].id));
    expect(row).toMatchObject({ cost_cents: 75, has_unpriced_leaf: false, food_cost_bps: 750 });
  });
});
