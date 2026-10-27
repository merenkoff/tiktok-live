// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  CASHALOT_LETTER_CODES,
  configFromDraft,
  defaultLetterFor,
  draftFromConfig,
  freeLetters,
  letterCode,
} from './taxTable';

describe('taxTable', () => {
  it('maps the fourteen letters to the ASCII codes default_tax_code stores', () => {
    expect(Object.keys(CASHALOT_LETTER_CODES)).toHaveLength(14);
    expect(letterCode('А')).toBe('A');
    expect(letterCode(' є ')).toBe('YE');
    expect(letterCode('A')).toBeNull();
    expect(letterCode('')).toBeNull();
  });

  it('shows the stored config as typed and sends it back parsed', () => {
    const draft = draftFromConfig({ taxes: [{ letter: 'А', name: 'ПДВ', rate: 20, type: 0 }], testing: true });
    expect(draft).toEqual({ taxes: [{ letter: 'А', name: 'ПДВ', rate: '20' }], testing: true });
    expect(configFromDraft({ ...draft, taxes: [{ letter: ' б', name: ' Без ПДВ ', rate: '0' }] })).toEqual({
      taxes: [{ letter: 'б', name: 'Без ПДВ', rate: 0 }],
      testing: true,
    });
  });

  it('reads a comma decimal and leaves an unreadable rate for the server to name', () => {
    const taxes = configFromDraft({
      taxes: [
        { letter: 'А', name: 'ПДВ', rate: '7,5' },
        { letter: 'Б', name: 'ПДВ', rate: 'двадцять' },
        { letter: 'В', name: 'ПДВ', rate: '' },
      ],
      testing: false,
    }).taxes as Array<{ rate: unknown }>;
    expect(taxes.map((t) => t.rate)).toEqual([7.5, 'двадцять', '']);
  });

  it('survives a config with no table or a malformed row', () => {
    expect(draftFromConfig(null)).toEqual({ taxes: [], testing: false });
    expect(draftFromConfig({ taxes: 'x' })).toEqual({ taxes: [], testing: false });
    expect(draftFromConfig({ taxes: [null, { letter: 5 }] }).taxes).toEqual([
      { letter: '', name: '', rate: '' },
      { letter: '', name: '', rate: '' },
    ]);
  });

  it('finds the default row by its code, by its letter, in any case — or not at all', () => {
    const taxes = [
      { letter: 'А', name: 'ПДВ', rate: '20' },
      { letter: 'є', name: 'ПДВ', rate: '7' },
    ];
    expect(defaultLetterFor('A', taxes)).toBe('А');
    expect(defaultLetterFor('ye', taxes)).toBe('Є');
    expect(defaultLetterFor('А', taxes)).toBe('А');
    expect(defaultLetterFor('B', taxes)).toBeNull();
    expect(defaultLetterFor(null, taxes)).toBeNull();
  });

  it('offers a row every letter the other rows do not hold', () => {
    const taxes = [
      { letter: 'А', name: '', rate: '' },
      { letter: 'Б', name: '', rate: '' },
    ];
    expect(freeLetters(taxes, 0)).toContain('А');
    expect(freeLetters(taxes, 0)).not.toContain('Б');
    expect(freeLetters(taxes, 2)).toHaveLength(12);
  });
});
