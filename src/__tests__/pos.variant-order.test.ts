// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.variant-order.test.ts
//
// A size run reads S, M, L, XL — not the alphabet (TechDocs/POS_CLOTHING.md,
// phase C0). The comparison is pure; the services are checked through the real
// database because the order is applied AFTER the query, per product, and
// must not disturb the order of the products or the rows a LIMIT kept.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as products from '../pos/products.service.js';
import { listOnHand, movementReport } from '../pos/stock-reports.service.js';
import {
  compareVariantLabels,
  sizeRank,
  sortVariantRuns,
} from '../pos/verticals/variantOrder.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

const sorted = (labels: string[]) => [...labels].sort(compareVariantLabels);

/**
 * A children's shop sells in heights, pairs of heights, months and years
 * (TechDocs/POS_CLOTHING.md, C1). ONE table of cases, pinned identically by
 * `pos/src/lib/variantOrder.test.ts` — the till sorts offline with its own copy
 * of the comparator, and the two must never disagree about what a size run is.
 */
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
    // C1d: an age with its unit and a height are the same ladder, ordered by the size they are named after.
    name: 'a height and an age in months are one ladder',
    input: ['86', '3–6 міс', '62', '9–12 міс', '0–3 міс', '80'],
    expected: ['0–3 міс', '62', '3–6 міс', '9–12 міс', '80', '86'],
  },
  {
    name: 'an age in years runs in years, not as text',
    input: ['3–4 роки', '1–2 роки', '10–11 років', '2–3 роки', '13–14 років'],
    expected: ['1–2 роки', '2–3 роки', '3–4 роки', '10–11 років', '13–14 років'],
  },
  {
    name: 'the order crosses the unit: months, then years',
    input: ['2–3 роки', '9–12 міс', '12–18 міс', '1–2 роки', '6–9 міс'],
    expected: ['6–9 міс', '9–12 міс', '12–18 міс', '1–2 роки', '2–3 роки'],
  },
  {
    name: 'a pair of heights sits beside the age it names',
    input: ['98-104', '3–4 роки', '2–3 роки'],
    expected: ['2–3 роки', '98-104', '3–4 роки'],
  },
  {
    name: 'a colour first, then the ages within it',
    input: ['рожевий / 2–3 роки', 'блакитний / 12–18 міс', 'блакитний / 3–6 міс'],
    expected: ['блакитний / 3–6 міс', 'блакитний / 12–18 міс', 'рожевий / 2–3 роки'],
  },
  {
    // C1d: a garment marked «98-104» is a size 104 (it fits up to 104 cm), so it comes AFTER a plain 100.
    name: 'a pair of heights is named after its larger height',
    input: ['104', '98-104', '100'],
    expected: ['100', '98-104', '104'],
  },
  {
    name: 'adult letters are untouched by any of this',
    input: ['XL', 'S', 'M', 'XXL'],
    expected: ['S', 'M', 'XL', 'XXL'],
  },
  {
    // The known limit: the order knows numbers and letters, not SCHEMES. One
    // product should use one scheme; a months pair and a year mix by value.
    name: 'does not know schemes: months and years of one product interleave by number',
    input: ['3-6', '3', '4', '2-3'],
    expected: ['2-3', '3', '3-6', '4'],
  },
];

describe('sizeRank', () => {
  it('puts the letter sizes on one ladder', () => {
    const ladder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((s) => sizeRank(s));
    expect(ladder).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('reads 2XL as XXL and 3XL as XXXL, in any case and with stray spaces', () => {
    expect(sizeRank('2XL')).toBe(sizeRank('XXL'));
    expect(sizeRank('3xl')).toBe(sizeRank('XXXL'));
    expect(sizeRank('2XS')).toBe(sizeRank('XXS'));
    expect(sizeRank(' x l ')).toBe(sizeRank('XL'));
    expect(sizeRank('xl.')).toBe(sizeRank('XL'));
  });

  it('reads a Cyrillic М, Л, С, Х as the Latin letter it looks like', () => {
    expect(sizeRank('М')).toBe(sizeRank('M'));
    expect(sizeRank('Л')).toBe(sizeRank('L'));
    expect(sizeRank('С')).toBe(sizeRank('S'));
    expect(sizeRank('ХЛ')).toBe(sizeRank('XL'));
    expect(sizeRank('ХХЛ')).toBe(sizeRank('XXL'));
    expect(sizeRank('ХС')).toBe(sizeRank('XS'));
  });

  it.each(['90', '36–40', 'Чорний', 'Універсальний', 'Сірий', '0,5 л', '', 'XLL', 'SM', '6XL'])(
    'is not a letter size: %j',
    (text) => {
      expect(sizeRank(text)).toBeNull();
    }
  );
});

describe('compareVariantLabels', () => {
  it('orders letter sizes from smallest to largest', () => {
    expect(sorted(['XL', 'S', 'XXL', 'M', 'XS', 'L'])).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  });

  it('mixes Cyrillic and Latin spellings of one size without splitting them', () => {
    expect(sorted(['L', 'М', 'S', 'XL', 'ХС'])).toEqual(['ХС', 'S', 'М', 'L', 'XL']);
  });

  it('orders numbers as numbers', () => {
    expect(sorted(['100', '90', '110', '28', '104'])).toEqual(['28', '90', '100', '104', '110']);
    expect(sorted(['10 л', '1,5 л', '2 л'])).toEqual(['1,5 л', '2 л', '10 л']);
  });

  it('keeps a size range next to the numbers it starts with', () => {
    expect(sorted(['38', '36–40', '34'])).toEqual(['34', '36–40', '38']);
  });

  it('groups by colour, then runs each colour from small to large', () => {
    expect(
      sorted(['Чорний / L', 'Білий / M', 'Чорний / S', 'Чорний / XL', 'Білий / S', 'Чорний / M', 'Білий / L'])
    ).toEqual(['Білий / S', 'Білий / M', 'Білий / L', 'Чорний / S', 'Чорний / M', 'Чорний / L', 'Чорний / XL']);
  });

  it('does the same for a numeric size under a colour (a belt, a shoe)', () => {
    expect(sorted(['Чорний / 100', 'Чорний / 90', 'Коричневий / 95', 'Чорний / 105'])).toEqual([
      'Коричневий / 95',
      'Чорний / 90',
      'Чорний / 100',
      'Чорний / 105',
    ]);
  });

  it('reads colours alphabetically, ignoring case', () => {
    expect(sorted(['чорний / M', 'Білий / M', 'Синій / M'])).toEqual(['Білий / M', 'Синій / M', 'чорний / M']);
  });

  it('puts a letter size ahead of a word, so a mixed list does not interleave them', () => {
    expect(sorted(['Універсальний', 'M', 'S'])).toEqual(['S', 'M', 'Універсальний']);
  });

  it('puts the shorter label first when one is a prefix of the other', () => {
    expect(compareVariantLabels('Чорний', 'Чорний / M')).toBeLessThan(0);
  });

  it('reports equal labels as equal, so the caller keeps its own id order', () => {
    expect(compareVariantLabels('Чорний / M', 'Чорний / M')).toBe(0);
    expect(compareVariantLabels('М', 'M')).toBe(0);
  });
});

describe('compareVariantLabels — a children\'s shop', () => {
  it.each(KIDS_CASES)('$name', ({ input, expected }) => {
    expect(sorted(input)).toEqual(expected);
  });

  it('never reads a height or an age as a letter size', () => {
    for (const text of ['98-104', '3-6', '86', '2-3', '98/104']) expect(sizeRank(text)).toBeNull();
  });
});

describe('sortVariantRuns', () => {
  const row = (product: number, label: string, id: number) => ({ product, label, id });

  it('sorts each product\'s run and leaves the products where the query put them', () => {
    const rows = [
      row(2, 'L', 1),
      row(2, 'S', 2),
      row(1, 'XL', 3),
      row(1, 'M', 4),
      row(3, '90', 5),
      row(3, '100', 6),
    ];
    const out = sortVariantRuns(rows, (r) => r.product, (r) => r.label);

    expect(out.map((r) => r.id)).toEqual([2, 1, 4, 3, 5, 6]);
  });

  it('is stable: equal labels keep the order they came in', () => {
    const rows = [row(1, 'M', 10), row(1, 'М', 11), row(1, 'M', 12)];
    const out = sortVariantRuns(rows, (r) => r.product, (r) => r.label);

    expect(out.map((r) => r.id)).toEqual([10, 11, 12]);
  });

  it('does not mutate its input and copes with nothing', () => {
    const rows = [row(1, 'L', 1), row(1, 'S', 2)];
    sortVariantRuns(rows, (r) => r.product, (r) => r.label);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(sortVariantRuns([], (r: { p: number }) => r.p, () => '')).toEqual([]);
  });
});

describe.skipIf(!hasDb)('variant order through the services', () => {
  let store: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('vorder');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  // Created deliberately in the wrong order, with a number of each kind.
  async function make(name: string, sizes: Array<[string, string]>, skuPrefix = name) {
    return products.createProduct(store.storeId, {
      name,
      variants: sizes.map(([color, size], i) => ({
        attributes: { color, size },
        sku: `${skuPrefix}-${i}`.toUpperCase().replace(/\s/g, ''),
        price_cents: 50000,
        quantity: 5,
      })),
    });
  }

  it('lists a product\'s variants from small to large, grouped by colour', async () => {
    await make('Футболка', [
      ['Чорний', 'L'],
      ['Білий', 'M'],
      ['Чорний', 'XL'],
      ['Чорний', 'S'],
      ['Білий', 'S'],
      ['Чорний', 'M'],
    ]);

    const list = (await products.listProducts(store.storeId)) as Array<{
      name: string;
      variants: Array<{ label: string }>;
    }>;
    const tee = list.find((p) => p.name === 'Футболка')!;

    expect(tee.variants.map((v) => v.label)).toEqual([
      'Білий / S',
      'Білий / M',
      'Чорний / S',
      'Чорний / M',
      'Чорний / L',
      'Чорний / XL',
    ]);
  });

  it('puts numbers in numeric order on the till\'s catalogue, products still by name', async () => {
    await make('Ремінь', [
      ['Чорний', '100'],
      ['Чорний', '90'],
      ['Чорний', '110'],
    ]);
    await make('Аксесуар', [['Сірий', 'M']]);

    const catalog = await products.getCatalog(store.storeId, { snapshot: true });
    const names = catalog.map((c) => c.product_name);
    // Product order is the query's (by name) — untouched by the sort.
    expect(names.indexOf('Аксесуар')).toBeLessThan(names.indexOf('Ремінь'));

    const belt = catalog.filter((c) => c.product_name === 'Ремінь').map((c) => c.label);
    expect(belt).toEqual(['Чорний / 90', 'Чорний / 100', 'Чорний / 110']);
  });

  // TechDocs/POS_CLOTHING.md, C1. A children's shop makes a card per colour and
  // batch, so «Боді» is three products. The query used to sort `name, label`,
  // which dealt their variants into each other (A100, B92, A98) and left the
  // per-product size order with nothing contiguous to sort.
  describe('two cards with the same name', () => {
    let first = 0;
    let second = 0;

    beforeAll(async () => {
      const a = await make('Боді', [['рожевий', '100'], ['рожевий', '98']]);
      const b = await make('Боді', [['рожевий', '92']], 'Боді-друга');
      first = a!.id;
      second = b!.id;
    });

    it('keeps each card\'s variants together, each in size order, on the till\'s catalogue', async () => {
      const catalog = await products.getCatalog(store.storeId, { snapshot: true });
      const rows = catalog.filter((c) => c.product_name === 'Боді');

      expect(rows.map((r) => [r.product_id, r.label])).toEqual([
        [first, 'рожевий / 98'],
        [first, 'рожевий / 100'],
        [second, 'рожевий / 92'],
      ]);
    });

    it('does the same on the on-hand sheet', async () => {
      const onHand = (await listOnHand(store.storeId)).filter((r) => r.product_name === 'Боді');

      expect(onHand.map((r) => [r.product_id, r.label])).toEqual([
        [first, 'рожевий / 98'],
        [first, 'рожевий / 100'],
        [second, 'рожевий / 92'],
      ]);
    });

    it('and on the movement report', async () => {
      const day = 24 * 3600 * 1000;
      const report = await movementReport(
        store.storeId,
        new Date(Date.now() - day).toISOString(),
        new Date(Date.now() + day).toISOString()
      );

      expect(report.filter((r) => r.product_name === 'Боді').map((r) => r.label)).toEqual([
        'рожевий / 98',
        'рожевий / 100',
        'рожевий / 92',
      ]);
    });
  });

  it('orders the on-hand sheet a stocktake is counted against the same way', async () => {
    const onHand = await listOnHand(store.storeId);
    const tee = onHand.filter((r) => r.product_name === 'Футболка').map((r) => r.label);

    expect(tee).toEqual(['Білий / S', 'Білий / M', 'Чорний / S', 'Чорний / M', 'Чорний / L', 'Чорний / XL']);
  });
});
