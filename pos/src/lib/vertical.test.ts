// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The client's view of the sales verticals is a hand-written mirror of the
// backend registry (`src/pos/verticals`), exactly like the module id lists in
// `modules/constants.test.ts`. This test is what keeps the two honest: it
// imports the real definitions and compares.

import { describe, expect, it } from 'vitest';
import { clothingVertical } from '../../../src/pos/verticals/clothing';
import { cafeVertical } from '../../../src/pos/verticals/cafe';
import { flowersVertical } from '../../../src/pos/verticals/flowers';
import { DEFAULT_VERTICAL, VERTICAL_OPTIONS, verticalTitle } from './vertical';

describe('DEFAULT_VERTICAL', () => {
  it('is the backend clothing definition, field for field', () => {
    // What a till assumes when its cached auth predates verticals. If these
    // drift, a cold-offline florist shows clothing fields that the server then
    // rejects on the next write.
    expect(DEFAULT_VERTICAL.id).toBe(clothingVertical.id);
    expect(DEFAULT_VERTICAL.title).toBe(clothingVertical.title);
    expect(DEFAULT_VERTICAL.attributes).toEqual(clothingVertical.attributes);
    expect(DEFAULT_VERTICAL.units).toEqual([...clothingVertical.units]);
    expect(DEFAULT_VERTICAL.defaultUnit).toBe(clothingVertical.units[0]);
    expect(DEFAULT_VERTICAL.maxCompositionDepth).toBe(clothingVertical.maxCompositionDepth);
  });
});

describe('VERTICAL_OPTIONS', () => {
  it('lists every vertical the backend ships, with its title', () => {
    expect(VERTICAL_OPTIONS).toEqual([
      { id: clothingVertical.id, title: clothingVertical.title },
      { id: flowersVertical.id, title: flowersVertical.title },
      { id: cafeVertical.id, title: cafeVertical.title },
    ]);
  });

  it('names a vertical, falling back to the raw id', () => {
    expect(verticalTitle('flowers')).toBe('Квіти');
    // A store on a vertical this build has not shipped yet still renders.
    expect(verticalTitle('bakery')).toBe('bakery');
  });
});
