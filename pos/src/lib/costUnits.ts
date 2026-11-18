// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/costUnits.ts — the purchase price as the server keeps it.
//
// A cost is THOUSANDTHS of a kopeck per base unit (`cost_milli`, migration
// 103; the server's twin is `src/pos/cost.ts`). The base unit of a kitchen is
// a gram, and whole kopecks per gram moved a kilogram's price in steps of
// 10 ₴; in thousandths, 35,50 ₴/кг is exactly 3550 a gram. What a person
// types and reads stays what it always was — hryvnias per kilogram, per litre,
// per piece, per pack — and this file is the only place the two meet.
//
// Pure, no I/O: `costUnits.test.ts` pins it.

/** Thousandths of a kopeck in one kopeck. */
export const MILLI = 1000;

/** Whole kopecks from thousandths, half up — how a SUM of costs becomes money. */
export function milliToCents(milli: number): number {
  return Math.round(milli / MILLI);
}

/** What `quantity` base units cost, in whole kopecks: rounded once, after the multiplication. */
export function lineCostCents(quantity: number, costMilli: number): number {
  return milliToCents(quantity * costMilli);
}

/**
 * A cost as a share of a price, in basis points (2500 = 25 %), from the sum
 * BEFORE it is rounded to kopecks — the server's `foodCostBps` to the letter.
 */
export function costShareBps(costMilli: number, priceCents: number): number {
  return Math.round((costMilli * 10) / priceCents);
}

/**
 * The precise cost of whatever the server sent: `cost_milli` when it knows the
 * column, the rounded `cost_cents` otherwise (a backend older than 103).
 */
export function costMilliOf(row: { cost_milli?: number | null; cost_cents?: number | null }): number {
  if (row.cost_milli != null) return row.cost_milli;
  return (row.cost_cents ?? 0) * MILLI;
}

/** The same for a document line or a movement, whose price may be absent. */
export function unitCostMilliOf(row: {
  unit_cost_milli?: number | null;
  unit_cost_cents?: number | null;
}): number | null {
  if (row.unit_cost_milli != null) return row.unit_cost_milli;
  return row.unit_cost_cents == null ? null : row.unit_cost_cents * MILLI;
}

/** How a base unit is priced out loud: grams by the kilogram, millilitres by the litre. */
export function pricingUnit(unit: string | null | undefined): { per: number; label: string } {
  const base = (unit ?? '').trim();
  if (base === 'г') return { per: 1000, label: 'кг' };
  if (base === 'мл') return { per: 1000, label: 'л' };
  return { per: 1, label: base || 'шт' };
}

/**
 * A price typed for `per` base units (a kilogram is 1000, a 750 ml bottle 750,
 * a piece 1), in kopecks → thousandths per ONE base unit.
 */
export function priceToMilli(cents: number, per: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(per) || per <= 0) return 0;
  return Math.round((cents * MILLI) / per);
}

/** The other way: what `per` base units cost, in whole kopecks — the number a price box shows. */
export function milliToPrice(milli: number, per: number): number {
  if (!Number.isFinite(milli) || !Number.isFinite(per) || per <= 0) return 0;
  return Math.round((milli * per) / MILLI);
}
