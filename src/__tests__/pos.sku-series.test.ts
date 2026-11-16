// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { skuSeries, type SkuSeriesRow } from '../pos/sku-series.js';

function rows(...skus: (string | [string, string])[]): SkuSeriesRow[] {
  return skus.map((entry) =>
    Array.isArray(entry)
      ? { sku: entry[0], productName: entry[1] }
      : { sku: entry, productName: 'Товар' }
  );
}

describe('skuSeries', () => {
  it('reads the shop\'s two series back out of the articles', () => {
    const series = skuSeries(rows('0001', '0002', '0017', 'т001', 'т014'));
    expect(series.map((s) => [s.prefix, s.last, s.next])).toEqual([
      ['', '0017', '0018'],
      ['т', 'т014', 'т015'],
    ]);
  });

  it('keeps a Cyrillic «т» and a Latin «t» apart', () => {
    // They are the same glyph on screen and different rows in
    // `idx_pos_variants_store_sku`. Folding them together would suggest a
    // number that is already taken, and would hide from the owner that the
    // two ever got mixed.
    const series = skuSeries(rows('т001', 'т014', 't020'));
    expect(series).toHaveLength(2);
    expect(series.map((s) => s.next).sort()).toEqual(['t021', 'т015']);
  });

  it('keeps the padding of the number it continues', () => {
    expect(skuSeries(rows('0042'))[0]!.next).toBe('0043');
    expect(skuSeries(rows('42'))[0]!.next).toBe('43');
    expect(skuSeries(rows('000042'))[0]!.next).toBe('000043');
  });

  it('lets a series outgrow its padding rather than wrap into a collision', () => {
    expect(skuSeries(rows('0999'))[0]!.next).toBe('1000');
    expect(skuSeries(rows('9'))[0]!.next).toBe('10');
  });

  it('continues from the highest number, not the last row read', () => {
    // Rows arrive in whatever order the query returned them.
    expect(skuSeries(rows('0017', '0002', '0009'))[0]!.next).toBe('0018');
  });

  it('counts in whole numbers no matter how long the article is', () => {
    // `sku` is VARCHAR(64); through Number the last digits would be lost and
    // the suggestion would land on an article that already exists.
    const long = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    expect(skuSeries(rows(long))[0]!.next).toBe('9007199254740994');
  });

  it('ignores an article whose digits are interleaved', () => {
    // '068-130' is the shop's own scheme, not a counter: "the next one" has no
    // meaning, and inventing one would collide with whatever it really is.
    expect(skuSeries(rows('068-130', '14-2-7'))).toEqual([]);
  });

  it('ignores an article with no digits at all', () => {
    expect(skuSeries(rows('БЕЗ-НОМЕРА', ''))).toEqual([]);
  });

  it('shows a few product names, newest numbers first, without repeating one', () => {
    const series = skuSeries(
      rows(
        ['т001', 'Повзунки'],
        ['т002', 'Боді'],
        ['т003', 'Боді'],
        ['т004', 'Футболка'],
        ['т005', 'Шапка']
      )
    );
    expect(series[0]!.samples).toEqual(['Шапка', 'Футболка', 'Боді']);
  });

  it('puts the series this card is already filed under first', () => {
    // The answer to "which series was this kind of goods in?" — every other
    // T-shirt is «т…», so «т…» leads even though the digits series is bigger.
    const series = skuSeries([
      { sku: '0001', productName: 'Сукня' },
      { sku: '0002', productName: 'Джинси' },
      { sku: '0003', productName: 'Куртка' },
      { sku: 'т001', productName: 'Футболка', inTag: true },
      { sku: 'т002', productName: 'Футболка', inTag: true },
    ]);
    expect(series[0]!.prefix).toBe('т');
    expect(series[0]!.inTag).toBe(2);
    expect(series[1]!.prefix).toBe('');
    expect(series[1]!.inTag).toBe(0);
  });

  it('falls back to sheer usage when no tag was asked about', () => {
    const series = skuSeries(rows('0001', '0002', '0003', 'т001'));
    expect(series.map((s) => s.prefix)).toEqual(['', 'т']);
    expect(series[0]!.count).toBe(3);
  });

  it('has nothing to say about an empty catalogue', () => {
    expect(skuSeries([])).toEqual([]);
  });
});
