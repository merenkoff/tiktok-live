// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.weighed-stock.test.ts — the owner's stock screens for
// goods sold by weight (migration 075, TechDocs/grocery/G4_WEIGHED.md). Stock
// stays grams; what changes is that every row the stock screens read says
// what its price is for (`price_per`), so they can show and take kilograms,
// and that «мало на складі» counts in the unit the variant is SOLD in — three
// kilograms of cheese, not three grams.

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

describe.skipIf(!hasDb)('POS stock screens for weighed goods', () => {
  let app: FastifyInstance;
  let store: TestStore;
  const ids: Record<string, number> = {};

  const get = (url: string) =>
    app.inject({ method: 'GET', url: `/api/pos${url}`, headers: auth(store.ownerToken) });

  async function product(name: string, unit: string, quantity: number, priceCents: number): Promise<number> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/products',
      headers: auth(store.ownerToken),
      payload: { name, variants: [{ attributes: {}, unit, price_cents: priceCents, quantity }] },
    });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { variants: Array<{ id: number }> }).variants[0].id;
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('weighed_stock');
    // The real grocery vertical: it weighs grams and millilitres, so the
    // server derives `price_per` 1000 for those units itself.
    await pool.query(`UPDATE pos_stores SET vertical = 'grocery' WHERE id = $1`, [store.storeId]);
    ids.cheese = await product('Сир твердий', 'г', 2500, 18990);
    ids.salami = await product('Ковбаса', 'г', 3500, 29900);
    ids.kvass = await product('Квас розливний', 'мл', 2000, 4500);
    ids.bread = await product('Хліб', 'шт', 3, 4590);
    ids.milk = await product('Молоко', 'шт', 4, 4290);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  it('calls a weighed variant low at three kilograms or litres, a piece at three pieces', async () => {
    const res = await get('/stock/low');
    expect(res.statusCode, res.body).toBe(200);
    const low = res.json() as Array<{ variant_id: number; quantity: number; price_per: number }>;
    const byId = new Map(low.map((row) => [row.variant_id, row]));

    expect(byId.get(ids.cheese)).toMatchObject({ quantity: 2500, price_per: 1000 });
    expect(byId.get(ids.kvass)).toMatchObject({ quantity: 2000, price_per: 1000 });
    expect(byId.get(ids.bread)).toMatchObject({ quantity: 3, price_per: 1 });
    // 3,5 кг of salami and four bottles of milk are not running out.
    expect(byId.has(ids.salami)).toBe(false);
    expect(byId.has(ids.milk)).toBe(false);

    // Ordered by what is left in selling units: 2 l, 2,5 kg, 3 pieces —
    // not by raw base units, which would put the bread first.
    expect(low.map((row) => row.variant_id)).toEqual([ids.kvass, ids.cheese, ids.bread]);
  });

  it('says on the on-hand sheet which rows are counted in kilograms', async () => {
    const res = await get('/stock/reports/on-hand');
    expect(res.statusCode, res.body).toBe(200);
    const rows = res.json() as Array<{ variant_id: number; price_per: number; quantity: number }>;
    const byId = new Map(rows.map((row) => [row.variant_id, row]));
    expect(byId.get(ids.cheese)).toMatchObject({ price_per: 1000, quantity: 2500 });
    expect(byId.get(ids.bread)).toMatchObject({ price_per: 1, quantity: 3 });
  });

  it('says it in the movement history and the period report too', async () => {
    const movements = await get(`/stock/reports/movements?variant_id=${ids.cheese}`);
    expect(movements.statusCode, movements.body).toBe(200);
    const history = movements.json() as Array<{ variant_id: number; price_per: number; delta: number }>;
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((row) => row.variant_id === ids.cheese && row.price_per === 1000)).toBe(true);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const report = await get(`/stock/reports/movement-summary?from=${from}&to=${to}`);
    expect(report.statusCode, report.body).toBe(200);
    const rows = report.json() as Array<{ variant_id: number; price_per: number; closing: number }>;
    const byId = new Map(rows.map((row) => [row.variant_id, row]));
    expect(byId.get(ids.cheese)).toMatchObject({ price_per: 1000, closing: 2500 });
    expect(byId.get(ids.bread)).toMatchObject({ price_per: 1, closing: 3 });
  });
});
