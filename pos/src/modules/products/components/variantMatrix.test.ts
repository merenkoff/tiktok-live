// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  buildCells,
  canonicalColour,
  cellKey,
  colourVocabulary,
  DEFAULT_SCALE_ID,
  existingKeys,
  foldKey,
  scaleById,
  SIZE_SCALES,
  supportsMatrix,
  tidy,
} from './variantMatrix';

const scale = (id: string) => scaleById(id).sizes;

describe('SIZE_SCALES — children first', () => {
  it('starts with the children\'s scales, and the first is the default', () => {
    expect(SIZE_SCALES.slice(0, 6).map((s) => s.id)).toEqual([
      'baby-height',
      'kid-height',
      'height-pairs',
      'months',
      'years',
      'year-pairs',
    ]);
    expect(DEFAULT_SCALE_ID).toBe('baby-height');
  });

  it('knows a baby\'s heights, in steps of six', () => {
    expect(scale('baby-height')).toEqual(['56', '62', '68', '74', '80', '86', '92']);
  });

  it('knows a child\'s heights up to 164', () => {
    const sizes = scale('kid-height');
    expect(sizes[0]).toBe('92');
    expect(sizes.at(-1)).toBe('164');
    expect(sizes).toHaveLength(13);
  });

  it('writes pairs of heights the way the shop does: neighbours, a hyphen, no spaces', () => {
    const pairs = scale('height-pairs');
    expect(pairs.slice(0, 4)).toEqual(['56-62', '62-68', '68-74', '74-80']);
    expect(pairs).toContain('98-104');
    expect(pairs.at(-1)).toBe('158-164');
    // Each pair starts where the last one ended.
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i]!.split('-')[0]).toBe(pairs[i - 1]!.split('-')[1]);
    }
  });

  it('has months and years, single and paired', () => {
    expect(scale('months')).toEqual(['0-3', '3-6', '6-9', '9-12', '12-18', '18-24']);
    expect(scale('years')[0]).toBe('1');
    expect(scale('years').at(-1)).toBe('14');
    expect(scale('year-pairs').slice(0, 3)).toEqual(['1-2', '2-3', '3-4']);
    expect(scale('year-pairs').at(-1)).toBe('13-14');
  });

  it('keeps the adult letters, trousers and both kinds of shoes', () => {
    expect(scale('adult')).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(scale('trousers')[0]).toBe('26');
    expect(scale('kids-shoes')[0]).toBe('16');
    expect(scale('shoes').at(-1)).toBe('45');
    expect(scale('one')).toEqual(['Універсальний']);
  });

  it('has no duplicate size inside one scale, and no empty one', () => {
    for (const s of SIZE_SCALES) {
      expect(s.sizes.length).toBeGreaterThan(0);
      expect(new Set(s.sizes).size).toBe(s.sizes.length);
    }
  });

  it('falls back to the first scale for an id it does not know', () => {
    expect(scaleById('nope').id).toBe('baby-height');
    expect(scaleById(null).id).toBe('baby-height');
  });
});

describe('supportsMatrix', () => {
  it('needs both colour and size', () => {
    expect(supportsMatrix([{ key: 'color' }, { key: 'size' }])).toBe(true);
    expect(supportsMatrix([{ key: 'color' }, { key: 'length_cm' }, { key: 'country' }])).toBe(false);
    expect(supportsMatrix([{ key: 'size' }])).toBe(false);
    expect(supportsMatrix([])).toBe(false);
    expect(supportsMatrix(undefined)).toBe(false);
  });
});

describe('tidy and foldKey', () => {
  it('collapses whitespace', () => {
    expect(tidy('  світло   рожевий ')).toBe('світло рожевий');
  });

  it('reads one size or colour however it was typed', () => {
    expect(foldKey('98/104')).toBe(foldKey('98-104'));
    expect(foldKey('98–104')).toBe(foldKey('98-104'));
    expect(foldKey('  Малиновий ')).toBe(foldKey('малиновий'));
    expect(foldKey('98-104')).not.toBe(foldKey('98'));
  });
});

describe('colourVocabulary', () => {
  const v = (color: unknown, is_active = true) => ({ is_active, attributes: { color } });

  it('counts colours across the store, most used first', () => {
    const vocab = colourVocabulary([
      { variants: [v('блакитний'), v('блакитний'), v('рожевий')] },
      { variants: [v('блакитний'), v('беж')] },
    ]);
    expect(vocab).toEqual([
      { name: 'блакитний', count: 3 },
      { name: 'беж', count: 1 },
      { name: 'рожевий', count: 1 },
    ]);
  });

  it('merges spellings that differ by case, keeping the most common one', () => {
    const vocab = colourVocabulary([
      { variants: [v('малиновий'), v('малиновий'), v('Малиновий'), v(' малиновий ')] },
    ]);
    expect(vocab).toEqual([{ name: 'малиновий', count: 4 }]);
  });

  it('ignores archived cards and variants, and variants with no colour', () => {
    const vocab = colourVocabulary([
      { is_active: false, variants: [v('зелений')] },
      { variants: [v('сірий', false), v(undefined), v(''), v('   '), v(7)] },
    ]);
    expect(vocab).toEqual([]);
  });
});

describe('canonicalColour', () => {
  const vocab = [
    { name: 'блакитний', count: 5 },
    { name: 'світло-рожевий', count: 2 },
  ];

  it('reuses the store\'s own spelling, whatever the case and spacing typed', () => {
    expect(canonicalColour('Блакитний', vocab)).toBe('блакитний');
    expect(canonicalColour('  БЛАКИТНИЙ ', vocab)).toBe('блакитний');
    expect(canonicalColour('Світло-Рожевий', vocab)).toBe('світло-рожевий');
  });

  it('keeps a new colour as typed, tidied', () => {
    expect(canonicalColour('  Пудровий   беж ', vocab)).toBe('Пудровий беж');
  });

  it('gives nothing for nothing', () => {
    expect(canonicalColour('   ', vocab)).toBe('');
  });
});

describe('buildCells', () => {
  it('is every colour by every size, colour by colour', () => {
    expect(buildCells(['блакитний', 'рожевий'], ['86', '92'])).toEqual([
      { color: 'блакитний', size: '86' },
      { color: 'блакитний', size: '92' },
      { color: 'рожевий', size: '86' },
      { color: 'рожевий', size: '92' },
    ]);
  });

  it('is one row per size when there is no colour, and per colour when there is no size', () => {
    expect(buildCells([], ['86', '92'])).toEqual([
      { color: '', size: '86' },
      { color: '', size: '92' },
    ]);
    expect(buildCells(['сірий'], [])).toEqual([{ color: 'сірий', size: '' }]);
  });

  it('is one plain variant when nothing was chosen', () => {
    expect(buildCells([], [])).toEqual([{ color: '', size: '' }]);
  });
});

describe('existingKeys and cellKey', () => {
  it('marks what the card already has, however the colour and the pair were written', () => {
    const have = existingKeys([
      { attributes: { color: 'Блакитний', size: '98-104' } },
      { attributes: { color: 'рожевий', size: '86' } },
      { is_active: false, attributes: { color: 'зелений', size: '86' } },
    ]);

    expect(have.has(cellKey({ color: 'блакитний', size: '98/104' }))).toBe(true);
    expect(have.has(cellKey({ color: ' рожевий ', size: '86' }))).toBe(true);
    // An archived variant is gone from the till: making it again is not a twin.
    expect(have.has(cellKey({ color: 'зелений', size: '86' }))).toBe(false);
    expect(have.has(cellKey({ color: 'рожевий', size: '92' }))).toBe(false);
  });

  it('treats a missing attribute as empty', () => {
    const have = existingKeys([{ attributes: { size: '86' } }, { attributes: null }]);
    expect(have.has(cellKey({ color: '', size: '86' }))).toBe(true);
    expect(have.has(cellKey({ color: '', size: '' }))).toBe(true);
  });
});
