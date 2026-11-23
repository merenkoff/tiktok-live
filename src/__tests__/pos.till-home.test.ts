// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.till-home.test.ts — the till's home screen
// (migration 112, TechDocs/POS_CLOTHING.md «Головна каси й швидкість фото»).
//
// The owner ticks «На головному екрані каси» on a card (one at a time, or many
// from the list), and the journal says who did. While nothing is ticked the
// home screen is what sold most in 30 days of the store's calendar — counted
// as purchases, voided receipts and older sales left out — and it rides in
// the snapshot so the offline till builds the same screen. `?home=1` answers
// both sets whole; a page of «Усі товари» is a page of CARDS, never a cut
// through one.

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
  type TestProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';

interface Row {
  product_id: number;
  variant_id: number;
  product_name: string;
  till_home: boolean;
  popular_rank: number | null;
}

describe.skipIf(!hasDb)('POS till home screen', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;
  const p: Record<string, TestProduct> = {};

  async function sell(variantId: number, quantity: number): Promise<number> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: variantId, quantity }],
        payments: [{ method: 'cash', amount_cents: 10000 * quantity }],
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return Number(res.json().id);
  }

  async function catalog(query = ''): Promise<Row[]> {
    const res = await app.inject({ method: 'GET', url: `/api/pos/catalog${query}`, headers: auth(store.sellerToken) });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Row[];
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('tillhome');
    other = await createTestStore('tillhome_x');
    for (const name of ['Боді', 'Комбінезон', 'Кофта', 'Повзунки', 'Сукня', 'Шапка']) {
      p[name] = await seedProduct(store.storeId, { name, quantity: 50 });
    }

    await sell(p['Комбінезон'].variantId, 1);
    await sell(p['Боді'].variantId, 3);
    // Forty days ago on the store's calendar: outside the window.
    const old = await sell(p['Кофта'].variantId, 5);
    await pool.query(
      `UPDATE pos_sales s
          SET created_at = ((NOW() AT TIME ZONE st.timezone) - INTERVAL '40 days') AT TIME ZONE st.timezone
         FROM pos_stores st
        WHERE st.id = s.store_id AND s.id = $1`,
      [old]
    );
    // Voided: never counted.
    const voided = await sell(p['Повзунки'].variantId, 4);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${voided}/void`,
      headers: auth(store.ownerToken),
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(200);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  it('ranks what sold most in 30 days, in the snapshot and nowhere it is not asked', async () => {
    const snapshot = await catalog('?all=1');
    const rank = new Map(snapshot.map((r) => [r.product_name, r.popular_rank]));
    expect(rank.get('Боді')).toBe(1);
    expect(rank.get('Комбінезон')).toBe(2);
    expect(rank.get('Кофта')).toBeNull();
    expect(rank.get('Повзунки')).toBeNull();
    expect(rank.get('Сукня')).toBeNull();
    // A folder or a scan reads no aggregate: the rank is null there.
    expect((await catalog()).every((r) => r.popular_rank === null)).toBe(true);
  });

  it('answers the ticked cards and the sellers whole for ?home=1', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/pos/products/${p['Шапка'].productId}`,
      headers: auth(store.ownerToken),
      payload: { till_home: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().till_home).toBe(true);

    const home = await catalog('?home=1');
    expect(home.map((r) => r.product_name).sort()).toEqual(['Боді', 'Комбінезон', 'Шапка']);
    expect(home.find((r) => r.product_name === 'Шапка')?.till_home).toBe(true);
    expect(home.find((r) => r.product_name === 'Боді')?.popular_rank).toBe(1);
  });

  it('ticks many cards at once, leaving another store and the archive alone, and journals it', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/pos/products/${p['Повзунки'].productId}/archive`,
      headers: auth(store.ownerToken),
    });
    const foreign = await seedProduct(other.storeId, { name: 'Чужий' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/products/till-home',
      headers: auth(store.ownerToken),
      payload: {
        product_ids: [p['Сукня'].productId, p['Шапка'].productId, p['Повзунки'].productId, foreign.productId],
        on: true,
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    // «Шапка» was ticked already, «Повзунки» is archived, «Чужий» is not ours.
    expect(res.json()).toEqual({ changed: 1, product_ids: [p['Сукня'].productId] });

    const foreignRow = await pool.query(`SELECT till_home FROM pos_products WHERE id = $1`, [foreign.productId]);
    expect(foreignRow.rows[0].till_home).toBe(false);

    const journal = await app.inject({
      method: 'GET',
      url: `/api/pos/menu-changes?entity=product&entity_id=${p['Сукня'].productId}`,
      headers: auth(store.ownerToken),
    });
    expect(journal.statusCode, journal.body).toBe(200);
    const rows = journal.json().changes as Array<{ changes: Array<{ field: string; from: unknown; to: unknown }> }>;
    expect(rows[0].changes).toContainEqual({ field: 'till_home', from: false, to: true });

    const off = await app.inject({
      method: 'POST',
      url: '/api/pos/products/till-home',
      headers: auth(store.ownerToken),
      payload: { product_ids: [p['Сукня'].productId, p['Шапка'].productId], on: false },
    });
    expect(off.json().changed).toBe(2);

    for (const payload of [{}, { product_ids: [], on: true }, { product_ids: [1], on: 'yes' }]) {
      const bad = await app.inject({
        method: 'POST',
        url: '/api/pos/products/till-home',
        headers: auth(store.ownerToken),
        payload,
      });
      expect(bad.statusCode).toBe(400);
    }
    // A seller does not keep the catalogue.
    const seller = await app.inject({
      method: 'POST',
      url: '/api/pos/products/till-home',
      headers: auth(store.sellerToken),
      payload: { product_ids: [p['Сукня'].productId], on: true },
    });
    expect(seller.statusCode).toBe(403);
  });

  it('pages «Усі товари» by cards, never through one', async () => {
    // A second size on every card: a variant page would cut cards in half.
    for (const { productId } of Object.values(p)) {
      await pool.query(
        `INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
         VALUES ($1, $2, '{"size":"L","color":"black"}'::jsonb, 'L · black', 'шт', 10000, 0)`,
        [store.storeId, productId]
      );
    }
    const pages: string[][] = [];
    for (let offset = 0; offset < 6; offset += 2) {
      const rows = await catalog(`?limit=2&offset=${offset}`);
      const names = [...new Set(rows.map((r) => r.product_name))];
      // Both sizes of every card on the page.
      expect(rows).toHaveLength(names.length * 2);
      pages.push(names);
    }
    // «Повзунки» is in the archive: five live cards, alphabetically.
    expect(pages).toEqual([['Боді', 'Комбінезон'], ['Кофта', 'Сукня'], ['Шапка']]);
  });
});
