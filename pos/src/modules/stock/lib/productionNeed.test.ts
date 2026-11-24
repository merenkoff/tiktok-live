// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { productionNeed, productionRuns } from './productionNeed';

describe('productionNeed — what a production run takes', () => {
  it('multiplies a per-unit recipe as it always did', () => {
    expect(productionNeed(5, 3)).toBe(15);
    expect(productionRuns(17, 5)).toBe(3);
  });

  it('divides a recipe written for a batch («вихід») and rounds once', () => {
    // Garlic sauce: 700 г mayonnaise for 905 г of sauce.
    expect(productionNeed(700, 905, 905)).toBe(700);
    expect(productionNeed(700, 100, 905)).toBe(77); // 77.35
    expect(productionNeed(10, 100, 1900)).toBe(1); // 0.53 — never rounded away
    expect(productionRuns(2000, 700, 905)).toBe(2585); // grams of sauce the mayonnaise allows
    expect(productionNeed(700, 0, 905)).toBe(0);
  });
});
