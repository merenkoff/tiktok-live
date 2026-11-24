// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { CostIndex, CostNode } from './recipeCost';
import { buildTechCardSheet } from './techCardSheet';

function node(variantId: number, caption: string, unit: string, recipe = false): CostNode {
  return {
    variantId,
    productId: variantId,
    caption,
    unit,
    costMilli: 5000,
    prepLossBps: null,
    derived: recipe,
    recipe,
    recipeYield: 1,
    ingredient: true,
    components: [],
  };
}

const index: CostIndex = new Map([
  [1, node(1, 'Картопля', 'г')],
  [2, node(2, 'Масло', 'г')],
  [3, node(3, 'Бульйон, порція', 'шт', true)],
]);

describe('the tech card as a sheet for the kitchen', () => {
  it('lists gross, net and loss per line, the yield, and no money at all', () => {
    const sheet = buildTechCardSheet({
      store: 'Шабля',
      title: 'Пюре',
      size: '250 г',
      components: [
        { component_variant_id: 1, quantity: 125, loss_bps: 2000 },
        { component_variant_id: 2, quantity: 10 },
        { component_variant_id: 3, quantity: 1 },
        // A line still being typed is not printed.
        { component_variant_id: 2, quantity: 0 },
      ],
      index,
      now: new Date(2026, 10, 7),
    });
    expect(sheet).toEqual({
      store: 'Шабля',
      title: 'Пюре',
      size: '250 г',
      date: '07.11.2026',
      lossy: true,
      yield: '≈ 110 г + Бульйон, порція × 1 шт',
      lines: [
        { caption: 'Картопля', unit: 'г', gross: 125, loss: '20', net: 100, prep: false },
        { caption: 'Масло', unit: 'г', gross: 10, loss: '', net: 10, prep: false },
        { caption: 'Бульйон, порція', unit: 'шт', gross: 1, loss: '', net: 1, prep: true },
      ],
    });
    expect(JSON.stringify(sheet)).not.toMatch(/cost|price|₴/);
  });

  it('is a single weight column for a recipe with no losses, and names a variant it does not know', () => {
    const sheet = buildTechCardSheet({
      store: '',
      title: 'Латте',
      size: '',
      components: [
        { component_variant_id: 2, quantity: 18 },
        { component_variant_id: 99, quantity: 5 },
      ],
      index,
    });
    expect(sheet.lossy).toBe(false);
    expect(sheet.lines.map((l) => l.caption)).toEqual(['Масло', 'Варіант 99']);
  });

  it('prints the stated «вихід» of a recipe written for a batch, not the estimate', () => {
    const sheet = buildTechCardSheet({
      store: 'Шабля',
      title: 'Шашлик свинний ПФ',
      size: '',
      components: [{ component_variant_id: 1, quantity: 2000, loss_bps: 0 }],
      index,
      batch: { amount: 1900, unit: 'г' },
    });
    expect(sheet.yield).toBe('1,9 кг (склад — на всю варку)');
    // «For one unit» keeps the estimate from the lines.
    expect(
      buildTechCardSheet({ store: '', title: '', size: '', components: [{ component_variant_id: 1, quantity: 350 }], index, batch: { amount: 1, unit: 'г' } }).yield
    ).toBe('≈ 350 г');
  });
});
