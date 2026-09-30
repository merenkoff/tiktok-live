// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuestOrder } from './types';

const listGuestOrders = vi.fn();
vi.mock('./tablesApi', () => ({ listGuestOrders: (...a: unknown[]) => listGuestOrders(...a) }));

const { useGuestOrders } = await import('./useGuestOrders');
const { POLL_MS } = await import('./usePolling');

const order = (id: number, tableId = 11): GuestOrder => ({
  id,
  table_id: tableId,
  table_name: '5',
  hall_name: 'Зала',
  created_at: '2026-09-30T10:00:00.000Z',
  expires_at: '2026-09-30T10:30:00.000Z',
  has_open_bill: false,
  lines: [{ id: id * 10, name: 'Борщ', caption: '', quantity: 1, note: '', problem: null }],
});

beforeEach(() => {
  vi.useFakeTimers();
  listGuestOrders.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useGuestOrders', () => {
  it('reads once on mount and hands the list over', async () => {
    listGuestOrders.mockResolvedValue({ orders: [order(1)] });
    const { result } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    expect(result.current.orders.map((o) => o.id)).toEqual([1]);
    // The whole room's, not one table's.
    expect(listGuestOrders).toHaveBeenCalledWith(undefined);
  });

  it('asks for one table only when it is given one', async () => {
    listGuestOrders.mockResolvedValue({ orders: [] });
    renderHook(() => useGuestOrders({ online: true, tableId: 11 }));
    await tick(0);
    expect(listGuestOrders).toHaveBeenCalledWith(11);
  });

  it('picks up a request that arrives between two polls', async () => {
    listGuestOrders.mockResolvedValueOnce({ orders: [] }).mockResolvedValue({ orders: [order(2)] });
    const { result } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    expect(result.current.orders).toEqual([]);
    await tick(POLL_MS);
    expect(result.current.orders.map((o) => o.id)).toEqual([2]);
  });

  it('keeps the same list when a poll finds nothing new, so a panel mid-tap does not re-render', async () => {
    listGuestOrders.mockImplementation(async () => ({ orders: [order(1)] }));
    const { result } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    const first = result.current.orders;
    await tick(POLL_MS);
    expect(listGuestOrders).toHaveBeenCalledTimes(2);
    expect(result.current.orders).toBe(first);
  });

  it('fails quietly and keeps the last answer', async () => {
    listGuestOrders.mockResolvedValueOnce({ orders: [order(1)] }).mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    await tick(POLL_MS);
    // No throw, no error state to show — the map or the bill is fine without it.
    expect(result.current.orders.map((o) => o.id)).toEqual([1]);
  });

  it('treats an answer that is not a list as no requests', async () => {
    // A backend older than Q6 answers 404 (swallowed above); one that answers
    // with something else entirely must not put a non-array where a list goes.
    listGuestOrders.mockResolvedValue({ id: 90, rounds: [] });
    const { result } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    expect(result.current.orders).toEqual([]);
  });

  it('reads nothing, and shows nothing, while the till is out of range', async () => {
    listGuestOrders.mockResolvedValue({ orders: [order(1)] });
    const { result, rerender } = renderHook(({ online }) => useGuestOrders({ online }), {
      initialProps: { online: true },
    });
    await tick(0);
    expect(result.current.orders).toHaveLength(1);
    listGuestOrders.mockClear();

    rerender({ online: false });
    await tick(POLL_MS * 3);
    expect(listGuestOrders).not.toHaveBeenCalled();
    // A list of guests nobody can still answer is worse than none.
    expect(result.current.orders).toEqual([]);
  });

  it('re-reads on demand, which is what accepting does', async () => {
    listGuestOrders.mockResolvedValueOnce({ orders: [order(1)] }).mockResolvedValue({ orders: [] });
    const { result } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.orders).toEqual([]);
  });

  it('stops when the screen goes away', async () => {
    listGuestOrders.mockResolvedValue({ orders: [] });
    const { unmount } = renderHook(() => useGuestOrders({ online: true }));
    await tick(0);
    unmount();
    listGuestOrders.mockClear();
    await tick(POLL_MS * 3);
    expect(listGuestOrders).not.toHaveBeenCalled();
  });
});
