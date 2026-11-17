// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The question saved whole (`POST /modifier-groups` with answers,
// `PUT /modifier-groups/:id`) and assigned from its own side
// (`PUT /modifier-groups/:id/products`) — what the owner's redrawn editor
// writes. The per-answer routes are pinned in pos.routes.modifiers.test.ts.

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

interface Answer {
  id: number;
  name: string;
  price_delta_cents: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  component_variant_id: number | null;
  component_quantity: number | null;
}

describe.skipIf(!hasDb)('POS modifiers: the question saved whole', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let latteId = 0;
  let rafId = 0;
  let teaId = 0;
  let oatId = 0;
  let oatProductId = 0;
  let groupId = 0;
  let answers: Answer[] = [];

  const owner = () => auth(store.ownerToken);

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('mwhole');
    latteId = (await seedProduct(store.storeId, { name: 'Латте', priceCents: 6500, quantity: 5 })).productId;
    rafId = (await seedProduct(store.storeId, { name: 'Раф', priceCents: 8000, quantity: 5 })).productId;
    teaId = (await seedProduct(store.storeId, { name: 'Чай', priceCents: 4000, quantity: 5 })).productId;
    const oat = await seedProduct(store.storeId, { name: 'Молоко вівсяне', priceCents: 100, quantity: 5000 });
    oatId = oat.variantId;
    oatProductId = oat.productId;
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store.storeId);
    await app.close();
  });

  it('creates a question with its answers in one request, in the order given', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: owner(),
      payload: {
        name: 'Молоко',
        min_select: 1,
        max_select: 1,
        modifiers: [
          { name: 'звичайне', is_default: true },
          { name: 'вівсяне', price_delta_cents: 1500, component_variant_id: oatId, component_quantity: 200 },
          { name: 'кокосове', price_delta_cents: 2000 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const group = res.json();
    groupId = group.id;
    answers = group.modifiers;
    expect(group).toMatchObject({ name: 'Молоко', min_select: 1, max_select: 1, product_ids: [] });
    expect(answers.map((m) => [m.name, m.price_delta_cents, m.is_default, m.sort_order])).toEqual([
      ['звичайне', 0, true, 0],
      ['вівсяне', 1500, false, 1],
      ['кокосове', 2000, false, 2],
    ]);
    expect(answers[1]).toMatchObject({ component_variant_id: oatId, component_quantity: 200 });
  });

  it('replaces it whole: a kept answer keeps its id, the list order is the till order', async () => {
    const [plain, oat, coconut] = answers;
    const res = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: {
        name: 'Молоко до кави',
        modifiers: [
          { id: oat.id, name: 'вівсяне', price_delta_cents: 2000, component_variant_id: oatId, component_quantity: 180 },
          { id: plain.id, name: 'звичайне', is_default: true },
          { name: 'безлактозне', price_delta_cents: 1000 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const group = res.json();
    expect(group.name).toBe('Молоко до кави');
    // min/max were not named: they stay.
    expect(group).toMatchObject({ min_select: 1, max_select: 1 });
    const next: Answer[] = group.modifiers;
    expect(next.map((m) => m.name)).toEqual(['вівсяне', 'звичайне', 'безлактозне']);
    expect(next[0].id).toBe(oat.id);
    expect(next[0]).toMatchObject({ price_delta_cents: 2000, component_quantity: 180 });
    expect(next[1].id).toBe(plain.id);
    // The one the list left out is gone.
    expect(next.some((m) => m.id === coconut.id)).toBe(false);
    answers = next;
  });

  it('leaves the answers alone when the body does not name them', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().is_active).toBe(false);
    expect(res.json().modifiers).toHaveLength(3);
    await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: { is_active: true },
    });
  });

  it('refuses in words and writes nothing: two «як завжди» under «one», a name twice, a foreign answer', async () => {
    const before = await pool.query(
      `SELECT id, name, price_delta_cents, is_default, sort_order FROM pos_modifiers WHERE group_id = $1 ORDER BY id`,
      [groupId]
    );
    const [oat, plain] = answers;

    const twoDefaults = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: {
        name: 'Зламане',
        modifiers: [
          { id: oat.id, name: 'вівсяне', is_default: true },
          { id: plain.id, name: 'звичайне', is_default: true },
        ],
      },
    });
    expect(twoDefaults.statusCode).toBe(400);
    expect(twoDefaults.json().error).toMatch(/«як завжди»/);

    const twice = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: { modifiers: [{ id: oat.id, name: 'Вівсяне' }, { name: 'вівсяне ' }] },
    });
    expect(twice.statusCode).toBe(400);
    expect(twice.json().error).toMatch(/двічі/);

    const foreign = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: { modifiers: [{ id: 999999999, name: 'чуже' }] },
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error).toMatch(/не належить/);

    const noName = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: owner(),
      payload: { name: 'Сироп', modifiers: [{ name: '  ' }] },
    });
    expect(noName.statusCode).toBe(400);

    const after = await pool.query(
      `SELECT id, name, price_delta_cents, is_default, sort_order FROM pos_modifiers WHERE group_id = $1 ORDER BY id`,
      [groupId]
    );
    expect(after.rows).toEqual(before.rows);
    const group = await pool.query(`SELECT name FROM pos_modifier_groups WHERE id = $1`, [groupId]);
    expect(group.rows[0].name).toBe('Молоко до кави');
    const stray = await pool.query(`SELECT 1 FROM pos_modifier_groups WHERE store_id = $1 AND name = 'Сироп'`, [
      store.storeId,
    ]);
    expect(stray.rows).toHaveLength(0);
  });

  it('keeps an answer saveable after its ingredient was archived', async () => {
    await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [oatId]);
    const [oat, plain, lactoseFree] = answers;
    const body = (extra: Record<string, unknown>) => ({
      modifiers: [
        { id: oat.id, name: 'вівсяне', component_variant_id: oatId, component_quantity: 150, ...extra },
        { id: plain.id, name: 'звичайне' },
        { id: lactoseFree.id, name: 'безлактозне' },
      ],
    });
    const kept = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: body({}),
    });
    expect(kept.statusCode).toBe(200);
    expect(kept.json().modifiers[0]).toMatchObject({ component_variant_id: oatId, component_quantity: 150 });

    // A NEW pointer at an archived ingredient is still refused.
    const fresh = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}`,
      headers: owner(),
      payload: {
        modifiers: [...body({}).modifiers, { name: 'ще вівсяне', component_variant_id: oatId, component_quantity: 1 }],
      },
    });
    expect(fresh.statusCode).toBe(400);
    await pool.query(`UPDATE pos_variants SET is_active = TRUE WHERE id = $1`, [oatId]);
  });

  it('assigns the question to products from its own side: new ones ask it last, others stop', async () => {
    // «Латте» already asks another question first.
    const syrup = await app.inject({
      method: 'POST',
      url: '/api/pos/modifier-groups',
      headers: owner(),
      payload: { name: 'Сироп', min_select: 0, max_select: 3, modifiers: [{ name: 'ваніль', price_delta_cents: 1000 }] },
    });
    const syrupId = syrup.json().id;
    await app.inject({
      method: 'PUT',
      url: `/api/pos/products/${latteId}/modifier-groups`,
      headers: owner(),
      payload: { group_ids: [syrupId] },
    });

    const first = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}/products`,
      headers: owner(),
      payload: { product_ids: [latteId, rafId, latteId] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ added: 2, removed: 0 });
    expect(first.json().group.product_ids).toEqual([latteId, rafId].sort((a, b) => a - b));

    const latte = await pool.query(
      `SELECT group_id FROM pos_product_modifier_groups WHERE product_id = $1 ORDER BY sort_order, group_id`,
      [latteId]
    );
    expect(latte.rows.map((r) => Number(r.group_id))).toEqual([syrupId, groupId]);

    // An archived product that asks it is not in the owner's picker: its
    // absence from the list is not a request to detach.
    await pool.query(
      `INSERT INTO pos_product_modifier_groups (store_id, product_id, group_id, sort_order) VALUES ($1, $2, $3, 0)`,
      [store.storeId, oatProductId, groupId]
    );
    await pool.query(`UPDATE pos_products SET is_active = FALSE WHERE id = $1`, [oatProductId]);

    const second = await app.inject({
      method: 'PUT',
      url: `/api/pos/modifier-groups/${groupId}/products`,
      headers: owner(),
      payload: { product_ids: [rafId, teaId] },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ added: 1, removed: 1 });
    expect(second.json().group.product_ids).toEqual([rafId, teaId].sort((a, b) => a - b));
    const archived = await pool.query(
      `SELECT 1 FROM pos_product_modifier_groups WHERE product_id = $1 AND group_id = $2`,
      [oatProductId, groupId]
    );
    expect(archived.rows).toHaveLength(1);
    // «Латте» keeps the question it had before.
    const latteAfter = await pool.query(
      `SELECT group_id FROM pos_product_modifier_groups WHERE product_id = $1`,
      [latteId]
    );
    expect(latteAfter.rows.map((r) => Number(r.group_id))).toEqual([syrupId]);

    // The list says where each question is asked.
    const list = await app.inject({ method: 'GET', url: '/api/pos/modifier-groups', headers: owner() });
    const byId = new Map<number, { product_ids: number[] }>(
      (list.json() as Array<{ id: number; product_ids: number[] }>).map((g) => [g.id, g])
    );
    expect(byId.get(syrupId)?.product_ids).toEqual([latteId]);

    // And the menu journal has a row for every card whose questions moved.
    const journal = await pool.query(
      `SELECT entity_id FROM pos_menu_changes WHERE store_id = $1 AND entity = 'product' AND entity_id = ANY($2::bigint[])`,
      [store.storeId, [rafId, teaId]]
    );
    expect(new Set(journal.rows.map((r) => Number(r.entity_id)))).toEqual(new Set([rafId, teaId]));
  });

  it('refuses a product of another store, and a seller', async () => {
    const other = await createTestStore('mwhole2');
    try {
      const foreign = await seedProduct(other.storeId, { name: 'Чуже' });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/pos/modifier-groups/${groupId}/products`,
        headers: owner(),
        payload: { product_ids: [foreign.productId] },
      });
      expect(res.statusCode).toBe(400);
      const theirs = await app.inject({
        method: 'PUT',
        url: `/api/pos/modifier-groups/${groupId}`,
        headers: auth(other.ownerToken),
        payload: { name: 'Не моє' },
      });
      expect(theirs.statusCode).toBe(400);
    } finally {
      await dropTestStore(other.storeId);
    }
    for (const url of [`/api/pos/modifier-groups/${groupId}`, `/api/pos/modifier-groups/${groupId}/products`]) {
      const seller = await app.inject({
        method: 'PUT',
        url,
        headers: auth(store.sellerToken),
        payload: { name: 'x', product_ids: [] },
      });
      expect(seller.statusCode).toBe(403);
    }
  });
});
