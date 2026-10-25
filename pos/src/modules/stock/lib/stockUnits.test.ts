// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a stock screen counts in (`stockUnits.ts`): a weighed row is shown and
// typed in kilograms, and grams — with a cost per gram — are what leave the
// screen, exactly as before. A row that is neither weighed nor packed must
// come out untouched: that is every clothing shop.

import { describe, expect, it } from 'vitest';
import {
  costStepNote,
  costUnit,
  countPack,
  formatDecimal,
  parseDecimal,
  countScale,
  countUnit,
  isWeighedRow,
  shownCost,
  shownQty,
  signedStockCell,
  stockCell,
  stockText,
  typedCostToBase,
  typedToBase,
} from './stockUnits';

const cheese = { unit: 'г', price_per: 1000 };
const kvass = { unit: 'мл', price_per: 1000 };
const tee = { unit: 'шт', price_per: 1 };
const milkForCoffee = { unit: 'мл', price_per: 1, pack_qty: 1000, pack_label: 'пляшка' };
const cheeseHead = { unit: 'г', price_per: 1000, pack_qty: 5000, pack_label: 'голова' };

describe('what the box counts in', () => {
  it('counts a weighed row in kilograms or litres, anything else in its own unit', () => {
    expect([countScale(cheese), countUnit(cheese)]).toEqual([1000, 'кг']);
    expect([countScale(kvass), countUnit(kvass)]).toEqual([1000, 'л']);
    expect([countScale(tee), countUnit(tee)]).toEqual([1, 'шт']);
    // A café's grams are ingredients priced per gram: not weighed, stay grams.
    expect(countUnit({ unit: 'г', price_per: 1 })).toBe('г');
    // A row from a server older than migration 075 carries no price_per.
    expect(isWeighedRow({})).toBe(false);
  });

  it('gives a weighed row its pack in kilograms, so the toggle reads «голова | кг»', () => {
    expect(countPack(cheeseHead)).toEqual({ qty: 5, label: 'голова' });
    expect(countPack(milkForCoffee)).toEqual({ qty: 1000, label: 'пляшка' });
    expect(countPack(cheese)).toBeNull();
  });
});

describe('quantities', () => {
  it('shows grams as kilograms and takes kilograms back as grams', () => {
    expect(shownQty(cheese, 'base', 2500)).toBe(2.5);
    expect(typedToBase(cheese, 'base', 2.5)).toBe(2500);
    expect(shownQty(cheese, 'base', 350)).toBe(0.35);
    expect(typedToBase(cheese, 'base', 0.35)).toBe(350);
  });

  it('lands on whole grams despite binary fractions, and keeps a real fraction for the check to name', () => {
    expect(typedToBase(cheese, 'base', 1.005)).toBe(1005);
    expect(typedToBase(cheese, 'base', 0.1 + 0.2)).toBe(300);
    expect(Number.isInteger(typedToBase(cheese, 'base', 1.2345))).toBe(false);
  });

  it('counts packs of a weighed row in heads and of anything else in bottles', () => {
    expect(shownQty(cheeseHead, 'pack', 10000)).toBe(2);
    expect(typedToBase(cheeseHead, 'pack', 1.5)).toBe(7500);
    expect(shownQty(cheeseHead, 'base', 7500)).toBe(7.5);
    expect(typedToBase(milkForCoffee, 'pack', 5)).toBe(5000);
    expect(shownQty(milkForCoffee, 'base', 5000)).toBe(5000);
  });

  it('leaves a plain row exactly as typed', () => {
    expect(shownQty(tee, 'base', 12)).toBe(12);
    expect(typedToBase(tee, 'base', 12)).toBe(12);
    expect(typedToBase(tee, 'base', 2.5)).toBe(2.5);
    expect(typedToBase(tee, 'base', Number.NaN)).toBe(0);
  });
});

describe('purchase prices', () => {
  it('shows a per-gram cost per kilogram and keeps a typed one unrounded', () => {
    expect(shownCost(cheese, 'base', 12)).toBe(12000);
    expect(typedCostToBase(cheese, 'base', 1450)).toBeCloseTo(1.45, 10);
    expect(costUnit(cheese, 'base')).toBe('кг');
    expect(costUnit(cheeseHead, 'pack')).toBe('голова');
    expect(costUnit(milkForCoffee, 'pack')).toBe('пляшка');
    expect(costUnit(tee, 'base')).toBe('шт');
  });

  it('says what will be stored when a price per kilogram is off the 10 ₴ step', () => {
    expect(costStepNote(cheese, 'base', typedCostToBase(cheese, 'base', 1450))).toBe(
      'Закупка зберігається цілими копійками за 1 г: запишеться 10,00 ₴ за кг'
    );
    // 120,00 ₴ a kilogram is exactly 12 kopecks a gram: nothing to say.
    expect(costStepNote(cheese, 'base', typedCostToBase(cheese, 'base', 12000))).toBeNull();
    expect(costStepNote(milkForCoffee, 'pack', typedCostToBase(milkForCoffee, 'pack', 1500))).toBe(
      'Закупка зберігається цілими копійками за 1 мл: запишеться 20,00 ₴ за пляшка'
    );
  });

  it('has nothing to say about a price per piece or an empty one', () => {
    expect(costStepNote(tee, 'base', 4990)).toBeNull();
    expect(costStepNote(cheese, 'base', undefined)).toBeNull();
  });
});

describe('the decimal box', () => {
  it('reads a comma and a dot alike, and a half-typed number as what it is so far', () => {
    expect(parseDecimal('20,5')).toBe(20.5);
    expect(parseDecimal('20.5')).toBe(20.5);
    expect(parseDecimal('20,')).toBe(20);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal(' 1 200,5 ')).toBe(1200.5);
  });

  it('is not a number yet when empty, negative or not a number at all', () => {
    for (const text of ['', ',', '-1', 'abc', '1,2,3', '1.2.3', '1e3']) expect(parseDecimal(text)).toBeNull();
  });

  it('writes a number the Ukrainian way, to the gram', () => {
    expect(formatDecimal(20.5)).toBe('20,5');
    expect(formatDecimal(12)).toBe('12');
    expect(formatDecimal(1.23456)).toBe('1,235');
    expect(formatDecimal(Number.NaN)).toBe('');
  });
});

describe('stock figures', () => {
  it('reads a weighed figure as kilograms with its unit, a plain one as before', () => {
    expect(stockText(12500, cheese)).toBe('12,500 кг');
    expect(stockText(1500, kvass)).toBe('1,500 л');
    expect(stockText(12, tee)).toBe('12 шт');
    expect(stockCell(12500, cheese)).toBe('12,500 кг');
    expect(stockCell(12, tee)).toBe('12');
  });

  it('keeps the sign of a weighed change under a kilogram', () => {
    expect(stockText(-500, cheese)).toBe('-0,500 кг');
    expect(signedStockCell(-500, cheese)).toBe('-0,500 кг');
    expect(signedStockCell(2500, cheese)).toBe('+2,500 кг');
    expect(signedStockCell(-3, tee)).toBe('-3');
    expect(signedStockCell(3, tee)).toBe('+3');
  });
});
