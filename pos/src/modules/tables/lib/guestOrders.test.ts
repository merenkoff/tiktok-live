// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { acceptLabel, acceptableLines, alertCount, alertKeys, alertsByTable, blockedLineIds, callWords, elsewhere, feedHeadline, minutesWaiting, plural, refusedLineId, requestsLabel, sentCaption, waitingByTable, waitingLabel } from './guestOrders';
import type { GuestOrder, GuestOrderLine, SentGuestOrder, WaiterCall } from './types';

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

// ── Q8/Q9 ────────────────────────────────────────────────────────────────

const call = (over: Partial<WaiterCall> = {}): WaiterCall => ({
  id: 70,
  kind: 'waiter',
  table_id: 11,
  table_name: '5',
  hall_name: 'Зала',
  created_at: '2026-10-16T10:00:00.000Z',
  expires_at: '2026-10-16T10:15:00.000Z',
  has_open_bill: false,
  ...over,
});

const sentOrder = (over: Partial<SentGuestOrder> = {}): SentGuestOrder => ({
  id: 80,
  table_id: 12,
  table_name: '6',
  hall_name: 'Зала',
  created_at: '2026-10-16T10:00:00.000Z',
  bill_id: 90,
  round_seq: 3,
  bill_opened_by_guest: false,
  total_cents: 28500,
  lines: [{ name: 'Борщ', caption: '', quantity: 1, note: '' }],
  ...over,
});

describe('plural', () => {
  it('counts the Ukrainian way, teens included', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, 'виклик', 'виклики', 'викликів'))).toEqual([
      '1 виклик',
      '2 виклики',
      '5 викликів',
      '11 викликів',
      '12 викликів',
      '21 виклик',
      '22 виклики',
      '25 викликів',
      '111 викликів',
    ]);
  });
});

describe('alerts per table', () => {
  const feed = {
    orders: [order([line()], { id: 5, table_id: 11 }), order([line()], { id: 6, table_id: 11 })],
    sent: [sentOrder({ id: 80, table_id: 12 }), sentOrder({ id: 81, table_id: 12 })],
    calls: [call({ id: 70, table_id: 11, kind: 'waiter' }), call({ id: 71, table_id: 11, kind: 'bill' }), call({ id: 72, table_id: 13, kind: 'bill' })],
  };

  it('gathers requests, calls and auto-sent orders under their table', () => {
    const map = alertsByTable(feed);
    expect(map.get(11)).toEqual({ requests: 2, waiter: true, bill: true, sent: 0, low: null });
    expect(map.get(12)).toEqual({ requests: 0, waiter: false, bill: false, sent: 2, low: null });
    expect(map.get(13)).toEqual({ requests: 0, waiter: false, bill: true, sent: 0, low: null });
    expect(map.has(14)).toBe(false);
  });

  it('counts each thing once for a hall tab', () => {
    const map = alertsByTable(feed);
    expect(alertCount(map.get(11))).toBe(4);
    expect(alertCount(map.get(12))).toBe(2);
    expect(alertCount(undefined)).toBe(0);
  });

  it('keys each thing by kind, so a request and a call with one id are two things', () => {
    const keys = alertKeys({ orders: [order([line()], { id: 70 })], sent: [], calls: [call({ id: 70 })] });
    expect([...keys].sort()).toEqual(['call:70', 'order:70']);
  });

  it('heads the list with only what there is', () => {
    expect(feedHeadline({ requests: 3, sent: 1, calls: 2 })).toBe('2 виклики · 1 на кухні без офіціанта · 3 запити');
    expect(feedHeadline({ requests: 1, sent: 0, calls: 0 })).toBe('1 запит');
    expect(feedHeadline({ requests: 0, sent: 0, calls: 1 })).toBe('1 виклик');
  });

  it('says what a call asks for, and which round an order became', () => {
    expect(callWords('waiter')).toBe('Кличе офіціанта');
    expect(callWords('bill')).toBe('Просить рахунок');
    expect(sentCaption(sentOrder({ round_seq: 3 }))).toBe('Уже на кухні · замовлення 3');
    expect(sentCaption(sentOrder({ round_seq: null }))).toBe('Уже на кухні');
  });
});

describe('the rest of the room, from one bill', () => {
  it('leaves this table out and puts the most urgent first: a call, then an order cooking, then a request', () => {
    const list = elsewhere(
      {
        orders: [order([line()], { id: 5, table_id: 14, table_name: '9' }), order([line()], { id: 6, table_id: 11, table_name: '5' })],
        sent: [sentOrder({ table_id: 12, table_name: '6' })],
        calls: [
          call({ id: 71, kind: 'bill', table_id: 13, table_name: '7' }),
          call({ id: 72, kind: 'waiter', table_id: 15, table_name: '10' }),
          call({ id: 73, kind: 'waiter', table_id: 11, table_name: '5' }),
        ],
      },
      11
    );
    expect(list).toEqual([
      { table_id: 15, table_name: '10', words: 'кличе офіціанта' },
      { table_id: 13, table_name: '7', words: 'просить рахунок' },
      { table_id: 12, table_name: '6', words: 'замовив сам' },
      { table_id: 14, table_name: '9', words: 'запит' },
    ]);
  });

  it('names a table once, by the most urgent thing at it', () => {
    const list = elsewhere(
      { orders: [order([line()], { table_id: 12, table_name: '6' })], sent: [sentOrder({ table_id: 12 })], calls: [call({ table_id: 12, table_name: '6' })] },
      null
    );
    expect(list).toEqual([{ table_id: 12, table_name: '6', words: 'кличе офіціанта' }]);
  });
});

describe('a low score from a table (F6)', () => {
  const low = (id: number, table_id: number, score: number) =>
    ({ id, table_id, score, score_word: '', tag_labels: [], comment: null, table_name: String(table_id), hall_name: '', created_at: '', has_open_bill: false }) as never;

  it('marks the table with its lowest score, counts as one more thing to walk over for, and has its own chime key', () => {
    const feed = { orders: [], sent: [], calls: [], feedback: [low(1, 11, 3), low(2, 11, 1), low(3, 12, 2)] };
    const alerts = alertsByTable(feed);
    expect(alerts.get(11)?.low).toBe(1);
    expect(alerts.get(12)?.low).toBe(2);
    expect(alerts.get(13)).toBeUndefined();
    expect(alertCount(alerts.get(11))).toBe(1);
    expect(alertKeys(feed)).toEqual(new Set(['feedback:1', 'feedback:2', 'feedback:3']));
    expect(feedHeadline({ requests: 0, sent: 0, calls: 1, feedback: 2 })).toBe('1 виклик · 2 низькі оцінки');
  });

  it('reads an older backend — no feedback at all — as no low scores', () => {
    const alerts = alertsByTable({ orders: [], sent: [], calls: [] });
    expect(alerts.size).toBe(0);
    expect(alertKeys({ orders: [], sent: [], calls: [] }).size).toBe(0);
    expect(feedHeadline({ requests: 1, sent: 0, calls: 0 })).toBe('1 запит');
  });
});
