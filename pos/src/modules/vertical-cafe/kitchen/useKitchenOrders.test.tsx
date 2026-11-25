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
const delayRemote = vi.fn();

vi.mock('./kitchenApi', () => ({
  listOrders: () => listOrders(),
  setPrep: (...a: unknown[]) => setPrep(...a),
  delayRemote: (...a: unknown[]) => delayRemote(...a),
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
      await result.current.markReady({ id: 1, kind: 'sale' });
    });
    expect(setPrep).toHaveBeenCalledWith({ id: 1, kind: 'sale' }, 'ready');
    expect(result.current.orders[0]).toMatchObject({ prep_status: 'ready', ready_at: 'srv' });
    expect(result.current.banner).toBeNull();

    listOrders.mockResolvedValue(board([]));
    await act(async () => {
      await result.current.markServed({ id: 1, kind: 'sale' });
    });
    expect(setPrep).toHaveBeenLastCalledWith({ id: 1, kind: 'sale' }, 'served');
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
      await result.current.markReady({ id: 1, kind: 'sale' });
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
  describe('«+10 хв» on a cafe’s order (РК4)', () => {
    const remote = (cookBy: string) =>
      order({ id: 5, kind: 'remote', cook_by: cookBy, promised_at: cookBy } as Partial<KitchenOrder>);

    it('sends one delay however fast the second tap comes, and lets the next one go once it is done', async () => {
      let finish: (v: unknown) => void = () => undefined;
      delayRemote.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
      const { result } = renderHook(() => useKitchenOrders(true));
      await act(async () => {
        await Promise.resolve();
      });
      let first: Promise<void> = Promise.resolve();
      act(() => {
        first = result.current.delayRemote({ id: 5 });
      });
      expect(result.current.delaying.has(5)).toBe(true);
      await act(async () => {
        await result.current.delayRemote({ id: 5 });
      });
      expect(delayRemote).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish({ id: 5, promised_at: null });
        await first;
      });
      expect(result.current.delaying.has(5)).toBe(false);
      delayRemote.mockResolvedValueOnce({ id: 5, promised_at: null });
      await act(async () => {
        await result.current.delayRemote({ id: 5 });
      });
      expect(delayRemote).toHaveBeenCalledTimes(2);
    });

    it('drops a read that started before the tap, so the old promise does not come back', async () => {
      const late = remote('2026-09-20T09:55:00.000Z');
      const moved = remote('2026-09-20T10:05:00.000Z');
      listOrders.mockResolvedValue(board([late]));
      const { result } = renderHook(() => useKitchenOrders(true));
      await act(async () => {
        await Promise.resolve();
      });
      // A poll leaves before the tap and answers after it, with the board as it was.
      let answerOld: (b: KitchenBoard) => void = () => undefined;
      listOrders.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
      await act(async () => {
        vi.advanceTimersByTime(POLL_MS);
      });
      delayRemote.mockResolvedValueOnce({ id: 5, promised_at: moved.promised_at });
      listOrders.mockResolvedValue(board([moved]));
      await act(async () => {
        await result.current.delayRemote({ id: 5 });
      });
      expect(result.current.orders[0]?.cook_by).toBe(moved.cook_by);
      await act(async () => {
        answerOld(board([late]));
        await Promise.resolve();
      });
      expect(result.current.orders[0]?.cook_by).toBe(moved.cook_by);
    });
  });
});
