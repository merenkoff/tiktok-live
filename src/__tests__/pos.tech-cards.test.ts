// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Техкарти» — what a dish costs to assemble, and what share of its price that
// is (café phase К5c).
//
// The rule everything here defends: a dish with one unpriced leaf has NO
// honest food cost. Zero per cent on that screen is not a small error, it is
// a number the owner would make a pricing decision on. So the endpoint returns
// `null` and says why, and never 0.
//
// The second rule is that the sum is the SAME one a production document
// writes onto the shelf. That is why `unitCostOf` exists at all instead of a
// second query with the same JOIN.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { createProduct } from '../pos/products.service.js';
import { listTechCards, produceComposite, unitCostOf } from '../pos/composites.service.js';

describe.skipIf(!hasDb)('POS tech cards', () => {
  let store: TestStore;
  let other: TestStore;
  let app: FastifyInstance;

  // A café's ingredients, priced per base unit in kopecks.
  let beef = 0; // 50 коп/г
  let water = 0; // 1 коп/мл
  let salt = 0; // never received with a price — 0
  let cream = 0; // 30 коп/мл

  async function setCost(variantId: number, costCents: number): Promise<void> {
    await pool.query(`UPDATE pos_variants SET cost_cents = $1 WHERE id = $2`, [
      costCents,
      variantId,
    ]);
  }

  async function composite(
    name: string,
    stockMode: 'own' | 'derived',
    priceCents: number,
    components: Array<{ component_variant_id: number; quantity: number }>
  ): Promise<number> {
    const product = await createProduct(store.storeId, {
      name,
      kind: 'composite',
      stock_mode: stockMode,
      variants: [
        {
          attributes: {},
          unit: 'шт',
          price_cents: priceCents,
          quantity: 0,
          components,
        },
      ],
    });
    return (product!.variants[0] as { id: number }).id;
  }

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('techcard');
    other = await createTestStore('techcardx');
    // A recipe inside a recipe needs a vertical that allows one (migration 045).
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [store.storeId, other.storeId],
    ]);

    beef = (await seedProduct(store.storeId, { name: 'Яловичина', quantity: 10000 })).variantId;
    water = (await seedProduct(store.storeId, { name: 'Вода', quantity: 100000 })).variantId;
    salt = (await seedProduct(store.storeId, { name: 'Сіль', quantity: 5000 })).variantId;
    cream = (await seedProduct(store.storeId, { name: 'Вершки', quantity: 5000 })).variantId;
    await setCost(beef, 50);
    await setCost(water, 1);
    await setCost(cream, 30);
    // `salt` stays at 0 on purpose: that is «never received with a price».

    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  function rowFor(rows: Awaited<ReturnType<typeof listTechCards>>, name: string) {
    return rows.find((r) => r.product_name === name)!;
  }

  it('costs a nested recipe by its leaves, folding in a derived one', async () => {
    // A stock made in advance: 100 g beef + 500 ml water = 5000 + 500 = 5500.
    const broth = await composite('Бульйон', 'own', 0, [
      { component_variant_id: beef, quantity: 100 },
      { component_variant_id: water, quantity: 500 },
    ]);
    await setCost(broth, 5500);

    // A sauce assembled when it sells — 20 ml cream = 600.
    const sauce = await composite('Соус', 'derived', 0, [
      { component_variant_id: cream, quantity: 20 },
    ]);

    // The soup holds both. The `own` broth stays a LEAF (its ingredients left
    // with its production document); the `derived` sauce is folded in.
    const soup = await composite('Борщ', 'derived', 20000, [
      { component_variant_id: broth, quantity: 1 },
      { component_variant_id: sauce, quantity: 1 },
    ]);

    const rows = await listTechCards(pool, store.storeId);
    const card = rowFor(rows, 'Борщ');
    // 5500 (broth as a leaf) + 600 (the sauce's cream, folded in) = 6100.
    expect(card.cost_cents).toBe(6100);
    expect(card.leaf_count).toBe(2);
    expect(card.has_unpriced_leaf).toBe(false);
    // 6100 / 20000 = 30,5 %.
    expect(card.food_cost_bps).toBe(3050);

    // The same number `unitCostOf` gives on its own.
    expect(await unitCostOf(pool, store.storeId, soup)).toMatchObject({
      unitCostCents: 6100,
      hasUnpricedLeaf: false,
      leafCount: 2,
    });
  });

  it('refuses to guess when a leaf has no cost — «—», never 0 %', async () => {
    const fries = await composite('Картопля фрі', 'derived', 8000, [
      { component_variant_id: water, quantity: 100 },
      { component_variant_id: salt, quantity: 5 },
    ]);

    const card = rowFor(await listTechCards(pool, store.storeId), 'Картопля фрі');
    expect(card.has_unpriced_leaf).toBe(true);
    expect(card.food_cost_bps).toBeNull();
    // The sum is still reported — it is the salt that is unknown, and the
    // screen says so next to it.
    expect(card.cost_cents).toBe(100);

    expect(await unitCostOf(pool, store.storeId, fries)).toMatchObject({
      hasUnpricedLeaf: true,
    });
  });

  it('shows a composite whose recipe is empty rather than hiding it', async () => {
    const empty = await composite('Порожня картка', 'own', 9000, []);
    const card = rowFor(await listTechCards(pool, store.storeId), 'Порожня картка');
    expect(card.leaf_count).toBe(0);
    expect(card.cost_cents).toBe(0);
    // No recipe is not «costs nothing» either.
    expect(card.food_cost_bps).toBeNull();
    expect(await unitCostOf(pool, store.storeId, empty)).toMatchObject({ leafCount: 0 });
  });

  it('has no percentage for a card with no price', async () => {
    await composite('Без ціни', 'derived', 0, [{ component_variant_id: cream, quantity: 10 }]);
    const card = rowFor(await listTechCards(pool, store.storeId), 'Без ціни');
    expect(card.cost_cents).toBe(300);
    expect(card.food_cost_bps).toBeNull();
  });

  it('leaves simple products out — a rose is not a tech card', async () => {
    const rows = await listTechCards(pool, store.storeId);
    expect(rows.map((r) => r.product_name)).not.toContain('Яловичина');
    expect(rows.every((r) => r.kind === 'composite')).toBe(true);
  });

  it('never reaches into another store', async () => {
    expect(await listTechCards(pool, other.storeId)).toHaveLength(0);
  });

  // The sum a tech card shows and the sum a production document writes onto
  // the shelf have one definition now — this is what says so.
  it('agrees to the kopeck with what production writes', async () => {
    const cream20 = await composite('Крем', 'own', 15000, [
      { component_variant_id: cream, quantity: 20 },
      { component_variant_id: beef, quantity: 2 },
    ]);
    const expected = (await unitCostOf(pool, store.storeId, cream20)).unitCostCents;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const produced = await produceComposite(client, {
        storeId: store.storeId,
        variantId: cream20,
        quantity: 3,
        staffId: store.ownerId,
        referenceType: 'test',
        referenceId: 1,
      });
      expect(produced.unitCostCents).toBe(expected);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    // 20 × 30 + 2 × 50 = 700.
    expect(expected).toBe(700);
  });

  describe('the route', () => {
    it('serves the owner and is not read as a product id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/products/tech-cards',
        headers: { authorization: `Bearer ${store.ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const rows = res.json() as Array<{ product_name: string }>;
      expect(rows.map((r) => r.product_name)).toContain('Борщ');
    });

    it('is owner-only', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/products/tech-cards',
        headers: { authorization: `Bearer ${store.sellerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('needs a token at all', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/products/tech-cards' });
      expect(res.statusCode).toBe(401);
    });
  });
});
