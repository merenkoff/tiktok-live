// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  acceptableLines,
  acceptLabel,
  blockedLineIds,
  minutesWaiting,
  refusedLineId,
  requestsLabel,
  waitingByTable,
  waitingLabel,
} from './guestOrders';
import type { GuestOrder, GuestOrderLine } from './types';

const line = (over: Partial<GuestOrderLine> = {}): GuestOrderLine => ({
  id: 1,
  name: 'Борщ',
  caption: '',
  quantity: 1,
  note: '',
  problem: null,
  ...over,
});

const order = (lines: GuestOrderLine[], over: Partial<GuestOrder> = {}): GuestOrder => ({
  id: 5,
  table_id: 11,
  table_name: '5',
  hall_name: 'Зала',
  created_at: '2026-09-30T10:00:00.000Z',
  expires_at: '2026-09-30T10:30:00.000Z',
  has_open_bill: false,
  lines,
  ...over,
});

describe('how long the guest has been waiting', () => {
  const at = Date.parse('2026-09-30T10:00:00.000Z');

  it('counts whole minutes and says «щойно» before the first one', () => {
    expect(minutesWaiting('2026-09-30T10:00:00.000Z', at + 3 * 60_000 + 59_000)).toBe(3);
    expect(waitingLabel('2026-09-30T10:00:00.000Z', at + 20_000)).toBe('щойно');
    expect(waitingLabel('2026-09-30T10:00:00.000Z', at + 7 * 60_000)).toBe('7 хв тому');
  });

  it('never goes negative when the two clocks disagree', () => {
    expect(minutesWaiting('2026-09-30T10:00:00.000Z', at - 5 * 60_000)).toBe(0);
    expect(minutesWaiting('not a date', at)).toBe(0);
  });
});

describe('requestsLabel', () => {
  it.each([
    [1, '1 запит'],
    [2, '2 запити'],
    [4, '4 запити'],
    [5, '5 запитів'],
    [11, '11 запитів'],
    [12, '12 запитів'],
    [21, '21 запит'],
    [22, '22 запити'],
  ])('%i → %s', (n, label) => {
    expect(requestsLabel(n)).toBe(label);
  });
});

describe('waitingByTable', () => {
  it('counts requests per table, so two guests at one table read as two', () => {
    const counts = waitingByTable([
      order([line()], { id: 1, table_id: 11 }),
      order([line()], { id: 2, table_id: 11 }),
      order([line()], { id: 3, table_id: 12 }),
    ]);
    expect(counts.get(11)).toBe(2);
    expect(counts.get(12)).toBe(1);
    expect(counts.get(13)).toBeUndefined();
  });
});

describe('which lines can go in', () => {
  const stopped = line({ id: 2, name: 'Стейк', problem: 'сьогодні в стоп-листі' });
  const fine = line({ id: 1 });
  const ran = line({ id: 3, name: 'Десерт' });

  it('blocks what the server flagged and what a refused accept just named — one set', () => {
    const o = order([fine, stopped, ran]);
    expect(blockedLineIds(o)).toEqual([2]);
    expect(blockedLineIds(o, new Set([3]))).toEqual([2, 3]);
    expect(acceptableLines(o, new Set([3])).map((l) => l.id)).toEqual([1]);
  });

  it('says nothing special while everything can go in', () => {
    expect(acceptLabel(order([fine, ran]))).toBe('Прийняти');
  });

  it('says out loud that the button leaves something out', () => {
    expect(acceptLabel(order([fine, stopped]))).toBe('Прийняти без цієї');
    expect(acceptLabel(order([fine, stopped, ran]), new Set([3]))).toBe('Прийняти без них');
  });

  it('has no accept button at all when nothing can go in', () => {
    expect(acceptLabel(order([stopped]))).toBeNull();
    expect(acceptLabel(order([fine, ran]), new Set([1, 3]))).toBeNull();
  });
});

describe('refusedLineId', () => {
  it('reads the request line the server named on a refused accept', () => {
    expect(refusedLineId({ response: { status: 409, data: { error: 'x', item_id: 42 } } })).toBe(42);
  });

  it('marks nothing when the refusal is not about a line', () => {
    expect(refusedLineId({ response: { status: 409, data: { error: 'Запит уже відхилено' } } })).toBeNull();
    expect(refusedLineId(new Error('Network Error'))).toBeNull();
    expect(refusedLineId({ response: { data: { item_id: 'abc' } } })).toBeNull();
    expect(refusedLineId({ response: { data: { item_id: 0 } } })).toBeNull();
    expect(refusedLineId(undefined)).toBeNull();
  });
});
