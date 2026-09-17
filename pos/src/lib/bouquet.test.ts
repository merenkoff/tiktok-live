// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's mirror of the server's bouquet arithmetic.
//
// These cases are deliberately the same ones `src/__tests__/pos.composites.
// test.ts` runs against Postgres. The whole point of this file existing is that
// an offline `OFF-` receipt and the sale that lands at sync agree to the
// kopeck, so a divergence has to fail here rather than in a customer's hands.

import { describe, expect, it } from 'vitest';
import { customBouquetLabel, priceOfComponents, withLabour } from './bouquet';

const CATALOG = new Map([
  [10, { price_cents: 10000 }],
  [20, { price_cents: 4000 }],
]);

describe('withLabour', () => {
  it('adds nothing when the store charges nothing', () => {
    expect(withLabour(40000, 0)).toBe(40000);
  });

  it('adds the charge on top of the parts, not as a multiplier of them', () => {
    // 400 ₴ of stems + 25% for the work. A multiplier would compound a margin
    // the retail price already carries.
    expect(withLabour(40000, 2500)).toBe(50000);
  });

  it('rounds the half-kopeck the way the server does', () => {
    // 1 ₴ at 12.5% is 12.5 kopecks; both sides use Math.round.
    expect(withLabour(100, 1250)).toBe(113);
  });

  it('ignores a nonsense charge rather than producing NaN money', () => {
    expect(withLabour(1000, Number.NaN)).toBe(1000);
    expect(withLabour(1000, -500)).toBe(1000);
  });
});

describe('priceOfComponents', () => {
  it('sums the stems at catalogue price and adds the work', () => {
    const price = priceOfComponents(
      [
        { component_variant_id: 10, quantity: 4 },
        { component_variant_id: 20, quantity: 1 },
      ],
      CATALOG,
      2500
    );
    expect(price).toBe(withLabour(4 * 10000 + 4000, 2500));
  });

  it('counts a stem the snapshot has never heard of as free, not as a failure', () => {
    // A stale mirror should misprice by one stem, not refuse the sale — the
    // server re-prices at sync and wins anyway.
    expect(priceOfComponents([{ component_variant_id: 999, quantity: 3 }], CATALOG, 0)).toBe(0);
  });
});

describe('customBouquetLabel', () => {
  it('counts every stem, not every kind of stem', () => {
    expect(
      customBouquetLabel([
        { component_variant_id: 10, quantity: 9 },
        { component_variant_id: 20, quantity: 1 },
      ])
    ).toBe('10 стебел');
  });

  it.each([
    [1, '1 стебло'],
    [2, '2 стебла'],
    [4, '4 стебла'],
    [5, '5 стебел'],
    [11, '11 стебел'],
    [12, '12 стебел'],
    [14, '14 стебел'],
    [21, '21 стебло'],
    [22, '22 стебла'],
    [25, '25 стебел'],
    [101, '101 стебло'],
    [111, '111 стебел'],
  ])('declines %i correctly', (n, expected) => {
    expect(customBouquetLabel([{ component_variant_id: 10, quantity: n }])).toBe(expected);
  });
});
