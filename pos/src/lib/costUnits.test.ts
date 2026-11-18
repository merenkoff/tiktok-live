// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  costMilliOf,
  costShareBps,
  lineCostCents,
  milliToCents,
  milliToPrice,
  priceToMilli,
  pricingUnit,
  unitCostMilliOf,
} from './costUnits';

describe('costUnits', () => {
  it('keeps a price per kilogram to the kopeck', () => {
    // 35,50 ₴/кг → 3550 thousandths of a kopeck a gram, and back.
    expect(priceToMilli(3550, 1000)).toBe(3550);
    expect(milliToPrice(3550, 1000)).toBe(3550);
    // A piece: 12,40 ₴ is 1240 kopecks, 1 240 000 thousandths.
    expect(priceToMilli(1240, 1)).toBe(1_240_000);
    expect(milliToPrice(1_240_000, 1)).toBe(1240);
  });

  it('gives a pack’s price back as it was typed', () => {
    // A 700 ml bottle for 100,00 ₴ does not divide evenly; the box still reads 100,00.
    const milli = priceToMilli(10_000, 700);
    expect(milli).toBe(14_286);
    expect(milliToPrice(milli, 700)).toBe(10_000);
    // A 750 ml bottle for 189,90 ₴ divides exactly.
    expect(priceToMilli(18_990, 750)).toBe(25_320);
  });

  it('rounds a sum once, half up — the server’s cases', () => {
    expect(milliToCents(63_900)).toBe(64);
    expect(milliToCents(499)).toBe(0);
    expect(milliToCents(500)).toBe(1);
    expect(lineCostCents(18, 3550)).toBe(64);
    expect(costShareBps(217_930, 1000)).toBe(2179);
  });

  it('reads a backend that does not know the precise column yet', () => {
    expect(costMilliOf({ cost_milli: 3550, cost_cents: 4 })).toBe(3550);
    expect(costMilliOf({ cost_cents: 4 })).toBe(4000);
    expect(costMilliOf({})).toBe(0);
    expect(unitCostMilliOf({ unit_cost_milli: 3550, unit_cost_cents: 4 })).toBe(3550);
    expect(unitCostMilliOf({ unit_cost_cents: 4 })).toBe(4000);
    expect(unitCostMilliOf({ unit_cost_cents: null })).toBeNull();
  });

  it('prices grams by the kilogram and millilitres by the litre', () => {
    expect(pricingUnit('г')).toEqual({ per: 1000, label: 'кг' });
    expect(pricingUnit('мл')).toEqual({ per: 1000, label: 'л' });
    expect(pricingUnit('шт')).toEqual({ per: 1, label: 'шт' });
    expect(pricingUnit('')).toEqual({ per: 1, label: 'шт' });
    expect(priceToMilli(100, 0)).toBe(0);
  });
});
