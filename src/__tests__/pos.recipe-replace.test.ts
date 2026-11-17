// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Замінити в усіх рецептах» (`POST /products/components/replace`): one
// ingredient swapped for another in every recipe, in one transaction — the
// multiplier never empty, a recipe that already holds the replacement gets the
// quantities added, a swap one recipe cannot take refuses them all.

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

describe.skipIf(!hasDb)('POS recipes: replace an ingredient everywhere', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let cream = 0;
  let oatCream = 0;
  let sugar = 0;
  let soup = { productId: 0, variantId: 0 };
  let cake = { productId: 0, variantId: 0 };
  let answerId = 0;

  const owner = () => auth(store.ownerToken);

  async function recipeOf(variantId: number): Promise<Array<[number, number]>> {
    const rows = await pool.query(
      `SELECT component_variant_id, quantity FROM pos_product_components
       WHERE variant_id = $1 ORDER BY sort_order, id`,
      [variantId]
    );
    return rows.rows.map((r) => [Number(r.component_variant_id), Number(r.quantity)]);
  }

  async function makeDish(name: string, components: Array<[number, number]>) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/products',
      headers: owner(),
      payload: {
        name,
        kind: 'composite',
        stock_mode: 'derived',
        variants: [
          {
            price_cents: 10000,
            components: components.map(([component_variant_id, quantity]) => ({ component_variant_id, quantity })),
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const product = res.json();
    return { productId: Number(product.id), variantId: Number(product.variants[0].id) };
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rreplace');
    cream = (await seedProduct(store.storeId, { name: 'Вершки', priceCents: 0, quantity: 5000 })).variantId;
    oatCream = (await seedProduct(store.storeId, { name: 'Вершки вівсяні', priceCents: 0, quantity: 5000 })).variantId;
    sugar = (await seedProduct(store.storeId, { name: 'Цукор', priceCents: 0, quantity: 5000 })).variantId;
    soup = await makeDish('Крем-суп', [
      [cream, 100],
      [sugar, 10],
    ]);
    // Already holds the replacement: the two quantities must add up, not list it twice.
    cake = await makeDish('Торт', [
      [sugar, 30],
      [cream, 50],
      [oatCream, 20],
    ]);
    const group = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: owner(),
      payload: {
        name: 'Додатково',
        modifiers: [{ name: 'з вершками', component_variant_id: cream, component_quantity: 25 }],
      },
    });
    answerId = Number(group.json().modifiers[0].id);
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store.storeId);
    await app.close();
  });

  const replace = (payload: Record<string, unknown>, headers = owner()) =>
    app.inject({ method: 'POST', url: '/api/pos/products/components/replace', headers, payload });

  it('refuses in words and changes nothing: no multiplier, the same ingredient, another store’s', async () => {
    const before = [await recipeOf(soup.variantId), await recipeOf(cake.variantId)];

    const noFactor = await replace({ from_variant_id: cream, to_variant_id: oatCream });
    expect(noFactor.statusCode).toBe(400);
    expect(noFactor.json().error).toMatch(/множник/);

    const zero = await replace({ from_variant_id: cream, to_variant_id: oatCream, factor: 0 });
    expect(zero.statusCode).toBe(400);

    const same = await replace({ from_variant_id: cream, to_variant_id: cream, factor: 1 });
    expect(same.statusCode).toBe(400);
    expect(same.json().error).toMatch(/інший/);

    const other = await createTestStore('rreplace2');
    try {
      const foreign = await seedProduct(other.storeId, { name: 'Чуже' });
      const res = await replace({ from_variant_id: cream, to_variant_id: foreign.variantId, factor: 1 });
      expect(res.statusCode).toBe(400);
    } finally {
      await dropTestStore(other.storeId);
    }

    expect([await recipeOf(soup.variantId), await recipeOf(cake.variantId)]).toEqual(before);
  });

  it('is all or nothing: a swap one recipe cannot take leaves every recipe as it was', async () => {
    const before = [await recipeOf(soup.variantId), await recipeOf(cake.variantId)];
    // Under this vertical a recipe may not hold a recipe: sugar → «Торт» is
    // fine for nobody, and «Крем-суп» — rewritten first — must not keep it.
    const res = await replace({ from_variant_id: sugar, to_variant_id: cake.variantId, factor: 1 });
    expect(res.statusCode).toBe(400);
    expect([await recipeOf(soup.variantId), await recipeOf(cake.variantId)]).toEqual(before);
  });

  it('403s a seller', async () => {
    const res = await replace({ from_variant_id: cream, to_variant_id: oatCream, factor: 1 }, auth(store.sellerToken));
    expect(res.statusCode).toBe(403);
  });

  it('swaps it in every recipe: same place, quantity × multiplier, twins added, modifiers only when asked', async () => {
    const res = await replace({ from_variant_id: cream, to_variant_id: oatCream, factor: 1.5 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recipes: 2, products: 2, modifiers: 0 });

    expect(await recipeOf(soup.variantId)).toEqual([
      [oatCream, 150],
      [sugar, 10],
    ]);
    // 50 × 1.5 = 75 joins the 20 that was already there, in the first one's place.
    expect(await recipeOf(cake.variantId)).toEqual([
      [sugar, 30],
      [oatCream, 95],
    ]);

    // The expanded recipes the till writes off from were rebuilt with it.
    const flat = await pool.query(
      `SELECT leaf_variant_id, quantity_per_unit FROM pos_product_components_flat
       WHERE variant_id = $1 ORDER BY leaf_variant_id`,
      [soup.variantId]
    );
    expect(flat.rows.map((r) => [Number(r.leaf_variant_id), Number(r.quantity_per_unit)])).toEqual(
      [
        [oatCream, 150],
        [sugar, 10],
      ].sort((a, b) => a[0] - b[0])
    );

    // The answer was not asked to follow, and did not.
    const answer = await pool.query(`SELECT component_variant_id, component_quantity FROM pos_modifiers WHERE id = $1`, [
      answerId,
    ]);
    expect(Number(answer.rows[0].component_variant_id)).toBe(cream);

    // The menu journal says what each card's recipe was and became.
    const journal = await pool.query(
      `SELECT entity_id FROM pos_menu_changes WHERE store_id = $1 AND entity = 'product' AND entity_id = ANY($2::bigint[])`,
      [store.storeId, [soup.productId, cake.productId]]
    );
    expect(new Set(journal.rows.map((r) => Number(r.entity_id)))).toEqual(new Set([soup.productId, cake.productId]));
  });

  it('repoints modifier answers when asked, and is its own undo the other way round', async () => {
    const answers = await replace({ from_variant_id: cream, to_variant_id: oatCream, factor: 2, include_modifiers: true });
    expect(answers.statusCode).toBe(200);
    expect(answers.json()).toEqual({ recipes: 0, products: 0, modifiers: 1 });
    const answer = await pool.query(`SELECT component_variant_id, component_quantity FROM pos_modifiers WHERE id = $1`, [
      answerId,
    ]);
    expect([Number(answer.rows[0].component_variant_id), Number(answer.rows[0].component_quantity)]).toEqual([oatCream, 50]);

    const back = await replace({ from_variant_id: oatCream, to_variant_id: cream, factor: 1 });
    expect(back.statusCode).toBe(200);
    expect(back.json().recipes).toBe(2);
    expect(await recipeOf(soup.variantId)).toEqual([
      [cream, 150],
      [sugar, 10],
    ]);
  });
});
