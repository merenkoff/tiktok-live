// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The receipt search a till can do without the server (clothing R3): what
// the mirror carries, on the device's calendar.

import { describe, expect, it } from 'vitest';
import { deviceDay, normalizeSaleParams, saleMatches } from './saleSearch';

const row = (over: Partial<Parameters<typeof saleMatches>[0]> = {}) => ({
  receipt_number: 'R-00042',
  customer_name: 'Олена Коваль',
  created_at: new Date().toISOString(),
  detail: {
    items: [
      { product_name: 'Пальто вовняне', variant_label: 'Сірий / M' },
      { product_name: 'Кепка', variant_label: 'Чорний / L' },
    ],
  },
  ...over,
});

describe('normalizeSaleParams', () => {
  it('reads a bare number as the page size, the shape every caller had before the search', () => {
    expect(normalizeSaleParams(30)).toEqual({ limit: 30, offset: 0, q: '', from: undefined, to: undefined });
    expect(normalizeSaleParams(undefined).limit).toBe(50);
  });

  it('trims the phrase and clamps the page', () => {
    expect(normalizeSaleParams({ q: '  кепка ', limit: 999, offset: -3, from: '', to: '2026-10-04' })).toEqual({
      limit: 200,
      offset: 0,
      q: 'кепка',
      from: undefined,
      to: '2026-10-04',
    });
  });
});

describe('saleMatches', () => {
  it('matches everything when nothing is asked', () => {
    expect(saleMatches(row(), { q: '' })).toBe(true);
  });

  it('reads digits as the tail of the receipt number — «2» is not R-00042', () => {
    expect(saleMatches(row(), { q: '42' })).toBe(true);
    expect(saleMatches(row(), { q: '0042' })).toBe(true);
    expect(saleMatches(row(), { q: '2' })).toBe(false);
    expect(saleMatches(row(), { q: '4' })).toBe(false);
  });

  it('looks for text in the number, the customer and the lines the device has', () => {
    expect(saleMatches(row(), { q: 'r-000' })).toBe(true);
    expect(saleMatches(row(), { q: 'коваль' })).toBe(true);
    expect(saleMatches(row(), { q: 'пальто' })).toBe(true);
    expect(saleMatches(row(), { q: 'чорний' })).toBe(true);
    expect(saleMatches(row(), { q: 'шарф' })).toBe(false);
    // A receipt merged from the server list has no lines until opened online.
    expect(saleMatches(row({ detail: undefined }), { q: 'пальто' })).toBe(false);
    expect(saleMatches(row({ customer_name: null }), { q: 'коваль' })).toBe(false);
  });

  it('cuts by the device\'s calendar day, inclusive on both ends', () => {
    const today = deviceDay(new Date());
    const yesterday = deviceDay(new Date(Date.now() - 86_400_000));
    const old = row({ created_at: new Date(Date.now() - 86_400_000).toISOString() });
    expect(saleMatches(row(), { q: '', from: today })).toBe(true);
    expect(saleMatches(old, { q: '', from: today })).toBe(false);
    expect(saleMatches(old, { q: '', to: yesterday })).toBe(true);
    expect(saleMatches(row(), { q: '', to: yesterday })).toBe(false);
    expect(saleMatches(old, { q: 'кепка', from: yesterday, to: today })).toBe(true);
  });
});
