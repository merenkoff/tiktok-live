// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Gross and net in a recipe (migration 104).
//
// A line's `quantity` is the GROSS weight — what leaves the shelf — and stays
// what stock, the expanded recipes and the cost read. `loss_bps` says how much
// of it does not reach the dish; the net is derived and never stored. What
// these tests hold:
//
//   · a loss is kept with its line and changes nothing a sale or a cost reads;
//   · a client built before the column sends lines without it, and a line it
//     kept does not lose the loss the owner typed elsewhere;
//   · an ingredient's usual loss is a typing aid on its card — the owner's to
//     set — and a replacement brings its own when it states one;
//   · the menu journal says the loss beside the weight.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { netQuantity, normalizeLossBps } from '../pos/composites.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe('recipe losses: the arithmetic', () => {
  it('derives the net from the gross and the loss', () => {
    expect(netQuantity(125, 2000)).toBe(100);
    expect(netQuantity(35, 1500)).toBe(30); // 29,75
    expect(netQuantity(180, 0)).toBe(180);
    expect(netQuantity(1000, 9900)).toBe(10);
  });

  it('takes a loss of 0…99 % in whole basis points and nothing else', () => {
    expect(normalizeLossBps(0)).toBe(0);
    expect(normalizeLossBps('1250')).toBe(1250);
    expect(normalizeLossBps(9900)).toBe(9900);
    for (const bad of [-1, 9901, 12.5, 'багато', null, {}]) {
      expect(() => normalizeLossBps(bad)).toThrow('Втрати — від 0 до 99 %');
    }
  });
});

describe.skipIf(!hasDb)('POS recipes: gross, loss and net', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let potato = 0;
  let potatoProduct = 0;
  let peeled = 0;
  let butter = 0;
  let mash = 0;
  let mashProduct = 0;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url: `/api/pos${url}`, headers: auth(token), payload: payload as object });

  async function ingredient(name: string, costMilli: number, extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/products', store.ownerToken, {
      name,
      sellable: false,
      variants: [{ attributes: {}, unit: 'г', price_cents: 0, cost_milli: costMilli, quantity: 0, ...extra }],
    });
    expect(res.statusCode).toBe(201);
    return { productId: Number(res.json().id), variantId: Number(res.json().variants[0].id) };
  }

  const recipe = async () =>
    ((await call('GET', `/products/${mashProduct}`, store.ownerToken)).json().variants[0].components as Array<{
      component_variant_id: number;
      quantity: number;
      loss_bps: number;
    }>).map((c) => ({ id: c.component_variant_id, quantity: c.quantity, loss: c.loss_bps }));

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rloss');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    ({ productId: potatoProduct, variantId: potato } = await ingredient('Картопля', 2000));
    // Peeled potato states its usual loss on its card: none.
    peeled = (await ingredient('Картопля чищена', 4500, { prep_loss_bps: 0 })).variantId;
    butter = (await ingredient('Масло', 32_000)).variantId;

    const dish = await call('POST', '/products', store.ownerToken, {
      name: 'Пюре',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: 8000,
          components: [
            // 125 г from the shelf, 20 % is peel: 100 г in the pan.
            { component_variant_id: potato, quantity: 125, loss_bps: 2000 },
            { component_variant_id: butter, quantity: 10 },
          ],
        },
      ],
    });
    expect(dish.statusCode).toBe(201);
    mashProduct = Number(dish.json().id);
    mash = Number(dish.json().variants[0].id);
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await app?.close();
  });

  it('keeps the loss with its line — and stock and cost still read the gross weight', async () => {
    expect(await recipe()).toEqual([
      { id: potato, quantity: 125, loss: 2000 },
      { id: butter, quantity: 10, loss: 0 },
    ]);
    const flat = await pool.query(
      `SELECT leaf_variant_id, quantity_per_unit FROM pos_product_components_flat
       WHERE store_id = $1 AND variant_id = $2 ORDER BY leaf_variant_id`,
      [store.storeId, mash]
    );
    expect(flat.rows.map((r) => Number(r.quantity_per_unit)).sort((a, b) => a - b)).toEqual([10, 125]);
    // 125 г × 2 коп + 10 г × 32 коп = 5,70 ₴: the peel is paid for.
    const card = (await call('GET', '/products/tech-cards', store.ownerToken))
      .json()
      .find((c: { variant_id: number }) => c.variant_id === mash);
    expect(card).toMatchObject({ cost_cents: 570 });
  });

  it('a client built before the column keeps a line’s loss by not mentioning it', async () => {
    // It read the recipe without `loss_bps` and sends back what it knows.
    const res = await call('PATCH', `/variants/${mash}`, store.ownerToken, {
      components: [
        { component_variant_id: potato, quantity: 130 },
        { component_variant_id: butter, quantity: 12 },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(await recipe()).toEqual([
      { id: potato, quantity: 130, loss: 2000 },
      { id: butter, quantity: 12, loss: 0 },
    ]);

    // Stating it — a zero included — is a decision, and it is taken.
    await call('PATCH', `/variants/${mash}`, store.ownerToken, {
      components: [
        { component_variant_id: potato, quantity: 125, loss_bps: 0 },
        { component_variant_id: butter, quantity: 10, loss_bps: 500 },
      ],
    });
    expect(await recipe()).toEqual([
      { id: potato, quantity: 125, loss: 0 },
      { id: butter, quantity: 10, loss: 500 },
    ]);
    await call('PATCH', `/variants/${mash}`, store.ownerToken, {
      components: [
        { component_variant_id: potato, quantity: 125, loss_bps: 2000 },
        { component_variant_id: butter, quantity: 10, loss_bps: 0 },
      ],
    });
  });

  it('refuses a loss that is not 0…99 % and changes nothing', async () => {
    for (const bad of [9901, -5, 12.5]) {
      const res = await call('PATCH', `/variants/${mash}`, store.ownerToken, {
        components: [{ component_variant_id: potato, quantity: 125, loss_bps: bad }],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Втрати — від 0 до 99 %');
    }
    expect(await recipe()).toEqual([
      { id: potato, quantity: 125, loss: 2000 },
      { id: butter, quantity: 10, loss: 0 },
    ]);
  });

  it('an ingredient’s usual loss is set on its card, cleared with null, and journalled in words', async () => {
    const set = await call('PATCH', `/variants/${potato}`, store.ownerToken, { prep_loss_bps: 2500 });
    expect(set.statusCode).toBe(200);
    const card = async () => (await call('GET', `/products/${potatoProduct}`, store.ownerToken)).json().variants[0];
    expect(await card()).toMatchObject({ prep_loss_bps: 2500 });
    // Saving another field leaves it.
    await call('PATCH', `/variants/${potato}`, store.ownerToken, { sku: 'POT-1' });
    expect(await card()).toMatchObject({ prep_loss_bps: 2500, sku: 'POT-1' });

    expect((await call('PATCH', `/variants/${potato}`, store.ownerToken, { prep_loss_bps: 12000 })).statusCode).toBe(400);
    expect(await card()).toMatchObject({ prep_loss_bps: 2500 });

    const journal = (await call('GET', `/menu-changes?entity=product&entity_id=${potatoProduct}`, store.ownerToken)).json();
    const changes = journal.changes.flatMap((row: { changes: unknown[] }) => row.changes);
    expect(changes).toContainEqual({ field: 'variant.prep_loss', variant: '', from: null, to: '25 %' });

    await call('PATCH', `/variants/${potato}`, store.ownerToken, { prep_loss_bps: null });
    expect((await card()).prep_loss_bps).toBeNull();
  });

  it('the journal says the loss beside the weight', async () => {
    await call('PATCH', `/variants/${mash}`, store.ownerToken, {
      components: [
        { component_variant_id: potato, quantity: 150, loss_bps: 2000 },
        { component_variant_id: butter, quantity: 10, loss_bps: 0 },
      ],
    });
    const journal = (await call('GET', `/menu-changes?entity=product&entity_id=${mashProduct}`, store.ownerToken)).json();
    const changes = journal.changes.flatMap((row: { changes: unknown[] }) => row.changes) as Array<{
      field: string;
      to?: unknown;
    }>;
    const recipeChange = changes.find((c) => c.field === 'variant.recipe');
    expect(recipeChange?.to).toEqual(['Картопля — 150 г (втрати 20 %)', 'Масло — 10 г']);
    await call('PATCH', `/variants/${mash}`, store.ownerToken, {
      components: [
        { component_variant_id: potato, quantity: 125, loss_bps: 2000 },
        { component_variant_id: butter, quantity: 10, loss_bps: 0 },
      ],
    });
  });

  it('a replacement brings its own usual loss when its card states one, and keeps the line’s otherwise', async () => {
    // Peeled potato states 0 %: the peel does not follow it into the recipe.
    const toPeeled = await call('POST', '/products/components/replace', store.ownerToken, {
      from_variant_id: potato,
      to_variant_id: peeled,
      factor: 0.8,
    });
    expect(toPeeled.statusCode).toBe(200);
    expect(await recipe()).toEqual([
      { id: peeled, quantity: 100, loss: 0 },
      { id: butter, quantity: 10, loss: 0 },
    ]);

    // Back to plain potato, whose card says nothing: the line keeps what it had (0 %).
    await call('POST', '/products/components/replace', store.ownerToken, {
      from_variant_id: peeled,
      to_variant_id: potato,
      factor: 1.25,
    });
    expect(await recipe()).toEqual([
      { id: potato, quantity: 125, loss: 0 },
      { id: butter, quantity: 10, loss: 0 },
    ]);
  });
});
