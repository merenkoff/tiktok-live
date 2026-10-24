// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The arithmetic of НБУ № 25 (TechDocs/POS_CASH_ROUNDING.md). The three
// tables below are copied verbatim into `pos/src/lib/cashRounding.test.ts`:
// the till shows the customer a sum before the server sees the sale, and the
// two must agree to the kopeck.

import { describe, expect, it } from 'vitest';
import {
  cashPartCents,
  cashRoundingDelta,
  parseCashRoundingStep,
  refundRoundingCents,
  saleRoundingCents,
  type CashRoundingPayment,
  type CashRoundingStep,
} from '../pos/cashRounding.js';

/** [sum, step, rounded by] — п. 4 (10 kopecks) and п. 4-1 (50 kopecks). */
const DELTA_CASES: Array<[number, CashRoundingStep, number]> = [
  [22123, 0, 0],
  // п. 4: «від 1 до 4 копійок … в бік зменшення», «від 5 до 9 … в бік збільшення».
  [22120, 10, 0],
  [22121, 10, -1],
  [22124, 10, -4],
  [22125, 10, 5],
  [22129, 10, 1],
  [5, 10, 5],
  [4, 10, -4],
  // п. 4-1: 1–24 → 00, 25–49 → 50, 51–74 → 50, 75–99 → next 00.
  [22100, 50, 0],
  [22101, 50, -1],
  [22124, 50, -24],
  [22125, 50, 25],
  [22149, 50, 1],
  [22150, 50, 0],
  [22151, 50, -1],
  [22174, 50, -24],
  [22175, 50, 25],
  [22199, 50, 1],
  [24, 50, -24],
  // Nothing to round.
  [0, 50, 0],
  [-100, 10, 0],
];

/** [total, payments, step, rounding] — only the cash part of a receipt is rounded. */
const SALE_CASES: Array<[number, CashRoundingPayment[], CashRoundingStep, number]> = [
  // Cash: what was handed over does not matter, the sum does.
  [22123, [{ method: 'cash', amount_cents: 50000 }], 50, -23],
  [22123, [{ method: 'cash', amount_cents: 22120 }], 10, -3],
  [22175, [{ method: 'cash', amount_cents: 22200 }], 50, 25],
  // п. 6: no cash, no rounding.
  [22123, [{ method: 'card', amount_cents: 22123 }], 50, 0],
  [22123, [{ method: 'qr', amount_cents: 22123 }], 10, 0],
  // Mixed: the card is what the terminal took, the rest is rounded.
  [22123, [{ method: 'card', amount_cents: 10000 }, { method: 'cash', amount_cents: 12100 }], 50, -23],
  [22123, [{ method: 'card', amount_cents: 10010 }, { method: 'cash', amount_cents: 12100 }], 50, -13],
  // A card row covering everything leaves no cash to round.
  [22123, [{ method: 'card', amount_cents: 30000 }, { method: 'cash', amount_cents: 100 }], 50, 0],
  // Rounding off: nothing changes.
  [22123, [{ method: 'cash', amount_cents: 50000 }], 0, 0],
];

/** [refund total, method, step, rounding] — only money handed back in cash. */
const REFUND_CASES: Array<[number, string | null, CashRoundingStep, number]> = [
  [22123, 'cash', 50, -23],
  [22175, 'cash', 50, 25],
  [22123, 'cash', 10, -3],
  [22123, 'card', 50, 0],
  [22123, 'qr', 50, 0],
  [22123, null, 50, 0],
  [22123, 'cash', 0, 0],
];

describe('cashRoundingDelta', () => {
  it.each(DELTA_CASES)('%i by step %i is rounded by %i', (sum, step, delta) => {
    expect(cashRoundingDelta(sum, step)).toBe(delta);
  });

  it('always lands on the step', () => {
    for (let sum = 1; sum <= 1000; sum++) {
      for (const step of [10, 50] as const) {
        const rounded = sum + cashRoundingDelta(sum, step);
        expect(rounded % step).toBe(0);
        expect(Math.abs(rounded - sum)).toBeLessThanOrEqual(step / 2);
      }
    }
  });
});

describe('saleRoundingCents', () => {
  it.each(SALE_CASES)('%i paid %j by step %i is rounded by %i', (total, payments, step, rounding) => {
    expect(saleRoundingCents(total, payments, step)).toBe(rounding);
  });

  it('counts the cash part as what card and QR leave', () => {
    expect(cashPartCents(22123, [{ method: 'card', amount_cents: 10000 }])).toBe(12123);
    expect(cashPartCents(22123, [{ method: 'card', amount_cents: 30000 }])).toBe(0);
  });
});

describe('refundRoundingCents', () => {
  it.each(REFUND_CASES)('%i back by %s, step %i, is rounded by %i', (total, method, step, rounding) => {
    expect(refundRoundingCents(total, method, step)).toBe(rounding);
  });
});

describe('parseCashRoundingStep', () => {
  it('reads absent as off and accepts the three steps', () => {
    expect(parseCashRoundingStep(undefined)).toBe(0);
    expect(parseCashRoundingStep(null)).toBe(0);
    expect(parseCashRoundingStep(0)).toBe(0);
    expect(parseCashRoundingStep(10)).toBe(10);
    expect(parseCashRoundingStep('50')).toBe(50);
  });

  it('refuses anything else in words', () => {
    for (const bad of [25, 5, 100, 'abc', '', -10, 10.5, true]) {
      expect(() => parseCashRoundingStep(bad)).toThrow(/крок заокруглення/);
    }
  });
});
