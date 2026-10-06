// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Product } from '@pos/platform';
import { pluralVariants, priceRange, productSummary, rowVariants, stockSummary } from './productSummary';

const v = (price_cents: number, quantity: number, extra: Record<string, unknown> = {}) =>
  ({ id: 1, product_id: 1, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents, cost_cents: 0, is_active: true, quantity, ...extra }) as Product['variants'][number];

const product = (variants: Product['variants'], extra: Partial<Product> = {}): Product =>
  ({ id: 1, name: 'Костюмчик', description: null, image_url: null, is_active: true, tag_ids: [], kind: 'simple', stock_mode: 'own', variants, ...extra }) as Product;

describe('pluralVariants', () => {
  it('declines the word, 11–14 included', () => {
    expect(pluralVariants(1)).toBe('1 варіант');
    expect(pluralVariants(2)).toBe('2 варіанти');
    expect(pluralVariants(4)).toBe('4 варіанти');
    expect(pluralVariants(5)).toBe('5 варіантів');
    expect(pluralVariants(11)).toBe('11 варіантів');
    expect(pluralVariants(14)).toBe('14 варіантів');
    expect(pluralVariants(21)).toBe('21 варіант');
    expect(pluralVariants(22)).toBe('22 варіанти');
  });
});

describe('priceRange', () => {
  it('names one price, or the span, in the compact form', () => {
    expect(priceRange([v(42000, 1)])).toBe('420 ₴');
    expect(priceRange([v(42000, 1), v(42000, 1)])).toBe('420 ₴');
    expect(priceRange([v(42000, 1), v(35000, 1)])).toBe('350–420 ₴');
    // The thousands separator is whatever `formatUah` uses — a thin space, not a typed one.
    expect(priceRange([v(159000, 1), v(169050, 1)])).toMatch(/^1\s590–1\s690,50 ₴$/);
    expect(priceRange([])).toBeNull();
  });
});

describe('stockSummary', () => {
  it('sums a product that holds its own stock, with the unit when there is one', () => {
    expect(stockSummary({ kind: 'simple', stock_mode: 'own' }, [v(1, 3), v(1, 6), v(1, 7)])).toBe('16 шт');
    expect(stockSummary({ kind: 'simple', stock_mode: 'own' }, [v(1, 3), v(1, 250, { unit: 'г' })])).toBe('253');
    expect(stockSummary({ kind: 'composite', stock_mode: 'own' }, [v(1, 2)])).toBe('2 шт');
  });

  it('never sums a derived composite — its variants share the same stems', () => {
    expect(stockSummary({ kind: 'composite', stock_mode: 'derived' }, [v(1, 16)])).toBe('Можна зібрати: 16');
    expect(stockSummary({ kind: 'composite', stock_mode: 'derived' }, [v(1, 16), v(1, 9)])).toBe('Можна зібрати: до 16');
  });
});

describe('productSummary', () => {
  it('joins the three figures, counts only active variants, and says so for none', () => {
    expect(productSummary(product([v(40000, 1), v(45000, 2), v(40000, 0, { is_active: false })]))).toBe(
      '2 варіанти · 400–450 ₴ · 3 шт'
    );
    expect(productSummary(product([]))).toBe('Без варіантів');
    expect(productSummary(product([v(65000, 16)], { kind: 'composite', stock_mode: 'derived' }))).toBe(
      '1 варіант · 650 ₴ · Можна зібрати: 16'
    );
  });
});

describe('a card in the archive', () => {
  it('speaks for every variant it had — archiving took them all down with it', () => {
    const archived = product([v(39000, 1, { is_active: false }), v(39000, 0, { is_active: false })], { is_active: false });
    expect(productSummary(archived)).toBe('2 варіанти · 390 ₴ · 1 шт');
    expect(rowVariants(archived)).toHaveLength(2);
  });

  it('a live card still counts only its live variants', () => {
    expect(rowVariants(product([v(1, 1), v(1, 1, { is_active: false })]))).toHaveLength(1);
  });
});
