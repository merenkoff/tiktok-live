// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Preorder } from '../types';
import { cartLinesFromPreorder } from './preorderCart';

function order(items: Preorder['items']): Preorder {
  return { id: 9, items } as Preorder;
}

const item = {
  id: 1,
  variant_id: 7,
  quantity: 1,
  unit_price_cents: 8000,
  components: null,
  product_name: 'Латте',
  label: 'M',
  unit: 'шт',
  image_url: null,
  current_unit_price_cents: 8500,
};

describe('cartLinesFromPreorder', () => {
  it('puts the promised line on the till at the locked price, on its own key', () => {
    const [line] = cartLinesFromPreorder(order([item]));
    expect(line).toMatchObject({ uid: 'preorder:9:1', unit_price_cents: 8000, max_quantity: 1, variant_label: 'M' });
    expect(line.modifiers).toBeUndefined();
  });

  it('names the promised answers and note, a deleted answer included, and sends only the live ids (К3)', () => {
    const [line] = cartLinesFromPreorder(
      order([
        {
          ...item,
          modifiers: [
            { modifier_id: null, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 },
            { modifier_id: 3, group_name: 'Цукор', name: 'без цукру', price_delta_cents: 0 },
          ],
          note: 'гарячіше',
        },
      ])
    );
    expect(line.variant_label).toBe('M · вівсяне · без цукру');
    expect(line.modifiers).toEqual([{ id: 3, group_name: 'Цукор', name: 'без цукру', price_delta_cents: 0 }]);
    expect(line.note).toBe('гарячіше');
    // The lock, not today's quote.
    expect(line.unit_price_cents).toBe(8000);
  });
});
