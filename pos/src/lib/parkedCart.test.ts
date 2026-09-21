// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { cartLinesFromParked, liveModifiers } from './parkedCart';

const base = {
  id: 5,
  variant_id: 7,
  quantity: 2,
  product_name: 'Латте',
  label: 'M',
  unit: 'шт',
  line_price_cents: 8000,
  image_url: null,
  components: null,
};

describe('cartLinesFromParked', () => {
  it('restores a plain line on its bare key, capped at what was parked', () => {
    const [line] = cartLinesFromParked({ items: [base] });
    expect(line).toMatchObject({ uid: '7', variant_label: 'M', quantity: 2, max_quantity: 2, unit_price_cents: 8000 });
    expect(line.modifiers).toBeUndefined();
    expect(line.note).toBeUndefined();
  });

  it('restores a café line with its answers and note on the server’s own merge key (К3)', () => {
    const [line] = cartLinesFromParked({
      items: [
        {
          ...base,
          modifiers: [
            { modifier_id: 12, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 },
            { modifier_id: 3, group_name: 'Цукор', name: 'без цукру', price_delta_cents: 0 },
          ],
          note: ' гарячіше ',
        },
      ],
    });
    // Sorted ids, the note, and the caption already naming the answers —
    // exactly what a walk-in latte with the same choices would get.
    expect(line.uid).toBe('7|3,12|гарячіше');
    expect(line.variant_label).toBe('M · вівсяне · без цукру');
    expect(line.modifiers).toEqual([
      { id: 12, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 },
      { id: 3, group_name: 'Цукор', name: 'без цукру', price_delta_cents: 0 },
    ]);
    expect(line.note).toBe('гарячіше');
  });

  it('keeps a deleted answer’s name on the caption but no longer sends its id', () => {
    const [line] = cartLinesFromParked({
      items: [
        {
          ...base,
          modifiers: [
            { modifier_id: null, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 },
            { modifier_id: 3, group_name: 'Цукор', name: 'без цукру', price_delta_cents: 0 },
          ],
        },
      ],
    });
    expect(line.variant_label).toBe('M · вівсяне · без цукру');
    expect(line.uid).toBe('7|3|');
    expect(line.modifiers?.map((m) => m.id)).toEqual([3]);
  });

  it('gives a counter-built bouquet a line of its own, whatever else it carries', () => {
    const [line] = cartLinesFromParked({
      items: [
        {
          ...base,
          components: [{ component_variant_id: 1, quantity: 9, product_name: 'Троянда', label: '', unit: 'шт', unit_price_cents: 9000 }],
        },
      ],
    });
    expect(line.uid).toBe('bouquet:parked-5');
    expect(line.components).toHaveLength(1);
  });
});

describe('liveModifiers', () => {
  it('drops the answers that no longer exist, and is absent when none are left', () => {
    expect(liveModifiers(undefined)).toBeUndefined();
    expect(liveModifiers([{ modifier_id: null, group_name: 'g', name: 'n', price_delta_cents: 0 }])).toBeUndefined();
  });
});
