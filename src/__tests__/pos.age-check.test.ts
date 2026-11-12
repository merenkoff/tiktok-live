// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.age-check.test.ts
//
// The buyer's age, asked once per receipt (migration 102,
// TechDocs/POS_AGE_CHECK.md): the catalog marks what is sold to an adult only —
// excise goods, a recipe holding them, an answer that pours from them — the
// owner switches the question on, the login carries the switch to the till, and
// a sale records the cashier's «так» without ever requiring it.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import { createProduct, getCatalog } from '../pos/products.service.js';
import * as modifiers from '../pos/modifiers.service.js';
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

describe.skipIf(!hasDb)('POS age check (migration 102)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let beer = 0;
  let set = 0;
  let coffee = 0;
  let water = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rage');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    const beerCard = await createProduct(store.storeId, {
      name: 'Пиво світле 0,5',
      fiscal_excise: true,
      fiscal_uktzed: '2203000100',
      variants: [{ attributes: {}, price_cents: 6_000, quantity: 50 }],
    } as never);
    beer = Number((beerCard!.variants[0] as { id: number }).id);
    const setCard = await createProduct(store.storeId, {
      name: 'Сет: пиво й грінки',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [{ attributes: {}, price_cents: 15_000, components: [{ component_variant_id: beer, quantity: 1 }] }],
    } as never);
    set = Number((setCard!.variants[0] as { id: number }).id);
    const c = await seedProduct(store.storeId, { name: 'Кава', priceCents: 5_000, quantity: 100 });
    coffee = c.variantId;
    let group = await modifiers.createGroup(store.storeId, { name: 'Додати', min_select: 0, max_select: 1 });
    group = await modifiers.createModifier(store.storeId, group.id, {
      name: 'пиво',
      price_delta_cents: 6_000,
      component_variant_id: beer,
      component_quantity: 1,
    });
    await modifiers.createModifier(store.storeId, group.id, { name: 'цукор', price_delta_cents: 0 });
    await modifiers.setProductGroups(store.storeId, c.productId, [group.id]);
    water = (await seedProduct(store.storeId, { name: 'Вода', priceCents: 2_000, quantity: 100 })).variantId;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  it('marks excise goods, a recipe holding them and an answer pouring from them — nothing else', async () => {
    const catalog = (await getCatalog(store.storeId, { snapshot: true } as never)) as unknown as Array<{
      variant_id: number;
      age_restricted?: boolean;
      modifier_groups?: Array<{ modifiers: Array<{ name: string; age_restricted?: boolean }> }>;
    }>;
    const byId = new Map(catalog.map((item) => [item.variant_id, item]));
    expect(byId.get(beer)?.age_restricted).toBe(true);
    expect(byId.get(set)?.age_restricted).toBe(true);
    expect(byId.get(water)?.age_restricted).toBeUndefined();
    expect(byId.get(coffee)?.age_restricted).toBeUndefined();
    const answers = byId.get(coffee)?.modifier_groups?.[0].modifiers ?? [];
    expect(answers.find((m) => m.name === 'пиво')?.age_restricted).toBe(true);
    expect(answers.find((m) => m.name === 'цукор')?.age_restricted).toBeUndefined();
  });

  it('is the owner’s switch, off by default, and rides with the login', async () => {
    const me = async () =>
      (await app.inject({ method: 'GET', url: '/api/pos/me', headers: auth(store.sellerToken) })).json() as {
        store: { age_check?: boolean };
      };
    expect((await me()).store.age_check).toBe(false);

    const patch = (payload: unknown, token = store.ownerToken) =>
      app.inject({ method: 'PATCH', url: '/api/pos/store', headers: auth(token), payload });
    expect((await patch({ age_check: 'так' })).statusCode).toBe(400);
    expect((await patch({ age_check: true }, store.sellerToken)).statusCode).toBe(403);
    const on = await patch({ age_check: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().age_check).toBe(true);
    expect((await me()).store.age_check).toBe(true);
  });

  it('records the cashier’s «так» on the receipt and never requires it', async () => {
    const sell = (extra: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: {
          items: [{ variant_id: beer, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 6_000 }],
          client_uuid: randomUUID(),
          ...extra,
        },
      });
    const confirmed = await sell({ age_confirmed: true });
    expect(confirmed.statusCode).toBe(201);
    // An older till sends nothing and still sells.
    const silent = await sell({});
    expect(silent.statusCode).toBe(201);

    const read = async (id: number) =>
      (await app.inject({ method: 'GET', url: `/api/pos/sales/${id}`, headers: auth(store.ownerToken) })).json() as {
        age_confirmed: boolean;
      };
    expect((await read(confirmed.json().id)).age_confirmed).toBe(true);
    expect((await read(silent.json().id)).age_confirmed).toBe(false);
  });
});
