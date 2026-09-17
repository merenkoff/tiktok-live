// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { withLabour } from '../pos/composites.service.js';
import { customBouquetLabel } from '../pos/sales.service.js';

/**
 * The server half of a pair.
 *
 * `pos/src/lib/bouquet.ts` re-implements both of these, because the desktop
 * till has to price and name a bouquet it rings with no network, and the `OFF-`
 * receipt the customer walks out with must match the sale that lands at sync.
 * Two implementations of one rule is exactly the thing that drifts, so both are
 * pinned to **the same table** — `pos/src/lib/bouquet.test.ts` runs these very
 * cases. Change one, change both, or one of these two files goes red.
 */
describe('bouquet pricing (mirrored in pos/src/lib/bouquet.ts)', () => {
  describe('withLabour', () => {
    it('adds nothing when the store charges nothing', () => {
      expect(withLabour(40000, 0)).toBe(40000);
    });

    it('adds the charge on top of the parts, not as a multiplier of them', () => {
      expect(withLabour(40000, 2500)).toBe(50000);
    });

    it('rounds the half-kopeck the way the till does', () => {
      expect(withLabour(100, 1250)).toBe(113);
    });

    it('ignores a nonsense charge rather than producing NaN money', () => {
      expect(withLabour(1000, Number.NaN)).toBe(1000);
      expect(withLabour(1000, -500)).toBe(1000);
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
});
