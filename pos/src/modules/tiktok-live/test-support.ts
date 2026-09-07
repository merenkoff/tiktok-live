// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Test-only helpers for this module. Not reachable from `remote-entry.ts`, so
// it is tree-shaken out of `dist-remotes/tiktok-live` — nothing here ships.
//
// jsdom's own `WebSocket` would try to open a real connection, so the socket
// tests drive this stand-in instead: a class that records its instances and
// lets a test decide when the socket opens, receives a frame, or drops.

interface FakeWsEvent {
  data: string;
}

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  /** The socket most recently constructed — what the code under test just made. */
  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!ws) throw new Error('no WebSocket was constructed');
    return ws;
  }

  readyState: number = FakeWebSocket.CONNECTING;
  closedByClient = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: FakeWsEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  /** Server accepted the connection. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Server pushed a JSON frame. */
  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  /** Server pushed something unparseable. */
  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }

  /** Connection failed (rejects `connect()`). */
  fail(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onerror?.(new Error('socket error'));
  }

  /** Server dropped the connection — the reconnect trigger. */
  serverClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  close(): void {
    this.closedByClient = true;
    this.readyState = FakeWebSocket.CLOSED;
  }
}

/**
 * Swap `globalThis.WebSocket` for {@link FakeWebSocket}; returns the undo.
 *
 * `defineProperty`, not assignment: jsdom exposes `WebSocket` as a read-only
 * accessor on the window, so a plain write throws in strict mode.
 */
export function installFakeWebSocket(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  FakeWebSocket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: FakeWebSocket as unknown as typeof WebSocket,
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'WebSocket', original);
    else delete (globalThis as { WebSocket?: unknown }).WebSocket;
    FakeWebSocket.instances = [];
  };
}
