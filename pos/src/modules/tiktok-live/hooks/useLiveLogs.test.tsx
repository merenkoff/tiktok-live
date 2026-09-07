// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket, installFakeWebSocket } from '../test-support';
import type { SessionLog } from '../types';

const bridgeToken = vi.fn<[{ force?: boolean }?], Promise<string>>();
const getSessionLogs = vi.fn<[number?], Promise<SessionLog[]>>();

vi.mock('../lib/liveClient', () => ({
  liveClient: {
    bridgeToken: (opts?: { force?: boolean }) => bridgeToken(opts),
    getSessionLogs: (limit?: number) => getSessionLogs(limit),
  },
}));

const { useLiveLogs } = await import('./useLiveLogs');

function log(id: number): SessionLog {
  return {
    id,
    session_id: 1,
    user_id: 1,
    log_type: 'tiktok_comment',
    message: `msg ${id}`,
    created_at: '2026-09-07T10:00:00.000Z',
  };
}

/** Let the hook's async token fetch settle, then open the socket it created. */
async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  await act(async () => {
    FakeWebSocket.last().open();
  });
}

describe('useLiveLogs', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installFakeWebSocket();
    bridgeToken.mockReset().mockResolvedValue('live-token');
    getSessionLogs.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    restore();
    vi.useRealTimers();
  });

  it('does nothing until enabled', () => {
    renderHook(() => useLiveLogs(false));
    expect(bridgeToken).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('carries the bridged token in the socket URL', async () => {
    renderHook(() => useLiveLogs(true));
    await openSocket();
    expect(FakeWebSocket.last().url).toContain('/api/sessions/logs/stream?token=live-token');
  });

  it('loads the backlog on connect and appends live frames', async () => {
    getSessionLogs.mockResolvedValue([log(1), log(2)]);
    const { result } = renderHook(() => useLiveLogs(true));
    await openSocket();

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await waitFor(() => expect(result.current.logs).toHaveLength(2));

    await act(async () => {
      FakeWebSocket.last().emit({ type: 'log', log: log(3) });
    });
    expect(result.current.logs.map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it('keeps the socket when the backlog request fails', async () => {
    getSessionLogs.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useLiveLogs(true));
    await openSocket();

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.logs).toEqual([]);
  });

  it('caps the buffer at 1000 entries, keeping the newest', async () => {
    const { result } = renderHook(() => useLiveLogs(true));
    await openSocket();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      const ws = FakeWebSocket.last();
      for (let id = 1; id <= 1005; id += 1) ws.emit({ type: 'log', log: log(id) });
    });

    expect(result.current.logs).toHaveLength(1000);
    expect(result.current.logs[0].id).toBe(6);
    expect(result.current.logs[result.current.logs.length - 1].id).toBe(1005);
  });

  it('reconnects 5 seconds after the server drops the socket, re-minting the token', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useLiveLogs(true));
    await openSocket();
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(bridgeToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      FakeWebSocket.last().serverClose();
    });
    expect(result.current.isConnected).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    // An expired token looks exactly like a socket that closes on open, so the
    // retry mints a fresh one rather than reusing the cached (possibly dead) one.
    expect(bridgeToken).toHaveBeenLastCalledWith({ force: true });
  });

  it('retries after a failed connect attempt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useLiveLogs(true));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    await act(async () => {
      FakeWebSocket.last().fail();
    });
    expect(result.current.isConnected).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
  });

  it('reconnects immediately on the manual retry, without waiting for the timer', async () => {
    const { result } = renderHook(() => useLiveLogs(true));
    await openSocket();
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      result.current.reconnect();
    });

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    expect(FakeWebSocket.instances[0].closedByClient).toBe(true);
  });

  it('closes the socket on unmount', async () => {
    const { unmount } = renderHook(() => useLiveLogs(true));
    await openSocket();
    const ws = FakeWebSocket.last();

    unmount();
    expect(ws.closedByClient).toBe(true);
  });
});
