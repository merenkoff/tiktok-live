// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/stock/lib/stockUnits.ts — what a stock screen counts in.
//
// Stock is counted in base units and stays that way: 2,5 kg of cheese is
// quantity 2500 in unit 'г' (migration 075, TechDocs/grocery/G4_WEIGHED.md).
// Whoever receives it reads «2,5 кг» on the delivery note and on the scale,
// and prices it per kilogram — so a weighed row (`price_per` 1000) shows and
// takes kilograms on every stock screen and turns them into grams on the way
// out, the way the purchase pack (`pack.ts`) turns bottles into millilitres.
// The server sees grams, and a cost per gram in thousandths of a kopeck
// (`lib/costUnits.ts`) — a price per kilogram is kept to the kopeck.
//
// A weighed row may have a pack too (a 5 kg head of cheese): then the box
// switches between the pack and kilograms, and grams never show at all.
//
// Pure, no I/O: `stockUnits.test.ts` pins it.

import { displayUnit, formatQuantity, isWeighed, packOf } from '@pos/platform';
import type { Pack, PackMode, VariantPack } from '@pos/platform';
import { milliToPrice, priceToMilli, pricingUnit } from '../../../lib/costUnits';

/** What a row must say about itself: its base unit, its pricing basis and its pack. */
export interface StockUnitRow extends VariantPack {
  unit?: string | null;
  /** 1000 when the price is per kilogram or litre (migration 075); absent → 1. */
  price_per?: number | null;
}

/** Base units in one unit a person counts in: 1000 for a weighed row (кг, л), 1 otherwise. */
export function countScale(row: Pick<StockUnitRow, 'price_per'>): number {
  return isWeighed(row.price_per) ? Number(row.price_per) : 1;
}

/** Whether the row is sold by weight, and so counted in kilograms or litres. */
export function isWeighedRow(row: Pick<StockUnitRow, 'price_per'>): boolean {
  return countScale(row) > 1;
}

/** The unit the box counts in when it is not counting packs: «кг» for grams sold by weight. */
export function countUnit(row: StockUnitRow): string {
  return displayUnit(row.unit ?? '', row.price_per ?? 1);
}

/**
 * The row's pack in the units the box counts in — a 5 kg head of cheese is
 * 5 next to «кг», not 5000 — so `QuantityUnitToggle` and its hint («2 ×
 * голова = 10 кг») work unchanged. Null without a pack.
 */
export function countPack(row: StockUnitRow): Pack | null {
  const pack = packOf(row);
  if (!pack) return null;
  return { qty: pack.qty / countScale(row), label: pack.label };
}

/** Base units in one of whatever the box counts in right now. */
function perBox(row: StockUnitRow, mode: PackMode): number {
  const pack = packOf(row);
  return mode === 'pack' && pack ? pack.qty : countScale(row);
}

/** Base units → the number in the box: grams as kilograms, millilitres as packs. */
export function shownQty(row: StockUnitRow, mode: PackMode, base: number): number {
  const per = perBox(row, mode);
  if (per === 1) return base;
  // Four decimals so a round-trip through the box is lossless for anything a
  // person would actually type.
  return Math.round((base / per) * 10000) / 10000;
}

/**
 * The number in the box → base units. 1,005 kg is 1004.9999999999999 g in
 * binary; to a millionth of a gram it is 1005. A real fraction survives —
 * 1,2345 kg stays 1234.5 g — for the whole-units check to name.
 */
export function typedToBase(row: StockUnitRow, mode: PackMode, typed: number): number {
  if (!Number.isFinite(typed)) return 0;
  const per = perBox(row, mode);
  if (per === 1) return typed;
  return Math.round(typed * per * 1e6) / 1e6;
}

/**
 * Base units in whatever the PRICE box is per. A pack in pack mode; otherwise
 * a kilogram or a litre for anything counted in grams or millilitres — whether
 * it is sold by weight or is a café's ingredient counted in grams: flour is
 * bought by the kilogram either way, and «за 1 г» is a price nobody can type.
 */
export function costPer(row: StockUnitRow, mode: PackMode): number {
  const pack = packOf(row);
  if (mode === 'pack' && pack) return pack.qty;
  return Math.max(countScale(row), pricingUnit(row.unit).per);
}

/**
 * A purchase price in THOUSANDTHS of a kopeck per base unit (`costUnits.ts`,
 * migration 103) → the kopecks the box shows: per kilogram, per pack, per piece.
 */
export function shownCost(row: StockUnitRow, mode: PackMode, milliPerBase: number): number {
  return milliToPrice(milliPerBase, costPer(row, mode));
}

/**
 * The kopecks typed in the box → thousandths of a kopeck per base unit. A
 * price per kilogram or litre is kept to the kopeck (14,50 ₴/кг is exactly
 * 1450 thousandths a gram), and a pack's price reads back as it was typed.
 */
export function typedCostToMilli(row: StockUnitRow, mode: PackMode, cents: number): number {
  return priceToMilli(cents, costPer(row, mode));
}

/** What the price box is per: «кг», «л», «пляшка», «шт». */
export function costUnit(row: StockUnitRow, mode: PackMode): string {
  const pack = packOf(row);
  if (mode === 'pack' && pack) return pack.label;
  return isWeighedRow(row) ? countUnit(row) : pricingUnit(row.unit).label;
}

/**
 * What a decimal box holds as a number: «20,5» and «20.5» are both 20.5, a
 * trailing «20,» is 20 while it is being typed, and anything that is not a
 * non-negative number yet («», «,», letters, a minus) is null.
 */
export function parseDecimal(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** 20.5 → «20,5», the way a Ukrainian writes it; three decimals at most, a gram. */
export function formatDecimal(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** «2,500 кг», «12 шт», «250 мл» — a stock figure in a sentence. */
export function stockText(base: number, row: StockUnitRow): string {
  if (isWeighedRow(row) && base < 0) return `-${formatQuantity(-base, row.unit ?? '', row.price_per ?? 1)}`;
  return formatQuantity(base, row.unit ?? '', row.price_per ?? 1);
}

/**
 * A stock figure in a table cell: kilograms with their unit for a weighed row
 * (a bare «2,500» next to rows of pieces would read as a lot of pieces), the
 * bare number otherwise, as the cells always showed it.
 */
export function stockCell(base: number, row: StockUnitRow): string {
  return isWeighedRow(row) ? stockText(base, row) : String(base);
}

/** A change of stock with its sign: «+2,500 кг», «-0,350 кг», «+3». */
export function signedStockCell(delta: number, row: StockUnitRow): string {
  const text = stockCell(Math.abs(delta), row);
  return delta > 0 ? `+${text}` : delta < 0 ? `-${text}` : text;
}
