import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLogs } from './useLogs';
import { makeLog } from '../test/utils';

const connectMock = vi.fn();
const disconnectMock = vi.fn();
const onLogMock = vi.fn();
const onDisconnectMock = vi.fn();

vi.mock('../services/websocket', () => ({
  WebSocketClient: class {
    connect = (...args: unknown[]) => connectMock(...args);
    disconnect = (...args: unknown[]) => disconnectMock(...args);
    onLog = (...args: unknown[]) => onLogMock(...args);
    onDisconnect = (...args: unknown[]) => onDisconnectMock(...args);
  },
}));

vi.mock('../services/api', () => ({
  api: {
    getWebSocketUrl: vi.fn(() => 'ws://localhost/test'),
    getSessionLogs: vi.fn(),
  },
}));

import { api } from '../services/api';

describe('useLogs', () => {
  beforeEach(() => {
    connectMock.mockReset();
    disconnectMock.mockReset();
    onLogMock.mockReset();
    onDisconnectMock.mockReset();
    vi.mocked(api.getSessionLogs).mockReset();

    connectMock.mockResolvedValue(undefined);
    vi.mocked(api.getSessionLogs).mockResolvedValue([
      makeLog({ id: 1, message: 'initial' }),
    ]);
    onLogMock.mockImplementation(() => () => {});
    onDisconnectMock.mockImplementation(() => () => {});
  });

  it('connects and loads initial logs', async () => {
    const { result } = renderHook(() => useLogs());

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    expect(result.current.logs[0].message).toBe('initial');
  });

  it('appends live logs via onLog', async () => {
    let logHandler: ((log: any) => void) | undefined;
    onLogMock.mockImplementation((handler) => {
      logHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      logHandler?.(makeLog({ id: 2, message: 'live' }));
    });

    await waitFor(() =>
      expect(result.current.logs.some((l) => l.message === 'live')).toBe(true)
    );
  });

  it('schedules reconnect after disconnect', async () => {
    let disconnectHandler: (() => void) | undefined;
    onDisconnectMock.mockImplementation((handler) => {
      disconnectHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    const connectsBefore = connectMock.mock.calls.length;

    vi.useFakeTimers();
    act(() => {
      disconnectHandler?.();
    });
    expect(result.current.isConnected).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(connectMock.mock.calls.length).toBeGreaterThan(connectsBefore);
    vi.useRealTimers();
  });

  it('reconnect clears timer and reconnects immediately', async () => {
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    const before = connectMock.mock.calls.length;

    act(() => {
      result.current.reconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(connectMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('disconnects on unmount', async () => {
    const { unmount } = renderHook(() => useLogs());
    await waitFor(() => expect(connectMock).toHaveBeenCalled());
    unmount();
    expect(disconnectMock).toHaveBeenCalled();
  });

  it('addLog and clear helpers work', async () => {
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      result.current.clear();
      result.current.addLog(makeLog({ id: 99, message: 'manual' }));
    });

    expect(result.current.logs).toEqual([
      expect.objectContaining({ message: 'manual' }),
    ]);
  });

  it('schedules reconnect after connect failure', async () => {
    vi.useFakeTimers();
    connectMock.mockRejectedValue(new Error('boom'));

    renderHook(() => useLogs());

    await act(async () => {
      await Promise.resolve();
    });
    expect(connectMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(connectMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});
