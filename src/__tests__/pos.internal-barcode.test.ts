// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  INTERNAL_BARCODE_MAX_PAYLOAD,
  buildInternalBarcode,
  isInternalBarcode,
} from '../pos/gtin/internal-code.js';
import { computeCheckDigit, verifyCheckDigit } from '../pos/gtin/normalize.js';

/**
 * The one place the store's own EAN-13 is made — a garment's tag, the owner's
 * «Згенерувати» button and a florist's showcase bouquet all come through it.
 *
 * A wrong check digit cannot be caught downstream, only reported: the client's
 * `isEan13` verifies it and a price tag then prints no bars at all, which is
 * the right answer for a code someone typed in and no answer at all for one
 * we minted. So the maths is pinned against codes whose check digit is
 * publicly known — the same arithmetic the client runs.
 */
describe('internal EAN-13', () => {
  it('computes the check digit real barcodes agree on', () => {
    for (const code of ['4820000000017', '5901234123457', '9780306406157', '4006381333931']) {
      expect(computeCheckDigit(code.slice(0, 12))).toBe(code[12]);
    }
  });

  it('issues `29` + a ten-digit counter + check digit', () => {
    const code = buildInternalBarcode(42);

    expect(code).toHaveLength(13);
    expect(code.slice(0, 12)).toBe('290000000042');
    expect(verifyCheckDigit(code)).toBe(true);
  });

  it('stays out of the weighed-goods and reserved prefixes for every counter value', () => {
    // GS1 Ukraine: `20`–`23` are a scale's price/weight codes, read apart by
    // prefix at the till; `24`–`28` are reserved. The old showcase code was
    // `2` + the variant id — `20…` for every id a shop will ever reach.
    for (const n of [0, 1, 7, 99, 123_456, 9_999_999, INTERNAL_BARCODE_MAX_PAYLOAD]) {
      const prefix = buildInternalBarcode(n).slice(0, 2);
      expect(prefix).toBe('29');
    }
  });

  it('recognises its own codes and rejects everything else', () => {
    expect(isInternalBarcode(buildInternalBarcode(7))).toBe(true);
    // A real manufacturer's code — the prefix keeps the two spaces apart.
    expect(isInternalBarcode('4820000000017')).toBe(false);
    // The retired `2` + id form: a valid EAN-13, and exactly what a scale's
    // `20` parse would take apart.
    const legacy = `200000000042${computeCheckDigit('200000000042')}`;
    expect(verifyCheckDigit(legacy)).toBe(true);
    expect(isInternalBarcode(legacy)).toBe(false);
    // Right prefix, wrong check digit: a tag that looks fine and scans as junk.
    expect(isInternalBarcode('2900000000420')).toBe(false);
    expect(isInternalBarcode('')).toBe(false);
  });

  it('refuses a counter that cannot fit rather than emit a fourteenth digit', () => {
    expect(() => buildInternalBarcode(-1)).toThrow();
    expect(() => buildInternalBarcode(1.5)).toThrow();
    expect(() => buildInternalBarcode(INTERNAL_BARCODE_MAX_PAYLOAD + 1)).toThrow();
  });
});
