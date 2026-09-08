// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  computeCheckDigit,
  looksLikeBarcode,
  normalizeGtin,
  toDisplayGtin,
  verifyCheckDigit,
} from '../pos/gtin/normalize.js';

function validEan13(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

describe('gtin normalize', () => {
  it('rejects empty', () => {
    expect(normalizeGtin('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeGtin('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeGtin(null)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects non-digits / garbage', () => {
    expect(normalizeGtin('abc')).toEqual({ ok: false, reason: 'non_digits' });
    expect(normalizeGtin('12')).toEqual({ ok: false, reason: 'bad_length' });
  });

  it('accepts valid EAN-13 Coca-Cola sample and strips spaces', () => {
    // 5449000000996 is a known valid EAN-13 pattern — use computed check
    const body = '544900000099';
    const check = computeCheckDigit(body);
    const ean = `${body}${check}`;
    expect(verifyCheckDigit(ean)).toBe(true);
    const r = normalizeGtin(` ${ean} `);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.display).toBe(ean);
      expect(r.canonical).toBe(`0${ean}`);
    }
  });

  it('pads UPC-A (12) to 13 with leading zero when check valid', () => {
    // UPC-A 049000006346 — classic coke; as 12 digits with check
    const upc12 = '049000006346';
    expect(upc12).toHaveLength(12);
    expect(verifyCheckDigit(upc12)).toBe(true);
    const r = normalizeGtin(upc12);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.display).toBe(`0${upc12}`);
      expect(r.display).toHaveLength(13);
      expect(verifyCheckDigit(r.display)).toBe(true);
      expect(r.canonical).toBe(`00${upc12}`);
    }
  });

  it('rejects bad check digit', () => {
    // Force known bad: flip last digit of a valid code
    const body = '400638133393';
    const good = `${body}${computeCheckDigit(body)}`;
    const bad = `${body}${good.slice(-1) === '0' ? '1' : '0'}`;
    expect(normalizeGtin(bad)).toEqual({ ok: false, reason: 'bad_check_digit' });
  });

  it('accepts EAN-8 with valid check', () => {
    const body = '4012345';
    const ean8 = `${body}${computeCheckDigit(body)}`;
    expect(ean8).toHaveLength(8);
    const r = normalizeGtin(ean8);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // EAN-8 keeps its short form for provider queries…
      expect(r.display).toBe(ean8);
      // …and still lands under a 14-digit key.
      expect(r.canonical).toBe(ean8.padStart(14, '0'));
    }
  });

  it('canonical is always GTIN-14 and round-trips through display', () => {
    const codes = [
      `4012345${computeCheckDigit('4012345')}`,
      '049000006346',
      validEan13('544900000099'),
      `0${validEan13('482000000001')}`,
    ];
    for (const code of codes) {
      const r = normalizeGtin(code);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.canonical).toMatch(/^\d{14}$/);
      expect(verifyCheckDigit(r.canonical)).toBe(true);
      expect(toDisplayGtin(r.canonical)).toBe(r.display);
      // display is itself a valid barcode, and normalizes back to the same key
      const again = normalizeGtin(r.display);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.canonical).toBe(r.canonical);
    }
  });

  it('collapses EAN-13 and its GTIN-14 form onto one key', () => {
    const ean13 = validEan13('482000000001');
    const a = normalizeGtin(ean13);
    const b = normalizeGtin(`0${ean13}`);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.canonical).toBe(b.canonical);
      expect(a.canonical).toBe(`0${ean13}`);
    }
  });

  it('keeps a real indicator digit as a separate item', () => {
    const ean13 = validEan13('482000000001');
    const caseBody = `1${ean13.slice(0, 12)}`;
    const caseGtin = `${caseBody}${computeCheckDigit(caseBody)}`;
    const item = normalizeGtin(ean13);
    const box = normalizeGtin(caseGtin);
    expect(item.ok && box.ok).toBe(true);
    if (item.ok && box.ok) {
      expect(box.canonical).not.toBe(item.canonical);
      // A code with a non-zero indicator digit is already 14 wide — no padding.
      expect(box.display).toBe(caseGtin);
    }
  });

  it('looksLikeBarcode heuristic', () => {
    expect(looksLikeBarcode('12345678')).toBe(true);
    expect(looksLikeBarcode('бодик')).toBe(false);
    expect(looksLikeBarcode('123')).toBe(false);
  });
});
