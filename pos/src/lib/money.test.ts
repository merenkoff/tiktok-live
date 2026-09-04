// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { formatUah, refundLineAmount, uahInputToCents } from './money';

describe('formatUah', () => {
  it('renders kopiykas with a comma and the currency sign', () => {
    expect(formatUah(45000)).toBe('450,00 ₴');
    expect(formatUah(5)).toBe('0,05 ₴');
    expect(formatUah(0)).toBe('0,00 ₴');
  });

  it('keeps the sign for negative amounts (refund previews)', () => {
    expect(formatUah(-1250)).toBe('-12,50 ₴');
  });
});

describe('uahInputToCents', () => {
  it('accepts both decimal separators and surrounding spaces', () => {
    expect(uahInputToCents('12,50')).toBe(1250);
    expect(uahInputToCents('12.50')).toBe(1250);
    expect(uahInputToCents('  7 ')).toBe(700);
  });

  it('rounds to the nearest kopiyka', () => {
    expect(uahInputToCents('0.005')).toBe(1);
    expect(uahInputToCents('0.004')).toBe(0);
  });

  it('treats garbage and negatives as zero', () => {
    expect(uahInputToCents('abc')).toBe(0);
    expect(uahInputToCents('')).toBe(0);
    expect(uahInputToCents('-5')).toBe(0);
  });
});

describe('refundLineAmount', () => {
  it('splits a line that does not divide evenly so the units add back up', () => {
    // 3 units for 10,00 ₴ → 333 + 334 + 333
    const line = 1000;
    const first = refundLineAmount(line, 3, 0, 1);
    const second = refundLineAmount(line, 3, 1, 1);
    const third = refundLineAmount(line, 3, 2, 1);
    expect([first, second, third]).toEqual([333, 334, 333]);
    expect(first + second + third).toBe(line);
  });

  it('returns the whole line when everything comes back at once', () => {
    expect(refundLineAmount(1000, 3, 0, 3)).toBe(1000);
  });

  it('prices a partial refund on top of what was already returned', () => {
    expect(refundLineAmount(1000, 3, 1, 2)).toBe(667);
  });

  it('guards against a zero/negative quantity', () => {
    expect(refundLineAmount(1000, 0, 0, 1)).toBe(0);
    expect(refundLineAmount(1000, -2, 0, 1)).toBe(0);
  });

  it('is exact for evenly divisible lines', () => {
    expect(refundLineAmount(45000, 2, 0, 1)).toBe(22500);
    expect(refundLineAmount(45000, 2, 1, 1)).toBe(22500);
  });
});
