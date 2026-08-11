import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WebSocketClient } from './websocket';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev?: any) => void) | null = null;
  onclose: ((ev?: any) => void) | null = null;
  onerror: ((ev?: any) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(undefined);
  });

  constructor(public url: string) {
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(undefined);
    });
  }
}

describe('WebSocketClient', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  it('resolves connect on open', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await expect(client.connect()).resolves.toBeUndefined();
    expect(client.isConnected()).toBe(true);
  });

  it('routes log messages to onLog handlers', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const handler = vi.fn();
    client.onLog(handler);

    const ws = (client as any).ws as MockWebSocket;
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'log',
        log: { id: 1, message: 'hi', log_type: 'info' },
      }),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'hi' })
    );
  });

  it('routes typed events to on() handlers', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const handler = vi.fn();
    client.on('connected', handler);

    const ws = (client as any).ws as MockWebSocket;
    ws.onmessage?.({
      data: JSON.stringify({ type: 'connected', message: 'ok' }),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'connected' })
    );
  });

  it('ignores invalid JSON without throwing', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const ws = (client as any).ws as MockWebSocket;
    expect(() => ws.onmessage?.({ data: 'not-json' })).not.toThrow();
  });

  it('fires onDisconnect when socket closes', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const onDisconnect = vi.fn();
    client.onDisconnect(onDisconnect);

    const ws = (client as any).ws as MockWebSocket;
    ws.onclose?.(undefined);

    expect(onDisconnect).toHaveBeenCalled();
  });

  it('disconnect clears onclose so intentional close does not notify', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const onDisconnect = vi.fn();
    client.onDisconnect(onDisconnect);

    client.disconnect();
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('send only works when OPEN', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const ws = (client as any).ws as MockWebSocket;
    client.send({ type: 'ping' });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    ws.readyState = MockWebSocket.CLOSED;
    client.send({ type: 'ping2' });
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it('onLog unsubscribe removes handler', async () => {
    const client = new WebSocketClient('ws://localhost/test');
    await client.connect();
    const handler = vi.fn();
    const unsub = client.onLog(handler);
    unsub();

    const ws = (client as any).ws as MockWebSocket;
    ws.onmessage?.({
      data: JSON.stringify({ type: 'log', log: { id: 1 } }),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects connect on websocket error', async () => {
    class ErrorSocket {
      static OPEN = 1;
      readyState = 0;
      onopen: ((ev?: any) => void) | null = null;
      onclose: ((ev?: any) => void) | null = null;
      onerror: ((ev?: any) => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) {
        queueMicrotask(() => this.onerror?.(new Event('error')));
      }
    }
    vi.stubGlobal('WebSocket', ErrorSocket);

    const client = new WebSocketClient('ws://localhost/test');
    await expect(client.connect()).rejects.toBeTruthy();
  });
});
