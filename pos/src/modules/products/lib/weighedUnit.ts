// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product card's words for goods sold by weight (TechDocs/grocery/G4_WEIGHED.md).
//
// A weighed variant is stored in grams or millilitres — stock, documents and
// recipes stay in base units — and priced per kilogram or litre: the server
// gives it `price_per` 1000 when its unit is one the store's vertical sells by
// weight (`VerticalPublicConfig.weighedUnits`). So the card shows `г` as «кг»,
// asks the price «за 1 кг», reads the opening stock in kilograms and the
// purchase price per kilogram — the one figure stored per gram, with a step of
// a kopeck per gram (10 ₴ per kilogram), which the sheet says out loud.
//
// Pure, no I/O: `weighedUnit.test.ts` pins it. Nothing here runs for a store
// whose vertical weighs nothing, which is every store until groceries (PR4).

import { displayUnit, formatQuantity, parseWeightInput, uahInputToCents, WEIGHED_PRICE_PER } from '@pos/platform';
import type { VerticalPublicConfig } from '@pos/platform';
import { centsToInput } from './productDraft';

/** Whether a variant in `unit` is sold by weight in this store — what the server will derive. */
export function isWeighedUnit(vertical: Pick<VerticalPublicConfig, 'weighedUnits'>, unit: string): boolean {
  return (vertical.weighedUnits ?? []).includes(unit);
}

/** The unit picker's captions: `г` reads «кг — на вагу», every other unit as itself. */
export function unitLabels(vertical: Pick<VerticalPublicConfig, 'weighedUnits'>): Record<string, string> {
  return Object.fromEntries(
    (vertical.weighedUnits ?? []).map((unit) => [unit, `${displayUnit(unit, WEIGHED_PRICE_PER)} — на вагу`])
  );
}

/** «Ціна за 1 кг, грн» for a weighed unit, «Ціна, грн» otherwise. */
export function priceCaption(weighed: boolean, unit: string): string {
  return weighed ? `Ціна за 1 ${displayUnit(unit, WEIGHED_PRICE_PER)}, грн` : 'Ціна, грн';
}

/** What is on the shelf: «2,350 кг» for a weighed variant, «12 шт» otherwise. */
export function stockText(quantity: number, unit: string, weighed: boolean): string {
  if (weighed) return formatQuantity(Math.max(0, quantity), unit, WEIGHED_PRICE_PER);
  return unit ? `${quantity} ${unit}` : String(quantity);
}

/** An opening stock typed in kilograms («12,5») as base units (12 500); 0 when it is not a weight. */
export function openingStockOf(text: string, weighed: boolean): number {
  if (weighed) return parseWeightInput(text) ?? 0;
  return Number(text) || 0;
}

/** A per-gram purchase price («0.12») as the per-kilogram text the owner reads («120»). */
export function costPerKgText(baseText: string): string {
  if (baseText.trim() === '') return '';
  return centsToInput(uahInputToCents(baseText) * WEIGHED_PRICE_PER);
}

/**
 * A per-kilogram purchase price as the per-gram text the card stores: 119,90
 * ₴/кг is 11,99 kopecks a gram, kept as 12 — the step `cost_cents` has always
 * had (TechDocs/grocery/G4_WEIGHED.md, «Відомі обмеження»).
 */
export function costBaseText(perKgText: string): string {
  if (perKgText.trim() === '') return '';
  return centsToInput(Math.round(uahInputToCents(perKgText) / WEIGHED_PRICE_PER));
}
