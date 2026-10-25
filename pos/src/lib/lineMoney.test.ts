// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's copy of the line sum (migration 075, TechDocs/grocery/G4_WEIGHED.md).
// The table is the server's (`src/__tests__/pos.line-money.test.ts`), copied
// verbatim: the sum the cart shows is the sum the server files, to the kopeck.
// The last test reads the server's function too, so the two copies cannot
// drift even if somebody edits only one of the tables.

import { describe, expect, it } from 'vitest';
import { lineAmountCents as serverLineAmountCents } from '../../../src/pos/lineMoney';
import { lineAmountCents } from './lineMoney';

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

describe('lineAmountCents on the till', () => {
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

  it('agrees with the server on every case and on a sweep of grams', () => {
    for (const [quantity, price, per] of LINE_AMOUNT_CASES) {
      expect(lineAmountCents(quantity, price, per)).toBe(serverLineAmountCents(quantity, price, per));
    }
    for (let grams = 1; grams <= 2000; grams += 7) {
      for (const price of [1, 499, 1450, 5230, 18990, 99_999]) {
        expect(lineAmountCents(grams, price, 1000)).toBe(serverLineAmountCents(grams, price, 1000));
      }
    }
  });
});
