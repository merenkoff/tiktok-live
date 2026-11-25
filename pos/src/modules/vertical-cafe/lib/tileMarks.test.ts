// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { blockedVariantIds, tileMarkOf } from './tileMarks';

const pizza = [{ variant_id: 10 }, { variant_id: 11 }];

describe('tileMarkOf', () => {
  it('is nothing on a host with no marks, or for a dish nobody marked', () => {
    expect(tileMarkOf(pizza, undefined)).toBeNull();
    expect(tileMarkOf(pizza, { 'remote-kitchen': { 99: { text: '≈30 хв', blocked: false } } })).toBeNull();
  });

  it('finds the word on any of the product’s variants', () => {
    expect(tileMarkOf(pizza, { 'remote-kitchen': { 11: { text: '≈35 хв', blocked: false } } })).toEqual({
      text: '≈35 хв',
      blocked: false,
    });
  });

  it('greys the tile only when every size is blocked, whichever module said it', () => {
    const both = {
      a: { 10: { text: 'пауза', blocked: true } },
      b: { 11: { text: 'потрібна мережа', blocked: true } },
    };
    expect(tileMarkOf(pizza, both)).toEqual({ text: 'пауза', blocked: true });
    expect([...blockedVariantIds(pizza, both)].sort()).toEqual([10, 11]);
  });

  it('keeps a tile live while one size still sells: the blocked one is only left out', () => {
    // 30 см from the cafe's own oven, 50 см from the paused kitchen.
    const half = { 'remote-kitchen': { 11: { text: 'пауза', blocked: true } } };
    expect(tileMarkOf(pizza, half)).toBeNull();
    expect([...blockedVariantIds(pizza, half)]).toEqual([11]);
    // A neutral word on the size that still sells is what the tile says.
    const mixed = {
      a: { 10: { text: 'кухня ≈30 хв', blocked: false } },
      b: { 11: { text: 'пауза', blocked: true } },
    };
    expect(tileMarkOf(pizza, mixed)).toEqual({ text: 'кухня ≈30 хв', blocked: false });
  });
});
