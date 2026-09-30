// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeCatalogItem, makeTag } from '../test/utils';
import { filterCatalog, flattenTags, tagFilterIds } from './catalog-filter';

/** Одяг(1) → Верх(2) → Футболки(3); Взуття(4) is a separate root. */
const tags = [
  makeTag({
    id: 1,
    name: 'Одяг',
    children: [
      makeTag({
        id: 2,
        name: 'Верх',
        parent_id: 1,
        children: [makeTag({ id: 3, name: 'Футболки', parent_id: 2 })],
      }),
    ],
  }),
  makeTag({ id: 4, name: 'Взуття' }),
];

describe('flattenTags', () => {
  it('walks the whole tree depth-first', () => {
    expect(flattenTags(tags).map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  it('handles a flat list and an empty one', () => {
    expect(flattenTags([makeTag({ id: 9 })]).map((t) => t.id)).toEqual([9]);
    expect(flattenTags([])).toEqual([]);
  });
});

describe('tagFilterIds', () => {
  it('includes the tag and every descendant', () => {
    expect(tagFilterIds(tags, 1).sort()).toEqual([1, 2, 3]);
    expect(tagFilterIds(tags, 2).sort()).toEqual([2, 3]);
  });

  it('returns just the tag itself when it is a leaf', () => {
    expect(tagFilterIds(tags, 3)).toEqual([3]);
    expect(tagFilterIds(tags, 4)).toEqual([4]);
  });
});

describe('filterCatalog', () => {
  const items = [
    makeCatalogItem({
      variant_id: 1,
      product_name: 'Футболка',
      sku: 'TS-M',
      barcode: '111',
      attributes: { color: 'Синій', size: 'M' },
      label: 'Синій / M',
      tag_ids: [3],
    }),
    makeCatalogItem({
      variant_id: 2,
      product_name: 'Кросівки',
      sku: 'SN-42',
      barcode: '222',
      attributes: { color: 'Білий', size: '42' },
      label: 'Білий / 42',
      tag_ids: [4],
    }),
    makeCatalogItem({
      variant_id: 3,
      product_name: 'Шапка',
      sku: null,
      barcode: null,
      attributes: { color: 'Чорний', size: 'OS', country: 'Туреччина' },
      label: 'Чорний / OS',
    }),
  ];

  it('returns everything without options', () => {
    expect(filterCatalog(items, tags)).toHaveLength(3);
    expect(filterCatalog(items, tags, {})).toHaveLength(3);
  });

  it('matches a barcode exactly and ignores every other filter', () => {
    expect(
      filterCatalog(items, tags, { barcode: ' 222 ', q: 'футболка', tag_id: 3 }).map(
        (i) => i.variant_id
      )
    ).toEqual([2]);
    expect(filterCatalog(items, tags, { barcode: '22' })).toEqual([]);
  });

  it('searches name, sku, barcode and the variant caption case-insensitively', () => {
    const ids = (q: string) => filterCatalog(items, tags, { q }).map((i) => i.variant_id);
    expect(ids('футбол')).toEqual([1]);
    expect(ids('SN-4')).toEqual([2]);
    expect(ids('111')).toEqual([1]);
    expect(ids('чорний')).toEqual([3]);
    expect(ids('42')).toEqual([2]);
    expect(ids('нічого')).toEqual([]);
  });

  it('searches the attributes the vertical marks searchable, and only those', () => {
    // Mirrors the server: `searchableAttributeKeys` decides, so the offline
    // till finds exactly what the online one finds.
    const ids = (q: string, keys: string[]) =>
      filterCatalog(items, tags, { q }, keys).map((i) => i.variant_id);
    expect(ids('туреч', ['country'])).toEqual([3]);
    // Not searchable → not found, even though the value is on the row.
    expect(ids('туреч', [])).toEqual([]);
    expect(ids('туреч', ['color'])).toEqual([]);
  });

  it('filters by tag including descendants', () => {
    expect(filterCatalog(items, tags, { tag_id: 1 }).map((i) => i.variant_id)).toEqual([1]);
    expect(filterCatalog(items, tags, { tag_id: 4 }).map((i) => i.variant_id)).toEqual([2]);
  });

  it('combines a query with a tag filter', () => {
    expect(filterCatalog(items, tags, { q: 'кросівки', tag_id: 1 })).toEqual([]);
    expect(filterCatalog(items, tags, { q: 'кросівки', tag_id: 4 }).map((i) => i.variant_id)).toEqual([2]);
  });
});

describe('filterCatalog — what is not on the menu', () => {
  // The snapshot holds the ingredients too, so the stock count can find the
  // milk; the sell screen must never offer it, not even to a wedge scan.
  const items = [
    makeCatalogItem({ variant_id: 1, product_name: 'Латте', barcode: '111' }),
    makeCatalogItem({ variant_id: 2, product_name: 'Молоко вівсяне', barcode: '222', sellable: false }),
    makeCatalogItem({ variant_id: 3, product_name: 'Круасан', barcode: '333', sellable: true }),
  ];

  it('hides an unsellable row by default, whatever the query', () => {
    expect(filterCatalog(items, tags).map((i) => i.variant_id)).toEqual([1, 3]);
    expect(filterCatalog(items, tags, { q: 'молоко' })).toEqual([]);
    expect(filterCatalog(items, tags, { barcode: '222' })).toEqual([]);
  });

  it('shows everything when the stock count asks', () => {
    expect(filterCatalog(items, tags, { include_unsellable: true }).map((i) => i.variant_id)).toEqual([1, 2, 3]);
    expect(filterCatalog(items, tags, { barcode: '222', include_unsellable: true }).map((i) => i.variant_id)).toEqual([2]);
  });

  it('treats a row snapshotted before the flag existed as on the menu', () => {
    const old = { ...makeCatalogItem({ variant_id: 9 }) } as Record<string, unknown>;
    delete old.sellable;
    expect(filterCatalog([old as never], tags).map((i) => i.variant_id)).toEqual([9]);
  });
});

describe('filterCatalog — the query is read as words', () => {
  // The same fixtures and the same expected results as the server runs against
  // Postgres (`src/__tests__/pos.catalog-search.test.ts`): the offline till
  // must find exactly what the online one finds.
  const FIXTURES = [
    { key: 'A', name: 'Костюмчик Зайчик', color: 'блакитний', size: '86', sku: 'KZ-86', barcode: '2900000000011' },
    { key: 'B', name: 'Костюмчик Зайчик', color: 'блакитний', size: '98-104', sku: 'KZ-98', barcode: '2900000000028' },
    { key: 'C', name: 'Костюмчик Зайчик', color: 'рожевий', size: '86', sku: 'KZ-R86', barcode: '2900000008606' },
    { key: 'D', name: 'Сукня Свято', color: 'біла', size: '92-98', sku: 'SS-1', barcode: '4820086123456' },
    { key: 'E', name: 'Комплект 100%', color: 'молочний', size: '62', sku: 'K_1', barcode: '5901234123457' },
    { key: 'F', name: 'Реглан', color: 'сірий', size: '110', sku: '0054', barcode: '2900000000554' },
    { key: 'G', name: 'Боді', color: 'жовтий', size: '98/104', sku: 'BD-1', barcode: '5901234000016' },
    { key: 'H', name: 'Боді', color: 'жовтий', size: '104–110', sku: 'BD-2', barcode: '5901234000023' },
    { key: 'I', name: 'Шапка', color: 'сіра', size: 'OS', sku: '77', barcode: '5901234000030' },
    { key: 'J', name: 'Шарф', color: 'сірий', size: 'OS', sku: 'J-1', barcode: '5907712345678' },
  ];
  const rows = FIXTURES.map((f, i) =>
    makeCatalogItem({
      variant_id: i + 1,
      product_id: i + 1,
      product_name: f.name,
      attributes: { color: f.color, size: f.size },
      label: `${f.color} / ${f.size}`,
      sku: f.sku,
      barcode: f.barcode,
    })
  );
  const keyOf = (variantId: number) => FIXTURES[variantId - 1]!.key;
  const find = (q: string) =>
    filterCatalog(rows, tags, { q }, ['color', 'size'])
      .map((r) => keyOf(r.variant_id))
      .sort()
      .join('');

  const MATCH_CASES: Array<{ query: string; expected: string }> = [
    { query: 'зайчик 86', expected: 'AC' },
    { query: 'зайчик', expected: 'ABC' },
    { query: 'ЗАЙЧИК', expected: 'ABC' },
    { query: '86 зайчик', expected: 'AC' },
    { query: 'блакитний 98/104', expected: 'B' },
    // The field is folded too, so a pair saved with a slash or an en dash is one of these.
    { query: '98-104', expected: 'BG' },
    { query: '98–104', expected: 'BG' },
    { query: '98/104', expected: 'BG' },
    { query: '104-110', expected: 'H' },
    { query: '104–110 жовтий', expected: 'H' },
    { query: 'зайчик сукня', expected: '' },
    // A short number is a size: «86» is in the barcode of D too, and must not find it.
    { query: '86', expected: 'AC' },
    // …while a fragment of a scan (six digits) still does.
    { query: '086123', expected: 'D' },
    { query: '4820086123456', expected: 'D' },
    { query: '0054', expected: 'F' },
    { query: '54', expected: '' },
    { query: '77', expected: 'I' },
    { query: '5907712345678', expected: 'J' },
    { query: '907712', expected: 'J' },
    { query: 'kz-86', expected: 'A' },
    { query: 'реглан 110', expected: 'F' },
    // `%` and `_` mean themselves.
    { query: '100%', expected: 'E' },
    { query: '%', expected: 'E' },
    { query: '_', expected: 'E' },
    { query: 'k_1', expected: 'E' },
    // Only six words count: the seventh («lol») would exclude everything.
    { query: 'костюмчик зайчик блакитний 86 2900000000011 kz-86 lol', expected: 'A' },
    { query: '', expected: 'ABCDEFGHIJ' },
    { query: '   ', expected: 'ABCDEFGHIJ' },
  ];

  it.each(MATCH_CASES)('«$query» finds $expected', ({ query, expected }) => {
    expect(find(query)).toBe(expected);
  });
});
