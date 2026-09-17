// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Product, ProductVariant } from '../../../types';
import { componentOptions } from './componentOptions';

function variant(id: number, label: string, over: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id,
    product_id: 1,
    attributes: {},
    label,
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 1000,
    cost_cents: 0,
    is_active: true,
    quantity: 5,
    ...over,
  };
}

function product(id: number, name: string, over: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    tag_ids: [],
    variants: [variant(id * 10, 'Червона')],
    ...over,
  };
}

describe('componentOptions', () => {
  it('offers every active variant of a non-composite product', () => {
    const options = componentOptions([
      product(1, 'Троянда', { variants: [variant(10, 'Червона'), variant(11, 'Біла')] }),
    ]);
    expect(options.map((o) => o.variant_id)).toEqual([11, 10]);
    expect(options[1].caption).toBe('Троянда · Червона');
  });

  it('never offers a composite — that is what makes cycles impossible', () => {
    const options = componentOptions([
      product(1, 'Троянда'),
      product(2, 'Букет', { kind: 'composite', stock_mode: 'derived' }),
    ]);
    expect(options.map((o) => o.caption)).toEqual(['Троянда · Червона']);
  });

  it('skips archived products and archived variants', () => {
    const options = componentOptions([
      product(1, 'Списана', { is_active: false }),
      product(2, 'Тюльпан', {
        variants: [variant(20, 'Рожевий'), variant(21, 'Жовтий', { is_active: false })],
      }),
    ]);
    expect(options.map((o) => o.variant_id)).toEqual([20]);
  });

  it('excludes the product being edited, so it cannot contain itself', () => {
    const options = componentOptions([product(1, 'Троянда'), product(2, 'Евкаліпт')], 1);
    expect(options.map((o) => o.caption)).toEqual(['Евкаліпт · Червона']);
  });

  it('falls back to the product name when a variant has no caption', () => {
    const options = componentOptions([
      product(1, 'Крафт-пакування', { variants: [variant(10, '')] }),
    ]);
    expect(options[0].caption).toBe('Крафт-пакування');
  });
});
