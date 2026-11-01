// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/dish-facts.ts — the three numbers a dish's card may say on the
// guest's QR menu (migration 087, TechDocs/POS_QR_MENU_FEEDBACK.md phase F14):
// the calories of the portion as served, the strength of a drink and the time
// a dish takes. All three are the owner's to type and all three are optional;
// NULL means «not said» and the page prints nothing for it.
//
// Integers on the wire, like kopecks and grams: the strength travels in
// TENTHS of a percent (45 = 4,5 %), so the DTO, the database and the page
// never meet a float. The owner's form types «4,5» — the normaliser reads a
// string with a comma or a dot as well as a number, so a 400 for a bad value
// is a sentence the form shows as is, never a silent clearing.
//
// Zero is a statement for two of them («0 ккал» for water, «0 %» for a
// non-alcoholic beer) and meaningless for the third, so the ranges differ.

export const KCAL_MAX = 9999;
/** Tenths of a percent by volume: 1000 = 100 %. */
export const STRENGTH_TENTHS_MAX = 1000;
export const PREP_MINUTES_MAX = 600;

/** Thrown for a value the owner can fix; the routes answer it with a 400 and the message as is. */
export class DishFactsError extends Error {}

/** A number, or a string the form typed («450», «4,5»); blank and null are «not said». */
function numberOf(raw: unknown, what: string): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN;
  if (typeof raw !== 'string') throw new DishFactsError(`${what}: має бути числом`);
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
}

/** The calories of the portion as served: a whole number 0..9999, or null for «not said». */
export function normalizeKcal(raw: unknown): number | null {
  const value = numberOf(raw, 'Калорійність');
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > KCAL_MAX) {
    throw new DishFactsError(`Калорійність: ціле число від 0 до ${KCAL_MAX}`);
  }
  return value;
}

/**
 * The strength in tenths of a percent (45 = 4,5 %): the wire carries the
 * tenths as an integer, the form may send the percent as text («4,5»), which
 * is told apart by `{ percent: true }`. 0..100 % with at most one decimal.
 */
export function normalizeStrengthTenths(raw: unknown, options: { percent?: boolean } = {}): number | null {
  const value = numberOf(raw, 'Міцність');
  if (value === null) return null;
  const tenths = options.percent ? Math.round(value * 10) : value;
  if (
    !Number.isInteger(tenths) ||
    tenths < 0 ||
    tenths > STRENGTH_TENTHS_MAX ||
    (options.percent && Math.abs(value * 10 - tenths) > 1e-6)
  ) {
    throw new DishFactsError('Міцність: число від 0 до 100 %, не більше однієї цифри після коми');
  }
  return tenths;
}

/** The time a dish takes, in whole minutes 1..600, or null for «not said». */
export function normalizePrepMinutes(raw: unknown): number | null {
  const value = numberOf(raw, 'Час приготування');
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > PREP_MINUTES_MAX) {
    throw new DishFactsError(`Час приготування: ціле число хвилин від 1 до ${PREP_MINUTES_MAX}`);
  }
  return value;
}

/** «4,5 %» / «40 %» from tenths — the one place the comma is written. */
export function strengthPercentText(tenths: number): string {
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return `${whole}${frac ? `,${frac}` : ''} %`;
}
