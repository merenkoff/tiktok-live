import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionLog } from '../types';
import { WebSocketClient } from '../services/websocket';
import { api } from '../services/api';

export function useLogs() {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocketClient | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Clean up previous instance
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    const wsClient = new WebSocketClient(api.getWebSocketUrl());
    wsRef.current = wsClient;

    wsClient
      .connect()
      .then(() => {
        if (!mountedRef.current) return;
        setIsConnected(true);

        // Load initial logs
        api.getSessionLogs(100).then((initialLogs) => {
          if (mountedRef.current) setLogs(initialLogs);
        });

        // Listen for new logs
        wsClient.onLog((log) => {
          if (mountedRef.current) {
            setLogs((prev) => [...prev, log].slice(-1000));
          }
        });

        // Listen for disconnect to auto-reconnect
        wsClient.onDisconnect?.(() => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          reconnectTimerRef.current = setTimeout(() => connect(), 5000);
        });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        reconnectTimerRef.current = setTimeout(() => connect(), 5000);
      });
  }, []);

  // Manual reconnect — does NOT reload the page
  const reconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsConnected(false);
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [connect]);

  return {
    logs,
    isConnected,
    reconnect,
    addLog: (log: SessionLog) => setLogs((prev) => [...prev, log].slice(-1000)),
    clear: () => setLogs([]),
  };
}
