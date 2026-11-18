// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { PosTag, Product } from '@pos/platform';
import { hasGap, menuGaps, menuProducts, pruneTags } from './menuGaps';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Борщ',
    description: 'З пампушками',
    composition: 'Буряк, капуста, яловичина',
    image_url: '/pos-uploads/a.jpg',
    is_active: true,
    sellable: true,
    tag_ids: [],
    variants: [],
    ...over,
  } as Product;
}

function tag(id: number, name: string, children: PosTag[] = []): PosTag {
  return { id, store_id: 1, parent_id: null, name, sort_order: 0, color: null, show_in_catalog_bar: false, children };
}

describe('the marketer’s list: the menu, and what the guest would miss', () => {
  it('holds what the till sells and leaves the shelves behind it out', () => {
    const list = menuProducts([
      product({ id: 1 }),
      product({ id: 2, name: 'Бекон', sellable: false }),
      product({ id: 3, name: 'Вода' }),
    ]);
    expect(list.map((p) => p.id)).toEqual([1, 3]);
  });

  it('names what a dish lacks on the guest’s page', () => {
    expect(menuGaps(product())).toEqual([]);
    expect(menuGaps(product({ image_url: null, description: '  ', composition: null }))).toEqual([
      'photo',
      'description',
      'composition',
    ]);
    expect(hasGap(product({ composition: '' }), 'composition')).toBe(true);
    // A card the guest never sees lacks nothing there — the cork fee, a bag.
    expect(menuGaps(product({ menu_hidden: true, image_url: null, description: null }))).toEqual([]);
  });

  it('drops a tag that holds no dish, and keeps a parent for a child that does', () => {
    const tags = [
      tag(1, 'Супи'),
      tag(2, 'Інгредієнти'),
      tag(3, 'Бар', [tag(4, 'Вино'), tag(5, 'Пиво')]),
    ];
    const pruned = pruneTags(tags, [product({ tag_ids: [1] }), product({ id: 2, tag_ids: [4] })]);
    expect(pruned.map((t) => t.name)).toEqual(['Супи', 'Бар']);
    expect(pruned[1].children?.map((t) => t.name)).toEqual(['Вино']);
  });
});
