// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.modifiers.test.ts — modifiers on a sale line (migration
// 046): the owner's groups and answers, and what a chosen answer does at
// checkout — the price, the caption, the snapshot and the shelf.
// See TechDocs/POS_CAFE.md §3–§4, POS_VERTICALS.md §7k.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { applyPosMigrations, createTestStore, dropTestStore, hasDb } from './helpers/pos-fixtures.js';
import {
  createProduct,
  getCatalog,
  listProducts,
  updateVariant,
} from '../pos/products.service.js';
import { completeSale, refundSale } from '../pos/sales.service.js';
import * as modifiers from '../pos/modifiers.service.js';
import { fiscalLineName } from '../pos/fiscal/mapping.js';
import { parkCart } from '../pos/parked-carts.service.js';
import { createPreorder } from '../pos/preorders.service.js';

describe.skipIf(!hasDb)('POS modifiers', () => {
  let storeId = 0;
  let staffId = 0;
  let milk = 0;
  let oat = 0;
  let beans = 0;
  let cup = 0;
  let sugar = 0;
  let water = 0;
  let cheese = 0;
  /** Derived semi-finished, 5 г sugar + 5 мл water, priced at 10 ₴ as a card. */
  let syrup = 0;
  let latte = 0;
  let latteProduct = 0;
  let sandwich = 0;
  let sandwichProduct = 0;

  let milkGroup: modifiers.ModifierGroup;
  let syrupGroup: modifiers.ModifierGroup;
  let portionGroup: modifiers.ModifierGroup;
  let extrasGroup: modifiers.ModifierGroup;
  const id = (group: modifiers.ModifierGroup, name: string) =>
    group.modifiers.find((m) => m.name === name)!.id;

  async function ingredient(name: string, unit: string, quantity: number, cost = 0) {
    const product = await createProduct(storeId, {
      name,
      sellable: false,
      variants: [{ attributes: {}, unit, price_cents: 100, cost_cents: cost, quantity }],
    });
    return (product!.variants[0] as { id: number }).id;
  }

  async function stockOf(variantId: number): Promise<number> {
    const result = await pool.query(
      `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
      [variantId, storeId]
    );
    return Number(result.rows[0].quantity);
  }

  async function snapshotOf(saleId: number): Promise<Record<number, number>> {
    const rows = await pool.query(
      `SELECT c.component_variant_id, c.quantity_per_unit
       FROM pos_sale_item_components c
       JOIN pos_sale_items i ON i.id = c.sale_item_id
       WHERE i.sale_id = $1`,
      [saleId]
    );
    return Object.fromEntries(
      rows.rows.map((r) => [Number(r.component_variant_id), Number(r.quantity_per_unit)])
    );
  }

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await createTestStore('mods');
    storeId = store.storeId;
    staffId = store.ownerId;
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [storeId]);

    milk = await ingredient('Молоко', 'мл', 5000);
    oat = await ingredient('Вівсяне молоко', 'мл', 3000);
    beans = await ingredient('Зерно', 'г', 1000);
    cup = await ingredient('Стакан', 'шт', 100);
    sugar = await ingredient('Цукор', 'г', 1000);
    water = await ingredient('Вода', 'мл', 10000);
    cheese = await ingredient('Сир', 'г', 1000);

    const syrupCard = await createProduct(storeId, {
      name: 'Карамельний сироп (порція)',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: 1000,
          quantity: 0,
          components: [
            { component_variant_id: sugar, quantity: 5 },
            { component_variant_id: water, quantity: 5 },
          ],
        },
      ],
    });
    syrup = (syrupCard!.variants[0] as { id: number }).id;

    const latteCard = await createProduct(storeId, {
      name: 'Латте',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: { size: 'M' },
          price_cents: 6500,
          quantity: 0,
          components: [
            { component_variant_id: beans, quantity: 18 },
            { component_variant_id: cup, quantity: 1 },
          ],
        },
      ],
    });
    latte = (latteCard!.variants[0] as { id: number }).id;
    latteProduct = latteCard!.id;

    const sandwichCard = await createProduct(storeId, {
      name: 'Сендвіч',
      variants: [{ attributes: {}, price_cents: 9000, quantity: 5 }],
    });
    sandwich = (sandwichCard!.variants[0] as { id: number }).id;
    sandwichProduct = sandwichCard!.id;

    // Milk is a required single choice whose answers carry the milk — the
    // latte's own recipe holds none, so nothing is written off twice.
    milkGroup = await modifiers.createGroup(storeId, { name: 'Молоко', min_select: 1, max_select: 1 });
    milkGroup = await modifiers.createModifier(storeId, milkGroup.id, {
      name: 'звичайне',
      price_delta_cents: 0,
      component_variant_id: milk,
      component_quantity: 200,
      is_default: true,
    });
    milkGroup = await modifiers.createModifier(storeId, milkGroup.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: oat,
      component_quantity: 200,
    });
    milkGroup = await modifiers.createModifier(storeId, milkGroup.id, {
      name: 'мигдальне',
      price_delta_cents: 1500,
    });
    // Syrups: optional, up to three, and «карамель» writes off a portion of a
    // semi-finished product that is itself a recipe.
    syrupGroup = await modifiers.createGroup(storeId, { name: 'Сироп', min_select: 0, max_select: 3 });
    syrupGroup = await modifiers.createModifier(storeId, syrupGroup.id, {
      name: 'карамель',
      price_delta_cents: 1000,
      component_variant_id: syrup,
      component_quantity: 1,
    });
    syrupGroup = await modifiers.createModifier(storeId, syrupGroup.id, {
      name: 'ваніль',
      price_delta_cents: 1000,
    });
    // A negative delta: businesses differ.
    portionGroup = await modifiers.createGroup(storeId, { name: 'Порція', max_select: 1 });
    portionGroup = await modifiers.createModifier(storeId, portionGroup.id, {
      name: 'половина',
      price_delta_cents: -2000,
    });
    await modifiers.setProductGroups(storeId, latteProduct, [
      milkGroup.id,
      syrupGroup.id,
      portionGroup.id,
    ]);

    extrasGroup = await modifiers.createGroup(storeId, { name: 'Додатки', max_select: 2 });
    extrasGroup = await modifiers.createModifier(storeId, extrasGroup.id, {
      name: 'ще сир',
      price_delta_cents: 2000,
      component_variant_id: cheese,
      component_quantity: 20,
    });
    await modifiers.setProductGroups(storeId, sandwichProduct, [extrasGroup.id]);
  }, 60000);

  afterAll(async () => {
    if (storeId) await dropTestStore(storeId);
  });

  describe('the owner defines the questions', () => {
    it('refuses what cannot be a group or an answer', async () => {
      await expect(modifiers.createGroup(storeId, { name: '  ' })).rejects.toThrow(/назва/);
      await expect(
        modifiers.createGroup(storeId, { name: 'X', min_select: 2, max_select: 1 })
      ).rejects.toThrow(/max_select/);
      await expect(
        modifiers.createModifier(storeId, milkGroup.id, { name: 'кокосове', component_variant_id: milk })
      ).rejects.toThrow(/і варіанта, і кількості/);
      await expect(
        modifiers.createModifier(storeId, milkGroup.id, {
          name: 'кокосове',
          component_variant_id: 999999999,
          component_quantity: 1,
        })
      ).rejects.toThrow(/не знайдено/);
      // One default already fills a max-1 group.
      await expect(
        modifiers.createModifier(storeId, milkGroup.id, { name: 'соєве', is_default: true })
      ).rejects.toThrow(/Дефолтних/);
      await expect(
        modifiers.updateGroup(storeId, milkGroup.id, { max_select: 0 })
      ).rejects.toThrow(/max_select/);
      // A group of another store cannot be attached.
      const other = await createTestStore('mods2');
      try {
        const foreign = await modifiers.createGroup(other.storeId, { name: 'Чужа' });
        await expect(
          modifiers.setProductGroups(storeId, latteProduct, [milkGroup.id, foreign.id])
        ).rejects.toThrow(/не знайдено/);
      } finally {
        await dropTestStore(other.storeId);
      }
    });

    it('lists groups with their answers, and the product list names its groups', async () => {
      const groups = await modifiers.listGroups(storeId);
      expect(groups.map((g) => g.name)).toEqual(['Молоко', 'Сироп', 'Порція', 'Додатки']);
      const milkRow = groups.find((g) => g.id === milkGroup.id)!;
      expect(milkRow).toMatchObject({ min_select: 1, max_select: 1 });
      expect(milkRow.modifiers.map((m) => m.name)).toEqual(['звичайне', 'вівсяне', 'мигдальне']);
      expect(milkRow.modifiers[0]).toMatchObject({
        is_default: true,
        component_variant_id: milk,
        component_quantity: 200,
        component: { product_name: 'Молоко', unit: 'мл' },
      });

      const products = await listProducts(storeId);
      expect(products.find((p) => p.id === latteProduct)?.modifier_group_ids).toEqual([
        milkGroup.id,
        syrupGroup.id,
        portionGroup.id,
      ]);
      expect(products.find((p) => p.id === sandwichProduct)?.modifier_group_ids).toEqual([
        extrasGroup.id,
      ]);
    });

    it('sends the till only active groups and answers, and nothing for a product that asks none', async () => {
      await modifiers.updateModifier(storeId, id(milkGroup, 'мигдальне'), { is_active: false });
      const catalog = await getCatalog(storeId);
      const latteRow = catalog.find((c) => c.variant_id === latte)!;
      expect(latteRow.modifier_groups?.map((g) => g.name)).toEqual(['Молоко', 'Сироп', 'Порція']);
      expect(latteRow.modifier_groups![0].modifiers.map((m) => m.name)).toEqual([
        'звичайне',
        'вівсяне',
      ]);
      expect(latteRow.modifier_groups![0].modifiers[0]).toMatchObject({
        is_default: true,
        price_delta_cents: 0,
      });
      // The card's own price is untouched by its modifiers.
      expect(latteRow.price_cents).toBe(6500);
      expect(catalog.find((c) => c.variant_id === syrup)).not.toHaveProperty('modifier_groups');
    });
  });

  describe('a modified line at checkout', () => {
    it('prices the line as the card price plus the deltas — never a sum of ingredients', async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          {
            variant_id: latte,
            quantity: 1,
            // Named out of order on purpose: the set is what matters.
            modifiers: [id(portionGroup, 'половина'), id(syrupGroup, 'карамель'), id(milkGroup, 'вівсяне')],
            note: '  гарячіше ',
          },
        ],
        payments: [{ method: 'cash', amount_cents: 7000 }],
      });
      const line = sale!.items[0];
      // 6500 + 1500 (oat) + 1000 (caramel) − 2000 (half) — not 18 г of beans.
      expect(line.unit_price_cents).toBe(7000);
      expect(line.line_total_cents).toBe(7000);
      expect(sale!.total_cents).toBe(7000);
      // The caption carries the choices in group order, the note does not.
      expect(line.variant_label).toBe('M · вівсяне · карамель · половина');
      expect(line.note).toBe('гарячіше');
      expect(fiscalLineName(line.product_name, line.variant_label)).toBe(
        'Латте (M · вівсяне · карамель · половина)'
      );
      expect(line.modifiers).toEqual([
        { modifier_id: id(milkGroup, 'вівсяне'), group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 },
        { modifier_id: id(syrupGroup, 'карамель'), group_name: 'Сироп', name: 'карамель', price_delta_cents: 1000 },
        { modifier_id: id(portionGroup, 'половина'), group_name: 'Порція', name: 'половина', price_delta_cents: -2000 },
      ]);
    });

    it('refuses what the questions do not allow, naming the question', async () => {
      const sell = (items: Parameters<typeof completeSale>[0]['items']) =>
        completeSale({ storeId, staffId, items, payments: [{ method: 'cash', amount_cents: 100000 }] });

      // A required group unanswered — including by a client that has never
      // heard of modifiers and sends none.
      await expect(sell([{ variant_id: latte, quantity: 1 }])).rejects.toThrow(/Оберіть «Молоко»/);
      await expect(
        sell([{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне'), id(milkGroup, 'вівсяне')] }])
      ).rejects.toThrow(/«Молоко»: не більше 1/);
      // Another product's answer.
      await expect(
        sell([{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне'), id(extrasGroup, 'ще сир')] }])
      ).rejects.toThrow(/недоступний для цього товару/);
      // An inactive one is not on offer either.
      await expect(
        sell([{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'мигдальне')] }])
      ).rejects.toThrow(/недоступний/);
      await expect(
        sell([{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне'), id(milkGroup, 'звичайне')] }])
      ).rejects.toThrow(/двічі/);
      await expect(
        sell([{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне')], note: 'x'.repeat(121) }])
      ).rejects.toThrow(/довший/);
      // A bouquet's price is its stems'; a delta on top has no meaning.
      await expect(
        sell([
          {
            variant_id: latte,
            quantity: 1,
            components: [{ component_variant_id: beans, quantity: 10 }],
            modifiers: [id(milkGroup, 'звичайне')],
          },
        ])
      ).rejects.toThrow(/cannot carry modifiers/);

      // A delta may be negative; the price may not.
      const withCrash = await modifiers.createModifier(storeId, portionGroup.id, {
        name: 'нічого',
        price_delta_cents: -20000,
      });
      try {
        await expect(
          sell([{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне'), id(withCrash, 'нічого')] }])
        ).rejects.toThrow(/below zero/);
      } finally {
        await modifiers.deleteModifier(storeId, id(withCrash, 'нічого'));
      }
      // Nothing above moved a shelf.
      expect(await stockOf(milk)).toBe(5000);
    });

    it('merges identical lines and keeps different ones apart', async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          { variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне'), id(syrupGroup, 'карамель')] },
          { variant_id: latte, quantity: 1, modifiers: [id(syrupGroup, 'карамель'), id(milkGroup, 'звичайне')] },
          { variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне')], note: 'без кришки' },
          { variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне')] },
        ],
        payments: [{ method: 'cash', amount_cents: 100000 }],
      });
      const lines = sale!.items.map((i) => ({ q: i.quantity, label: i.variant_label, note: i.note }));
      expect(lines).toEqual(
        expect.arrayContaining([
          { q: 2, label: 'M · звичайне · карамель', note: '' },
          { q: 1, label: 'M · звичайне', note: 'без кришки' },
          { q: 1, label: 'M · звичайне', note: '' },
        ])
      );
      expect(lines).toHaveLength(3);
    });

    it('writes off what the modifiers take next to the recipe, and gives back exactly that', async () => {
      const before = {
        beans: await stockOf(beans),
        cup: await stockOf(cup),
        oat: await stockOf(oat),
        milk: await stockOf(milk),
        sugar: await stockOf(sugar),
        water: await stockOf(water),
      };
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          { variant_id: latte, quantity: 2, modifiers: [id(milkGroup, 'вівсяне'), id(syrupGroup, 'карамель')] },
        ],
        payments: [{ method: 'cash', amount_cents: 18000 }],
      });
      // The recipe, the oat milk, and the syrup expanded to sugar and water —
      // the same way the recipe's own semi-finished would be. Ordinary milk
      // was not chosen, so none of it moved.
      expect(await stockOf(beans)).toBe(before.beans - 36);
      expect(await stockOf(cup)).toBe(before.cup - 2);
      expect(await stockOf(oat)).toBe(before.oat - 400);
      expect(await stockOf(sugar)).toBe(before.sugar - 10);
      expect(await stockOf(water)).toBe(before.water - 10);
      expect(await stockOf(milk)).toBe(before.milk);
      expect(await snapshotOf(sale!.id)).toEqual({
        [beans]: 18,
        [cup]: 1,
        [oat]: 200,
        [sugar]: 5,
        [water]: 5,
      });

      await refundSale({
        storeId,
        staffId,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      });
      expect(await stockOf(beans)).toBe(before.beans - 18);
      expect(await stockOf(oat)).toBe(before.oat - 200);
      expect(await stockOf(sugar)).toBe(before.sugar - 5);
    });

    it('records a product with its own shelf AND a write-off, so the refund gets both back', async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: sandwich, quantity: 1, modifiers: [id(extrasGroup, 'ще сир')] }],
        payments: [{ method: 'cash', amount_cents: 11000 }],
      });
      expect(sale!.items[0].unit_price_cents).toBe(11000);
      expect(sale!.items[0].variant_label).toBe('ще сир');
      expect(await stockOf(sandwich)).toBe(4);
      expect(await stockOf(cheese)).toBe(980);
      // The self row: rows present are the whole truth, so «no rows ⇒ own
      // shelf» cannot leave the sandwich out of the refund.
      expect(await snapshotOf(sale!.id)).toEqual({ [sandwich]: 1, [cheese]: 20 });

      await refundSale({
        storeId,
        staffId,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      });
      expect(await stockOf(sandwich)).toBe(5);
      expect(await stockOf(cheese)).toBe(1000);
    });

    it('takes an older client that names no modifiers, when nothing is required', async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: sandwich, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 9000 }],
      });
      expect(sale!.items[0]).toMatchObject({ unit_price_cents: 9000, modifiers: [], note: '' });
      expect(await snapshotOf(sale!.id)).toEqual({});
      await refundSale({
        storeId,
        staffId,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      });
      expect(await stockOf(sandwich)).toBe(5);
    });

    it('shifts the card markdown by the delta, and lets the cart discount see the delta', async () => {
      await updateVariant(storeId, latte, { compare_at_cents: 8000 });
      try {
        const sale = await completeSale({
          storeId,
          staffId,
          items: [{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'вівсяне')] }],
          payments: [{ method: 'cash', amount_cents: 8000 }],
        });
        // 6500 → 8000 with the oat milk; the «was 80 ₴» moves to 95 ₴, so the
        // receipt keeps showing the same 15 ₴ off rather than a 0 ₴ one.
        expect(sale!.items[0]).toMatchObject({ unit_price_cents: 8000, compare_at_unit_cents: 9500 });
      } finally {
        await updateVariant(storeId, latte, { compare_at_cents: null });
      }

      const discounted = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'вівсяне')] }],
        cart_discount: { type: 'percent', value: 10 },
        payments: [{ method: 'cash', amount_cents: 7200 }],
      });
      expect(discounted!.items[0]).toMatchObject({
        unit_price_cents: 8000,
        compare_at_unit_cents: null,
        line_discount_cents: 800,
        line_total_cents: 7200,
      });
    });

    it('keeps the names on a receipt after the answer is gone', async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне'), id(syrupGroup, 'ваніль')] }],
        payments: [{ method: 'cash', amount_cents: 7500 }],
      });
      await modifiers.deleteModifier(storeId, id(syrupGroup, 'ваніль'));
      const again = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: latte, quantity: 1, modifiers: [id(milkGroup, 'звичайне')] }],
        payments: [{ method: 'cash', amount_cents: 6500 }],
      });
      expect(again!.items[0].variant_label).toBe('M · звичайне');
      const kept = await pool.query(
        `SELECT modifier_id, name FROM pos_sale_item_modifiers m
         JOIN pos_sale_items i ON i.id = m.sale_item_id
         WHERE i.sale_id = $1 AND m.name = 'ваніль'`,
        [sale!.id]
      );
      expect(kept.rows).toEqual([{ modifier_id: null, name: 'ваніль' }]);
    });

    it('is refused, out loud, by a parked cart and a pre-order for now', async () => {
      await expect(
        parkCart({
          storeId,
          staffId,
          clientUuid: randomUUID(),
          label: 'Столик',
          items: [{ variant_id: sandwich, quantity: 1, modifiers: [id(extrasGroup, 'ще сир')] } as never],
        })
      ).rejects.toThrow(/поки не можна відкласти/);
      await expect(
        createPreorder({
          storeId,
          staffId,
          clientUuid: randomUUID(),
          dueAt: new Date(Date.now() + 3_600_000).toISOString(),
          items: [{ variant_id: sandwich, quantity: 1, note: 'без цибулі' } as never],
        })
      ).rejects.toThrow(/поки не можна замовити наперед/);
    });
  });
});
