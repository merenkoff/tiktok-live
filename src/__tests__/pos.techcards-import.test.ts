// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.techcards-import.test.ts — «Імпорт техкарт» through
// `POST /api/pos/products/tech-cards/import` (TechDocs/POS_ONBOARDING.md, O3):
// a table becomes ingredients with prices and dishes with recipes, all or
// nothing, by the same rules a hand edit follows.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { createProduct } from '../pos/products.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

type Row = { dish: string; variant?: string; ingredient: string; quantity: string; unit: string; price?: string; line?: number };

describe.skipIf(!hasDb)('POST /api/pos/products/tech-cards/import', () => {
  let app: FastifyInstance;
  let store: TestStore;

  const send = (rows: Row[], apply = false, token = store.ownerToken) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/products/tech-cards/import',
      headers: auth(token),
      payload: { rows, apply },
    });

  const product = async (name: string) =>
    (
      await pool.query(
        `SELECT p.id, p.kind, p.stock_mode, p.sellable FROM pos_products p WHERE p.store_id = $1 AND p.name = $2`,
        [store.storeId, name]
      )
    ).rows[0];

  const recipe = async (dish: string, label = '') =>
    (
      await pool.query(
        `SELECT ip.name, c.quantity
           FROM pos_product_components c
           JOIN pos_variants v ON v.id = c.variant_id JOIN pos_products p ON p.id = v.product_id
           JOIN pos_variants iv ON iv.id = c.component_variant_id JOIN pos_products ip ON ip.id = iv.product_id
          WHERE p.store_id = $1 AND p.name = $2 AND v.label = $3
          ORDER BY c.sort_order`,
        [store.storeId, dish, label]
      )
    ).rows.map((r) => `${r.name} ${r.quantity}`);

  const BORSHCH: Row[] = [
    { dish: 'Борщ', ingredient: 'Буряк', quantity: '80', unit: 'г', price: '20' },
    { dish: 'Борщ', ingredient: 'Капуста', quantity: '50', unit: 'г', price: '15' },
    { dish: 'Борщ', ingredient: 'Яловичина', quantity: '0,07', unit: 'кг', price: '280' },
  ];
  const VZVAR: Row[] = [
    { dish: 'Взвар', variant: '1 л', ingredient: 'Сухофрукти', quantity: '120', unit: 'г', price: '200' },
    { dish: 'Взвар', variant: '1 л', ingredient: 'Цукор', quantity: '30', unit: 'г', price: '40' },
    { dish: 'Взвар', variant: '300 мл', ingredient: 'Сухофрукти', quantity: '40', unit: 'г' },
    { dish: 'Взвар', variant: '300 мл', ingredient: 'Цукор', quantity: '10', unit: 'г' },
  ];

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('tcimp');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    const v = (size: string, price: number, quantity = 0) => ({ attributes: size ? { size } : {}, unit: 'шт', price_cents: price, quantity });
    await createProduct(store.storeId, { name: 'Борщ', variants: [v('', 15500)] });
    await createProduct(store.storeId, { name: 'Взвар', variants: [v('1 л', 11000), v('300 мл', 4000)] });
    await createProduct(store.storeId, { name: 'Компот', variants: [v('1 л', 12000), v('300 мл', 4500)] });
    await createProduct(store.storeId, { name: 'Сирник', variants: [v('', 6500, 5)] });
    await createProduct(store.storeId, { name: 'Дубль', variants: [v('', 1000)] });
    await createProduct(store.storeId, { name: 'Дубль', variants: [v('', 2000)] });
    await createProduct(store.storeId, {
      name: 'Буряк',
      sellable: false,
      variants: [{ attributes: {}, unit: 'г', price_cents: 0, cost_cents: 1, quantity: 0 }],
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  it('previews: new ingredients, a price that changes, each dish’s cost and food cost — and writes nothing', async () => {
    const res = await send([...BORSHCH, ...VZVAR]);
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan).toMatchObject({ ok: true, applied: false, errors: [] });
    expect(plan.totals).toEqual({ dishes: 3, becomes_derived: 3, replaced: 0, ingredients_new: 4, prices_set: 5 });
    const borshch = plan.dishes.find((d: { dish: string }) => d.dish === 'Борщ');
    // 80 г × 2 коп + 50 г × 2 коп (15 ₴/кг rounds to 2 kop/g) + 70 г × 28 коп = 160 + 100 + 1960
    expect(borshch).toMatchObject({ becomes: 'derived', cost_cents: 2220, price_cents: 15500, food_cost_bps: 1432, error: null });
    expect(borshch.components).toEqual([
      { ingredient: 'Буряк', quantity: 80, unit: 'г', is_new: false },
      { ingredient: 'Капуста', quantity: 50, unit: 'г', is_new: true },
      { ingredient: 'Яловичина', quantity: 70, unit: 'г', is_new: true },
    ]);
    expect(plan.ingredients.find((i: { name: string }) => i.name === 'Буряк')).toMatchObject({ cost_cents: 2, price_changed: true, is_new: false });
    expect((await product('Борщ')).kind).toBe('simple');
    expect(await product('Капуста')).toBeUndefined();
  });

  it('applies: ingredients off the menu with prices per base unit, dishes become recipes, food cost shows', async () => {
    const res = await send([...BORSHCH, ...VZVAR], true);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, applied: true });

    expect(await product('Борщ')).toMatchObject({ kind: 'composite', stock_mode: 'derived' });
    expect(await product('Взвар')).toMatchObject({ kind: 'composite', stock_mode: 'derived' });
    expect(await recipe('Борщ')).toEqual(['Буряк 80', 'Капуста 50', 'Яловичина 70']);
    expect(await recipe('Взвар', '300 мл')).toEqual(['Сухофрукти 40', 'Цукор 10']);

    const ingredients = await pool.query(
      `SELECT p.name, p.sellable, v.unit, v.cost_cents, t.name AS tag
         FROM pos_products p JOIN pos_variants v ON v.product_id = p.id
         LEFT JOIN pos_product_tags pt ON pt.product_id = p.id LEFT JOIN pos_tags t ON t.id = pt.tag_id
        WHERE p.store_id = $1 AND p.name IN ('Капуста', 'Яловичина', 'Сухофрукти', 'Цукор', 'Буряк') ORDER BY p.name`,
      [store.storeId]
    );
    expect(ingredients.rows).toEqual([
      { name: 'Буряк', sellable: false, unit: 'г', cost_cents: 2, tag: null },
      { name: 'Капуста', sellable: false, unit: 'г', cost_cents: 2, tag: 'Складники' },
      { name: 'Сухофрукти', sellable: false, unit: 'г', cost_cents: 20, tag: 'Складники' },
      { name: 'Цукор', sellable: false, unit: 'г', cost_cents: 4, tag: 'Складники' },
      { name: 'Яловичина', sellable: false, unit: 'г', cost_cents: 28, tag: 'Складники' },
    ]);

    // The expanded recipes were rebuilt once, for every dish.
    const flat = await pool.query(
      `SELECT count(DISTINCT f.variant_id)::int AS n FROM pos_product_components_flat f WHERE f.store_id = $1`,
      [store.storeId]
    );
    expect(flat.rows[0].n).toBe(3);

    const cards = await app.inject({ method: 'GET', url: '/api/pos/products/tech-cards', headers: auth(store.ownerToken) });
    const borshchCard = cards.json().find((c: { product_name: string }) => c.product_name === 'Борщ');
    expect(borshchCard).toMatchObject({ cost_cents: 2220 });
  });

  it('runs again: a dish’s recipe is replaced wholesale, not added to', async () => {
    const res = await send([{ dish: 'Борщ', ingredient: 'Буряк', quantity: '100', unit: 'г' }], true);
    expect(res.json()).toMatchObject({ ok: true, applied: true });
    expect(res.json().dishes[0]).toMatchObject({ becomes: 'replaced' });
    expect(await recipe('Борщ')).toEqual(['Буряк 100']);
  });

  it('refuses the whole table for one bad row, naming every row to fix', async () => {
    const res = await send(
      [
        { dish: 'Невідома страва', ingredient: 'Сіль', quantity: '2', unit: 'г' },
        { dish: 'Сирник', ingredient: 'Сир', quantity: '100', unit: 'г' },
        { dish: 'Компот', variant: '1 л', ingredient: 'Ягоди', quantity: '150', unit: 'г' },
        { dish: 'Взвар', ingredient: 'Сухофрукти', quantity: '40', unit: 'г' },
        { dish: 'Дубль', ingredient: 'Сіль', quantity: '1', unit: 'г' },
        { dish: 'Борщ', ingredient: 'Буряк', quantity: '80', unit: 'мл', line: 7 },
        { dish: 'Борщ', ingredient: 'Яйце', quantity: '0,5', unit: 'шт', line: 8 },
        { dish: 'Борщ', ingredient: 'Сало', quantity: '20', unit: 'ложки', line: 9 },
        { dish: 'Борщ', ingredient: 'Перець', quantity: '1', unit: 'г', price: 'дорого', line: 10 },
      ],
      true
    );
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan).toMatchObject({ ok: false, applied: false });
    const dishErrors = plan.dishes.map((d: { error: string | null }) => d.error).filter(Boolean).join('\n');
    expect(dishErrors).toMatch(/страви «Невідома страва» немає в магазині/);
    expect(dishErrors).toMatch(/«Сирник»: на полиці 5/);
    expect(dishErrors).toMatch(/у «Компот» техкарта потрібна кожному варіанту — бракує: 300 мл/);
    expect(dishErrors).toMatch(/у «Взвар» кілька варіантів \(1 л, 300 мл\) — вкажіть варіант/);
    expect(dishErrors).toMatch(/«Дубль»: у магазині 2 товари з такою назвою/);
    const rowErrors = plan.errors.join('\n');
    expect(rowErrors).toMatch(/Рядок 7: «Буряк» ведеться в г, а в таблиці — мл/);
    expect(rowErrors).toMatch(/Рядок 8: 0,5 шт — у техкарті лише цілі шт/);
    expect(rowErrors).toMatch(/Рядок 9: одиниця «ложки»/);
    expect(rowErrors).toMatch(/Рядок 10: ціна «дорого»/);
    // Nothing was written: the dishes are as they were.
    expect(await product('Компот')).toMatchObject({ kind: 'simple' });
    expect(await product('Ягоди')).toBeUndefined();
    expect(await recipe('Борщ')).toEqual(['Буряк 100']);
  });

  it('keeps a price below a kopeck from reading as «unknown»', async () => {
    const res = await send([{ dish: 'Компот', variant: '1 л', ingredient: 'Вода фільтрована', quantity: '900', unit: 'мл', price: '3' }, { dish: 'Компот', variant: '300 мл', ingredient: 'Вода фільтрована', quantity: '270', unit: 'мл' }]);
    expect(res.json().ok).toBe(true);
    expect(res.json().ingredients[0]).toMatchObject({ name: 'Вода фільтрована', cost_cents: 1 });
    expect(res.json().warnings.join('\n')).toMatch(/дешевший за копійку за мл — записано 1 коп\/мл/);
  });

  it('is the owner’s alone', async () => {
    const res = await send(BORSHCH, false, store.sellerToken);
    expect(res.statusCode).toBe(403);
  });

  it('refuses a store whose type has no composite products', async () => {
    await pool.query(`UPDATE pos_stores SET vertical = 'clothing' WHERE id = $1`, [store.storeId]);
    const res = await send(BORSHCH);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/немає складених товарів/);
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
  });
});
