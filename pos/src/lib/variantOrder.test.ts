// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's copy of the size order. KIDS_CASES and the letter/number cases are
// the tables `src/__tests__/pos.variant-order.test.ts` pins on the server,
// copied verbatim: offline, IndexedDB returns rows by id and only this code
// puts them in order, so it must agree with the server on what a size run is.

import { describe, expect, it } from 'vitest';
import { compareVariantLabels, orderCatalog, sizeRank } from './variantOrder';

const sorted = (labels: string[]) => [...labels].sort(compareVariantLabels);

const KIDS_CASES: Array<{ name: string; input: string[]; expected: string[] }> = [
  {
    name: 'heights in centimetres run as numbers',
    input: ['92', '56', '116', '68', '104', '80'],
    expected: ['56', '68', '80', '92', '104', '116'],
  },
  {
    name: 'pairs of heights, written with a hyphen, run by their first number',
    input: ['98-104', '68-74', '104-110', '86-92', '74-80'],
    expected: ['68-74', '74-80', '86-92', '98-104', '104-110'],
  },
  {
    name: 'months',
    input: ['12-18', '3-6', '6-9', '0-3', '18-24', '9-12'],
    expected: ['0-3', '3-6', '6-9', '9-12', '12-18', '18-24'],
  },
  {
    name: 'years, single and paired',
    input: ['5', '2-3', '10', '4-5', '3', '2'],
    expected: ['2', '2-3', '3', '4-5', '5', '10'],
  },
  {
    name: 'a pair sits at the height it starts from, before the single one that follows it',
    input: ['92', '86-92', '86', '98'],
    expected: ['86', '86-92', '92', '98'],
  },
  {
    name: 'a colour first, then the pairs within it',
    input: ['рожевий / 98-104', 'блакитний / 104-110', 'рожевий / 86-92', 'блакитний / 92-98', 'блакитний / 86-92'],
    expected: ['блакитний / 86-92', 'блакитний / 92-98', 'блакитний / 104-110', 'рожевий / 86-92', 'рожевий / 98-104'],
  },
  {
    name: 'a pair typed with a slash still lands between its neighbours',
    input: ['бежевий / 104-110', 'бежевий / 98/104', 'бежевий / 86-92'],
    expected: ['бежевий / 86-92', 'бежевий / 98/104', 'бежевий / 104-110'],
  },
  {
    name: 'adult letters are untouched by any of this',
    input: ['XL', 'S', 'M', 'XXL'],
    expected: ['S', 'M', 'XL', 'XXL'],
  },
  {
    // The known limit: the order knows numbers and letters, not SCHEMES.
    name: 'does not know schemes: months and years of one product interleave by number',
    input: ['3-6', '3', '4', '2-3'],
    expected: ['2-3', '3', '3-6', '4'],
  },
];

describe('sizeRank', () => {
  it('puts the letter sizes on one ladder', () => {
    expect(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((s) => sizeRank(s))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('reads 2XL as XXL, and a Cyrillic М, Л, С, Х as the Latin letter it looks like', () => {
    expect(sizeRank('2XL')).toBe(sizeRank('XXL'));
    expect(sizeRank('М')).toBe(sizeRank('M'));
    expect(sizeRank('ХЛ')).toBe(sizeRank('XL'));
    expect(sizeRank('ХС')).toBe(sizeRank('XS'));
  });

  it.each(['90', '36–40', 'Чорний', 'Універсальний', '0,5 л', '', 'XLL', 'SM', '6XL', '98-104', '3-6', '98/104'])(
    'is not a letter size: %j',
    (text) => {
      expect(sizeRank(text)).toBeNull();
    }
  );
});

describe('compareVariantLabels', () => {
  it('orders letter sizes from smallest to largest, mixing Cyrillic and Latin spellings', () => {
    expect(sorted(['XL', 'S', 'XXL', 'M', 'XS', 'L'])).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(sorted(['L', 'М', 'S', 'XL', 'ХС'])).toEqual(['ХС', 'S', 'М', 'L', 'XL']);
  });

  it('orders numbers as numbers', () => {
    expect(sorted(['100', '90', '110', '28', '104'])).toEqual(['28', '90', '100', '104', '110']);
  });

  it('groups by colour, then runs each colour from small to large', () => {
    expect(
      sorted(['Чорний / L', 'Білий / M', 'Чорний / S', 'Чорний / XL', 'Білий / S', 'Чорний / M', 'Білий / L'])
    ).toEqual(['Білий / S', 'Білий / M', 'Білий / L', 'Чорний / S', 'Чорний / M', 'Чорний / L', 'Чорний / XL']);
  });

  it('puts a letter size ahead of a word, and the shorter label ahead of its extension', () => {
    expect(sorted(['Універсальний', 'M', 'S'])).toEqual(['S', 'M', 'Універсальний']);
    expect(compareVariantLabels('Чорний', 'Чорний / M')).toBeLessThan(0);
  });

  it('reports equal labels as equal', () => {
    expect(compareVariantLabels('Чорний / M', 'Чорний / M')).toBe(0);
    expect(compareVariantLabels('М', 'M')).toBe(0);
  });

  describe("a children's shop", () => {
    it.each(KIDS_CASES)('$name', ({ input, expected }) => {
      expect(sorted(input)).toEqual(expected);
    });
  });
});

describe('orderCatalog', () => {
  const row = (variant_id: number, product_id: number, product_name: string, label: string) => ({
    variant_id,
    product_id,
    product_name,
    label,
  });

  it('keeps every card\'s variants together and in size order, products by name', () => {
    // IndexedDB order: by variant_id, which mixes the cards up.
    const rows = [
      row(1, 20, 'Футболка', 'синій / XL'),
      row(2, 10, 'Боді', 'рожевий / 100'),
      row(3, 20, 'Футболка', 'синій / S'),
      row(4, 11, 'Боді', 'рожевий / 92'),
      row(5, 10, 'Боді', 'рожевий / 98'),
    ];

    expect(orderCatalog(rows).map((r) => r.variant_id)).toEqual([5, 2, 4, 3, 1]);
  });

  it('keeps two cards with one name apart, told by id — the catch a per-name grouping would miss', () => {
    const rows = [
      row(1, 2, 'Боді', 'рожевий / 92'),
      row(2, 1, 'Боді', 'рожевий / 100'),
      row(3, 1, 'Боді', 'рожевий / 98'),
    ];

    expect(orderCatalog(rows).map((r) => [r.product_id, r.label])).toEqual([
      [1, 'рожевий / 98'],
      [1, 'рожевий / 100'],
      [2, 'рожевий / 92'],
    ]);
  });

  it('is stable for equal labels (id order), does not mutate its input and copes with nothing', () => {
    const rows = [row(7, 1, 'Шапка', 'M'), row(3, 1, 'Шапка', 'М')];
    expect(orderCatalog(rows).map((r) => r.variant_id)).toEqual([3, 7]);
    expect(rows.map((r) => r.variant_id)).toEqual([7, 3]);
    expect(orderCatalog([])).toEqual([]);
  });
});
