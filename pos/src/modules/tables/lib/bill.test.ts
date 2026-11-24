// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  billTotals,
  canCancelRound,
  carriedOfLine,
  firedLineCents,
  isEmptyBill,
  lineTitle,
  liveRounds,
  previewLineCents,
  roundCarried,
} from './bill';
import type { Bill, BillLine, BillRound } from './types';

const line = (over: Partial<BillLine> = {}): BillLine => ({
  id: 1,
  variant_id: 5,
  quantity: 2,
  product_name: 'Латте',
  variant_label: 'M · вівсяне',
  unit: 'шт',
  unit_price_cents: null,
  compare_at_unit_cents: null,
  preview_unit_price_cents: 8000,
  components: null,
  modifiers: [],
  note: '',
  added_by: 1,
  added_by_name: 'Марта',
  sort_order: 0,
  ...over,
});

const round = (over: Partial<BillRound> = {}): BillRound => ({
  id: 7,
  seq: 1,
  fired_at: '2026-09-21T18:00:00.000Z',
  fired_by: 1,
  fired_by_name: 'Марта',
  prep_status: 'new',
  ready_at: null,
  served_at: null,
  cancelled_at: null,
  items: [],
  total_cents: 16000,
  ...over,
});

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 90,
  bill_no: 3,
  status: 'open',
  table_id: 11,
  table_name: '5',
  hall_id: 1,
  hall_name: 'Зала',
  guests: 2,
  note: null,
  customer_id: null,
  precheck_printed_at: null,
  opened_by: 1,
  opened_by_name: 'Марта',
  opened_at: '2026-09-21T18:00:00.000Z',
  closed_at: null,
  rounds: [],
  draft: [],
  fired_total_cents: 0,
  draft_preview_cents: 0,
  ...over,
});

describe('liveRounds and canCancelRound', () => {
  it('keeps a cancelled round on the bill but out of the arithmetic', () => {
    const b = bill({ rounds: [round({ id: 1 }), round({ id: 2, cancelled_at: 'x' })] });
    expect(liveRounds(b).map((r) => r.id)).toEqual([1]);
  });

  it('offers cancel until the round is handed over', () => {
    expect(canCancelRound(round({ prep_status: 'new' }))).toBe(true);
    expect(canCancelRound(round({ prep_status: 'ready' }))).toBe(true);
    // A dish that reached the guest is RETURNED, not cancelled (К4d).
    expect(canCancelRound(round({ prep_status: 'served' }))).toBe(false);
    expect(canCancelRound(round({ cancelled_at: 'x' }))).toBe(false);
  });
});

describe('isEmptyBill', () => {
  it('is empty with nothing alive, nothing typed and nothing paid', () => {
    expect(isEmptyBill(bill({ rounds: [], draft: [] }))).toBe(true);
    expect(isEmptyBill(bill({ rounds: [round({ cancelled_at: 'x' })], draft: [] }))).toBe(true);
  });

  it('is not empty with a live round, a typed line, a paid line or once closed', () => {
    expect(isEmptyBill(bill({ rounds: [round()], draft: [] }))).toBe(false);
    expect(isEmptyBill(bill({ rounds: [], draft: [line()] }))).toBe(false);
    const paid = round({ cancelled_at: 'x', items: [line({ id: 9, sale_id: 4 })] });
    expect(isEmptyBill(bill({ rounds: [paid], draft: [] }))).toBe(false);
    expect(isEmptyBill(bill({ rounds: [], draft: [], status: 'cancelled' }))).toBe(false);
  });
});

describe('line arithmetic', () => {
  it('prices a fired line by what it locked and a draft by today', () => {
    expect(firedLineCents(line({ unit_price_cents: 8000 }))).toBe(16000);
    expect(previewLineCents(line())).toBe(16000);
  });

  it('says nothing rather than guessing a line it cannot price', () => {
    // A plate assembled at the counter is priced from its parts when the round
    // fires; a second number here would be a different number.
    expect(previewLineCents(line({ preview_unit_price_cents: null }))).toBeNull();
  });

  it('captions a line by what distinguishes it', () => {
    expect(lineTitle(line())).toBe('Латте · M · вівсяне');
    expect(lineTitle(line({ variant_label: '' }))).toBe('Латте');
  });

  it('spells the answers out on a draft and leaves a fired caption alone', () => {
    const answers = [
      {
        modifier_id: 4,
        group_name: 'Молоко',
        name: 'вівсяне',
        price_delta_cents: 1500,
        sort_order: 0,
      },
    ];
    // A draft's label is the plain variant — without this, two lattes that
    // differ only in the milk read identically while they can still be fixed.
    expect(lineTitle(line({ variant_label: 'M', modifiers: answers }))).toBe('Латте · M · вівсяне');
    // A fired line already carries the caption the round composed; appending
    // would say «вівсяне» twice, on the screen and nowhere else.
    expect(lineTitle(line({ variant_label: 'M · вівсяне', modifiers: answers }), true)).toBe(
      'Латте · M · вівсяне'
    );
  });
});

describe('billTotals', () => {
  it('keeps what is owed apart from what is only typed', () => {
    const b = bill({
      fired_total_cents: 16000,
      draft_preview_cents: 5500,
      draft: [line({ id: 2 })],
    });
    expect(billTotals(b)).toEqual({ owed: 16000, draft: 5500, draftExact: true });
  });

  it('marks the draft inexact when a line could not be priced', () => {
    const b = bill({
      draft_preview_cents: 5500,
      draft: [line({ id: 2 }), line({ id: 3, preview_unit_price_cents: null })],
    });
    expect(billTotals(b).draftExact).toBe(false);
  });
});

describe('what the waiters carried («Роздача»)', () => {
  it('counts a line’s carried plates, never more than were fired', () => {
    expect(carriedOfLine(line({ quantity: 3, served_quantity: 1 }))).toBe(1);
    expect(carriedOfLine(line({ quantity: 3, served_quantity: 7 }))).toBe(3);
    expect(carriedOfLine(line({ quantity: 3 }))).toBe(0);
  });

  it('says «винесено k з n» only for a round still being served', () => {
    const items = [line({ id: 1, quantity: 2, served_quantity: 2 }), line({ id: 2, quantity: 3, served_quantity: 1 })];
    expect(roundCarried(round({ items }))).toEqual({ carried: 3, total: 5 });
    expect(roundCarried(round({ items: [line({ quantity: 2 })] }))).toBeNull();
    // A handed-over or cancelled round says so in its own word.
    expect(roundCarried(round({ items, prep_status: 'served' }))).toBeNull();
    expect(roundCarried(round({ items, cancelled_at: 'x' }))).toBeNull();
  });
});
