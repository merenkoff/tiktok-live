// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINTER_ENCODING,
  ENCODING_PRESETS,
  ENCODING_TABLES,
  MAX_SWEEP,
  effectiveEscT,
  encodingTitle,
  normalizeEncoding,
  parseEscT,
  presetCandidates,
  printerEncodingMetaKey,
  sameEncoding,
  sweepCandidates,
} from './printerEncoding';

describe('the tables', () => {
  it("carry Epson's numbers — the same ones the Rust side pins as `standard_number`", () => {
    // src-tauri/src/hardware/encoding.rs: the_standard_numbers_are_epsons.
    expect(Object.fromEntries(ENCODING_TABLES.map((t) => [t.id, t.standard]))).toEqual({
      windows1251: 46,
      cp866: 17,
      cp1125: 44,
    });
  });

  it('says what a profile selects, by its own number or the standard one', () => {
    expect(effectiveEscT(DEFAULT_PRINTER_ENCODING)).toBe(46);
    expect(effectiveEscT({ table: 'cp866', esc_t: null })).toBe(17);
    expect(effectiveEscT({ table: 'cp866', esc_t: 73 })).toBe(73);
    expect(encodingTitle({ table: 'cp866', esc_t: null })).toBe('CP866 · таблиця 17');
    expect(encodingTitle({ table: 'windows1251', esc_t: 6 })).toBe('Windows-1251 · таблиця 6');
  });

  it('treats an explicit standard number as the standard profile', () => {
    expect(sameEncoding({ table: 'windows1251', esc_t: 46 }, DEFAULT_PRINTER_ENCODING)).toBe(true);
    expect(sameEncoding({ table: 'windows1251', esc_t: 73 }, DEFAULT_PRINTER_ENCODING)).toBe(false);
    expect(sameEncoding({ table: 'cp866', esc_t: null }, DEFAULT_PRINTER_ENCODING)).toBe(false);
  });
});

describe('normalizeEncoding', () => {
  it('keeps a good profile', () => {
    expect(normalizeEncoding({ table: 'cp866', esc_t: 73 })).toEqual({ table: 'cp866', esc_t: 73 });
    expect(normalizeEncoding({ table: 'cp1125', esc_t: 0 })).toEqual({ table: 'cp1125', esc_t: 0 });
    expect(normalizeEncoding({ table: 'cp866', esc_t: 255 })).toEqual({ table: 'cp866', esc_t: 255 });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'cp866'],
    ['a number', 7],
    ['an empty object', {}],
  ])('is the default for %s', (_label, raw) => {
    expect(normalizeEncoding(raw)).toEqual(DEFAULT_PRINTER_ENCODING);
  });

  it('repairs piece by piece: a bad number or an unknown table never reaches the printer', () => {
    expect(normalizeEncoding({ table: 'cp866', esc_t: 300 })).toEqual({ table: 'cp866', esc_t: null });
    expect(normalizeEncoding({ table: 'cp866', esc_t: -1 })).toEqual({ table: 'cp866', esc_t: null });
    expect(normalizeEncoding({ table: 'cp866', esc_t: 4.5 })).toEqual({ table: 'cp866', esc_t: null });
    expect(normalizeEncoding({ table: 'cp866', esc_t: '17' })).toEqual({ table: 'cp866', esc_t: null });
    expect(normalizeEncoding({ table: 'koi8', esc_t: 12 })).toEqual({ table: 'windows1251', esc_t: 12 });
  });

  it('returns a fresh object, so editing it cannot change the default', () => {
    const a = normalizeEncoding(undefined);
    a.esc_t = 99;
    expect(DEFAULT_PRINTER_ENCODING.esc_t).toBeNull();
  });
});

describe('parseEscT', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['0', 0],
    ['46', 46],
    [' 17 ', 17],
    ['255', 255],
    ['256', 'invalid'],
    ['-1', 'invalid'],
    ['4.5', 'invalid'],
    ['abc', 'invalid'],
    ['1e2', 'invalid'],
    ['1234', 'invalid'],
  ])('reads %j as %j', (text, expected) => {
    expect(parseEscT(text)).toBe(expected);
  });
});

describe('the candidates a test sheet prints', () => {
  it('start with the three standard profiles, lettered the way the screen lists them', () => {
    expect(presetCandidates()).toEqual([
      { table: 'windows1251', esc_t: null, label: 'A' },
      { table: 'cp866', esc_t: null, label: 'B' },
      { table: 'cp1125', esc_t: null, label: 'C' },
    ]);
    expect(ENCODING_PRESETS.map((p) => p.letter)).toEqual(['A', 'B', 'C']);
  });

  it('sweep one table over a range of numbers, ends included', () => {
    const rows = sweepCandidates('cp866', 0, 80);
    expect(rows).toHaveLength(81);
    expect(rows[0]).toEqual({ table: 'cp866', esc_t: 0 });
    expect(rows[80]).toEqual({ table: 'cp866', esc_t: 80 });
    expect(sweepCandidates('windows1251', 46, 46)).toEqual([{ table: 'windows1251', esc_t: 46 }]);
  });

  it('clamp to a byte, swap a backwards range and never exceed the cap', () => {
    expect(sweepCandidates('cp866', 10, 5).map((r) => r.esc_t)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(sweepCandidates('cp866', -20, 2).map((r) => r.esc_t)).toEqual([0, 1, 2]);
    expect(sweepCandidates('cp866', 250, 900).map((r) => r.esc_t)).toEqual([250, 251, 252, 253, 254, 255]);
    expect(sweepCandidates('cp866', 0, 255)).toHaveLength(MAX_SWEEP);
  });
});

describe('where a profile is kept', () => {
  it('is per printer, so a café’s kitchen and bar can differ', () => {
    expect(printerEncodingMetaKey('Kitchen-1')).toBe('printerEncoding:Kitchen-1');
    expect(printerEncodingMetaKey('Kitchen-1')).not.toBe(printerEncodingMetaKey('Bar-1'));
  });
});
