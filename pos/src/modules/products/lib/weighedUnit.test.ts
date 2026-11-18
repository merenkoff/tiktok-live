// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  isWeighedUnit,
  openingStockOf,
  priceCaption,
  stockText,
  unitLabels,
} from './weighedUnit';

const grocery = { weighedUnits: ['г', 'мл'] };
const cafe = { weighedUnits: [] as string[] };

describe('the product card for goods sold by weight', () => {
  it('weighs only the units the vertical sells by weight', () => {
    expect(isWeighedUnit(grocery, 'г')).toBe(true);
    expect(isWeighedUnit(grocery, 'шт')).toBe(false);
    // A café's grams are ingredients priced per gram, as they always were.
    expect(isWeighedUnit(cafe, 'г')).toBe(false);
    // An auth cached before 075 says nothing — nothing is weighed.
    expect(isWeighedUnit({}, 'г')).toBe(false);
  });

  it('captions the unit and the price by what the price is for', () => {
    expect(unitLabels(grocery)).toEqual({ г: 'кг — на вагу', мл: 'л — на вагу' });
    expect(unitLabels(cafe)).toEqual({});
    expect(priceCaption(true, 'г')).toBe('Ціна за 1 кг, грн');
    expect(priceCaption(true, 'мл')).toBe('Ціна за 1 л, грн');
    expect(priceCaption(false, 'шт')).toBe('Ціна, грн');
  });

  it('shows the shelf in kilograms and reads an opening stock typed in them', () => {
    expect(stockText(2350, 'г', true)).toBe('2,350 кг');
    expect(stockText(-900, 'г', true)).toBe('0,000 кг');
    expect(stockText(12, 'шт', false)).toBe('12 шт');
    expect(openingStockOf('12,5', true)).toBe(12_500);
    expect(openingStockOf('abc', true)).toBe(0);
    expect(openingStockOf('3', false)).toBe(3);
  });
});
