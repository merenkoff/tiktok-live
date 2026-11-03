// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  CASHALOT_LETTER_CODES,
  configFromDraft,
  defaultLetterFor,
  draftFromConfig,
  emptyRow,
  freeLetters,
  letterCode,
  vatRows,
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

describe('the excise row (track ДК, ДК4)', () => {
  it('reads and sends the excise row with its kind, a VAT row as it always went', () => {
    const draft = draftFromConfig({
      taxes: [
        { letter: 'А', name: 'ПДВ', rate: 20 },
        { letter: 'Г', name: 'Акциз', rate: 5, type: 1 },
      ],
    });
    expect(draft.taxes[1].type).toBe(1);
    expect(configFromDraft(draft).taxes).toEqual([
      { letter: 'А', name: 'ПДВ', rate: 20 },
      { letter: 'Г', name: 'Акциз', rate: 5, type: 1 },
    ]);
    expect(emptyRow('Г', 1)).toEqual({ letter: 'Г', name: 'Акциз', rate: '5', type: 1 });
  });

  it('never makes the excise row the default rate', () => {
    const taxes = [
      { letter: 'А', name: 'ПДВ', rate: '20' },
      { letter: 'Г', name: 'Акциз', rate: '5', type: 1 as const },
    ];
    expect(defaultLetterFor('G', taxes)).toBeNull();
    expect(defaultLetterFor('A', taxes)).toBe('А');
    expect(vatRows(taxes).map((t) => t.letter)).toEqual(['А']);
  });
});
