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
      size: 'M',
      color: 'Синій',
      tag_ids: [3],
    }),
    makeCatalogItem({
      variant_id: 2,
      product_name: 'Кросівки',
      sku: 'SN-42',
      barcode: '222',
      size: '42',
      color: 'Білий',
      tag_ids: [4],
    }),
    makeCatalogItem({
      variant_id: 3,
      product_name: 'Шапка',
      sku: null,
      barcode: null,
      size: 'OS',
      color: 'Чорний',
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

  it('searches name, sku, barcode, size and colour case-insensitively', () => {
    const ids = (q: string) => filterCatalog(items, tags, { q }).map((i) => i.variant_id);
    expect(ids('футбол')).toEqual([1]);
    expect(ids('SN-4')).toEqual([2]);
    expect(ids('111')).toEqual([1]);
    expect(ids('чорний')).toEqual([3]);
    expect(ids('42')).toEqual([2]);
    expect(ids('нічого')).toEqual([]);
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
