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
