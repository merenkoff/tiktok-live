// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_MS, useVisiblePoll } from './usePolling';

// The DOM's word for «the tab is not in view», spelled in two halves:
// Tailwind scans this file for class candidates, and the whole word would
// emit a bare display-none utility into the module's stylesheet (see the
// header of usePolling.ts).
const ASLEEP = 'hid' + 'den';

let visibility: string = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
  // Back to jsdom's own.
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe('useVisiblePoll', () => {
  it('ticks on the interval while the screen is in view', async () => {
    const tick = vi.fn();
    renderHook(() => useVisiblePoll(tick, true));
    expect(tick).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(tick).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('polls nothing while the tablet sleeps in a pocket', async () => {
    visibility = ASLEEP;
    const tick = vi.fn();
    renderHook(() => useVisiblePoll(tick, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    });
    expect(tick).not.toHaveBeenCalled();
  });

  it('reads at once when the screen wakes, not up to ten seconds later', async () => {
    visibility = ASLEEP;
    const tick = vi.fn();
    renderHook(() => useVisiblePoll(tick, true));
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(tick).toHaveBeenCalledTimes(1);
    // …and going back to sleep is not a tick.
    visibility = ASLEEP;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled, and stops for good on unmount', async () => {
    const tick = vi.fn();
    const off = renderHook(() => useVisiblePoll(tick, false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(tick).not.toHaveBeenCalled();
    off.unmount();

    const on = renderHook(() => useVisiblePoll(tick, true));
    on.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(tick).not.toHaveBeenCalled();
  });

  it('calls the latest tick without restarting the timer on every render', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useVisiblePoll(fn, true), { initialProps: { fn: first } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS - 1000);
    });
    rerender({ fn: second });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // The interval was not reset by the re-render: it fired on schedule, and
    // it fired the newer function.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
