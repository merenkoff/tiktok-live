// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's copy of `src/pos/lineMoney.ts` (migration 075,
// TechDocs/grocery/G4_WEIGHED.md). The cart shows the customer a sum before
// the server sees the sale, and the receipt the server files must say the same
// number — so the function is copied verbatim and `lineMoney.test.ts` carries
// the server's `LINE_AMOUNT_CASES`, also verbatim, exactly like
// `cashRounding.ts`. Change one, change both and the table.

/**
 * What `quantity` base units cost when `unitPriceCents` is the price of
 * `pricePer` of them.
 *
 * A piece, or anything priced per base unit (`pricePer` 1): quantity × price,
 * exact, as every line before weighed goods. A weighed line (`pricePer` 1000 —
 * grams at a price per kilogram): quantity × price / 1000, rounded half a
 * kopeck UP, in integers so a tie is never a float's guess — 350 g at
 * 189,90 ₴/kg is 6 646,5 kopecks and costs 66,47.
 *
 * «Half up» is what the provider is assumed to do until the Checkbox sandbox
 * run (decision Д8, G4_WEIGHED.md §8) says otherwise.
 */
export function lineAmountCents(quantity: number, unitPriceCents: number, pricePer = 1): number {
  if (pricePer === 1) return quantity * unitPriceCents;
  if (!Number.isInteger(pricePer) || pricePer <= 0) {
    throw new Error(`price_per must be a positive integer, got ${pricePer}`);
  }
  return Math.floor((2 * quantity * unitPriceCents + pricePer) / (2 * pricePer));
}
