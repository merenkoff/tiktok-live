// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../../../test/utils';
import type { PosTag } from '../../../types';
import { stationOf } from './station';

const tag = (id: number, station: PosTag['station'], children: PosTag[] = []): PosTag => ({
  id,
  store_id: 1,
  parent_id: null,
  name: `t${id}`,
  sort_order: 0,
  color: null,
  show_in_catalog_bar: true,
  station,
  children,
});

const tags = [tag(1, 'bar', [tag(2, null)]), tag(3, 'kitchen'), tag(4, null, [tag(5, 'bar')])];

describe('stationOf', () => {
  it('finds the station on a tag at any depth', () => {
    expect(stationOf(makeCatalogItem({ tag_ids: [1] }), tags)).toBe('bar');
    expect(stationOf(makeCatalogItem({ tag_ids: [5] }), tags)).toBe('bar');
    expect(stationOf(makeCatalogItem({ tag_ids: [3] }), tags)).toBe('kitchen');
  });

  it('reads kitchen when a product wears both, as the ticket falls back', () => {
    expect(stationOf(makeCatalogItem({ tag_ids: [1, 3] }), tags)).toBe('kitchen');
  });

  it('is null with no tags or no station', () => {
    expect(stationOf(makeCatalogItem({ tag_ids: [] }), tags)).toBeNull();
    expect(stationOf(makeCatalogItem({ tag_ids: [2] }), tags)).toBeNull();
    expect(stationOf(undefined, tags)).toBeNull();
  });
});
