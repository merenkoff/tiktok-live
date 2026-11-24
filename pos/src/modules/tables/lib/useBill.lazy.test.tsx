// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A table nobody has ordered at has no bill (§4.1): the screen opens on the
// table alone, and the first write that needs a bill seats it — once, ahead of
// the dish that caused it, through the same queue.

import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '@pos/platform';
import type { DishChoice } from './draft';
import type { Bill, BillLine, OpenBillSummary } from './types';

const getBill = vi.fn();
const addLine = vi.fn();
const listOpenBills = vi.fn();
const seatTable = vi.fn();
const updateBill = vi.fn();
vi.mock('./tablesApi', () => ({
  getBill: (...a: unknown[]) => getBill(...a),
  addLine: (...a: unknown[]) => addLine(...a),
  listOpenBills: (...a: unknown[]) => listOpenBills(...a),
  seatTable: (...a: unknown[]) => seatTable(...a),
  updateBill: (...a: unknown[]) => updateBill(...a),
}));

const { useBill } = await import('./useBill');
const { POLL_MS } = await import('./usePolling');

const DISH: DishChoice = {
  item: {
    variant_id: 9,
    product_id: 2,
    product_name: 'Борщ',
    label: '',
    price_cents: 5500,
    modifier_groups: [],
  } as unknown as CatalogItem,
  modifiers: [],
  note: '',
};

const line = (id: number): BillLine => ({
  id,
  variant_id: 9,
  quantity: 1,
  product_name: 'Борщ',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: null,
  compare_at_unit_cents: null,
  preview_unit_price_cents: 5500,
  components: null,
  modifiers: [],
  note: '',
  sale_id: null,
  added_by: 1,
  added_by_name: 'Марта',
  sort_order: 0,
});

const bill = (draft: BillLine[] = [], over: Partial<Bill> = {}): Bill => ({
  id: 90,
  bill_no: 12,
  status: 'open',
  table_id: 11,
  table_name: '5',
  hall_id: 1,
  hall_name: 'Зала',
  guests: 1,
  note: null,
  customer_id: null,
  precheck_printed_at: null,
  opened_by: 1,
  opened_by_name: 'Марта',
  opened_at: '2026-11-24T10:00:00.000Z',
  closed_at: null,
  rounds: [],
  draft,
  fired_total_cents: 0,
  draft_preview_cents: draft.length * 5500,
  ...over,
});

const summary = (tableId: number, id = 90): OpenBillSummary => ({
  id,
  bill_no: 12,
  table_id: tableId,
  guests: 1,
  opened_at: '2026-11-24T10:00:00.000Z',
  opened_by: 2,
  opened_by_name: 'Олег',
  precheck_printed_at: null,
  fired_total_cents: 0,
  draft_count: 0,
  live_rounds: 0,
  prep_status: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of [getBill, addLine, listOpenBills, seatTable, updateBill]) fn.mockReset();
  listOpenBills.mockResolvedValue({ bills: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function tick(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useBill on a free table', () => {
  it('opens on the table alone and seats nobody by looking', async () => {
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();
    expect(result.current.loading).toBe(false);
    expect(result.current.bill).toBeNull();
    expect(result.current.billId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(seatTable).not.toHaveBeenCalled();
    expect(listOpenBills).toHaveBeenCalledTimes(1);
  });

  it('seats the table with the first dish, then puts the dish on that bill', async () => {
    let releaseSeat: (v: { bill: Bill; created: boolean }) => void = () => undefined;
    seatTable.mockImplementation(() => new Promise((resolve) => (releaseSeat = resolve)));
    addLine.mockResolvedValue(bill([line(3)]));
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    await act(async () => {
      result.current.addLine(DISH);
    });
    // On screen at once, before the table is even seated.
    expect(result.current.pending).toHaveLength(1);
    await act(async () => {
      releaseSeat({ bill: bill(), created: true });
    });
    await tick();

    expect(seatTable).toHaveBeenCalledTimes(1);
    expect(seatTable.mock.calls[0][0]).toBe(11);
    expect(seatTable.mock.calls[0][1].clientUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(addLine).toHaveBeenCalledWith(90, expect.objectContaining({ variant_id: 9, quantity: 1 }));
    expect(result.current.billId).toBe(90);
    expect(result.current.bill?.draft.map((l) => l.id)).toEqual([3]);
    expect(result.current.pending).toHaveLength(0);
  });

  it('seats once for three quick taps, and sends the dishes in tap order', async () => {
    let releaseSeat: (v: { bill: Bill; created: boolean }) => void = () => undefined;
    seatTable.mockImplementation(() => new Promise((resolve) => (releaseSeat = resolve)));
    addLine.mockResolvedValue(bill([line(3)]));
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    await act(async () => {
      result.current.addLine(DISH);
      result.current.addLine(DISH);
      result.current.addLine(DISH);
    });
    await act(async () => {
      releaseSeat({ bill: bill(), created: true });
    });
    await tick();
    expect(seatTable).toHaveBeenCalledTimes(1);
    expect(addLine).toHaveBeenCalledTimes(3);
    expect(addLine.mock.calls.every((c) => c[0] === 90)).toBe(true);
  });

  it('takes up a bill another waiter opened on this table', async () => {
    listOpenBills
      .mockResolvedValueOnce({ bills: [] })
      .mockResolvedValue({ bills: [summary(12, 70), summary(11, 91)] });
    getBill.mockResolvedValue(bill([line(4)], { id: 91, opened_by_name: 'Олег' }));
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();
    expect(result.current.bill).toBeNull();

    await tick(POLL_MS);
    expect(getBill).toHaveBeenCalledWith(91);
    expect(result.current.billId).toBe(91);
    expect(result.current.bill?.opened_by_name).toBe('Олег');
  });

  it('drops every dish waiting on a seat the server refused, with its sentence once', async () => {
    seatTable.mockRejectedValue({ response: { data: { error: 'Стіл не знайдено' } } });
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    await act(async () => {
      result.current.addLine(DISH);
      result.current.addLine(DISH);
    });
    await tick();
    expect(seatTable).toHaveBeenCalledTimes(1);
    expect(addLine).not.toHaveBeenCalled();
    expect(result.current.banner).toBe('Стіл не знайдено');
    expect(result.current.pending).toHaveLength(0);
    expect(result.current.bill).toBeNull();
  });

  it('seats a free table with the guests count', async () => {
    seatTable.mockResolvedValue({ bill: bill([], { guests: 4 }), created: true });
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    let ok = false;
    await act(async () => {
      ok = await result.current.setGuests(4);
    });
    expect(ok).toBe(true);
    expect(seatTable).toHaveBeenCalledWith(11, expect.objectContaining({ guests: 4 }));
    expect(updateBill).not.toHaveBeenCalled();
    expect(result.current.bill?.guests).toBe(4);
  });

  it('keeps its own count when somebody seated the table a moment earlier', async () => {
    seatTable.mockResolvedValue({ bill: bill([], { guests: 2 }), created: false });
    updateBill.mockResolvedValue(bill([], { guests: 5 }));
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    await act(async () => {
      await result.current.setGuests(5);
    });
    expect(updateBill).toHaveBeenCalledWith(90, { guests: 5 });
    expect(result.current.bill?.guests).toBe(5);
  });

  it('changes the count on a bill that is already open', async () => {
    getBill.mockResolvedValue(bill());
    updateBill.mockResolvedValue(bill([], { guests: 3 }));
    const { result } = renderHook(() => useBill({ billId: 90 }, { online: true }));
    await tick();

    await act(async () => {
      await result.current.setGuests(3);
    });
    expect(seatTable).not.toHaveBeenCalled();
    expect(updateBill).toHaveBeenCalledWith(90, { guests: 3 });
  });

  it('refuses a bill-only write while there is no bill, without asking the server', async () => {
    const write = vi.fn();
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    let ok = true;
    await act(async () => {
      ok = await result.current.run(write);
    });
    expect(ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(result.current.banner).toBe('Рахунок ще не відкрито');
  });

  it('takes the bill a free write opened by itself (a guest request accepted)', async () => {
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();

    await act(async () => {
      await result.current.runFree(async () => bill([line(5)], { id: 95 }));
    });
    expect(seatTable).not.toHaveBeenCalled();
    expect(result.current.billId).toBe(95);
  });

  it('goes back to a free table when its bill was closed elsewhere', async () => {
    seatTable.mockResolvedValue({ bill: bill(), created: true });
    addLine.mockResolvedValue(bill([line(3)]));
    const { result } = renderHook(() => useBill({ tableId: 11 }, { online: true }));
    await tick();
    await act(async () => {
      result.current.addLine(DISH);
    });
    await tick();
    expect(result.current.billId).toBe(90);

    getBill.mockResolvedValue(bill([], { status: 'cancelled' }));
    await tick(POLL_MS);
    expect(result.current.bill).toBeNull();
    expect(result.current.billId).toBeNull();
  });
});
