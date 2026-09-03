// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export function formatUah(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',');
  return `${value} ₴`;
}

export function uahInputToCents(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const num = Number(normalized);
  if (Number.isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/**
 * Money to return for `n` more units of a sale line. Mirrors `refundLineAmount`
 * in `src/pos/sales.service.ts` — the till previews the amount before sending,
 * so both sides must agree to the kopiyka.
 *
 * Works off the post-discount `line_total_cents`, and cumulatively (difference
 * of two rounded running totals) so a line's units always add back up to
 * exactly what was charged, in whatever order they come back.
 */
export function refundLineAmount(
  lineTotalCents: number,
  quantity: number,
  alreadyRefunded: number,
  n: number
): number {
  if (quantity <= 0) return 0;
  const through = (units: number) => Math.round((lineTotalCents * units) / quantity);
  return through(alreadyRefunded + n) - through(alreadyRefunded);
}
