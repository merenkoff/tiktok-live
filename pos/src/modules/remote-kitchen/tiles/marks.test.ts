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

  it('greys every kitchen dish on a pause or a paused link', () => {
    expect(cafeTileMarks(cafe({ kitchen: { accepting: false, load_minutes: 0 } }), true)?.[10]).toEqual({
      text: 'пауза',
      blocked: true,
    });
    expect(cafeTileMarks(cafe({ link: { status: 'paused', transit_minutes: 15 } }), true)?.[11]).toEqual({
      text: 'кухня вимкнена',
      blocked: true,
    });
  });

  it('offline still sells the dish, after a call — but not over a paused link', () => {
    // The kitchen's pause is not known offline, and on the phone it can say yes.
    expect(cafeTileMarks(cafe({ kitchen: { accepting: false } }), false)?.[10]).toEqual({
      text: 'дзвінок на кухню',
      blocked: false,
    });
    expect(cafeTileMarks(cafe({ link: { status: 'paused' } }), false)?.[10]).toEqual({
      text: 'кухня вимкнена',
      blocked: true,
    });
  });

  it('says «немає на кухні» on a dish the kitchen stopped or retired, and only on it', () => {
    const marks = cafeTileMarks(
      cafe({
        items: [
          { cafe_variant_id: 10, prep_minutes: 12, available: false },
          { cafe_variant_id: 11, prep_minutes: 12, available: true },
        ],
      }),
      true
    );
    expect(marks?.[10]).toEqual({ text: 'немає на кухні', blocked: true });
    expect(marks?.[11]).toEqual({ text: 'кухня ≈35 хв', blocked: false });
    // An older server says nothing of it: the dish reads as available.
    expect(cafeTileMarks(cafe(), true)?.[10]?.blocked).toBe(false);
    // Offline a stop list read earlier is not trusted over a call: the kitchen says on the phone.
    expect(
      cafeTileMarks(cafe({ items: [{ cafe_variant_id: 10, prep_minutes: 12, available: false }] }), false)?.[10]
    ).toEqual({ text: 'дзвінок на кухню', blocked: false });
  });

  it('marks nothing in a store that asks no kitchen, or marked no dish', () => {
    expect(cafeTileMarks(null, true)).toBeNull();
    expect(cafeTileMarks(cafe({ items: [] }), true)).toBeNull();
  });
});
