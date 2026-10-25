// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/lineMoney.ts — the arithmetic of one line's money, with no database
// behind it. Its own file so a module that `sales.service.ts` imports (the
// «під запис» lines, 073) can use it without closing an import cycle;
// `sales.service.ts` re-exports it, so every older import still works.

/**
 * What `quantity` base units cost when `unitPriceCents` is the price of
 * `pricePer` of them (migration 075, TechDocs/grocery/G4_WEIGHED.md).
 *
 * A piece, or anything priced per base unit (`pricePer` 1): quantity × price,
 * exact, as every line before weighed goods. A weighed line (`pricePer` 1000 —
 * grams at a price per kilogram): quantity × price / 1000, rounded half a
 * kopeck UP, in integers so a tie is never a float's guess — 350 g at
 * 189,90 ₴/kg is 6 646,5 kopecks and costs 66,47.
 *
 * The ONE place this sum is made: the sale, the «під запис» line, the parked
 * cart's label, the fiscal payload's `price × quantity` and the ДПС `COST` all
 * call it, and the till has a copy pinned to the same table of cases
 * (`LINE_AMOUNT_CASES`). «Half up» is what the provider is assumed to do until
 * the sandbox run (decision Д8, G4_WEIGHED.md §8) says otherwise — and then this
 * function and its copy are all that change.
 */
export function lineAmountCents(quantity: number, unitPriceCents: number, pricePer = 1): number {
  if (pricePer === 1) return quantity * unitPriceCents;
  if (!Number.isInteger(pricePer) || pricePer <= 0) {
    throw new Error(`price_per must be a positive integer, got ${pricePer}`);
  }
  return Math.floor((2 * quantity * unitPriceCents + pricePer) / (2 * pricePer));
}

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
