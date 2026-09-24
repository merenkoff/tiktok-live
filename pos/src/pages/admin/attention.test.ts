// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Потребують уваги»: each source turns into rows the owner can read at a
// glance, and the sidebar's numbers are counted from the same rows.

import { describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../../test/utils';
import type { Preorder } from '../../types';
import {
  deviceDay,
  fiscalItems,
  lowStockItems,
  navCounts,
  preorderItems,
  stopListItems,
} from './attention';

const now = new Date(2026, 8, 24, 12, 0);
const today = deviceDay(now);

function preorder(over: Partial<Preorder>): Preorder {
  return {
    id: 1,
    status: 'new',
    staff_id: 1,
    staff_name: null,
    customer_id: null,
    customer_name: null,
    recipient_name: 'Оксана',
    recipient_phone: null,
    fulfilment: 'pickup',
    address: null,
    due_at: new Date(2026, 8, 24, 17, 0).toISOString(),
    due_window_minutes: null,
    card_message: null,
    note: null,
    quoted_total_cents: 0,
    sale_id: null,
    created_at: now.toISOString(),
    items: [{} as Preorder['items'][number], {} as Preorder['items'][number]],
    current_total_cents: null,
    ...over,
  };
}

describe('stopListItems', () => {
  it('names each dish the kitchen is not making today, once per product', () => {
    const rows = stopListItems(
      [
        makeCatalogItem({ product_id: 1, variant_id: 1, product_name: 'Сирник', stop_listed_on: today }),
        makeCatalogItem({ product_id: 1, variant_id: 2, product_name: 'Сирник', stop_listed_on: today }),
        makeCatalogItem({ product_id: 2, variant_id: 3, product_name: 'Круасан', stop_listed_on: '2026-09-23' }),
      ],
      today
    );
    expect(rows.map((r) => r.text)).toEqual(['Сирник — у стоп-листі до кінця дня']);
  });

  it('folds a long stop-list into one row', () => {
    const many = [1, 2, 3, 4].map((id) =>
      makeCatalogItem({ product_id: id, variant_id: id, product_name: `Страва ${id}`, stop_listed_on: today })
    );
    expect(stopListItems(many, today).map((r) => r.text)).toEqual(['4 страви у стоп-листі до кінця дня']);
  });
});

describe('preorderItems', () => {
  it('lists today’s open pre-orders with their time, and flags a late one first', () => {
    const rows = preorderItems(
      [
        preorder({ id: 1 }),
        preorder({ id: 2, due_at: new Date(2026, 8, 24, 10, 30).toISOString() }),
        preorder({ id: 3, due_at: new Date(2026, 8, 25, 9, 0).toISOString() }),
        preorder({ id: 4, status: 'handed_over' }),
      ],
      now
    );
    expect(rows.map((r) => r.key)).toEqual(['preorder:2', 'preorder:1']);
    expect(rows[0]).toMatchObject({ alert: true, meta: '10:30' });
    expect(rows[0].text).toMatch(/^Прострочене передзамовлення на 10:30/);
    expect(rows[1].text).toBe('Передзамовлення на 17:00 · 2 позиції · Оксана');
  });

  it('does not call an assembled bouquet on the shelf late', () => {
    const rows = preorderItems(
      [preorder({ status: 'assembled', due_at: new Date(2026, 8, 24, 10, 0).toISOString() })],
      now
    );
    expect(rows[0].alert).toBe(false);
  });
});

describe('lowStockItems / fiscalItems', () => {
  it('names the one item running out, or counts many', () => {
    expect(lowStockItems([{ variant_id: 1, product_name: 'Молоко', label: '1 л', unit: 'шт', quantity: 2 }])[0].text).toBe(
      'Молоко · 1 л закінчується — 2 шт'
    );
    const many = lowStockItems(
      [1, 2, 3].map((id) => ({ variant_id: id, product_name: 'x', label: '', unit: 'шт', quantity: 1 }))
    );
    expect(many[0]).toMatchObject({ text: '3 товари закінчуються', meta: '3', to: '/admin/stock' });
  });

  it('turns ПРРО trouble into red rows', () => {
    const rows = fiscalItems({ documents: [{}, {}], sessions: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: '2 чеки не зареєстровано в ПРРО', alert: true, to: '/admin/fiscal' });
  });
});

describe('navCounts', () => {
  it('counts everything on «Сьогодні» and each item on its own page', () => {
    const counts = navCounts([
      ...fiscalItems({ documents: [{}], sessions: [] }),
      ...lowStockItems([1, 2, 3].map((id) => ({ variant_id: id, product_name: 'x', label: '', unit: 'шт', quantity: 1 }))),
      ...stopListItems([makeCatalogItem({ product_name: 'Сирник', stop_listed_on: today })], today),
    ]);
    expect(counts['/admin']).toEqual({ count: 3 });
    expect(counts['/admin/fiscal']).toEqual({ count: 1, alert: true });
    expect(counts['/admin/stock']).toEqual({ count: 3, alert: false });
  });

  it('is empty when nothing waits', () => {
    expect(navCounts([])).toEqual({});
  });
});
