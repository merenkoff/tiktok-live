// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/lineMoney.ts — the arithmetic of one line's money, with no database
// behind it. Its own file so a module that `sales.service.ts` imports (the
// «під запис» lines, 073) can use it without closing an import cycle;
// `sales.service.ts` re-exports it, so every older import still works.

/**
 * Money to return for `n` more units of a sale line.
 *
 * Works off `line_total_cents` (post-discount), not `unit_price_cents` — the
 * latter is the pre-discount price, so charging refunds against it hands back
 * more than the customer actually paid on any discounted receipt.
 *
 * Cumulative form on purpose: taking the difference between two rounded
 * running totals (rather than rounding each slice) means the units of a line
 * always sum to exactly `line_total_cents`, in whatever order they come back.
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
