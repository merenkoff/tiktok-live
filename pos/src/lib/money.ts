// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Thousands are split by a no-break space — «1 268,75 ₴», the Ukrainian way
 * and the board's — so a line never breaks inside a sum. Not the narrow one
 * (U+202F): SF draws it a hair wide at text sizes, and «1100,00» on a button
 * read as if there were no grouping at all. Screens only: the
 * thermal receipt (`receipt.rs` `money`), the PDF receipt and the price tag
 * format their own numbers for their own fonts and code pages.
 */
const GROUP = '\u00a0';

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

export function formatUah(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const [whole, frac] = (Math.abs(cents) / 100).toFixed(2).split('.');
  return `${sign}${groupThousands(whole)},${frac} ₴`;
}

/**
 * The short form for a chip, a quick-cash button or a table tile: «60 ₴»,
 * «1 240 ₴» when there are no kopiykas, the full form otherwise.
 */
export function formatUahCompact(cents: number): string {
  if (cents % 100 !== 0) return formatUah(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(cents) / 100))} ₴`;
}

export function uahInputToCents(value: string): number {
  // Any space goes — a sum pasted back from the screen carries the grouping.
  const normalized = value.replace(/\s/g, '').replace(',', '.');
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
