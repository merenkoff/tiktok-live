// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/services/websocket.ts` — same protocol, same
// behaviour, retyped for this module's lint rules (no bare `any` handlers).
// The server (`src/api/websocket.ts`) sends `{type:'initial'|'connected'|'log'|
// 'sessionStarted'|'sessionStopped', …}`; `log` frames go to `onLog`, every
// other type to `on(type, …)`.

import type { SessionLog } from '../types';

type LogHandler = (log: SessionLog) => void;
type EventHandler = (data: unknown) => void;

interface WsFrame {
  type?: string;
  log?: SessionLog;
}

export class LiveSocket {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private logHandlers = new Set<LogHandler>();
  private eventHandlers = new Map<string, Set<EventHandler>>();

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => resolve();
        this.ws.onmessage = (event: MessageEvent) => {
          try {
            this.handleMessage(JSON.parse(String(event.data)) as WsFrame);
          } catch (error) {
            console.error('[tiktok-live] bad WebSocket frame', error);
          }
        };
        this.ws.onclose = () => this.dispatch('disconnect', {});
        this.ws.onerror = (error) => reject(error);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(frame: WsFrame): void {
    if (frame.type === 'log' && frame.log) {
      this.logHandlers.forEach((handler) => handler(frame.log as SessionLog));
      return;
    }
    if (frame.type) this.dispatch(frame.type, frame);
  }

  private dispatch(type: string, data: unknown): void {
    this.eventHandlers.get(type)?.forEach((handler) => handler(data));
  }

  onLog(handler: LogHandler): () => void {
    this.logHandlers.add(handler);
    return () => {
      this.logHandlers.delete(handler);
    };
  }

  on(event: string, handler: EventHandler): () => void {
    let set = this.eventHandlers.get(event);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  onDisconnect(handler: EventHandler): () => void {
    return this.on('disconnect', handler);
  }

  disconnect(): void {
    if (!this.ws) return;
    // Drop the handler first: an intentional close must not look like a drop
    // and kick off the reconnect loop.
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
