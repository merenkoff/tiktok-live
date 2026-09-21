// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  draftBlocksPayment,
  evenShares,
  isSettled,
  lineCents,
  payableLines,
  selectionCents,
} from './pay';
import type { Bill, BillLine, BillRound } from './types';

const line = (over: Partial<BillLine> = {}): BillLine => ({
  id: 1,
  variant_id: 5,
  quantity: 2,
  product_name: 'Латте',
  variant_label: 'M',
  unit: 'шт',
  unit_price_cents: 6500,
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
  fired_at: '2026-09-21T18:00:00.000Z',
  fired_by: 1,
  fired_by_name: 'Марта',
  prep_status: 'served',
  ready_at: null,
  served_at: null,
  cancelled_at: null,
  items: [line()],
  total_cents: 13000,
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
  opened_at: '2026-09-21T18:00:00.000Z',
  closed_at: null,
  rounds: [round()],
  draft: [],
  fired_total_cents: 13000,
  draft_preview_cents: 0,
  ...over,
});

describe('payableLines', () => {
  it('offers what is still owed, and only that', () => {
    const b = bill({
      rounds: [
        round({ id: 1, items: [line({ id: 1 }), line({ id: 2, sale_id: 500 })] }),
        // A cancelled round owes nothing — its stock went back and nobody ate it.
        round({ id: 2, cancelled_at: 'x', items: [line({ id: 3 })] }),
      ],
    });
    expect(payableLines(b).map(({ line: l }) => l.id)).toEqual([1]);
  });

  it('never offers the draft: the kitchen has not been told about it', () => {
    const b = bill({ rounds: [], draft: [line({ id: 9, unit_price_cents: null })] });
    expect(payableLines(b)).toEqual([]);
    // Which is also the server's refusal, said before it has to refuse.
    expect(draftBlocksPayment(b)).toBe(true);
  });
});

describe('selection arithmetic', () => {
  it('prices a line by what its round locked', () => {
    expect(lineCents(line({ unit_price_cents: 6500, quantity: 2 }))).toBe(13000);
  });

  it('sums only what is ticked', () => {
    const b = bill({
      rounds: [round({ items: [line({ id: 1 }), line({ id: 2, quantity: 1 })] })],
    });
    const lines = payableLines(b);
    expect(selectionCents(lines, new Set([1]))).toBe(13000);
    expect(selectionCents(lines, new Set([1, 2]))).toBe(19500);
    expect(selectionCents(lines, new Set())).toBe(0);
  });
});

describe('evenShares', () => {
  it('adds up to the total, to the kopiyka', () => {
    const shares = evenShares(10000, 3);
    expect(shares).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('puts the odd kopiyka on the first share, not the last', () => {
    // «З мене на копійку більше» is a sentence somebody says out loud; the
    // last guest being short is found only when the receipts are added up.
    expect(evenShares(1001, 2)).toEqual([501, 500]);
  });

  it('degrades sanely', () => {
    expect(evenShares(0, 3)).toEqual([0, 0, 0]);
    expect(evenShares(5000, 1)).toEqual([5000]);
    expect(evenShares(5000, 0)).toEqual([5000]);
  });
});

describe('isSettled', () => {
  it('is settled when nothing is owed, or the bill is closed', () => {
    expect(isSettled(bill())).toBe(false);
    expect(isSettled(bill({ rounds: [round({ items: [line({ sale_id: 5 })] })] }))).toBe(true);
    expect(isSettled(bill({ status: 'paid' }))).toBe(true);
  });
});
