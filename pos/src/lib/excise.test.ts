// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { linesNeedingStamps, normalizeExciseLabel, stampsMissing } from './excise';

describe('normalizeExciseLabel — the server’s loose rule (ДК4, Д9)', () => {
  it('upper-cases and folds spaces, as the server stores it', () => {
    expect(normalizeExciseLabel(' aate508932   0000412168 ')).toBe('AATE508932 0000412168');
    expect(normalizeExciseLabel('АБВГ508932 0000412168')).toBe('АБВГ508932 0000412168');
  });

  it('refuses what cannot be a stamp', () => {
    expect(normalizeExciseLabel('1234567')).toBeNull();
    expect(normalizeExciseLabel('ABCDEFGHIJ')).toBeNull();
    expect(normalizeExciseLabel('AATE-508932')).toBeNull();
    expect(normalizeExciseLabel('')).toBeNull();
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
