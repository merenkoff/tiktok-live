// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The pure half of the café's analytics screens (phase К6). Small functions,
// but two of them exist to stop a confident lie: «0 %» from a null, and
// «пік о 00:00» from an empty day.

import { describe, expect, it } from 'vitest';
import { formatHour, pct, peakHour, topModifier } from './figures';
import type { CafeAnalytics } from '../analytics/types';

const hours = (spec: Record<number, number>): CafeAnalytics['peak_hours'] =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: spec[hour] ?? 0,
    revenue_cents: (spec[hour] ?? 0) * 1000,
  }));

describe('pct', () => {
  it('writes basis points the way a Ukrainian reads them', () => {
    expect(pct(3_250)).toBe('32,5 %');
    expect(pct(0)).toBe('0,0 %');
  });

  it('says «—» for an unknown share instead of a confident zero', () => {
    // The whole reason this helper exists: `null` means «we could not work it
    // out», and 0 % is a number an owner would re-price a menu by.
    expect(pct(null)).toBe('—');
    expect(pct(undefined)).toBe('—');
  });
});

describe('peakHour', () => {
  it('finds the busiest hour', () => {
    expect(peakHour(hours({ 8: 12, 13: 31, 19: 20 }))).toEqual({ hour: 13, orders: 31 });
  });

  it('gives the morning the tie — that is the shift a café staffs for', () => {
    expect(peakHour(hours({ 9: 15, 17: 15 }))).toEqual({ hour: 9, orders: 15 });
  });

  it('returns null for a day with no orders, not hour zero', () => {
    // «Пік о 00:00» is a claim about the night shift; null is the truth.
    expect(peakHour(hours({}))).toBeNull();
  });
});

describe('formatHour', () => {
  it('writes an hour the way a clock does', () => {
    expect(formatHour(9)).toBe('09:00');
    expect(formatHour(13)).toBe('13:00');
    expect(formatHour(0)).toBe('00:00');
  });
});

describe('topModifier', () => {
  it('takes the server’s first, and nothing from an empty list', () => {
    const list = [
      { group_name: 'Молоко', name: 'вівсяне', times: 42 },
      { group_name: 'Сироп', name: 'карамель', times: 8 },
    ];
    expect(topModifier(list)?.name).toBe('вівсяне');
    expect(topModifier([])).toBeNull();
  });
});
