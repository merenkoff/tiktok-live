// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/internal-code.ts — store-local barcodes we mint ourselves

import { computeCheckDigit, normalizeGtin } from './normalize.js';

/**
 * GS1 reserves EAN-13 prefixes 20–29 for restricted distribution — codes a shop
 * assigns itself, which no manufacturer will ever be issued. Within that range
 * GS1 Ukraine gives `20`–`23` to variable-measure items (a scale prints the
 * article and the weight or price into the code, and the till reads them back
 * by prefix), keeps `24`–`28` in reserve, and leaves `29` for a shop's own
 * fixed codes. So `29`, and nothing else: a code of ours in `20…` would be
 * taken apart as a weighed item the day a grocery's parse table is switched on.
 *
 * Every code this backend mints goes through here — a garment's
 * (`VerticalDefinition.autoBarcode`), the owner's «Згенерувати» button and a
 * florist's showcase bouquet alike — so there is one range to keep clear.
 */
export const INTERNAL_BARCODE_PREFIX = '29';

/** Digits between the prefix and the check digit: 13 − 2 − 1. */
export const INTERNAL_BARCODE_PAYLOAD_LENGTH = 10;

/** Largest counter value the payload can hold. */
export const INTERNAL_BARCODE_MAX_PAYLOAD = 10 ** INTERNAL_BARCODE_PAYLOAD_LENGTH - 1;

/**
 * Build a full EAN-13 from a counter value.
 *
 * Throws past the ceiling rather than silently emitting a 14-digit string that
 * would then be read as a GTIN-14 of something else entirely.
 */
export function buildInternalBarcode(payload: number | string): string {
  const n = typeof payload === 'number' ? payload : Number(payload);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`internal barcode payload must be a non-negative integer, got ${payload}`);
  }
  if (n > INTERNAL_BARCODE_MAX_PAYLOAD) {
    throw new Error(`internal barcode counter exhausted at ${INTERNAL_BARCODE_MAX_PAYLOAD}`);
  }
  const body = `${INTERNAL_BARCODE_PREFIX}${String(n).padStart(INTERNAL_BARCODE_PAYLOAD_LENGTH, '0')}`;
  return `${body}${computeCheckDigit(body)}`;
}

/**
 * Is this one of ours?
 *
 * Tested against the **display** form, not the stored key: the GTIN cache
 * canonicalizes to GTIN-14, where our `29…` has already become `029…`. Going
 * through `normalizeGtin` means the answer is the same whichever form the
 * caller happens to hold.
 */
export function isInternalBarcode(code: string | null | undefined): boolean {
  if (!code) return false;
  const norm = normalizeGtin(code);
  if (!norm.ok) return false;
  return new RegExp(`^${INTERNAL_BARCODE_PREFIX}\\d{11}$`).test(norm.display);
}
