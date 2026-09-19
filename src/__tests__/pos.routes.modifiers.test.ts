// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's modifier surface (modifiers.routes.ts) and a modified line
// through the real checkout route. The rules themselves are covered in
// pos.modifiers.test.ts; this is the wire.

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

describe.skipIf(!hasDb)('POS modifier routes', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let productId = 0;
  let variantId = 0;
  let cheeseId = 0;
  let groupId = 0;
  let cheeseModifierId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rmods');
    const sandwich = await seedProduct(store.storeId, { name: 'Сендвіч', priceCents: 9000, quantity: 5 });
    productId = sandwich.productId;
    variantId = sandwich.variantId;
    const cheese = await seedProduct(store.storeId, { name: 'Сир', priceCents: 100, quantity: 1000, unit: 'шт' });
    cheeseId = cheese.variantId;
    await pool.query(`UPDATE pos_products SET sellable = FALSE WHERE id = $1`, [cheese.productId]);
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store.storeId);
    await app.close();
  });

  it('403s a seller on the owner surface', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: auth(store.sellerToken),
      payload: { name: 'Додатки' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a group, its answers, and attaches it to a product', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: auth(store.ownerToken),
      payload: { name: 'Додатки', min_select: 0, max_select: 2 },
    });
    expect(created.statusCode).toBe(201);
    groupId = created.json().id;
    expect(created.json()).toMatchObject({ name: 'Додатки', min_select: 0, max_select: 2, modifiers: [] });

    const bad = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: auth(store.ownerToken),
      payload: { name: 'Зле', min_select: 3, max_select: 1 },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/max_select/);

    const answer = await app.inject({
      method: 'POST',
      url: `/api/pos/modifier-groups/${groupId}/modifiers`,
      headers: auth(store.ownerToken),
      payload: { name: 'ще сир', price_delta_cents: 2000, component_variant_id: cheeseId, component_quantity: 20 },
    });
    expect(answer.statusCode).toBe(201);
    expect(answer.json().modifiers).toHaveLength(1);
    cheeseModifierId = answer.json().modifiers[0].id;
    expect(answer.json().modifiers[0]).toMatchObject({
      name: 'ще сир',
      price_delta_cents: 2000,
      component: { product_name: 'Сир' },
    });

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: auth(store.ownerToken),
      payload: { name: 'Додатки до сендвіча' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('Додатки до сендвіча');

    const attached = await app.inject({
      method: 'PUT',
      url: `/api/pos/products/${productId}/modifier-groups`,
      headers: auth(store.ownerToken),
      payload: { group_ids: [groupId] },
    });
    expect(attached.statusCode).toBe(200);
    expect(attached.json().map((g: { id: number }) => g.id)).toEqual([groupId]);

    const list = await app.inject({
      method: 'GET',
      url: '/api/pos/modifier-groups',
      headers: auth(store.ownerToken),
    });
    expect(list.json().map((g: { name: string }) => g.name)).toEqual(['Додатки до сендвіча']);
  });

  it('shows the question on the catalog and answers it at the checkout route', async () => {
    const catalog = await app.inject({
      method: 'GET',
      url: `/api/pos/catalog?q=${encodeURIComponent('Сендвіч')}`,
      headers: auth(store.sellerToken),
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()[0].modifier_groups).toEqual([
      {
        id: groupId,
        name: 'Додатки до сендвіча',
        min_select: 0,
        max_select: 2,
        modifiers: [
          {
            id: cheeseModifierId,
            name: 'ще сир',
            price_delta_cents: 2000,
            is_default: false,
            component_variant_id: cheeseId,
            component_quantity: 20,
          },
        ],
      },
    ]);

    const sale = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: variantId, quantity: 1, modifiers: [cheeseModifierId], note: 'без цибулі' }],
        payments: [{ method: 'cash', amount_cents: 11000 }],
      },
    });
    expect(sale.statusCode).toBe(201);
    expect(sale.json().total_cents).toBe(11000);
    expect(sale.json().items[0]).toMatchObject({
      unit_price_cents: 11000,
      variant_label: 'black / M · ще сир',
      note: 'без цибулі',
      modifiers: [{ group_name: 'Додатки до сендвіча', name: 'ще сир', price_delta_cents: 2000 }],
    });

    const refused = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: variantId, quantity: 1, modifiers: [cheeseModifierId, 999999] }],
        payments: [{ method: 'cash', amount_cents: 11000 }],
      },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toMatch(/недоступний/);
  });

  it('deletes an answer and a group', async () => {
    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/pos/modifiers/${cheeseModifierId}`,
      headers: auth(store.ownerToken),
    });
    expect(gone.statusCode).toBe(200);
    const group = await app.inject({
      method: 'DELETE',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: auth(store.ownerToken),
    });
    expect(group.statusCode).toBe(200);
    const list = await app.inject({
      method: 'GET',
      url: '/api/pos/modifier-groups',
      headers: auth(store.ownerToken),
    });
    expect(list.json()).toEqual([]);
    const again = await app.inject({
      method: 'DELETE',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: auth(store.ownerToken),
    });
    expect(again.statusCode).toBe(400);
  });
});
