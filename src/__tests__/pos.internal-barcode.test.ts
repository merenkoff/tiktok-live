// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  BarcodeRangeError,
  ean13CheckDigit,
  internalBarcodeFor,
  isInternalBarcode,
} from '../pos/core/internalBarcode.js';

/**
 * A wrong check digit cannot be caught downstream, only reported: the client's
 * `isEan13` verifies it and a price tag then prints no bars at all, which is
 * the right answer for a code someone typed in and no answer at all for one
 * this module minted. So the maths is pinned here against codes whose check
 * digit is publicly known — the same arithmetic the client runs.
 */
describe('internal EAN-13', () => {
  it('computes the check digit real barcodes agree on', () => {
    // Published examples: the check digit is the last character of each.
    for (const code of [
      '4820000000017',
      '5901234123457',
      '9780306406157',
      '4006381333931',
    ]) {
      expect(ean13CheckDigit(code.slice(0, 12))).toBe(Number(code[12]));
    }
  });

  it('issues a code in GS1 restricted circulation, keyed on the variant id', () => {
    const code = internalBarcodeFor(42);

    expect(code).toHaveLength(13);
    expect(code.startsWith('2')).toBe(true);
    expect(code.slice(0, 12)).toBe('200000000042');
    expect(ean13CheckDigit(code.slice(0, 12))).toBe(Number(code[12]));
  });

  it('never issues the same code for two variants', () => {
    // The point of deriving it from the id rather than a counter: two tills
    // assembling at the same moment cannot collide without talking.
    const codes = new Set([1, 2, 99, 100, 123456, 9_999_999].map(internalBarcodeFor));
    expect(codes.size).toBe(6);
  });

  it('recognises its own codes and rejects everything else', () => {
    expect(isInternalBarcode(internalBarcodeFor(7))).toBe(true);
    // A real manufacturer's code — the prefix is exactly what keeps the two
    // spaces apart.
    expect(isInternalBarcode('4820000000017')).toBe(false);
    // Right prefix, wrong check digit: a tag that looks fine and scans as junk.
    expect(isInternalBarcode('2000000000420')).toBe(false);
    expect(isInternalBarcode('20000000004')).toBe(false);
    expect(isInternalBarcode('')).toBe(false);
  });

  it('refuses an id that cannot fit', () => {
    expect(() => internalBarcodeFor(0)).toThrow(BarcodeRangeError);
    expect(() => internalBarcodeFor(-1)).toThrow(BarcodeRangeError);
    expect(() => internalBarcodeFor(1.5)).toThrow(BarcodeRangeError);
    // Twelve digits: one more than the body can hold, and silently truncating
    // would hand two bouquets the same tag.
    expect(() => internalBarcodeFor(100_000_000_000)).toThrow(BarcodeRangeError);
  });
});
