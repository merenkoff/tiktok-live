// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The pure half of the kitchen board: clocks, columns, the optimistic move
// and the stop-list rows.

import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '@pos/platform';
import {
  applyPrep,
  clockOffset,
  formatWait,
  groupStopList,
  orderLabel,
  serverMessage,
  splitColumns,
  waitSeconds,
  waitTone,
} from './kitchen';
import type { KitchenOrder } from '../types';

function order(over: Partial<KitchenOrder>): KitchenOrder {
  return {
    id: 1,
    order_no: 7,
    receipt_number: 'R-00007',
    prep_status: 'new',
    created_at: '2026-09-20T10:00:00.000Z',
    ready_at: null,
    staff_name: 'Марта',
    note: null,
    items: [],
    ...over,
  };
}

describe('kitchen clocks', () => {
  it('measures every wait on the server clock, not the tablet’s', () => {
    // The tablet runs 30 s slow: the server says 10:00:30 when it says 10:00:00.
    const tablet = Date.parse('2026-09-20T10:00:00.000Z');
    const offset = clockOffset('2026-09-20T10:00:30.000Z', tablet);
    expect(offset).toBe(30_000);
    expect(waitSeconds('2026-09-20T09:58:00.000Z', offset, tablet)).toBe(150);
    // Never negative, whatever the clocks do.
    expect(waitSeconds('2026-09-20T10:05:00.000Z', offset, tablet)).toBe(0);
    expect(clockOffset('not a date', tablet)).toBe(0);
    expect(waitSeconds('not a date', 0, tablet)).toBe(0);
  });

  it('turns amber at five minutes and red at ten', () => {
    expect(waitTone(299)).toBe('ok');
    expect(waitTone(300)).toBe('warn');
    expect(waitTone(599)).toBe('warn');
    expect(waitTone(600)).toBe('late');
  });

  it('formats a wait the way a kitchen reads a clock', () => {
    expect(formatWait(0)).toBe('0:00');
    expect(formatWait(65)).toBe('1:05');
    expect(formatWait(3600)).toBe('1:00:00');
    expect(formatWait(3725.9)).toBe('1:02:05');
    expect(formatWait(-5)).toBe('0:00');
  });
});

describe('kitchen columns', () => {
  it('splits new from ready and keeps each column’s order', () => {
    const a = order({ id: 1, prep_status: 'new' });
    const b = order({ id: 2, prep_status: 'ready', ready_at: '2026-09-20T10:01:00.000Z' });
    const c = order({ id: 3, prep_status: 'new' });
    expect(splitColumns([a, b, c])).toEqual({ inWork: [a, c], pickup: [b] });
  });

  it('calls out the daily number, and the receipt when there is none', () => {
    expect(orderLabel({ order_no: 42, receipt_number: 'R-00042' })).toBe('42');
    expect(orderLabel({ order_no: null, receipt_number: 'R-00042' })).toBe('R-00042');
  });

  it('moves an order the moment it is tapped: «Готово» to the shelf, «Видано» off the board', () => {
    const list = [order({ id: 1 }), order({ id: 2 })];
    const ready = applyPrep(list, 1, 'ready', '2026-09-20T10:02:00.000Z');
    expect(ready[0]).toMatchObject({ id: 1, prep_status: 'ready', ready_at: '2026-09-20T10:02:00.000Z' });
    expect(ready[1]).toBe(list[1]);
    // A second «Готово» keeps the first stamp.
    expect(applyPrep(ready, 1, 'ready', '2026-09-20T10:03:00.000Z')[0].ready_at).toBe(
      '2026-09-20T10:02:00.000Z'
    );
    expect(applyPrep(ready, 1, 'served', '2026-09-20T10:04:00.000Z').map((o) => o.id)).toEqual([2]);
    expect(applyPrep(list, 99, 'served', '')).toEqual(list);
  });
});

describe('stop-list rows', () => {
  const item = (over: Partial<CatalogItem>): CatalogItem => ({
    variant_id: 1,
    product_id: 1,
    product_name: 'Латте',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 6500,
    quantity: 10,
    image_url: null,
    ...over,
  });

  it('is one row per product, on the menu only, alphabetical, with the stock summed', () => {
    const rows = groupStopList([
      item({ variant_id: 1, product_id: 1, product_name: 'Латте', label: 'S', quantity: 3 }),
      item({ variant_id: 2, product_id: 1, product_name: 'Латте', label: 'M', quantity: 0, stop_listed: true }),
      item({ variant_id: 3, product_id: 2, product_name: 'Круасан', quantity: 0 }),
      item({ variant_id: 4, product_id: 9, product_name: 'Зерно', sellable: false }),
    ]);
    expect(rows.map((r) => [r.name, r.stop_listed, r.stock])).toEqual([
      ['Круасан', false, 0],
      ['Латте', true, 3],
    ]);
  });
});

describe('serverMessage', () => {
  it('prefers what the server said and falls back otherwise', () => {
    expect(serverMessage({ response: { data: { error: 'Замовлення вже видано' } } }, 'x')).toBe(
      'Замовлення вже видано'
    );
    expect(serverMessage({ response: { data: { error: '  ' } } }, 'x')).toBe('x');
    expect(serverMessage(new Error('boom'), 'x')).toBe('x');
    expect(serverMessage(null, 'x')).toBe('x');
  });
});
