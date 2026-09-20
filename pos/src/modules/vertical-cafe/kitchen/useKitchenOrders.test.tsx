// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The board's polling and the two taps: a read on mount and every five
// seconds while enabled, an optimistic move on a tap, and the server's own
// words when it refuses.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KitchenBoard, KitchenOrder } from './types';

const listOrders = vi.fn<[], Promise<KitchenBoard>>();
const setPrep = vi.fn();

vi.mock('./kitchenApi', () => ({
  listOrders: () => listOrders(),
  setPrep: (...a: unknown[]) => setPrep(...a),
}));

const { POLL_MS, useKitchenOrders } = await import('./useKitchenOrders');

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

const board = (orders: KitchenOrder[]): KitchenBoard => ({
  orders,
  now: '2026-09-20T10:00:30.000Z',
});

beforeEach(() => {
  vi.useFakeTimers();
  listOrders.mockResolvedValue(board([order({ id: 1 })]));
  setPrep.mockResolvedValue({ id: 1, prep_status: 'ready', ready_at: 'x', served_at: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useKitchenOrders', () => {
  it('reads on mount and every five seconds while enabled, and stops when disabled', async () => {
    const { result, rerender, unmount } = renderHook(({ on }) => useKitchenOrders(on), {
      initialProps: { on: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(listOrders).toHaveBeenCalledTimes(1);
    expect(result.current.orders.map((o) => o.id)).toEqual([1]);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(listOrders).toHaveBeenCalledTimes(2);

    rerender({ on: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(listOrders).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('does not read at all when never enabled', async () => {
    renderHook(() => useKitchenOrders(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('moves the order the moment «Готово» is tapped, then re-reads', async () => {
    const { result } = renderHook(() => useKitchenOrders(true));
    await act(async () => {
      await Promise.resolve();
    });
    listOrders.mockResolvedValue(board([order({ id: 1, prep_status: 'ready', ready_at: 'srv' })]));

    await act(async () => {
      await result.current.markReady(1);
    });
    expect(setPrep).toHaveBeenCalledWith(1, 'ready');
    expect(result.current.orders[0]).toMatchObject({ prep_status: 'ready', ready_at: 'srv' });
    expect(result.current.banner).toBeNull();

    listOrders.mockResolvedValue(board([]));
    await act(async () => {
      await result.current.markServed(1);
    });
    expect(setPrep).toHaveBeenLastCalledWith(1, 'served');
    expect(result.current.orders).toEqual([]);
  });

  it("shows the server's words when the other screen was faster, and settles on the re-read", async () => {
    const { result } = renderHook(() => useKitchenOrders(true));
    await act(async () => {
      await Promise.resolve();
    });
    setPrep.mockRejectedValueOnce({ response: { data: { error: 'Замовлення вже видано' } } });
    listOrders.mockResolvedValue(board([]));

    await act(async () => {
      await result.current.markReady(1);
    });
    expect(result.current.banner).toBe('Замовлення вже видано');
    expect(result.current.orders).toEqual([]);

    act(() => result.current.clearBanner());
    expect(result.current.banner).toBeNull();
  });

  it('reports a list that cannot be read, and recovers on the next read', async () => {
    listOrders.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useKitchenOrders(true));
    // Under fake timers `waitFor` never advances; flush the microtasks instead.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.error).toBe('Не вдалося прочитати замовлення');
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.orders).toHaveLength(1);
  });
});
