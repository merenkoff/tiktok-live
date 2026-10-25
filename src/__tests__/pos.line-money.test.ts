// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sum of one line (migration 075, TechDocs/grocery/G4_WEIGHED.md). The
// table below is copied verbatim into the till's `pos/src/lib/lineMoney.test.ts`
// (phase Г4 PR2): the cart shows the customer a sum before the server sees the
// sale, and the two must agree to the kopeck. If the Checkbox sandbox run
// (decision Д8) finds another rounding, this table and both copies of the
// function change together — nothing else does.

import { describe, expect, it } from 'vitest';
import { lineAmountCents } from '../pos/lineMoney.js';
import {
  assertWeighedLine,
  displayUnit,
  formatQuantity,
  requireWeightSource,
  WeighedLineError,
} from '../pos/weighed.js';

/** [quantity, unit price, price_per, sum] — kopecks throughout. */
const LINE_AMOUNT_CASES: Array<[number, number, number, number]> = [
  // Pieces (and anything priced per base unit): exact, as every line before 075.
  [1, 4590, 1, 4590],
  [3, 4590, 1, 13770],
  [250, 1, 1, 250],
  [0, 4590, 1, 0],
  // Grams at a price per kilogram, half a kopeck up — the phase's example:
  // 0,350 кг × 189,90 = 66,465 → 66,47.
  [350, 18990, 1000, 6647],
  // An odd floor: 47,475 → 47,48, which «to even» would also give.
  [250, 18990, 1000, 4748],
  // Ties on an even floor tell «half up» from «to even»: 0,5 → 1, 2,5 → 3.
  [500, 1, 1000, 1],
  [1500, 1, 1000, 2],
  [2500, 1, 1000, 3],
  // Below a half goes down, above it up.
  [499, 1, 1000, 0],
  [501, 1, 1000, 1],
  // The ДПС examples: «1 кг 457 г» and 5,701 × 52,30 = 298,1623.
  [1457, 5230, 1000, 7620],
  [5701, 5230, 1000, 29816],
  // A whole kilogram is the price itself.
  [1000, 18990, 1000, 18990],
  // One gram of a dear thing, one gram of a cheap one.
  [1, 18990, 1000, 19],
  [1, 499, 1000, 0],
  // The heaviest line the server takes, at a price an INTEGER still holds.
  [999_999, 2000, 1000, 1_999_998],
];

describe('lineAmountCents', () => {
  it.each(LINE_AMOUNT_CASES)('%i at %i per %i comes to %i', (quantity, price, per, sum) => {
    expect(lineAmountCents(quantity, price, per)).toBe(sum);
  });

  it('defaults to a price per one base unit', () => {
    expect(lineAmountCents(3, 4590)).toBe(13770);
  });

  it('refuses a basis that is not a positive whole number', () => {
    expect(() => lineAmountCents(350, 18990, 0)).toThrow();
    expect(() => lineAmountCents(350, 18990, 2.5)).toThrow();
  });
});

describe('weighed quantities read as kilograms', () => {
  it.each([
    [350, 'г', 1000, '0,350 кг'],
    [1457, 'г', 1000, '1,457 кг'],
    [2000, 'г', 1000, '2,000 кг'],
    [1500, 'мл', 1000, '1,500 л'],
    [3, 'шт', 1, '3 шт'],
    [250, 'г', 1, '250 г'],
  ])('%i %s at price_per %i is «%s»', (quantity, unit, per, text) => {
    expect(formatQuantity(quantity, unit, per)).toBe(text);
  });

  it('shows the unit the price is for', () => {
    expect(displayUnit('г', 1000)).toBe('кг');
    expect(displayUnit('мл', 1000)).toBe('л');
    expect(displayUnit('г', 1)).toBe('г');
    expect(displayUnit('шт')).toBe('шт');
  });
});

describe('a weighed line', () => {
  it('needs the till to say how it was weighed — an old till is told to update', () => {
    expect(() => requireWeightSource(undefined)).toThrow(/оновіть застосунок/);
    expect(() => requireWeightSource('')).toThrow(WeighedLineError);
    expect(requireWeightSource('manual')).toBe('manual');
  });

  it('believes only a hand-typed weight until a scale can produce another', () => {
    // 'label' arrives with Г6 and 'scale' with Г9 (075 reserves both).
    expect(() => requireWeightSource('scale')).toThrow(/поки не підтримується/);
    expect(() => requireWeightSource('label')).toThrow(WeighedLineError);
  });

  it('refuses a weight past 999,999 and a sum of nothing', () => {
    expect(() => assertWeighedLine({ productName: 'Сир', quantity: 1_000_000, amountCents: 100 })).toThrow(
      /999,999/
    );
    expect(() => assertWeighedLine({ productName: 'Сир', quantity: 1, amountCents: 0 })).toThrow(/0,00/);
    expect(() => assertWeighedLine({ productName: 'Сир', quantity: 350, amountCents: 6647 })).not.toThrow();
  });
});
