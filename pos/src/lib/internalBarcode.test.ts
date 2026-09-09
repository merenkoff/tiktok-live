// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { isInternalBarcode } from './internalBarcode';

describe('isInternalBarcode', () => {
  it('recognises a minted store-local code', () => {
    expect(isInternalBarcode('2900000000018')).toBe(true);
    expect(isInternalBarcode(' 2900000000018 ')).toBe(true);
  });

  it('leaves real barcodes alone', () => {
    // A manufacturer's EAN-13 — enrichment must still run for these.
    expect(isInternalBarcode('4820270362877')).toBe(false);
    expect(isInternalBarcode('29123456')).toBe(false);
    expect(isInternalBarcode('290000000001')).toBe(false);
    expect(isInternalBarcode('29000000000180')).toBe(false);
    expect(isInternalBarcode('')).toBe(false);
    expect(isInternalBarcode(null)).toBe(false);
    expect(isInternalBarcode('не-код')).toBe(false);
  });
});
