// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { formatUah, uahToCents } from '../pos/core/money.js';

describe('POS money', () => {
  it('formats UAH', () => {
    expect(formatUah(69000)).toBe('690,00 ₴');
    expect(formatUah(0)).toBe('0,00 ₴');
  });

  it('converts UAH to cents', () => {
    expect(uahToCents(690)).toBe(69000);
    expect(uahToCents(10.5)).toBe(1050);
  });
});
