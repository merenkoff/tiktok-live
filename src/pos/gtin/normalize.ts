// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/normalize.ts — GTIN/EAN/UPC normalization + check digit

export type NormalizeGtinResult =
  | { ok: true; gtin: string; digits: string }
  | { ok: false; reason: 'empty' | 'non_digits' | 'bad_length' | 'bad_check_digit' };

/** Strip spaces/dashes; keep digits only. */
export function extractDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * GS1 mod-10 check digit for a digit string WITHOUT the check digit.
 * Returns the expected check digit character.
 */
export function computeCheckDigit(bodyWithoutCheck: string): string {
  const digits = bodyWithoutCheck.split('').map((c) => Number(c));
  let sum = 0;
  // From rightmost of body, positions alternate weight 3,1,3,1...
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i;
    const weight = fromRight % 2 === 0 ? 3 : 1;
    sum += digits[i]! * weight;
  }
  const mod = sum % 10;
  return String(mod === 0 ? 0 : 10 - mod);
}

export function verifyCheckDigit(gtinWithCheck: string): boolean {
  if (gtinWithCheck.length < 2) return false;
  const body = gtinWithCheck.slice(0, -1);
  const check = gtinWithCheck.slice(-1);
  return computeCheckDigit(body) === check;
}

/**
 * Normalize barcode to a canonical GTIN string used as cache key.
 * Accepts EAN-8, UPC-A (12), EAN-13, GTIN-14.
 * Pads UPC-A to 13 with leading 0 for storage consistency when length is 12.
 */
export function normalizeGtin(raw: string | null | undefined): NormalizeGtinResult {
  if (raw == null) return { ok: false, reason: 'empty' };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  if (/[^\d\s\-.]/.test(trimmed) && extractDigits(trimmed).length === 0) {
    return { ok: false, reason: 'non_digits' };
  }

  let digits = extractDigits(trimmed);
  if (!digits) return { ok: false, reason: 'non_digits' };

  // Reject obvious garbage (too short/long)
  if (digits.length < 8 || digits.length > 14) {
    return { ok: false, reason: 'bad_length' };
  }

  // Pad UPC-A (12) to EAN-13
  if (digits.length === 12) {
    digits = `0${digits}`;
  }

  // GTIN-14 / EAN-13 / EAN-8 — verify check digit
  if (digits.length === 8 || digits.length === 13 || digits.length === 14) {
    if (!verifyCheckDigit(digits)) {
      return { ok: false, reason: 'bad_check_digit' };
    }
    return { ok: true, gtin: digits, digits };
  }

  // length 9–11 after strip: invalid for retail GTIN
  return { ok: false, reason: 'bad_length' };
}

/** Heuristic for UI: looks like a barcode scan/query (digits, len >= 8). */
export function looksLikeBarcode(value: string): boolean {
  return /^\d{8,14}$/.test(value.trim());
}
