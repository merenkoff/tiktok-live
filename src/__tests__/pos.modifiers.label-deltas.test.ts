// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.modifiers.label-deltas.test.ts — an answer whose price
// depends on the size of the dish (migration 066): «Бортики Філадельфія» is
// +80 ₴ on a 30 см pizza and +150 ₴ on a 50 см one. Every path that prices a
// modified line must agree — the catalog row, checkout, a parked cart, a
// pre-order, a table's draft, a fired round. Numbers are Sun City's
// (TechDocs/POS_DEMO_SUNCITY.md).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { applyPosMigrations, createTestStore, dropTestStore, hasDb } from './helpers/pos-fixtures.js';
import { createProduct, getCatalog } from '../pos/products.service.js';
import { completeSale } from '../pos/sales.service.js';
import * as modifiers from '../pos/modifiers.service.js';
import { parkCart, releaseCart } from '../pos/parked-carts.service.js';
import { createPreorder } from '../pos/preorders.service.js';
import * as bills from '../pos/bills.service.js';
import { fireRound } from '../pos/rounds.service.js';
import { createHall, createTable } from '../pos/tables.service.js';

describe('label deltas, pure', () => {
  const crust = { price_delta_cents: 8000, label_deltas: [{ label: '50 см', price_delta_cents: 15000 }] };

  it('reads a label the way the owner would: spaces and case do not matter', () => {
    expect(modifiers.labelKey('  50   СМ ')).toBe('50 см');
    expect(modifiers.deltaForLabel(crust, '50 см')).toBe(15000);
    expect(modifiers.deltaForLabel(crust, '50  См')).toBe(15000);
    // No entry for the size: the answer's default.
    expect(modifiers.deltaForLabel(crust, '30 см')).toBe(8000);
    expect(modifiers.deltaForLabel(crust, '')).toBe(8000);
    // A different spelling is a different size — «50см» is not «50 см».
    expect(modifiers.deltaForLabel(crust, '50см')).toBe(8000);
  });

  it('hands back the groups as one variant sees them, and the same objects when nothing differs', () => {
    const group: modifiers.ModifierGroup = {
      id: 1,
      name: 'Бортики',
      min_select: 0,
      max_select: 1,
      sort_order: 0,
      is_active: true,
      modifiers: [
        {
          id: 10,
          group_id: 1,
          name: 'Філадельфія',
          ...crust,
          component_variant_id: null,
          component_quantity: null,
          component: null,
          is_default: false,
          sort_order: 0,
          is_active: true,
        },
      ],
    };
    expect(modifiers.groupsForVariant([group], '50 см')[0].modifiers[0].price_delta_cents).toBe(15000);
    expect(modifiers.groupsForVariant([group], '30 см')[0].modifiers[0].price_delta_cents).toBe(8000);
    // The input is not mutated.
    expect(group.modifiers[0].price_delta_cents).toBe(8000);
    const plain = { ...group, modifiers: [{ ...group.modifiers[0], label_deltas: [] }] };
    expect(modifiers.groupsForVariant([plain], '50 см')[0]).toBe(plain);
  });

  it('cleans the owner’s list and refuses what cannot be a price for a size', () => {
    expect(
      modifiers.cleanLabelDeltas([
        { label: '  50   см ', price_delta_cents: 15000 },
        { label: 'L', price_delta_cents: '-500' },
      ])
    ).toEqual([
      { label: '50 см', price_delta_cents: 15000 },
      { label: 'L', price_delta_cents: -500 },
    ]);
    expect(modifiers.cleanLabelDeltas(null)).toEqual([]);
    expect(() => modifiers.cleanLabelDeltas({})).toThrow(/списком/);
    expect(() => modifiers.cleanLabelDeltas([{ label: ' ', price_delta_cents: 1 }])).toThrow(/вкажіть розмір/);
    expect(() =>
      modifiers.cleanLabelDeltas([
        { label: '50 см', price_delta_cents: 1 },
        { label: '50 СМ', price_delta_cents: 2 },
      ])
    ).toThrow(/двічі/);
    expect(() => modifiers.cleanLabelDeltas([{ label: '50 см', price_delta_cents: 1.5 }])).toThrow(/цілим/);
    expect(() =>
      modifiers.cleanLabelDeltas([{ label: '50 см', price_delta_cents: 100_000_01 }])
    ).toThrow(/цілим/);
    expect(() =>
      modifiers.cleanLabelDeltas(Array.from({ length: 21 }, (_, i) => ({ label: `${i}`, price_delta_cents: 1 })))
    ).toThrow(/більше 20/);
  });
});

describe.skipIf(!hasDb)('label deltas in the store', () => {
  let storeId = 0;
  let staffId = 0;
  let pizzaProduct = 0;
  let small = 0;
  let large = 0;
  let crustGroup: modifiers.ModifierGroup;
  let sauceGroup: modifiers.ModifierGroup;
  let philadelphia = 0;
  let mozzarella = 0;
  let burgerSauce = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await createTestStore('labeldeltas');
    storeId = store.storeId;
    staffId = store.ownerId;
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [storeId]);

    const pizza = await createProduct(storeId, {
      name: 'Double Meet',
      variants: [
        { attributes: { size: '30 см' }, price_cents: 23000, quantity: 50 },
        { attributes: { size: '50 см' }, price_cents: 41000, quantity: 50 },
      ],
    });
    pizzaProduct = pizza!.id;
    const byLabel = new Map(
      (pizza!.variants as Array<{ id: number; label: string }>).map((v) => [v.label, v.id])
    );
    small = byLabel.get('30 см')!;
    large = byLabel.get('50 см')!;

    crustGroup = await modifiers.createGroup(storeId, { name: 'Бортики', min_select: 0, max_select: 1 });
    crustGroup = await modifiers.createModifier(storeId, crustGroup.id, {
      name: 'Філадельфія',
      price_delta_cents: 8000,
      label_deltas: [{ label: '50 см', price_delta_cents: 15000 }],
    });
    crustGroup = await modifiers.createModifier(storeId, crustGroup.id, {
      name: 'Моцарелла',
      price_delta_cents: 5000,
      label_deltas: [{ label: '50 см', price_delta_cents: 8000 }],
    });
    sauceGroup = await modifiers.createGroup(storeId, { name: 'Соус', min_select: 0, max_select: 1 });
    sauceGroup = await modifiers.createModifier(storeId, sauceGroup.id, {
      name: 'Бургер',
      price_delta_cents: 3000,
    });
    philadelphia = crustGroup.modifiers.find((m) => m.name === 'Філадельфія')!.id;
    mozzarella = crustGroup.modifiers.find((m) => m.name === 'Моцарелла')!.id;
    burgerSauce = sauceGroup.modifiers[0].id;
    await modifiers.setProductGroups(storeId, pizzaProduct, [crustGroup.id, sauceGroup.id]);
  });

  afterAll(async () => {
    await dropTestStore(storeId);
  });

  it('shows the owner the overrides and the sizes they can match', async () => {
    const group = await modifiers.getGroup(storeId, crustGroup.id);
    expect(group.modifiers.find((m) => m.id === philadelphia)!.label_deltas).toEqual([
      { label: '50 см', price_delta_cents: 15000 },
    ]);
    // In size order, not text order.
    expect(group.labels_in_use).toEqual(['30 см', '50 см']);
    const listed = (await modifiers.listGroups(storeId)).find((g) => g.id === sauceGroup.id)!;
    expect(listed.labels_in_use).toEqual(['30 см', '50 см']);
    expect(listed.modifiers[0].label_deltas).toEqual([]);
  });

  it('replaces the list wholesale on update, keeps it when not sent, clears it with null', async () => {
    const extra = await modifiers.createModifier(storeId, crustGroup.id, {
      name: 'Кунжутний',
      price_delta_cents: 1000,
      label_deltas: [{ label: '50 см', price_delta_cents: 1500 }],
    });
    const sesame = extra.modifiers.find((m) => m.name === 'Кунжутний')!.id;
    const renamed = await modifiers.updateModifier(storeId, sesame, { name: 'Кунжутні' });
    expect(renamed.modifiers.find((m) => m.id === sesame)!.label_deltas).toHaveLength(1);
    const replaced = await modifiers.updateModifier(storeId, sesame, {
      label_deltas: [{ label: '30 см', price_delta_cents: 900 }],
    });
    expect(replaced.modifiers.find((m) => m.id === sesame)!.label_deltas).toEqual([
      { label: '30 см', price_delta_cents: 900 },
    ]);
    const cleared = await modifiers.updateModifier(storeId, sesame, { label_deltas: null });
    expect(cleared.modifiers.find((m) => m.id === sesame)!.label_deltas).toEqual([]);
    await expect(
      modifiers.updateModifier(storeId, sesame, { label_deltas: [{ label: '', price_delta_cents: 1 }] })
    ).rejects.toThrow(/вкажіть розмір/);
    await modifiers.deleteModifier(storeId, sesame);
  });

  it('puts each size’s price on its own catalog row', async () => {
    const catalog = await getCatalog(storeId, { limit: 100 });
    const answer = (variantId: number, modifierId: number) =>
      catalog
        .find((row) => row.variant_id === variantId)!
        .modifier_groups!.flatMap((g) => g.modifiers)
        .find((m) => m.id === modifierId)!;
    expect(answer(small, philadelphia).price_delta_cents).toBe(8000);
    expect(answer(large, philadelphia).price_delta_cents).toBe(15000);
    expect(answer(large, mozzarella).price_delta_cents).toBe(8000);
    // An answer with no override costs the same everywhere.
    expect(answer(small, burgerSauce).price_delta_cents).toBe(3000);
    expect(answer(large, burgerSauce).price_delta_cents).toBe(3000);
    // The till's wire carries no override list.
    expect(answer(large, philadelphia)).not.toHaveProperty('label_deltas');
  });

  it('sells the bigger pizza at the bigger crust price, and snapshots that price', async () => {
    const sale = await completeSale({
      storeId,
      staffId,
      items: [
        { variant_id: large, quantity: 1, modifiers: [philadelphia, burgerSauce] },
        { variant_id: small, quantity: 1, modifiers: [philadelphia, burgerSauce] },
      ],
      payments: [{ method: 'cash', amount_cents: 100000 }],
    });
    const lines = new Map(sale!.items.map((line) => [line.variant_id, line]));
    // Sun City's site: 590 ₴ and 340 ₴.
    expect(lines.get(large)!.unit_price_cents).toBe(41000 + 15000 + 3000);
    expect(lines.get(small)!.unit_price_cents).toBe(23000 + 8000 + 3000);
    expect(lines.get(large)!.variant_label).toBe('50 см · Філадельфія · Бургер');
    expect(lines.get(large)!.modifiers!.find((m) => m.name === 'Філадельфія')!.price_delta_cents).toBe(15000);
    expect(lines.get(small)!.modifiers!.find((m) => m.name === 'Філадельфія')!.price_delta_cents).toBe(8000);
  });

  it('shifts an old price by the same size-dependent sum', async () => {
    await pool.query(`UPDATE pos_variants SET compare_at_cents = 45000 WHERE id = $1`, [large]);
    try {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: large, quantity: 1, modifiers: [mozzarella] }],
        payments: [{ method: 'cash', amount_cents: 100000 }],
      });
      expect(sale!.items[0].unit_price_cents).toBe(41000 + 8000);
      expect(sale!.items[0].compare_at_unit_cents).toBe(45000 + 8000);
    } finally {
      await pool.query(`UPDATE pos_variants SET compare_at_cents = NULL WHERE id = $1`, [large]);
    }
  });

  it('parks and pre-orders the bigger pizza at the bigger crust price', async () => {
    const { cart } = await parkCart({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      label: 'Доставка',
      items: [{ variant_id: large, quantity: 1, modifiers: [philadelphia] }],
    });
    expect(cart.items[0]).toMatchObject({ price_cents: 41000, line_price_cents: 56000 });
    await releaseCart({ storeId, staffId, cartId: cart.id });

    const { preorder } = await createPreorder({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      items: [{ variant_id: large, quantity: 2, modifiers: [philadelphia] }],
    });
    expect(preorder.quoted_total_cents).toBe(56000 * 2);
    expect(preorder.items[0]).toMatchObject({ unit_price_cents: 56000, current_unit_price_cents: 56000 });
  });

  it('previews, retypes and fires a table’s pizza at its own size’s price', async () => {
    const hall = await createHall(storeId, { name: 'Зал' });
    const table = await createTable(storeId, { hall_id: hall.id, name: '1' });
    const { bill } = await bills.openBill({ storeId, staffId, tableId: table.id });
    const drafted = await bills.addDraftItem(storeId, staffId, bill.id, {
      variant_id: small,
      quantity: 1,
      modifiers: [philadelphia],
    });
    const line = drafted.draft[0];
    expect(line.preview_unit_price_cents).toBe(23000 + 8000);

    // The guest wants the big one after all: same answers, bigger crust price.
    const retyped = await bills.updateDraftItem(storeId, bill.id, line.id, { variant_id: large });
    expect(retyped.draft[0].preview_unit_price_cents).toBe(41000 + 15000);
    expect(retyped.draft[0].modifiers[0].price_delta_cents).toBe(15000);

    const fired = await fireRound({ storeId, staffId, billId: bill.id, clientUuid: randomUUID() });
    expect(fired.rounds[0].items[0].unit_price_cents).toBe(41000 + 15000);
  });

  it('prices a guest’s request through the same resolution', async () => {
    const resolved = await modifiers.resolveForVariant(pool, storeId, large, [philadelphia]);
    expect(resolved.deltaCents).toBe(15000);
    expect(await modifiers.liveDeltaCents(pool, storeId, resolved.snapshot, small)).toBe(8000);
    expect(await modifiers.liveDeltaCents(pool, storeId, resolved.snapshot, large)).toBe(15000);
  });
});
