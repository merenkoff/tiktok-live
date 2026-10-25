// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a weighed line is on the till (migration 075, TechDocs/grocery/G4_WEIGHED.md).
//
// A weighed variant counts in whole grams or millilitres like any other row
// and is priced per kilogram or litre: `price_per` = 1000, which the server
// derives and the till only reads. The first half of this file is the
// server's `src/pos/weighed.ts`, copied so a quantity reads the same on the
// screen as in a server sentence; the second half is the weight pad's own
// arithmetic — typing «0,350» on a number pad — which the server never sees.
// The money of such a line is `lineAmountCents` (`lineMoney.ts`).

import { lineAmountCents } from './lineMoney';
import { formatUah } from './money';

/** The basis a weighed variant's price is for: 1 kg = 1000 g, 1 l = 1000 ml. */
export const WEIGHED_PRICE_PER = 1000;

/** The base units a variant may be weighed in — the CHECK in 075 says the same. */
export const WEIGHABLE_UNITS: readonly string[] = ['г', 'мл'];

/** What a weighed quantity reads as: grams as kilograms, millilitres as litres. */
const DISPLAY_UNIT: Readonly<Record<string, string>> = { г: 'кг', мл: 'л' };

/**
 * The heaviest weighed line, in base units: 999,999 kg — the server refuses
 * anything past it as a typo, and the pad stops at three digits before the
 * comma so it cannot be typed.
 */
export const MAX_WEIGHED_QUANTITY = 999_999;

/**
 * How a weight was taken. The till sends `manual` — a number the cashier
 * typed from a plain scale's display — the only one the server believes in
 * phase Г4; `label` (a scale's barcode, Г6) and `scale` (a connected scale,
 * Г9) arrive with the phases that can produce them.
 */
export type WeightSource = 'manual' | 'label' | 'scale';

/** The words under a hand-typed weight, on the pad, in the cart and on the receipt. */
export const MANUAL_WEIGHT_NOTE = 'вагу введено вручну';

export function isWeighed(pricePer: unknown): boolean {
  return Number(pricePer) > 1;
}

/** The unit a person reads: `кг` for a weighed line in grams, the base unit otherwise. */
export function displayUnit(unit: string, pricePer = 1): string {
  return isWeighed(pricePer) ? (DISPLAY_UNIT[unit] ?? unit) : unit;
}

/** «0,350 кг», «1,500 л», «3 шт» — for a sentence the cashier reads. */
export function formatQuantity(quantity: number, unit: string, pricePer = 1): string {
  if (isWeighed(pricePer)) {
    const digits = String(pricePer).length - 1;
    const whole = Math.trunc(quantity / pricePer);
    const fraction = String(Math.abs(quantity % pricePer)).padStart(digits, '0');
    return `${whole},${fraction} ${displayUnit(unit, pricePer)}`;
  }
  return unit ? `${quantity} ${unit}` : String(quantity);
}

/** «189,90 ₴/кг» for a price per kilogram, «45,90 ₴» for anything priced per one. */
export function unitPriceLabel(priceCents: number, unit: string, pricePer = 1): string {
  return isWeighed(pricePer) ? `${formatUah(priceCents)}/${displayUnit(unit, pricePer)}` : formatUah(priceCents);
}

/**
 * «0,350 кг × 189,90 ₴/кг» — a weighed line's second row in the cart and on
 * the receipt, instead of «350 × …» which would read as 350 pieces.
 */
export function weighedLineCaption(
  quantity: number,
  unit: string,
  pricePer: number,
  priceCents: number
): string {
  return `${formatQuantity(quantity, unit, pricePer)} × ${unitPriceLabel(priceCents, unit, pricePer)}`;
}

// ── The weight pad ───────────────────────────────────────────────────────────

export type WeightPadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'del';

/**
 * One tap on the weight pad, in kilograms as a scale's display shows them.
 * `fresh` means what is on screen was put there by the till (the weight a
 * line already had), so the first digit replaces it, as on the cash pad. At
 * most three digits after the comma (a gram) and three before it — 999,999,
 * the server's ceiling.
 */
export function weightPadInput(text: string, key: WeightPadKey, fresh: boolean): string {
  const base = fresh ? '' : text;
  if (key === 'del') return fresh ? '' : base.slice(0, -1);
  if (key === ',') {
    if (base.includes(',')) return base;
    return `${base || '0'},`;
  }
  const [whole, frac] = base.split(',');
  if (frac !== undefined) return frac.length >= 3 ? base : base + key;
  if (whole === '0') return key;
  if (whole.length >= 3) return base;
  return base + key;
}

/**
 * The pad's text (or anything typed into its field) as base units: «0,350» →
 * 350, «1,5» → 1500, «2» → 2000, «0.25» → 250. Null when it is not a weight —
 * empty, letters, more than three decimals.
 */
export function parseWeightInput(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace('.', ',');
  const match = /^(\d{1,6})(?:,(\d{0,3}))?$/.exec(normalized) ?? /^,(\d{1,3})$/.exec(normalized);
  if (!match) return null;
  const [whole, frac] = normalized.startsWith(',') ? ['0', match[1]] : [match[1], match[2] ?? ''];
  return Number(whole) * WEIGHED_PRICE_PER + Number(frac.padEnd(3, '0'));
}

/** Base units as the pad shows them to be retyped: 350 → «0,350», 2000 → «2,000». */
export function weightToPadText(quantity: number): string {
  return `${Math.trunc(quantity / WEIGHED_PRICE_PER)},${String(quantity % WEIGHED_PRICE_PER).padStart(3, '0')}`;
}

/**
 * Why this weight cannot be rung, in the cashier's words; null when it can.
 * The server's own checks (`assertWeighedLine`), said before the tap rather
 * than after the payment screen.
 */
export function weightProblem(quantity: number | null, priceCents: number, pricePer = WEIGHED_PRICE_PER): string | null {
  if (quantity == null || quantity <= 0) return 'Введіть вагу';
  if (quantity > MAX_WEIGHED_QUANTITY) return 'Вага понад 999,999 — перевірте введення';
  if (lineAmountCents(quantity, priceCents, pricePer) <= 0) {
    return 'Сума рядка 0,00 ₴ — вага замала або в товару немає ціни';
  }
  return null;
}
