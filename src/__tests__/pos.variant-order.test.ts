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
import { listOnHand } from '../pos/stock-reports.service.js';
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
  async function make(name: string, sizes: Array<[string, string]>) {
    return products.createProduct(store.storeId, {
      name,
      variants: sizes.map(([color, size], i) => ({
        attributes: { color, size },
        sku: `${name}-${i}`.toUpperCase().replace(/\s/g, ''),
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

  it('orders the on-hand sheet a stocktake is counted against the same way', async () => {
    const onHand = await listOnHand(store.storeId);
    const tee = onHand.filter((r) => r.product_name === 'Футболка').map((r) => r.label);

    expect(tee).toEqual(['Білий / S', 'Білий / M', 'Чорний / S', 'Чорний / M', 'Чорний / L', 'Чорний / XL']);
  });
});
