// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';

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
