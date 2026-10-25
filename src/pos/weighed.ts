// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/weighed.ts — what a weighed line is, with no database behind it
// (migration 075, TechDocs/grocery/G4_WEIGHED.md).
//
// A weighed variant counts in whole grams or millilitres like any other row
// and is priced per kilogram or litre: `price_per` = 1000. The money of such a
// line is `lineAmountCents` (lineMoney.ts); this file holds the rest — which
// units may be weighed, how a quantity reads to a person, and which ways of
// taking a weight the server believes.

/** The basis a weighed variant's price is for: 1 kg = 1000 g, 1 l = 1000 ml. */
export const WEIGHED_PRICE_PER = 1000;

/** The base units a variant may be weighed in — the CHECK in 075 says the same. */
export const WEIGHABLE_UNITS: readonly string[] = ['г', 'мл'];

/** What a weighed quantity reads as: grams as kilograms, millilitres as litres. */
const DISPLAY_UNIT: Readonly<Record<string, string>> = { г: 'кг', мл: 'л' };

/**
 * The heaviest weighed line, in base units: 999,999 kg. A scale's label has
 * five digits of weight and a till's pad three after the comma; anything past
 * this is a typo, and it also keeps the line's sum inside an INTEGER.
 */
export const MAX_WEIGHED_QUANTITY = 999_999;

/**
 * How a weight may have been taken (the CHECK in 075). Г4 believes only
 * `manual` — a number the cashier typed from a plain scale's display; `label`
 * (a scale's barcode, Г6) and `scale` (a connected scale, Г9) arrive with the
 * phases that can actually produce them.
 */
export type WeightSource = 'manual' | 'label' | 'scale';
export const ACCEPTED_WEIGHT_SOURCES: readonly WeightSource[] = ['manual'];

/** Thrown for a weighed line the server will not take — a 400 in the cashier's words. */
export class WeighedLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeighedLineError';
  }
}

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

/**
 * The weight source of a line the till marked weighed. Absent is the till that
 * does not know weighed goods at all — it would have priced 350 g as 350
 * pieces and shown the customer that sum — so it is refused in words that tell
 * the cashier what to do (G4_WEIGHED.md, decision 7).
 */
export function requireWeightSource(raw: unknown): WeightSource {
  if (raw == null || raw === '') {
    throw new WeighedLineError(
      'Ця каса ще не вміє продавати ваговий товар — оновіть застосунок, щоб вага рахувалася за кілограм'
    );
  }
  const source = String(raw).trim();
  if (!(ACCEPTED_WEIGHT_SOURCES as readonly string[]).includes(source)) {
    throw new WeighedLineError(`Спосіб зважування «${source}» поки не підтримується`);
  }
  return source as WeightSource;
}

/**
 * The checks every freshly rung weighed line passes once it is priced, wherever
 * it is rung — a sale or a handover «під запис» (both through `pricePlainLine`).
 * `amountCents` is what the line comes to.
 */
export function assertWeighedLine(line: {
  productName: string;
  quantity: number;
  amountCents: number;
}): void {
  if (line.quantity > MAX_WEIGHED_QUANTITY) {
    throw new WeighedLineError(`«${line.productName}»: вага понад 999,999 — перевірте введення`);
  }
  if (line.amountCents <= 0) {
    throw new WeighedLineError(
      `«${line.productName}»: сума рядка 0,00 ₴ — вага замала або в товару немає ціни`
    );
  }
}
