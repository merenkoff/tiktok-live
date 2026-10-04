// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { tileCompareAt } from './tilePrice';

const v = (price_cents: number, compare_at_cents: number | null = null) => ({ price_cents, compare_at_cents });

describe('tileCompareAt — the old price a tile may show beside its (cheapest) price', () => {
  it('shows the markdown of a one-variant card', () => {
    expect(tileCompareAt([v(45000, 59000)])).toBe(59000);
  });

  it('shows it when every size shares the price and the old price', () => {
    expect(tileCompareAt([v(45000, 59000), v(45000, 59000), v(45000, 59000)])).toBe(59000);
  });

  it('stays silent when the cheapest size is not the marked-down one', () => {
    // «від 450» is a size that was always 450; the 690 → 550 markdown belongs
    // to another size and the picker says it there.
    expect(tileCompareAt([v(45000), v(55000, 69000)])).toBeNull();
  });

  it('stays silent when sizes at the shown price disagree about the old price', () => {
    expect(tileCompareAt([v(45000, 59000), v(45000)])).toBeNull();
    expect(tileCompareAt([v(45000, 59000), v(45000, 65000)])).toBeNull();
  });

  it('ignores an old price that is not above the price, and an empty card', () => {
    expect(tileCompareAt([v(45000, 45000)])).toBeNull();
    expect(tileCompareAt([])).toBeNull();
  });

  it('follows the cheapest size when the dearer ones are not marked down', () => {
    expect(tileCompareAt([v(45000, 59000), v(70000)])).toBe(59000);
  });
});
