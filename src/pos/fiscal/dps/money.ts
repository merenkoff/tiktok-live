// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/money.ts
//
// Integer kopecks and thousandths in, the ДПС format's numbers out. The only
// place a fiscal amount becomes a fraction: everything before this is integer
// arithmetic, so a hryvnia figure is never added to another one.

/** Kopecks → hryvnias with two decimals, as a JSON number (`1257` → `12.57`). */
export function toUah(cents: number): number {
  return Math.round(cents) / 100;
}

/** Thousandths of a unit → the quantity with three decimals (`1500` → `1.5`). */
export function toAmount(quantityMilli: number): number {
  return Math.round(quantityMilli) / 1000;
}
