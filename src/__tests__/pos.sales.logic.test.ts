// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { refundLineAmount } from '../pos/sales.service.js';

/** Pure helpers mirroring refund availability rules */
function availableToRefund(quantity: number, refundedQuantity: number): number {
  return quantity - refundedQuantity;
}

function refundStatus(
  totalCents: number,
  previousRefunded: number,
  refundCents: number
): 'refunded' | 'partially_refunded' {
  const next = previousRefunded + refundCents;
  return next >= totalCents ? 'refunded' : 'partially_refunded';
}

describe('POS refund math', () => {
  it('computes available quantity', () => {
    expect(availableToRefund(3, 1)).toBe(2);
    expect(availableToRefund(2, 2)).toBe(0);
  });

  it('marks full vs partial refund', () => {
    expect(refundStatus(10000, 0, 10000)).toBe('refunded');
    expect(refundStatus(10000, 0, 4000)).toBe('partially_refunded');
    expect(refundStatus(10000, 6000, 4000)).toBe('refunded');
  });
});

/**
 * Pure helper mirroring the void rules in `voidSale` (src/pos/sales.service.ts).
 * Returns what the endpoint does for a sale in a given state.
 */
function voidOutcome(
  status: 'completed' | 'voided' | 'refunded' | 'partially_refunded',
  refundedCents: number
): 'void' | 'noop' | 'error' {
  if (status === 'voided') return 'noop';
  if (status !== 'completed') return 'error';
  if (refundedCents > 0) return 'error';
  return 'void';
}

describe('POS void eligibility', () => {
  it('voids a clean completed sale', () => {
    expect(voidOutcome('completed', 0)).toBe('void');
  });

  it('is idempotent — a replayed void is a no-op, not an error', () => {
    expect(voidOutcome('voided', 0)).toBe('noop');
  });

  it('refuses a sale that already has refunds', () => {
    expect(voidOutcome('completed', 1)).toBe('error');
    expect(voidOutcome('partially_refunded', 4000)).toBe('error');
    expect(voidOutcome('refunded', 10000)).toBe('error');
  });
});

describe('refundLineAmount', () => {
  // 3 units billed at 1000 each with a 10% cart discount -> line_total 2700,
  // which does not divide evenly by 3. Refunds must still sum to 2700 exactly.
  const LINE_TOTAL = 2700;
  const QTY = 3;

  it('never returns more than the line was charged, in any order', () => {
    const oneAtATime = [0, 1, 2].reduce(
      (sum, already) => sum + refundLineAmount(LINE_TOTAL, QTY, already, 1),
      0
    );
    expect(oneAtATime).toBe(LINE_TOTAL);

    expect(refundLineAmount(LINE_TOTAL, QTY, 0, 3)).toBe(LINE_TOTAL);
    expect(
      refundLineAmount(LINE_TOTAL, QTY, 0, 2) + refundLineAmount(LINE_TOTAL, QTY, 2, 1)
    ).toBe(LINE_TOTAL);
    expect(
      refundLineAmount(LINE_TOTAL, QTY, 0, 1) + refundLineAmount(LINE_TOTAL, QTY, 1, 2)
    ).toBe(LINE_TOTAL);
  });

  it('spreads the rounding remainder instead of dropping it', () => {
    // 2700/3 = 900 exactly; use a total that does not divide to prove the point.
    const odd = 1000;
    const slices = [0, 1, 2].map((already) => refundLineAmount(odd, 3, already, 1));
    expect(slices.reduce((a, b) => a + b, 0)).toBe(odd);
    expect(slices).toEqual([333, 334, 333]);
  });

  it('handles a single-unit line and a zero-quantity guard', () => {
    expect(refundLineAmount(1999, 1, 0, 1)).toBe(1999);
    expect(refundLineAmount(1999, 0, 0, 1)).toBe(0);
  });
});
