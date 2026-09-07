// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/hooks/useLogs.ts`. Same shape — one socket held in a
// ref, a fixed 5-second reconnect, a manual `reconnect()` that never reloads
// the page, and a 1000-entry cap. What is new is the token: the URL carries a
// bridged LIVE token, so a reconnect after a failed attempt re-mints it once
// before retrying (an expired token shows up as a socket that closes the
// instant it opens).

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveSocket } from '../lib/liveSocket';
import { liveClient } from '../lib/liveClient';
import { liveWsUrl } from '../lib/wsUrl';
import type { SessionLog } from '../types';

const RECONNECT_MS = 5000;
const MAX_LOGS = 1000;

export function useLiveLogs(enabled: boolean) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<LiveSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  /** Re-mint the token before the next attempt — set once per failure streak. */
  const remintRef = useRef(false);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    socketRef.current?.disconnect();
    socketRef.current = null;

    const retry = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      remintRef.current = true;
      reconnectTimerRef.current = setTimeout(() => connect(), RECONNECT_MS);
    };

    void (async () => {
      let token: string;
      try {
        token = await liveClient.bridgeToken({ force: remintRef.current });
        remintRef.current = false;
      } catch {
        retry();
        return;
      }
      if (!mountedRef.current) return;

      const socket = new LiveSocket(liveWsUrl(token));
      socketRef.current = socket;

      socket
        .connect()
        .then(() => {
          if (!mountedRef.current) return;
          setIsConnected(true);

          void liveClient
            .getSessionLogs(100)
            .then((initial) => {
              if (mountedRef.current) setLogs(initial ?? []);
            })
            .catch(() => {
              /* the socket is live; a missing backlog is not worth tearing it down */
            });

          socket.onLog((log) => {
            if (mountedRef.current) setLogs((prev) => [...prev, log].slice(-MAX_LOGS));
          });

          socket.onDisconnect(retry);
        })
        .catch(retry);
    })();
  }, []);

  /** Manual retry from the UI — does NOT reload the page. */
  const reconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsConnected(false);
    connect();
  }, [connect]);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, connect]);

  return {
    logs,
    isConnected,
    reconnect,
    addLog: (log: SessionLog) => setLogs((prev) => [...prev, log].slice(-MAX_LOGS)),
    clear: () => setLogs([]),
  };
}
