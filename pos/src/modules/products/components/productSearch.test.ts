// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { productMatchesQuery } from './productSearch';

const zaichyk = {
  name: 'Костюмчик Зайчик',
  variants: [
    { label: 'блакитний / 86', sku: 'KZ-86', barcode: '2900000000011', attributes: { color: 'блакитний', size: '86' } },
    { label: 'блакитний / 98-104', sku: 'KZ-98', barcode: '2900000000028', attributes: { color: 'блакитний', size: '98-104' } },
    { label: 'рожевий / 86', sku: 'KZ-R86', barcode: '2900000008606', attributes: { color: 'рожевий', size: '86' }, is_active: false },
  ],
};
const dress = {
  name: 'Сукня Свято',
  variants: [{ label: 'біла / 92-98', sku: 'SS-1', barcode: '4820086123456', attributes: { color: 'біла', size: '92-98' } }],
};

describe('productMatchesQuery', () => {
  it('matches everything for an empty box', () => {
    expect(productMatchesQuery(zaichyk, '')).toBe(true);
    expect(productMatchesQuery(zaichyk, '   ')).toBe(true);
  });

  it('finds by name, in any case', () => {
    expect(productMatchesQuery(zaichyk, 'зайчик')).toBe(true);
    expect(productMatchesQuery(zaichyk, 'ЗАЙЧИК')).toBe(true);
    expect(productMatchesQuery(dress, 'зайчик')).toBe(false);
  });

  it('finds a name and a size that live on different rows of one card', () => {
    expect(productMatchesQuery(zaichyk, 'зайчик 86')).toBe(true);
    expect(productMatchesQuery(zaichyk, '86 зайчик')).toBe(true);
    expect(productMatchesQuery(zaichyk, 'зайчик 122')).toBe(false);
  });

  it('reads a pair typed with a slash as the one saved with a hyphen', () => {
    expect(productMatchesQuery(zaichyk, 'блакитний 98/104')).toBe(true);
    expect(productMatchesQuery(zaichyk, '98–104')).toBe(true);
    expect(productMatchesQuery(dress, '98/104')).toBe(false);
  });

  it('does not find a product by a size that only its archived variant has', () => {
    expect(productMatchesQuery(zaichyk, 'рожевий')).toBe(false);
  });

  it('treats a short number as a size, not a fragment of a barcode', () => {
    // «86» is inside the dress's barcode 4820086123456 and in no label of it.
    expect(productMatchesQuery(dress, '86')).toBe(false);
    expect(productMatchesQuery(zaichyk, '86')).toBe(true);
  });

  it('still finds a scan, an article, and a fragment of a scan', () => {
    expect(productMatchesQuery(dress, '4820086123456')).toBe(true);
    expect(productMatchesQuery(dress, '086123')).toBe(true);
    expect(productMatchesQuery(zaichyk, 'kz-98')).toBe(true);
  });

  it('needs every word: one that matches nothing removes the card', () => {
    expect(productMatchesQuery(zaichyk, 'зайчик сукня')).toBe(false);
  });
});
