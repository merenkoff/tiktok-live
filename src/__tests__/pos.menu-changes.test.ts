// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.menu-changes.test.ts
//
// Who changed what in the menu (migration 101, TechDocs/POS_MENU_CHANGES.md):
// every write to a card, its variants, tags and modifier groups leaves one row
// with the author and the fields that changed — computed by the server from
// the card before and after, so a write that changes nothing leaves none.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as authService from '../pos/auth.service.js';
import { diffGroup, diffProduct } from '../pos/menu-changes.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  issueToken,
  type TestStore,
} from './helpers/pos-fixtures.js';

interface Row {
  entity: string;
  entity_id: number;
  entity_name: string;
  staff_name: string;
  staff_role: string;
  action: string;
  changes: Array<{ field: string; variant?: string; from?: unknown; to?: unknown }>;
}

describe('menu change diff (pure)', () => {
  const card = (over: Record<string, unknown> = {}) =>
    ({
      id: 1,
      name: 'Латте',
      description: null,
      composition: null,
      allergens: [],
      menu_labels: [],
      kcal: null,
      strength_tenths: null,
      prep_minutes: null,
      image_url: null,
      is_active: true,
      sellable: true,
      menu_hidden: false,
      kind: 'simple',
      stock_mode: 'own',
      fiscal_register: null,
      fiscal_excise: false,
      excise_per_unit: false,
      fiscal_uktzed: null,
      tag_ids: [],
      modifier_group_ids: [],
      stop_listed_on: null,
      needs_review: false,
      variants: [{ id: 10, label: 'M', unit: 'шт', price_cents: 6000, cost_cents: 1500, quantity: 3, is_active: true, components: [] }],
      ...over,
    }) as never;
  const names = { tags: new Map([[5, 'Кава']]), groups: new Map<number, string>() };

  it('lists the fields that changed and nothing else — stock and the stop-list are not menu changes', () => {
    const before = card();
    const after = card({
      description: 'Ніжний',
      tag_ids: [5],
      stop_listed_on: '2026-11-12',
      variants: [{ id: 10, label: 'M', unit: 'шт', price_cents: 6500, cost_cents: 1500, quantity: 0, is_active: true, components: [] }],
    });
    const { action, changes } = diffProduct(before, after, names);
    expect(action).toBe('update');
    expect(changes).toEqual([
      { field: 'description', from: null, to: 'Ніжний' },
      { field: 'tags', from: [], to: ['Кава'] },
      { field: 'variant.price_cents', variant: 'M', from: 6000, to: 6500 },
    ]);
    expect(diffProduct(before, card({ variants: [{ id: 10, label: 'M', unit: 'шт', price_cents: 6000, cost_cents: 1500, quantity: 99, is_active: true, components: [] }] }), names).changes).toEqual([]);
  });

  it('says create with the variants and their prices, archive and restore by the card', () => {
    expect(diffProduct(null, card(), names)).toEqual({
      action: 'create',
      changes: [{ field: 'variant_added', variant: 'M', to: 6000 }],
    });
    expect(diffProduct(card(), card({ is_active: false }), names).action).toBe('archive');
    expect(diffProduct(card({ is_active: false }), card(), names).action).toBe('restore');
  });

  it('follows a modifier group: added, changed and removed answers', () => {
    const group = (modifiers: unknown[], over: Record<string, unknown> = {}) =>
      ({ id: 7, name: 'Молоко', min_select: 0, max_select: 1, sort_order: 0, is_active: true, modifiers, ...over }) as never;
    const oat = { id: 1, name: 'Вівсяне', price_delta_cents: 1500, label_deltas: [], component: null, component_quantity: null, is_default: false, is_active: true };
    const soy = { ...oat, id: 2, name: 'Соєве' };
    const { changes } = diffGroup(group([oat, soy]), group([{ ...oat, price_delta_cents: 2000 }, { ...oat, id: 3, name: 'Мигдальне' }], { max_select: 2 }));
    expect(changes).toEqual([
      { field: 'group.max_select', from: 1, to: 2 },
      { field: 'modifier.price_delta_cents', variant: 'Вівсяне', from: 1500, to: 2000 },
      { field: 'modifier_added', variant: 'Мигдальне', to: 1500 },
      { field: 'modifier_removed', variant: 'Соєве' },
    ]);
    expect(diffGroup(group([oat]), null).action).toBe('delete');
  });
});

describe.skipIf(!hasDb)('POS menu change journal (routes)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let marketerToken = '';

  const call = (method: string, url: string, token: string, payload?: unknown) =>
    app.inject({ method: method as 'GET', url: `/api/pos${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
  const history = async (query = '') =>
    (await call('GET', `/menu-changes${query}`, store.ownerToken)).json() as { changes: Row[]; total: number };

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('mchg');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    const marketer = await authService.createStaff(store.storeId, { displayName: 'Оля', pin: '864201', role: 'marketer' });
    marketerToken = await issueToken(store.storeId, marketer.id);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  it('records who created, edited, re-priced and archived a card, newest first', async () => {
    const created = await call('POST', '/products', store.ownerToken, {
      name: 'Капучино',
      variants: [{ price_cents: 5500 }],
    });
    expect(created.statusCode).toBe(201);
    const product = created.json() as { id: number; variants: Array<{ id: number }> };

    expect(
      (await call('PATCH', `/products/${product.id}`, marketerToken, { description: 'З корицею', allergens: ['milk'] })).statusCode
    ).toBe(200);
    expect((await call('PATCH', `/variants/${product.variants[0].id}`, marketerToken, { price_cents: 6000 })).statusCode).toBe(200);
    // The same values again change nothing and leave no row.
    expect((await call('PATCH', `/variants/${product.variants[0].id}`, marketerToken, { price_cents: 6000 })).statusCode).toBe(200);
    expect((await call('POST', `/products/${product.id}/archive`, store.ownerToken)).statusCode).toBe(200);

    const { changes, total } = await history(`?entity=product&entity_id=${product.id}`);
    expect(total).toBe(4);
    expect(changes.map((c) => [c.action, c.staff_role])).toEqual([
      ['archive', 'owner'],
      ['update', 'marketer'],
      ['update', 'marketer'],
      ['create', 'owner'],
    ]);
    expect(changes[1]).toMatchObject({
      staff_name: 'Оля',
      entity_name: 'Капучино',
      changes: [{ field: 'variant.price_cents', from: 5500, to: 6000 }],
    });
    expect(changes[2].changes).toEqual([
      { field: 'description', from: null, to: 'З корицею' },
      { field: 'allergens', from: [], to: ['milk'] },
    ]);
    expect(changes[3].changes).toEqual([{ field: 'variant_added', variant: expect.any(String), to: 5500 }]);
  });

  it('records modifier groups and which groups a card asks', async () => {
    const group = await call('POST', '/modifier-groups', store.ownerToken, { name: 'Сироп', min_select: 0, max_select: 1 });
    expect(group.statusCode).toBe(201);
    const groupId = (group.json() as { id: number }).id;
    expect((await call('POST', `/modifier-groups/${groupId}/modifiers`, store.ownerToken, { name: 'Ваніль', price_delta_cents: 1000 })).statusCode).toBe(201);

    const product = (
      await call('POST', '/products', store.ownerToken, { name: 'Раф', variants: [{ price_cents: 7000 }] })
    ).json() as { id: number };
    expect((await call('PUT', `/products/${product.id}/modifier-groups`, store.ownerToken, { group_ids: [groupId] })).statusCode).toBe(200);

    const groupRows = (await history(`?entity=modifier_group&entity_id=${groupId}`)).changes;
    expect(groupRows.map((r) => r.action)).toEqual(['update', 'create']);
    expect(groupRows[0].changes).toEqual([{ field: 'modifier_added', variant: 'Ваніль', to: 1000 }]);

    const cardRows = (await history(`?entity=product&entity_id=${product.id}`)).changes;
    expect(cardRows[0].changes).toEqual([{ field: 'modifier_groups', from: [], to: ['Сироп'] }]);
  });

  it('is the owner’s to read: a seller and a marketer are refused', async () => {
    expect((await call('GET', '/menu-changes', store.sellerToken)).statusCode).toBe(403);
    const marketer = await call('GET', '/menu-changes', marketerToken);
    expect(marketer.statusCode).toBe(403);
    expect((await call('GET', '/menu-changes?entity_id=x', store.ownerToken)).statusCode).toBe(400);
  });
});
