// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveSocket } from './liveSocket';
import { FakeWebSocket, installFakeWebSocket } from '../test-support';
import type { SessionLog } from '../types';

function log(overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id: 1,
    session_id: 1,
    user_id: 1,
    log_type: 'tiktok_comment',
    message: 'A1 M',
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('LiveSocket', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installFakeWebSocket();
  });

  afterEach(() => {
    restore();
  });

  it('resolves connect() when the socket opens', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const connected = socket.connect();
    FakeWebSocket.last().open();
    await expect(connected).resolves.toBeUndefined();
    expect(socket.isConnected()).toBe(true);
  });

  it('routes `log` frames to onLog and everything else to on(type)', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const onLog = vi.fn();
    const onStarted = vi.fn();
    socket.onLog(onLog);
    socket.on('sessionStarted', onStarted);

    const connected = socket.connect();
    FakeWebSocket.last().open();
    await connected;

    FakeWebSocket.last().emit({ type: 'log', log: log({ id: 7 }) });
    FakeWebSocket.last().emit({ type: 'sessionStarted', sessionId: 3 });

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog.mock.calls[0][0].id).toBe(7);
    expect(onStarted).toHaveBeenCalledTimes(1);
    // A `log` frame must not also reach the generic handlers.
    expect(onStarted.mock.calls[0][0]).toMatchObject({ type: 'sessionStarted' });
  });

  it('survives a malformed frame without dropping the socket', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const onLog = vi.fn();
    socket.onLog(onLog);
    const connected = socket.connect();
    FakeWebSocket.last().open();
    await connected;

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    FakeWebSocket.last().emitRaw('not json');
    consoleError.mockRestore();

    FakeWebSocket.last().emit({ type: 'log', log: log() });
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(socket.isConnected()).toBe(true);
  });

  it('fires the disconnect handler when the server closes', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const onDisconnect = vi.fn();
    socket.onDisconnect(onDisconnect);
    const connected = socket.connect();
    FakeWebSocket.last().open();
    await connected;

    FakeWebSocket.last().serverClose();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire disconnect for an intentional disconnect()', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const onDisconnect = vi.fn();
    socket.onDisconnect(onDisconnect);
    const connected = socket.connect();
    const ws = FakeWebSocket.last();
    ws.open();
    await connected;

    socket.disconnect();
    ws.serverClose();

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(socket.isConnected()).toBe(false);
  });

  it('rejects connect() on a socket error', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const connected = socket.connect();
    FakeWebSocket.last().fail();
    await expect(connected).rejects.toBeDefined();
  });

  it('unsubscribes handlers via the returned disposer', async () => {
    const socket = new LiveSocket('ws://localhost/stream');
    const onLog = vi.fn();
    const off = socket.onLog(onLog);
    const connected = socket.connect();
    FakeWebSocket.last().open();
    await connected;

    off();
    FakeWebSocket.last().emit({ type: 'log', log: log() });
    expect(onLog).not.toHaveBeenCalled();
  });
});
