// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { isGoodsBarcode, linesNeedingStamps, normalizeExciseLabel, stampsMissing } from './excise';

// The same cases in `src/__tests__/pos.excise.test.ts` and
// `pos/src/lib/excise.test.ts`: the bar's scanner typed the first rows on
// 2026-11-04 — «Хлібний дар» (EAN 4820080720577, stamp ANFC015604) and
// «Кагор» (4820236720017, AICY275034), each under the English and the
// Ukrainian keyboard layout.
const STAMP_CASES: Array<[string, string | null]> = [
  ['ANFC015604', 'ANFC015604'],
  ['ФТАС015604', 'ANFC015604'],
  ['AICY275034', 'AICY275034'],
  ['ФШСН275034', 'AICY275034'],
  ['фшсн275034', 'AICY275034'],
  [' aate508932   0000412168 ', 'AATE508932 0000412168'],
  ['ФФЕУ508932 0000412168', 'AATE508932 0000412168'],
  ['4820080720577', null],
  ['4820236720017', null],
  ['1234567', null],
  ['ABCDEFGHIJ', null],
  ['AATE-508932', null],
  ['ХЖЄЮ015604', null],
  ['', null],
];

describe('normalizeExciseLabel — the server’s rule (ДК4, Д9, real scans)', () => {
  it.each(STAMP_CASES)('%j → %j', (raw, stored) => {
    expect(normalizeExciseLabel(raw)).toBe(stored);
  });

  it('tells a bottle’s own barcode from a misread', () => {
    expect(isGoodsBarcode('4820080720577')).toBe(true);
    expect(isGoodsBarcode('4820080720578')).toBe(false);
    expect(isGoodsBarcode('ANFC015604')).toBe(false);
  });
});

describe('stamps a cart still needs', () => {
  it('counts per bottle on goods sold with a stamp per unit only', () => {
    expect(stampsMissing({ quantity: 2, excise_per_unit: true, excise_labels: ['A1234567'] })).toBe(1);
    expect(stampsMissing({ quantity: 2 })).toBe(0);
    const lines = [
      { quantity: 1, excise_per_unit: true },
      { quantity: 1, excise_per_unit: true, excise_labels: ['A1234567'] },
      { quantity: 1, excise_per_unit: true, excise_labels: ['A1234567', 'B1234567'] },
      { quantity: 3 },
    ];
    expect(linesNeedingStamps(lines)).toEqual([lines[0], lines[2]]);
  });
});
