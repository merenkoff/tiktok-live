// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveSession } from '../types';

const getCurrentSession = vi.fn<[], Promise<LiveSession | null>>();
const startSession = vi.fn<[], Promise<LiveSession>>();
const stopSession = vi.fn<[], Promise<{ success: boolean }>>();

vi.mock('../lib/liveClient', () => ({
  liveClient: {
    getCurrentSession: () => getCurrentSession(),
    startSession: () => startSession(),
    stopSession: () => stopSession(),
  },
}));

const { useLiveSession } = await import('./useLiveSession');

const running: LiveSession = {
  id: 1,
  user_id: 42,
  status: 'running',
  started_at: '2026-09-07T09:00:00.000Z',
};

describe('useLiveSession', () => {
  beforeEach(() => {
    getCurrentSession.mockReset().mockResolvedValue(null);
    startSession.mockReset().mockResolvedValue(running);
    stopSession.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not poll until enabled', () => {
    renderHook(() => useLiveSession(false));
    expect(getCurrentSession).not.toHaveBeenCalled();
  });

  it('treats "no session" as an empty state, not an error', async () => {
    const { result } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.isActive).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('reports a running session as active', async () => {
    getCurrentSession.mockResolvedValue(running);
    const { result } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    expect(result.current.session?.started_at).toBe(running.started_at);
  });

  it('re-polls every 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useLiveSession(true));
    await waitFor(() => expect(getCurrentSession).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getCurrentSession).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getCurrentSession).toHaveBeenCalledTimes(3);
  });

  it('stops polling on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(getCurrentSession).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(getCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('start() starts the session and refreshes the status', async () => {
    const { result } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    getCurrentSession.mockResolvedValue(running);
    await act(async () => {
      await result.current.start();
    });

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(result.current.isActive).toBe(true);
    expect(result.current.isStarting).toBe(false);
    expect(result.current.actionError).toBeNull();
  });

  it('stop() stops the session and refreshes the status', async () => {
    getCurrentSession.mockResolvedValue(running);
    const { result } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(result.current.isActive).toBe(true));

    getCurrentSession.mockResolvedValue(null);
    await act(async () => {
      await result.current.stop();
    });

    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(result.current.isActive).toBe(false);
    expect(result.current.isStopping).toBe(false);
  });

  it('surfaces a failed start without wedging the button', async () => {
    startSession.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.actionError).toBe('Не вдалося почати ефір');
    expect(result.current.isStarting).toBe(false);
  });

  it('flags a failing poll as an error and recovers on the next tick', async () => {
    // The failure is deliberate; `reportLiveFailure` logging it is not noise
    // worth printing through the suite.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getCurrentSession.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useLiveSession(true));
    await waitFor(() => expect(result.current.isError).toBe(true));

    // A failing poll still hands the operator something to quote to support.
    expect(result.current.diagnostic?.code).toMatch(/^TL-/);

    getCurrentSession.mockResolvedValue(running);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.isActive).toBe(true);
    expect(result.current.diagnostic).toBeNull();
  });
});
