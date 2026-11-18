// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { CostIndex, CostNode } from './recipeCost';
import {
  grossFor,
  hasLosses,
  lossPercentText,
  netOf,
  parseLossPercent,
  recipeLineOf,
  recipeYield,
  yieldText,
} from './recipeLoss';

function node(variantId: number, caption: string, unit: string): CostNode {
  return {
    variantId,
    productId: variantId,
    caption,
    unit,
    costMilli: 0,
    prepLossBps: null,
    derived: false,
    recipe: false,
    ingredient: true,
    components: [],
  };
}

describe('recipeLoss', () => {
  it('derives the net from the gross — the server’s cases', () => {
    expect(netOf(125, 2000)).toBe(100);
    expect(netOf(35, 1500)).toBe(30);
    expect(netOf(180, 0)).toBe(180);
    expect(netOf(1000, 9900)).toBe(10);
  });

  it('works the gross out of a net, which is the sum the owner did on a calculator', () => {
    expect(grossFor(100, 2000)).toBe(125);
    expect(grossFor(30, 1500)).toBe(35);
    expect(grossFor(150, 0)).toBe(150);
    expect(grossFor(0, 2000)).toBe(0);
    // Never below one unit, however small the net.
    expect(grossFor(1, 0)).toBe(1);
  });

  it('gives a typed net back: the box does not jump while it is being typed', () => {
    for (const loss of [0, 500, 1250, 1500, 2000, 3300, 5000, 7500]) {
      for (const net of [1, 3, 7, 10, 30, 99, 100, 150, 245, 1000]) {
        expect(netOf(grossFor(net, loss), loss)).toBe(net);
      }
    }
  });

  it('reads a percent the way it is typed and refuses what is not 0…99 %', () => {
    expect(parseLossPercent('20')).toBe(2000);
    expect(parseLossPercent('12,5')).toBe(1250);
    expect(parseLossPercent('12.5 %')).toBe(1250);
    expect(parseLossPercent('')).toBe(0);
    expect(parseLossPercent('0')).toBe(0);
    expect(parseLossPercent('99')).toBe(9900);
    expect(parseLossPercent('100')).toBeNull();
    expect(parseLossPercent('99,5')).toBeNull();
    expect(parseLossPercent('багато')).toBeNull();
    expect(lossPercentText(2000)).toBe('20');
    expect(lossPercentText(1250)).toBe('12,5');
    expect(lossPercentText(0)).toBe('');
    expect(lossPercentText(null)).toBe('');
  });

  it('states the loss on every line it hands over, and notices a recipe that has one', () => {
    expect(recipeLineOf({ component_variant_id: 1, quantity: 5 })).toEqual({ component_variant_id: 1, quantity: 5, loss_bps: 0 });
    expect(recipeLineOf({ component_variant_id: 1, quantity: 5, loss_bps: 2000 }).loss_bps).toBe(2000);
    expect(hasLosses([{ component_variant_id: 1, quantity: 5 }])).toBe(false);
    expect(hasLosses([{ component_variant_id: 1, quantity: 5, loss_bps: 0 }])).toBe(false);
    expect(hasLosses([{ component_variant_id: 1, quantity: 5, loss_bps: 1 }])).toBe(true);
  });

  it('adds up what a portion comes to: the net of what is weighed, the pieces named apart', () => {
    const index: CostIndex = new Map([
      [1, node(1, 'Картопля', 'г')],
      [2, node(2, 'Молоко', 'мл')],
      [3, node(3, 'Яйце', 'шт')],
    ]);
    const y = recipeYield(index, [
      { component_variant_id: 1, quantity: 125, loss_bps: 2000 },
      { component_variant_id: 2, quantity: 50 },
      { component_variant_id: 3, quantity: 2 },
    ]);
    expect(y).toEqual({ weight: 150, unit: 'г', pieces: [{ caption: 'Яйце', quantity: 2, unit: 'шт' }] });
    expect(yieldText(y)).toBe('≈ 150 г + Яйце × 2 шт');
    // A drink is millilitres all the way down.
    expect(yieldText(recipeYield(index, [{ component_variant_id: 2, quantity: 200 }]))).toBe('≈ 200 мл');
    expect(yieldText(recipeYield(index, []))).toBe('');
  });
});
