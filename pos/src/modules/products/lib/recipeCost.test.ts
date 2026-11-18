// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Product } from '@pos/platform';
import {
  buildCostIndex,
  foodCostBps,
  baseMilliToHumanPrice,
  humanPriceToBaseMilli,
  moneyText,
  priceForTarget,
  recipeCost,
  scaleRecipe,
  unitCostOf,
  unitPriceText,
} from './recipeCost';

type Part = [variantId: number, quantity: number];

function product(
  id: number,
  name: string,
  opts: { cost?: number; unit?: string; kind?: 'simple' | 'composite'; mode?: 'own' | 'derived'; sellable?: boolean; parts?: Part[]; price?: number } = {}
): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    kind: opts.kind ?? 'simple',
    stock_mode: opts.mode ?? 'own',
    sellable: opts.sellable ?? false,
    tag_ids: [],
    variants: [
      {
        id: id * 10,
        product_id: id,
        attributes: {},
        label: '',
        unit: opts.unit ?? 'г',
        sku: null,
        barcode: null,
        price_cents: opts.price ?? 0,
        // `cost` is in thousandths of a kopeck per base unit, as the server keeps it.
        cost_cents: Math.round((opts.cost ?? 0) / 1000),
        cost_milli: opts.cost ?? 0,
        is_active: true,
        quantity: 0,
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

/**
 * The server's sum, with the server's numbers — the same case is built in a
 * real database by `src/__tests__/pos.recipe-cost-parity.test.ts` and read
 * back from `listTechCards`. If one side changes its arithmetic, one of the
 * two tests fails.
 *
 * Costs are thousandths of a kopeck per base unit, so the case uses prices no
 * whole kopeck per gram could hold:
 *
 *   A 35,50 ₴/кг = 3550, B 12,73 ₴/кг = 1273
 *   prep  (derived) = 10 A + 5 B                → 41 865, folded into what holds it
 *   stock (own, made ahead, 40 коп a piece)     → a shelf of its own, 40 000
 *   dish  (derived) = 2 prep + 3 stock + 4 A    → 83 730 + 120 000 + 14 200 = 217 930
 *                                                → 2,18 ₴, and 21,79 % of a 10 ₴ price:
 *                                                  the share is taken BEFORE the rounding.
 */
const PARITY = {
  a: 3550,
  b: 1273,
  stock: 40_000,
  price: 1000,
  costMilli: 217_930,
  cost: 218,
  bps: 2179,
  costWithoutB: 205,
};

function parityCatalogue(bCost = PARITY.b): Product[] {
  return [
    product(1, 'A', { cost: PARITY.a }),
    product(2, 'B', { cost: bCost }),
    product(3, 'Заготовка', { kind: 'composite', mode: 'derived', parts: [[10, 10], [20, 5]] }),
    product(4, 'Бульйон', { kind: 'composite', mode: 'own', cost: PARITY.stock, unit: 'шт', parts: [[10, 999]] }),
    product(5, 'Страва', {
      kind: 'composite',
      mode: 'derived',
      sellable: true,
      price: PARITY.price,
      parts: [[30, 2], [40, 3], [10, 4]],
    }),
  ];
}

describe('recipeCost: the server’s sum, live', () => {
  it('folds a recipe assembled on sale, and reads one made ahead as its own shelf', () => {
    const index = buildCostIndex(parityCatalogue());
    expect(unitCostOf(index, 30)).toEqual({ milli: 41_865, unpriced: false });
    // Made ahead: its own purchase price, however dear its recipe looks.
    expect(unitCostOf(index, 40)).toEqual({ milli: PARITY.stock, unpriced: false });

    const dish = index.get(50)!;
    const cost = recipeCost(index, dish.components, 50);
    expect(cost.lines.map((l) => l.lineMilli)).toEqual([83_730, 120_000, 14_200]);
    // Each line reads in whole kopecks; the total is rounded from the exact sum, not from these.
    expect(cost.lines.map((l) => l.lineCents)).toEqual([84, 120, 14]);
    expect(cost.milli).toBe(PARITY.costMilli);
    expect(cost.cents).toBe(PARITY.cost);
    expect(cost.unpriced).toBe(false);
    expect(foodCostBps(cost, PARITY.price)).toBe(PARITY.bps);
  });

  it('never calls an unknown price free: the total is a floor and the food cost is unknown', () => {
    const index = buildCostIndex(parityCatalogue(0));
    const cost = recipeCost(index, index.get(50)!.components, 50);
    expect(cost.cents).toBe(PARITY.costWithoutB);
    expect(cost.unpriced).toBe(true);
    // Named by the line the owner sees — the prep that holds the unpriced shelf.
    expect(cost.missing).toEqual(['Заготовка']);
    expect(foodCostBps(cost, PARITY.price)).toBeNull();
  });

  it('has no honest food cost without a price or without a recipe', () => {
    const index = buildCostIndex(parityCatalogue());
    const cost = recipeCost(index, index.get(50)!.components, 50);
    expect(foodCostBps(cost, 0)).toBeNull();
    expect(foodCostBps(recipeCost(index, []), 1000)).toBeNull();
  });

  it('survives a draft that names itself, or a variant that is gone', () => {
    const index = buildCostIndex([
      product(1, 'Петля', { kind: 'composite', mode: 'derived', parts: [[10, 1]] }),
    ]);
    expect(recipeCost(index, [{ component_variant_id: 10, quantity: 2 }], 10).unpriced).toBe(true);
    expect(recipeCost(index, [{ component_variant_id: 999, quantity: 1 }]).missing).toEqual(['Варіант 999']);
  });

  it('suggests the price that meets a target, rounded up to a whole hryvnia', () => {
    expect(priceForTarget(318, 3000)).toBe(1100); // 10,60 → 11 ₴
    expect(priceForTarget(3000, 3000)).toBe(10000);
    expect(priceForTarget(0, 3000)).toBeNull();
    expect(priceForTarget(318, 0)).toBeNull();
  });

  it('prices a gram by the kilogram and a millilitre by the litre — to the kopeck', () => {
    expect(unitPriceText(60_000, 'г')).toBe('600 ₴/кг');
    expect(unitPriceText(3550, 'г')).toBe('35,50 ₴/кг');
    expect(unitPriceText(4000, 'мл')).toBe('40 ₴/л');
    expect(unitPriceText(950_000, 'шт')).toBe('9,50 ₴/шт');
    expect(moneyText(123456)).toBe('1 234,56 ₴');
    expect(moneyText(-500)).toBe('−5 ₴');
    // 35,50 ₴/кг is 3,55 коп/г: kept exactly, where whole kopecks a gram made it 40 ₴/кг.
    expect(humanPriceToBaseMilli(3550, 'г')).toBe(3550);
    expect(baseMilliToHumanPrice(3550, 'г')).toBe(3550);
    expect(humanPriceToBaseMilli(950, 'шт')).toBe(950_000);
    expect(baseMilliToHumanPrice(950_000, 'шт')).toBe(950);
  });

  it('scales a recipe for another size, never below one unit', () => {
    expect(
      scaleRecipe(
        [
          { component_variant_id: 1, quantity: 18 },
          { component_variant_id: 2, quantity: 1 },
        ],
        1.5
      )
    ).toEqual([
      { component_variant_id: 1, quantity: 27, loss_bps: 0 },
      { component_variant_id: 2, quantity: 2, loss_bps: 0 },
    ]);
    expect(scaleRecipe([{ component_variant_id: 1, quantity: 1 }], 0.2)[0].quantity).toBe(1);
    // A loss is a share of the line: a bigger portion peels the same fifth away.
    expect(scaleRecipe([{ component_variant_id: 1, quantity: 125, loss_bps: 2000 }], 2)).toEqual([
      { component_variant_id: 1, quantity: 250, loss_bps: 2000 },
    ]);
  });
});
