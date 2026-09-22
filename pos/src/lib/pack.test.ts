// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  baseCostToPack,
  baseToPack,
  defaultPackMode,
  packCostToBase,
  packHint,
  packOf,
  packToBase,
  quantityToBase,
} from './pack';

const BOTTLE = { qty: 1000, label: 'пляшка' };

describe('packOf — does this row have a pack at all', () => {
  it('reads the pair off a row', () => {
    expect(packOf({ pack_qty: 1000, pack_label: 'пляшка' })).toEqual(BOTTLE);
  });

  // Half a pair cannot be converted or read, and the screen must not grow a
  // toggle that multiplies by undefined. A row cached by an older build has
  // neither field at all.
  it.each([
    ['no pack at all', {}],
    ['a row from an older build', { pack_qty: undefined, pack_label: undefined }],
    ['a number with no name', { pack_qty: 1000, pack_label: '' }],
    ['a name with no number', { pack_qty: null, pack_label: 'пляшка' }],
    ['a blank name', { pack_qty: 1000, pack_label: '   ' }],
    ['zero', { pack_qty: 0, pack_label: 'пляшка' }],
    ['a negative', { pack_qty: -5, pack_label: 'пляшка' }],
  ])('is null for %s', (_why, row) => {
    expect(packOf(row)).toBeNull();
  });

  it('is null for nothing', () => {
    expect(packOf(null)).toBeNull();
    expect(packOf(undefined)).toBeNull();
  });
});

describe('the arithmetic', () => {
  it('multiplies packs up to base units', () => {
    expect(packToBase(5, 1000)).toBe(5000);
    expect(packToBase(0, 1000)).toBe(0);
    expect(packToBase(2.5, 1000)).toBe(2500);
  });

  // 5200 ml of a 1000 ml bottle is 5.2 bottles. Rounding it to 5 would make
  // the hint disagree with the number in the box right above it.
  it('does not round base units down to whole packs', () => {
    expect(baseToPack(5000, 1000)).toBe(5);
    expect(baseToPack(5200, 1000)).toBe(5.2);
    expect(baseToPack(500, 1000)).toBe(0.5);
  });

  it('never divides by a pack that is not there', () => {
    expect(packToBase(5, 0)).toBe(0);
    expect(baseToPack(5000, 0)).toBe(0);
    expect(baseToPack(5000, Number.NaN)).toBe(0);
  });

  // What leaves the screen is always base units — that is the whole rule.
  it('converts whatever the box counts in', () => {
    expect(quantityToBase(5, 'pack', BOTTLE)).toBe(5000);
    expect(quantityToBase(5000, 'base', BOTTLE)).toBe(5000);
    expect(quantityToBase(5, 'pack', null)).toBe(5);
    // An empty box is zero, not NaN, so nothing downstream has to guard.
    expect(quantityToBase(Number.NaN, 'base', BOTTLE)).toBe(0);
  });
});

describe('packHint — the line under the box', () => {
  it('says what will land on the shelf', () => {
    expect(packHint(5, 'pack', BOTTLE, 'мл')).toBe('5 × пляшка = 5000 мл');
  });

  it('says how much of a delivery note that is', () => {
    expect(packHint(5000, 'base', BOTTLE, 'мл')).toBe('5000 мл = 5 × пляшка');
  });

  it('shows a fraction rather than a rounded lie', () => {
    expect(packHint(5200, 'base', BOTTLE, 'мл')).toBe('5200 мл = 5,2 × пляшка');
  });

  it('keeps at most three decimals', () => {
    expect(packHint(1, 'base', { qty: 3, label: 'ящик' }, 'шт')).toBe('1 шт = 0,333 × ящик');
  });

  it('is empty without a pack, so nothing is drawn', () => {
    expect(packHint(5, 'pack', null, 'мл')).toBe('');
    expect(packHint(Number.NaN, 'pack', BOTTLE, 'мл')).toBe('');
  });
});

// The trap the toggle creates: a clerk typing «5 пляшок» will type the
// BOTTLE's price next to it, and `unit_cost_cents` has only ever meant cents
// per base unit. Getting this backwards poisons every food-cost figure.
describe('the purchase price follows the box', () => {
  it('turns the price of a pack into the price of a base unit', () => {
    expect(packCostToBase(12000, 1000)).toBe(12); // 120 ₴ a bottle → 12 kop a ml
    expect(baseCostToPack(12, 1000)).toBe(12000);
  });

  it('rounds, because the cost column is whole kopecks', () => {
    expect(packCostToBase(1500, 1000)).toBe(2); // 15 ₴ a bottle → 1,5 kop → 2
    expect(packCostToBase(100, 3)).toBe(33);
  });

  it('is zero rather than Infinity when there is no pack', () => {
    expect(packCostToBase(12000, 0)).toBe(0);
    expect(baseCostToPack(12, Number.NaN)).toBe(0);
    expect(packCostToBase(Number.NaN, 1000)).toBe(0);
  });
});

describe('defaultPackMode', () => {
  // Oil always arrives in bottles; what is written off is 200 ml, not 0.2 of
  // a bottle.
  it('opens receiving in packs and counting in base units', () => {
    expect(defaultPackMode('receive', BOTTLE)).toBe('pack');
    expect(defaultPackMode('count', BOTTLE)).toBe('base');
  });

  it('stays in base units when there is no pack', () => {
    expect(defaultPackMode('receive', null)).toBe('base');
  });
});
