// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The pure half of the café's analytics screens (phase К6). Small functions,
// but two of them exist to stop a confident lie: «0 %» from a null, and
// «пік о 00:00» from an empty day.

import { describe, expect, it } from 'vitest';
import {
  formatHour,
  formatMinutes,
  groupByQuadrant,
  pct,
  peakHour,
  reasonLabeller,
  topModifier,
} from './figures';
import type { CafeAnalytics, MenuMatrixRow, MenuQuadrant } from '../analytics/types';

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

describe('groupByQuadrant', () => {
  const row = (variant_id: number, quadrant: MenuQuadrant): MenuMatrixRow => ({
    variant_id,
    product_name: `Страва ${variant_id}`,
    label: '',
    sold: 10,
    share_bps: 2500,
    revenue_cents: 10_000,
    cost_cents: 3_000,
    margin_cents: 7_000,
    unit_margin_cents: 700,
    quadrant,
  });

  it('keeps the four groups in the order an owner reads them, empty ones included', () => {
    // An empty quadrant is an answer — «собак немає» is worth seeing — so the
    // groups are fixed rather than derived from what happens to be there.
    const groups = groupByQuadrant([row(1, 'dog'), row(2, 'star'), row(3, 'dog')]);
    expect(groups.map((g) => g.quadrant)).toEqual(['star', 'plowhorse', 'puzzle', 'dog']);
    expect(groups.map((g) => g.rows.length)).toEqual([1, 0, 0, 2]);
  });
});

describe('reasonLabeller', () => {
  const reasons = [
    { code: 'spoiled', label: 'Зіпсувалося' },
    { code: 'tasting', label: 'Проба' },
  ];

  it('names a reason the way the write-off screen did', () => {
    expect(reasonLabeller(reasons)('spoiled')).toBe('Зіпсувалося');
  });

  it('shows an unknown code as it is instead of folding it into «Інше»', () => {
    // A session cached before a vertical learned a new word. An unnamed line
    // is a question the owner can ask; a mislabelled one is not.
    expect(reasonLabeller(reasons)('staff')).toBe('staff');
    expect(reasonLabeller(undefined)('spoiled')).toBe('spoiled');
  });
});

describe('formatMinutes', () => {
  it('writes a visit the way a host would say it', () => {
    expect(formatMinutes(42)).toBe('42 хв');
    expect(formatMinutes(95)).toBe('1 год 35 хв');
    expect(formatMinutes(120)).toBe('2 год');
  });

  it('says «—» when there is nothing to average', () => {
    expect(formatMinutes(null)).toBe('—');
  });
});
