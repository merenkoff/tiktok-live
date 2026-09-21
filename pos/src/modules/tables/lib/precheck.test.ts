// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { buildPrecheck, clockTime } from './precheck';
import type { Bill, BillLine, BillRound } from './types';

const line = (over: Partial<BillLine> = {}): BillLine => ({
  id: 1,
  variant_id: 5,
  quantity: 2,
  product_name: 'Латте',
  variant_label: 'M · вівсяне',
  unit: 'шт',
  unit_price_cents: 8000,
  compare_at_unit_cents: null,
  preview_unit_price_cents: null,
  components: null,
  modifiers: [],
  note: '',
  sale_id: null,
  added_by: 1,
  added_by_name: 'Марта',
  sort_order: 0,
  ...over,
});

const round = (over: Partial<BillRound> = {}): BillRound => ({
  id: 7,
  seq: 1,
  fired_at: '2026-09-21T17:00:00.000Z',
  fired_by: 1,
  fired_by_name: 'Марта',
  prep_status: 'served',
  ready_at: null,
  served_at: null,
  cancelled_at: null,
  items: [line()],
  total_cents: 16000,
  ...over,
});

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 90,
  bill_no: 12,
  status: 'open',
  table_id: 11,
  table_name: '5',
  hall_id: 1,
  hall_name: 'Зала',
  guests: 4,
  note: null,
  customer_id: null,
  precheck_printed_at: null,
  opened_by: 1,
  opened_by_name: 'Марта',
  opened_at: '2026-09-21T16:40:00.000Z',
  closed_at: null,
  rounds: [round()],
  draft: [line({ id: 9, unit_price_cents: null, preview_unit_price_cents: 5500 })],
  fired_total_cents: 16000,
  draft_preview_cents: 11000,
  ...over,
});

describe('buildPrecheck', () => {
  it('lists what the rounds locked, and never the draft', () => {
    const doc = buildPrecheck(bill());
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0]).toMatchObject({
      name: 'Латте',
      variant_label: 'M · вівсяне',
      quantity: 2,
      unit_price_cents: 8000,
      line_total_cents: 16000,
    });
    // A plate the kitchen has not been told about is not something to hand a
    // guest a number for.
    expect(doc.total_cents).toBe(16000);
  });

  it('says what is still owed after one guest of a split has paid', () => {
    const doc = buildPrecheck(
      bill({
        rounds: [
          round({
            items: [line({ id: 1, sale_id: 500 }), line({ id: 2, quantity: 1, unit_price_cents: 7500 })],
          }),
        ],
      })
    );
    // Not `fired_total_cents` — that is what the evening came to, and the
    // paper is about what is left on the table.
    expect(doc.items.map((i) => i.line_total_cents)).toEqual([7500]);
    expect(doc.total_cents).toBe(7500);
  });

  it('carries the table, not the money, in its heading', () => {
    const doc = buildPrecheck(bill(), new Date('2026-09-21T18:41:00.000Z'));
    expect(doc.table_name).toBe('5');
    expect(doc.hall_name).toBe('Зала');
    expect(doc.bill_no).toBe(12);
    expect(doc.guests).toBe(4);
    expect(doc.waiter_name).toBe('Марта');
    expect(doc.printed_at).toMatch(/^\d{2}:\d{2}$/);
    expect(doc.opened_at).toMatch(/^\d{2}:\d{2}$/);
  });

  it('passes the round’s own caption through untouched', () => {
    // Composed by the server at fire time, answers included — the pre-bill
    // and the receipt that follows it must read the same.
    const doc = buildPrecheck(bill({ rounds: [round({ items: [line({ variant_label: '' })] })] }));
    expect(doc.items[0].variant_label).toBe('');
    expect(doc.items[0].name).toBe('Латте');
  });
});

describe('clockTime', () => {
  it('reads HH:MM off the device clock', () => {
    expect(clockTime('2026-09-21T18:41:00.000Z', new Date())).toMatch(/^\d{2}:\d{2}$/);
    expect(clockTime(null, new Date('2026-09-21T18:41:00.000Z'))).toMatch(/^\d{2}:\d{2}$/);
  });

  it('says nothing rather than «NaN:NaN»', () => {
    expect(clockTime('not a date')).toBe('');
  });
});
