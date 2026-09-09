// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { buildPriceTags, defaultCopies, expandCopies, variantLabel } from './priceTag';
import type { PriceTagSource } from './priceTag';

function source(over: Partial<PriceTagSource['variant']> = {}, name = 'Піжама'): PriceTagSource {
  return {
    product: { name },
    variant: {
      id: 1,
      size: '98/104',
      color: 'Рожевий',
      price_cents: 45000,
      sku: '068-130',
      barcode: '2900000000018',
      quantity: 3,
      ...over,
    },
  };
}

describe('variantLabel', () => {
  it('joins colour and size, and survives either being blank', () => {
    expect(variantLabel({ size: 'M', color: 'Синій' })).toBe('Синій · M');
    expect(variantLabel({ size: 'M', color: '' })).toBe('M');
    expect(variantLabel({ size: '', color: '' })).toBe('');
  });
});

describe('defaultCopies', () => {
  it('prints one tag per unit on hand', () => {
    expect(defaultCopies(5)).toBe(5);
  });

  it('still prints one at zero stock — tagging usually happens before receiving', () => {
    expect(defaultCopies(0)).toBe(1);
    expect(defaultCopies(-2)).toBe(1);
  });
});

describe('buildPriceTags', () => {
  it('carries everything the tag shows', () => {
    expect(buildPriceTags('Demo Boutique', [source()])).toEqual([
      {
        storeName: 'Demo Boutique',
        productName: 'Піжама',
        variantLabel: 'Рожевий · 98/104',
        priceCents: 45000,
        sku: '068-130',
        barcode: '2900000000018',
        copies: 3,
      },
    ]);
  });

  it('drops a barcode it cannot draw rather than printing a mangled one', () => {
    // These are exactly what the shop's data holds: article numbers that spent
    // months in the barcode column.
    for (const barcode of ['068-130', '14783', '', '482027036287', null]) {
      expect(buildPriceTags('S', [source({ barcode })])[0]!.barcode).toBeNull();
    }
  });

  it('takes an explicit copy count over the stock default, including zero', () => {
    expect(buildPriceTags('S', [{ ...source(), copies: 7 }])[0]!.copies).toBe(7);
    // Zero is a real answer: "skip this row" without deselecting the product.
    expect(buildPriceTags('S', [{ ...source(), copies: 0 }])[0]!.copies).toBe(0);
  });

  it('normalises empty strings to null so the renderer has one thing to test', () => {
    const tag = buildPriceTags('S', [source({ sku: '  ' })])[0]!;
    expect(tag.sku).toBeNull();
  });
});

describe('expandCopies', () => {
  it('yields one entry per physical tag', () => {
    const tags = buildPriceTags('S', [
      { ...source(), copies: 2 },
      { ...source({ sku: 'X' }), copies: 1 },
    ]);
    expect(expandCopies(tags)).toHaveLength(3);
  });

  it('omits rows set to zero', () => {
    expect(expandCopies(buildPriceTags('S', [{ ...source(), copies: 0 }]))).toEqual([]);
  });
});
