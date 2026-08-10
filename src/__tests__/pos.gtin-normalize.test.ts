import { describe, expect, it } from 'vitest';
import {
  computeCheckDigit,
  looksLikeBarcode,
  normalizeGtin,
  verifyCheckDigit,
} from '../pos/gtin/normalize.js';

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
    if (r.ok) expect(r.gtin).toBe(ean);
  });

  it('pads UPC-A (12) to 13 with leading zero when check valid', () => {
    // UPC-A 049000006346 — classic coke; as 12 digits with check
    const upc12 = '049000006346';
    expect(upc12).toHaveLength(12);
    expect(verifyCheckDigit(upc12)).toBe(true);
    const r = normalizeGtin(upc12);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.gtin).toBe(`0${upc12}`);
      expect(r.gtin).toHaveLength(13);
      expect(verifyCheckDigit(r.gtin)).toBe(true);
    }
  });

  it('rejects bad check digit', () => {
    const r = normalizeGtin('5449000000990'); // wrong check if body needs other digit
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
    if (r.ok) expect(r.gtin).toBe(ean8);
  });

  it('looksLikeBarcode heuristic', () => {
    expect(looksLikeBarcode('12345678')).toBe(true);
    expect(looksLikeBarcode('бодик')).toBe(false);
    expect(looksLikeBarcode('123')).toBe(false);
  });
});
