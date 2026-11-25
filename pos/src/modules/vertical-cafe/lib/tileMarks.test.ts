// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { tileMarkOf } from './tileMarks';

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

  it('puts a blocked word first, whichever module said it', () => {
    expect(
      tileMarkOf(pizza, {
        a: { 10: { text: '≈30 хв', blocked: false } },
        b: { 11: { text: 'пауза', blocked: true } },
      })
    ).toEqual({ text: 'пауза', blocked: true });
  });
});
