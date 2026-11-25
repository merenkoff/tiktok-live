// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { cafeTileMarks, dishWord, roundUpToFive } from './marks';

const cafe = (over: Record<string, unknown> = {}) => ({
  link: { status: 'active', transit_minutes: 15 },
  kitchen: { accepting: true, load_minutes: 5 },
  items: [
    { cafe_variant_id: 10, prep_minutes: 12 },
    { cafe_variant_id: 11, prep_minutes: null },
  ],
  ...over,
});

describe('the words on the cafe’s kitchen-dish tiles', () => {
  it('rounds like the server', () => {
    expect(roundUpToFive(32)).toBe(35);
    expect(roundUpToFive(0)).toBe(5);
    expect(dishWord(12, 5, 15)).toBe('кухня ≈35 хв');
    expect(dishWord(null, 5, 15)).toBe('готує кухня');
  });

  it('gives each dish its own time: its cooking, the queue, the road', () => {
    expect(cafeTileMarks(cafe(), true)).toEqual({
      10: { text: 'кухня ≈35 хв', blocked: false },
      11: { text: 'готує кухня', blocked: false },
    });
  });

  it('greys every kitchen dish on a pause, a paused link, and offline — offline first', () => {
    expect(cafeTileMarks(cafe({ kitchen: { accepting: false, load_minutes: 0 } }), true)?.[10]).toEqual({
      text: 'пауза',
      blocked: true,
    });
    expect(cafeTileMarks(cafe({ link: { status: 'paused', transit_minutes: 15 } }), true)?.[11]).toEqual({
      text: 'кухня вимкнена',
      blocked: true,
    });
    expect(cafeTileMarks(cafe({ kitchen: { accepting: false } }), false)?.[10]).toEqual({
      text: 'потрібна мережа',
      blocked: true,
    });
  });

  it('marks nothing in a store that asks no kitchen, or marked no dish', () => {
    expect(cafeTileMarks(null, true)).toBeNull();
    expect(cafeTileMarks(cafe({ items: [] }), true)).toBeNull();
  });
});
