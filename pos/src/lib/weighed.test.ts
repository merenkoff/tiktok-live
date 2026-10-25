// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's half of «what a weighed line is» (TechDocs/grocery/G4_WEIGHED.md).
// The quantity sentences are the server's (`src/pos/weighed.ts`), compared
// against the real thing; the pad is the till's alone.

import { describe, expect, it } from 'vitest';
import {
  displayUnit as serverDisplayUnit,
  formatQuantity as serverFormatQuantity,
  MAX_WEIGHED_QUANTITY as SERVER_MAX,
  WEIGHED_PRICE_PER as SERVER_PRICE_PER,
} from '../../../src/pos/weighed';
import {
  displayUnit,
  formatQuantity,
  isWeighed,
  MAX_WEIGHED_QUANTITY,
  parseWeightInput,
  unitPriceLabel,
  WEIGHED_PRICE_PER,
  weighedLineCaption,
  weightPadInput,
  weightProblem,
  weightToPadText,
  type WeightPadKey,
} from './weighed';

const QUANTITY_CASES: Array<[number, string, number, string]> = [
  [350, 'г', 1000, '0,350 кг'],
  [1457, 'г', 1000, '1,457 кг'],
  [2000, 'г', 1000, '2,000 кг'],
  [1500, 'мл', 1000, '1,500 л'],
  [3, 'шт', 1, '3 шт'],
  [250, 'г', 1, '250 г'],
];

describe('a weighed quantity reads as the server writes it', () => {
  it.each(QUANTITY_CASES)('%i %s at price_per %i is «%s»', (quantity, unit, per, text) => {
    expect(formatQuantity(quantity, unit, per)).toBe(text);
    expect(serverFormatQuantity(quantity, unit, per)).toBe(text);
  });

  it('shows the unit the price is for, like the server', () => {
    for (const [unit, per] of [['г', 1000], ['мл', 1000], ['г', 1], ['шт', 1]] as const) {
      expect(displayUnit(unit, per)).toBe(serverDisplayUnit(unit, per));
    }
    expect(displayUnit('г', 1000)).toBe('кг');
  });

  it('keeps the same basis and ceiling as the server', () => {
    expect(WEIGHED_PRICE_PER).toBe(SERVER_PRICE_PER);
    expect(MAX_WEIGHED_QUANTITY).toBe(SERVER_MAX);
  });

  it('is weighed only above one', () => {
    expect(isWeighed(1000)).toBe(true);
    expect(isWeighed(1)).toBe(false);
    expect(isWeighed(undefined)).toBe(false);
  });
});

describe('prices and captions', () => {
  it('names a price per kilogram as such', () => {
    expect(unitPriceLabel(18990, 'г', 1000)).toBe('189,90 ₴/кг');
    expect(unitPriceLabel(4590, 'шт', 1)).toBe('45,90 ₴');
    expect(unitPriceLabel(5990, 'мл', 1000)).toBe('59,90 ₴/л');
  });

  it('writes a weighed line as weight × price per kilogram', () => {
    expect(weighedLineCaption(350, 'г', 1000, 18990)).toBe('0,350 кг × 189,90 ₴/кг');
  });
});

describe('the weight pad', () => {
  function type(keys: string, fresh = false, start = ''): string {
    let text = start;
    let isFresh = fresh;
    for (const key of keys.split('')) {
      text = weightPadInput(text, (key === '<' ? 'del' : key) as WeightPadKey, isFresh);
      isFresh = false;
    }
    return text;
  }

  it('types kilograms with three decimals', () => {
    expect(type(',35')).toBe('0,35');
    expect(type('0,350')).toBe('0,350');
    expect(type('1,4579')).toBe('1,457');
    expect(type('12,5')).toBe('12,5');
  });

  it('stops at three digits before the comma — 999,999 is the ceiling', () => {
    expect(type('1234')).toBe('123');
    expect(type('999,9999')).toBe('999,999');
  });

  it('replaces a leading zero and a comma typed twice does nothing', () => {
    expect(type('05')).toBe('5');
    expect(type('1,,5')).toBe('1,5');
  });

  it('deletes, and a fresh weight is replaced by the first key', () => {
    expect(type('1,25<')).toBe('1,2');
    expect(type('3', true, '0,350')).toBe('3');
    expect(type('<', true, '0,350')).toBe('');
  });

  it('reads what was typed as base units', () => {
    expect(parseWeightInput('0,350')).toBe(350);
    expect(parseWeightInput('0,35')).toBe(350);
    expect(parseWeightInput('1,5')).toBe(1500);
    expect(parseWeightInput('2')).toBe(2000);
    expect(parseWeightInput('2,')).toBe(2000);
    expect(parseWeightInput('0.25')).toBe(250);
    expect(parseWeightInput(',5')).toBe(500);
    expect(parseWeightInput('999,999')).toBe(999_999);
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput('1,2345')).toBeNull();
    expect(parseWeightInput('abc')).toBeNull();
  });

  it('shows a weight back in the pad’s own form', () => {
    expect(weightToPadText(350)).toBe('0,350');
    expect(weightToPadText(2000)).toBe('2,000');
    expect(parseWeightInput(weightToPadText(1457))).toBe(1457);
  });

  it('says why a weight cannot be rung before the server has to', () => {
    expect(weightProblem(null, 18990)).toBe('Введіть вагу');
    expect(weightProblem(0, 18990)).toBe('Введіть вагу');
    expect(weightProblem(1_000_000, 18990)).toMatch(/999,999/);
    // One gram at 4,99 ₴/kg is half a kopeck short of one: the server refuses it.
    expect(weightProblem(1, 499)).toMatch(/0,00/);
    expect(weightProblem(350, 18990)).toBeNull();
  });
});
