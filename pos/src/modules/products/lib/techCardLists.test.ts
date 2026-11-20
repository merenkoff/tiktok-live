// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { ModifierGroup, Product } from '@pos/platform';
import { buildCostIndex } from './recipeCost';
import {
  directUses,
  dishRows,
  ingredientRows,
  needsAttention,
  noRecipeProducts,
  overTarget,
  prepRows,
} from './techCardLists';

type Part = [variantId: number, quantity: number];

function product(
  id: number,
  name: string,
  opts: { cost?: number; kind?: 'simple' | 'composite'; mode?: 'own' | 'derived'; sellable?: boolean; parts?: Part[]; price?: number; active?: boolean; tags?: number[] } = {}
): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: opts.active ?? true,
    kind: opts.kind ?? 'simple',
    stock_mode: opts.mode ?? 'own',
    sellable: opts.sellable ?? false,
    tag_ids: opts.tags ?? [],
    variants: [
      {
        id: id * 10,
        product_id: id,
        attributes: {},
        label: '',
        unit: 'г',
        sku: null,
        barcode: null,
        price_cents: opts.price ?? 0,
        cost_cents: opts.cost ?? 0,
        is_active: true,
        quantity: 500,
        components: (opts.parts ?? []).map(([variantId, quantity], index) => ({
          id: index + 1,
          component_variant_id: variantId,
          quantity,
          sort_order: index,
          product_name: '',
          label: '',
          unit: '',
        })),
      },
    ],
  } as Product;
}

const dish = (id: number, name: string, price: number, parts: Part[]) =>
  product(id, name, { kind: 'composite', mode: 'derived', sellable: true, price, parts });

const CATALOGUE: Product[] = [
  product(1, 'Яловичина', { cost: 50 }),
  product(2, 'Вершки', { cost: 0 }),
  product(3, 'Сіль', { cost: 1 }),
  product(4, 'Соус', { kind: 'composite', mode: 'derived', parts: [[20, 30], [30, 2]] }),
  dish(5, 'Стейк', 30000, [[10, 300], [30, 5]]), // 15 005 → 50,0 %
  dish(6, 'Суп', 10000, [[40, 1]]), // through the sauce: cream has no price
  dish(7, 'Збиткова', 1000, [[10, 40]]), // 2 000 > 1 000
  dish(8, 'Порожня', 9000, []),
  dish(9, 'Дешева', 10000, [[30, 100]]), // 100 → 1 %
  product(10, 'Вода 0,5', { sellable: true, price: 3000 }),
  product(11, 'Архівна', { sellable: true, active: false }),
];

describe('techCardLists', () => {
  const index = buildCostIndex(CATALOGUE);

  it('lists what is sold with a recipe — worst first, the unknown ones after', () => {
    const rows = dishRows(CATALOGUE, index);
    expect(rows.map((r) => r.name)).toEqual(['Збиткова', 'Стейк', 'Дешева', 'Порожня', 'Суп']);
    expect(rows.map((r) => r.problems)).toEqual([['loss'], [], [], ['empty'], ['unpriced']]);
    expect(rows[1].sizes[0]).toMatchObject({ priceCents: 30000, bps: 5002 });
    // Never 0 %: an unknown cost has no percentage at all.
    expect(rows[4].worstBps).toBeNull();
    expect(rows[4].sizes[0].cost.missing).toEqual(['Соус']);
  });

  it('knows what needs attention and what is merely over the owner’s target', () => {
    const rows = dishRows(CATALOGUE, index);
    expect(rows.filter(needsAttention).map((r) => r.name)).toEqual(['Збиткова', 'Порожня', 'Суп']);
    // A dish that loses money is «attention», not «over target» twice.
    expect(rows.filter((r) => overTarget(r, 3000)).map((r) => r.name)).toEqual(['Стейк']);
    expect(rows.filter((r) => overTarget(r, null))).toEqual([]);
  });

  it('keeps preps apart from dishes, and lists what is sold with no recipe', () => {
    expect(prepRows(CATALOGUE, index).map((r) => r.name)).toEqual(['Соус']);
    expect(noRecipeProducts(CATALOGUE).map((p) => p.name)).toEqual(['Вода 0,5']);
  });

  it('follows an ingredient to every dish that takes it — through a prep too — unpriced first', () => {
    const groups = [
      {
        id: 1,
        name: 'Додатково',
        min_select: 0,
        max_select: 1,
        sort_order: 0,
        is_active: true,
        modifiers: [{ id: 1, group_id: 1, name: 'з вершками', price_delta_cents: 0, component_variant_id: 20, component_quantity: 10, component: null, is_default: false, sort_order: 0, is_active: true }],
      },
    ] as ModifierGroup[];
    const rows = ingredientRows(CATALOGUE, index, groups);
    expect(rows.map((r) => r.caption)).toEqual(['Вершки', 'Сіль', 'Яловичина']);
    const cream = rows[0];
    // In the sauce directly, in the soup through the sauce.
    expect(cream.usedIn.map((u) => u.name)).toEqual(['Соус', 'Суп']);
    expect(cream.modifierUses).toBe(1);
    expect(rows[1].usedIn.map((u) => u.name)).toEqual(['Дешева', 'Соус', 'Стейк', 'Суп']);
    // A recipe assembled on sale has no shelf: it is not an ingredient. Water is sold and used nowhere.
    expect(rows.some((r) => r.caption === 'Соус' || r.caption === 'Вода 0,5')).toBe(false);
  });

  it('counts the recipes a replacement would rewrite — direct lines only', () => {
    expect(directUses(CATALOGUE, 20)).toEqual({ recipes: 1, productIds: [4] });
    expect(directUses(CATALOGUE, 30).recipes).toBe(3);
    expect(directUses(CATALOGUE, 999)).toEqual({ recipes: 0, productIds: [] });
  });
});
