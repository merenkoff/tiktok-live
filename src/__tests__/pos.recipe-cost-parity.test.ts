// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's recipe editor shows a dish's cost while it is being typed, from
// the catalogue the page holds (`pos/src/modules/products/lib/recipeCost.ts`).
// That sum must be THIS server's — or the figure jumps the moment the card is
// saved. The same case is built here in a real database and read back from
// `listTechCards`; `recipeCost.test.ts` on the client pins the same numbers.
//
//   A 7 коп/г, B 3 коп/г
//   prep  (derived) = 10 A + 5 B                → 85, folded into what holds it
//   stock (own, made ahead, costs 40 a piece)   → a shelf of its own
//   dish  (derived) = 2 prep + 3 stock + 4 A    → 170 + 120 + 28 = 318

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { listTechCards } from '../pos/composites.service.js';
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

const PARITY = { a: 7, b: 3, stock: 40, price: 1000, cost: 318, bps: 3180, costWithoutB: 288 };

describe.skipIf(!hasDb)('POS recipes: the live cost on the client is this server’s sum', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let b = 0;
  let dish = 0;

  async function composite(
    name: string,
    mode: 'own' | 'derived',
    sellable: boolean,
    price: number,
    parts: Array<[number, number]>
  ): Promise<number> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/products',
      headers: auth(store.ownerToken),
      payload: {
        name,
        kind: 'composite',
        stock_mode: mode,
        sellable,
        variants: [
          {
            price_cents: price,
            components: parts.map(([component_variant_id, quantity]) => ({ component_variant_id, quantity })),
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    return Number(res.json().variants[0].id);
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rparity');
    // A recipe inside a recipe needs a vertical that allows it.
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    const a = (await seedProduct(store.storeId, { name: 'A', priceCents: 0, quantity: 100000 })).variantId;
    b = (await seedProduct(store.storeId, { name: 'B', priceCents: 0, quantity: 100000 })).variantId;
    await pool.query(`UPDATE pos_variants SET cost_cents = $2 WHERE id = $1`, [a, PARITY.a]);
    await pool.query(`UPDATE pos_variants SET cost_cents = $2 WHERE id = $1`, [b, PARITY.b]);
    const prep = await composite('Заготовка', 'derived', false, 0, [
      [a, 10],
      [b, 5],
    ]);
    // Made ahead: whatever its recipe holds, it is a shelf with its own price.
    const stock = await composite('Бульйон', 'own', false, 0, [[a, 999]]);
    await pool.query(`UPDATE pos_variants SET cost_cents = $2 WHERE id = $1`, [stock, PARITY.stock]);
    dish = await composite('Страва', 'derived', true, PARITY.price, [
      [prep, 2],
      [stock, 3],
      [a, 4],
    ]);
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store.storeId);
    await app.close();
  });

  it('folds the prep, reads the stock as its own shelf, and lands on the same kopeck', async () => {
    const row = (await listTechCards(pool, store.storeId)).find((r) => r.variant_id === dish);
    expect(row).toMatchObject({
      cost_cents: PARITY.cost,
      food_cost_bps: PARITY.bps,
      has_unpriced_leaf: false,
      leaf_count: 3,
    });
  });

  it('an unpriced shelf makes the cost a floor and the food cost unknown — on both sides', async () => {
    await pool.query(`UPDATE pos_variants SET cost_cents = 0 WHERE id = $1`, [b]);
    const row = (await listTechCards(pool, store.storeId)).find((r) => r.variant_id === dish);
    expect(row).toMatchObject({ cost_cents: PARITY.costWithoutB, food_cost_bps: null, has_unpriced_leaf: true });
  });
});
