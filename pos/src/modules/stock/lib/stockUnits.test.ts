// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a stock screen counts in (`stockUnits.ts`): a weighed row is shown and
// typed in kilograms, and grams — with a cost per gram — are what leave the
// screen, exactly as before. A row that is neither weighed nor packed must
// come out untouched: that is every clothing shop.

import { describe, expect, it } from 'vitest';
import {
  costPer,
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
  typedCostToMilli,
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
  it('keeps a price per kilogram to the kopeck', () => {
    // 14,50 ₴/кг is 1450 thousandths of a kopeck a gram — and reads back as typed.
    expect(typedCostToMilli(cheese, 'base', 1450)).toBe(1450);
    expect(shownCost(cheese, 'base', 1450)).toBe(1450);
    expect(shownCost(cheese, 'base', 12_000)).toBe(12_000);
    expect(costUnit(cheese, 'base')).toBe('кг');
    expect(costUnit(cheeseHead, 'pack')).toBe('голова');
    expect(costUnit(milkForCoffee, 'pack')).toBe('пляшка');
    expect(costUnit(tee, 'base')).toBe('шт');
  });

  it('prices a pack and gives its price back as it was typed', () => {
    // 15 ₴ for a 1000 ml bottle: 1,5 kopecks a millilitre, exactly.
    expect(costPer(milkForCoffee, 'pack')).toBe(1000);
    expect(typedCostToMilli(milkForCoffee, 'pack', 1500)).toBe(1500);
    expect(shownCost(milkForCoffee, 'pack', 1500)).toBe(1500);
    // A 5 kg head for 1 299,90 ₴.
    const milli = typedCostToMilli(cheeseHead, 'pack', 129_990);
    expect(shownCost(cheeseHead, 'pack', milli)).toBe(129_990);
    expect(shownCost(cheeseHead, 'base', milli)).toBe(25_998);
  });

  it('prices a café ingredient counted in grams by the kilogram, and a piece by the piece', () => {
    // Not sold by weight (`price_per` 1), still bought by the litre.
    expect(costPer(milkForCoffee, 'base')).toBe(1000);
    expect(costUnit(milkForCoffee, 'base')).toBe('л');
    expect(typedCostToMilli(milkForCoffee, 'base', 4250)).toBe(4250);
    expect(costPer(tee, 'base')).toBe(1);
    expect(typedCostToMilli(tee, 'base', 4990)).toBe(4_990_000);
    expect(shownCost(tee, 'base', 4_990_000)).toBe(4990);
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
