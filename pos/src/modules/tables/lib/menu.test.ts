// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { deviceLocalDay, groupMenu, menuSubtitle, stopListedToday } from './menu';
import type { CatalogItem } from '@pos/platform';

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  variant_id: 1,
  product_id: 1,
  product_name: 'Латте',
  attributes: { size: 'M' },
  label: 'M',
  unit: 'шт',
  sku: null,
  barcode: null,
  price_cents: 6500,
  quantity: 10,
  image_url: null,
  ...over,
});

describe('groupMenu', () => {
  it('folds variants back into one dish, in the menu’s own order', () => {
    const rows = groupMenu([
      item({ variant_id: 1, product_id: 1, label: 'S', price_cents: 6500, quantity: 4 }),
      item({ variant_id: 2, product_id: 1, label: 'L', price_cents: 8500, quantity: 3 }),
      item({ variant_id: 9, product_id: 2, product_name: 'Круасан', label: '', quantity: 2 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Латте', 'Круасан']);
    expect(rows[0].variants).toHaveLength(2);
    // «від 65 ₴» reads off the cheapest size, and the stock is the shelf.
    expect(rows[0].from_cents).toBe(6500);
    expect(rows[0].stock).toBe(7);
  });

  it('stops a dish, not a size', () => {
    const rows = groupMenu(
      [
        item({ variant_id: 1, product_id: 1, stop_listed_on: '2026-09-21' }),
        item({ variant_id: 2, product_id: 1, label: 'L' }),
      ],
      '2026-09-21'
    );
    expect(rows[0].stopped).toBe(true);
  });
});

describe('stopListedToday', () => {
  it('compares the day on the device’s clock, not the server’s verdict', () => {
    expect(stopListedToday({ stop_listed: true, stop_listed_on: '2026-09-21' }, '2026-09-21')).toBe(
      true
    );
    // Yesterday's snapshot un-greys itself at midnight without asking anyone.
    expect(stopListedToday({ stop_listed: true, stop_listed_on: '2026-09-20' }, '2026-09-21')).toBe(
      false
    );
  });

  it('falls back to the verdict when the answer carries no day', () => {
    expect(stopListedToday({ stop_listed: true }, '2026-09-21')).toBe(true);
    expect(stopListedToday({}, '2026-09-21')).toBe(false);
  });

  it('formats the device day as the server writes one', () => {
    expect(deviceLocalDay(new Date('2026-09-21T10:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('menuSubtitle', () => {
  it('says how many sizes, or what the single one is', () => {
    const [sizes] = groupMenu([
      item({ variant_id: 1, product_id: 1, label: 'S' }),
      item({ variant_id: 2, product_id: 1, label: 'L' }),
    ]);
    expect(menuSubtitle(sizes)).toBe('2 розміри');
    const [one] = groupMenu([item({ label: 'M' })]);
    expect(menuSubtitle(one)).toBe('M');
  });

  it('says the stop-list out loud, and prefers it to «немає»', () => {
    const [stopped] = groupMenu([item({ label: '', quantity: 0, stop_listed_on: '2026-09-21' })], '2026-09-21');
    expect(menuSubtitle(stopped)).toBe('сьогодні не робимо');
    const [out] = groupMenu([item({ label: '', quantity: 0 })]);
    expect(menuSubtitle(out)).toBe('немає');
  });
});
