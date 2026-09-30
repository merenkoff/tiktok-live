// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill screen re-reads its bill while it is in view (Q7) — and must never
// let that read undo a tap.

import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '@pos/platform';
import type { DishChoice } from './draft';
import type { Bill, BillLine } from './types';

const getBill = vi.fn();
const addLine = vi.fn();
vi.mock('./tablesApi', () => ({
  getBill: (...a: unknown[]) => getBill(...a),
  addLine: (...a: unknown[]) => addLine(...a),
}));

const { useBill } = await import('./useBill');
const { POLL_MS } = await import('./usePolling');

/** A dish with no questions, as the menu hands it over on a tap. */
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

const line = (id: number, name = 'Круасан'): BillLine => ({
  id,
  variant_id: 9,
  quantity: 1,
  product_name: name,
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

const bill = (draft: BillLine[] = []): Bill => ({
  id: 90,
  bill_no: 12,
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
  opened_at: '2026-09-30T10:00:00.000Z',
  closed_at: null,
  rounds: [],
  draft,
  fired_total_cents: 0,
  draft_preview_cents: draft.length * 5500,
});

beforeEach(() => {
  vi.useFakeTimers();
  getBill.mockReset();
  addLine.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useBill polling', () => {
  it('shows what another waiter (or an accepted request) changed, without a tap', async () => {
    getBill.mockResolvedValueOnce(bill()).mockResolvedValue(bill([line(3)]));
    const { result } = renderHook(() => useBill(90, { online: true }));
    await tick(0);
    expect(result.current.bill?.draft).toHaveLength(0);
    await tick(POLL_MS);
    expect(result.current.bill?.draft.map((l) => l.id)).toEqual([3]);
  });

  it('keeps the very same bill when nothing changed, so an open sheet does not re-render', async () => {
    getBill.mockImplementation(async () => bill([line(3)]));
    const { result } = renderHook(() => useBill(90, { online: true }));
    await tick(0);
    const first = result.current.bill;
    await tick(POLL_MS);
    expect(getBill).toHaveBeenCalledTimes(2);
    expect(result.current.bill).toBe(first);
  });

  it('shows no error when a poll fails — a blink of the Wi-Fi is not a broken bill', async () => {
    getBill.mockResolvedValueOnce(bill([line(3)])).mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useBill(90, { online: true }));
    await tick(0);
    await tick(POLL_MS);
    expect(result.current.error).toBeNull();
    expect(result.current.banner).toBeNull();
    expect(result.current.bill?.draft).toHaveLength(1);
  });

  it('recovers a bill that could not be read the first time', async () => {
    getBill.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue(bill([line(3)]));
    const { result } = renderHook(() => useBill(90, { online: true }));
    await tick(0);
    expect(result.current.error).not.toBeNull();
    await tick(POLL_MS);
    expect(result.current.error).toBeNull();
    expect(result.current.bill?.draft).toHaveLength(1);
  });

  it('reads nothing while the till is out of range', async () => {
    getBill.mockResolvedValue(bill());
    renderHook(() => useBill(90, { online: false }));
    await tick(POLL_MS * 3);
    expect(getBill).not.toHaveBeenCalled();
  });

  it('throws away a poll that started before a tap and lands after it', async () => {
    // The race that would make a dish vanish for ten seconds: the poll asks,
    // the waiter taps, the tap's answer arrives — and then the OLDER poll
    // answer, without the dish, arrives and overwrites it.
    let releasePoll: (b: Bill) => void = () => undefined;
    getBill
      .mockResolvedValueOnce(bill())
      .mockImplementationOnce(() => new Promise<Bill>((resolve) => (releasePoll = resolve)));
    addLine.mockResolvedValue(bill([line(3, 'Борщ')]));

    const { result } = renderHook(() => useBill(90, { online: true }));
    await tick(0);
    await tick(POLL_MS); // the poll is now in flight
    expect(getBill).toHaveBeenCalledTimes(2);

    await act(async () => {
      result.current.addLine(DISH);
    });
    await tick(0);
    expect(result.current.bill?.draft.map((l) => l.product_name)).toEqual(['Борщ']);

    // The old answer lands late, without the dish.
    await act(async () => {
      releasePoll(bill());
    });
    await tick(0);
    expect(result.current.bill?.draft.map((l) => l.product_name)).toEqual(['Борщ']);
  });

  it('does not start a read while a write is still queued', async () => {
    let releaseWrite: (b: Bill) => void = () => undefined;
    getBill.mockResolvedValue(bill());
    addLine.mockImplementation(() => new Promise<Bill>((resolve) => (releaseWrite = resolve)));

    const { result } = renderHook(() => useBill(90, { online: true }));
    await tick(0);
    getBill.mockClear();

    await act(async () => {
      result.current.addLine(DISH);
    });
    await tick(POLL_MS * 2);
    // The write is in flight: the poll stays out of its way.
    expect(getBill).not.toHaveBeenCalled();

    await act(async () => {
      releaseWrite(bill([line(3, 'Борщ')]));
    });
    await tick(POLL_MS);
    expect(getBill).toHaveBeenCalledTimes(1);
  });
});
