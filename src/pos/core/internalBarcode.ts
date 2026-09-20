// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * An EAN-13 for something the shop made itself.
 *
 * A bouquet assembled for the window gets a printed price tag, and that tag is
 * the only thing tying the flowers in the bucket to the card in the database
 * (`TechDocs/POS_FLORIST_BENCH.md` §11.3). It needs a barcode, and no supplier
 * will ever issue one for a bouquet that exists for an afternoon.
 *
 * Prefix `2` is GS1's **restricted circulation within a company**: codes that
 * are valid inside one retailer and are guaranteed never to collide with a
 * manufacturer's article number. That is precisely this case.
 *
 * The body is the variant's own id, which makes collisions impossible by
 * construction rather than by a uniqueness check and a retry loop: variant ids
 * are a single global sequence, so two tills assembling at the same moment get
 * different numbers without talking to each other. (`pos_variants(store_id,
 * barcode)` is unique anyway — that index is the belt, this is the braces.)
 *
 * The client only ever *reads* codes (`pos/src/lib/ean13.ts` validates and
 * draws bars); issuing one is a server job, because only the server knows the
 * id.
 */

/** Digits available for the body: 13 total, minus the prefix and the check. */
const BODY_DIGITS = 11;

/** GS1 restricted circulation. Never leaves the store. */
const INTERNAL_PREFIX = '2';

export class BarcodeRangeError extends Error {
  constructor(variantId: number) {
    super(`variant id ${variantId} does not fit an internal EAN-13`);
    this.name = 'BarcodeRangeError';
  }
}

/**
 * The thirteenth digit: weight 1 on the odd positions from the left, 3 on the
 * even ones, then round the sum up to the next ten.
 *
 * It has to be right here, because this is where the code is made. The client
 * now checks it too (`pos/src/lib/ean13.ts`, same arithmetic) and a price tag
 * refuses to draw bars for a code that fails — but that check exists for codes
 * typed in or imported, and it can only report a bad one. It cannot repair a
 * code this function got wrong, and until it was added the scanner at the
 * counter was the first validator, with a customer waiting.
 */
export function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < twelve.length; i += 1) {
    const digit = twelve.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** `2` + the variant id padded to 11 + check digit. */
export function internalBarcodeFor(variantId: number): string {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw new BarcodeRangeError(variantId);
  }
  const body = String(variantId);
  if (body.length > BODY_DIGITS) throw new BarcodeRangeError(variantId);
  const twelve = INTERNAL_PREFIX + body.padStart(BODY_DIGITS, '0');
  return twelve + String(ean13CheckDigit(twelve));
}

/** True for a code this module issued — the `2` prefix and a valid check digit. */
export function isInternalBarcode(code: string): boolean {
  if (!/^\d{13}$/.test(code) || code[0] !== INTERNAL_PREFIX) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code.charCodeAt(12) - 48;
}
