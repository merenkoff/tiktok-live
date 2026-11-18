// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/cost.ts — the purchase price, to the kopeck per kilogram or litre.
//
// A cost is kept in THOUSANDTHS of a kopeck per base unit (`cost_milli`,
// migration 103): the base unit of a kitchen is a gram, and whole kopecks per
// gram moved a kilogram's price in steps of 10 ₴. Quantities stay whole and
// money stays an integer; the only division is the one at the END of a sum,
// done here, once.
//
// `cost_cents` is the rounded copy older tills and module bundles still read.
// The database keeps the pair in step (the triggers of migration 103); this
// file is the arithmetic and the reading of a request that may carry either.

/** Thousandths of a kopeck in one kopeck. */
export const MILLI = 1000;

/** The largest precise cost a row may hold — where its rounded copy still fits an INTEGER. */
export const MAX_COST_MILLI = 2147483647 * MILLI;

/** Whole kopecks from thousandths, half up — how a SUM of costs becomes money. */
export function milliToCents(milli: number): number {
  return Math.round(milli / MILLI);
}

export function centsToMilli(cents: number): number {
  return cents * MILLI;
}

/** What `quantity` base units cost, in whole kopecks: rounded once, after the multiplication. */
export function lineCostCents(quantity: number, costMilli: number): number {
  return milliToCents(quantity * costMilli);
}

/**
 * A cost as a share of a price, in basis points (2500 = 25 %), from the sum
 * BEFORE it is rounded to kopecks — a 4 ₴ espresso must not gain or lose a
 * point of food cost to the rounding of its own cost.
 */
export function foodCostBps(costMilli: number, priceCents: number): number {
  return Math.round((costMilli * 10) / priceCents);
}

/** SQL: a sum of thousandths as whole kopecks. `expr` must already be an aggregate or a scalar. */
export function sqlMilliToCents(expr: string): string {
  return `ROUND((${expr}) / 1000.0)::bigint`;
}

export class CostInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CostInputError';
  }
}

function wholeNonNegative(raw: unknown, what: string, max: number): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new CostInputError(`${what}: потрібне ціле число від 0`);
  }
  return value;
}

/**
 * The cost a request asks for, in thousandths — or `undefined` for «leave it».
 *
 * A request may carry the precise field, the old one, or both. The precise one
 * wins. The old one alone comes from a client built before migration 103, and
 * such a client sends back the ROUNDED figure it read: when that equals the
 * rounding of what is stored, nothing was typed and the precise price stays —
 * otherwise saving any other field of the card would coarsen its cost.
 */
export function costMilliFromInput(
  input: { cost_milli?: unknown; cost_cents?: unknown },
  stored?: number
): number | undefined {
  if (input.cost_milli !== undefined && input.cost_milli !== null) {
    return wholeNonNegative(input.cost_milli, 'Закупівельна ціна', MAX_COST_MILLI);
  }
  if (input.cost_cents !== undefined && input.cost_cents !== null) {
    const cents = wholeNonNegative(input.cost_cents, 'Закупівельна ціна', 2147483647);
    if (stored !== undefined && milliToCents(stored) === cents) return undefined;
    return centsToMilli(cents);
  }
  return undefined;
}

/**
 * The same reading for a document line's price, which may also be CLEARED:
 * `null` in either field means «this line states no price», `undefined` in
 * both means «leave it».
 */
export function unitCostMilliFromInput(input: {
  unit_cost_milli?: unknown;
  unit_cost_cents?: unknown;
}): number | null | undefined {
  if (input.unit_cost_milli !== undefined) {
    return input.unit_cost_milli === null
      ? null
      : wholeNonNegative(input.unit_cost_milli, 'Ціна закупівлі', MAX_COST_MILLI);
  }
  if (input.unit_cost_cents !== undefined) {
    return input.unit_cost_cents === null
      ? null
      : centsToMilli(wholeNonNegative(input.unit_cost_cents, 'Ціна закупівлі', 2147483647));
  }
  return undefined;
}

/** How a base unit is priced out loud: grams by the kilogram, millilitres by the litre. */
export function pricingUnit(unit: string): { per: number; label: string } {
  const base = unit.trim();
  if (base === 'г') return { per: 1000, label: 'кг' };
  if (base === 'мл') return { per: 1000, label: 'л' };
  return { per: 1, label: base || 'шт' };
}

/**
 * «35,50 ₴/кг», «12 ₴/шт» — a purchase price as the owner reads it, for the
 * menu journal. Null when there is none: an unset price is «nothing», not «0 ₴».
 */
export function purchasePriceText(costMilli: number, unit: string): string | null {
  if (!(costMilli > 0)) return null;
  const { per, label } = pricingUnit(unit);
  const cents = Math.round((costMilli * per) / MILLI);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped}${frac === 0 ? '' : `,${String(frac).padStart(2, '0')}`} ₴/${label}`;
}
