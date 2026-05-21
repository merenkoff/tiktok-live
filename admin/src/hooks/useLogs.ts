import { useState, useEffect } from 'react';
import type { SessionLog } from '../types';
import { WebSocketClient } from '../services/websocket';
import { api } from '../services/api';

export function useLogs() {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const wsClient = new WebSocketClient(api.getWebSocketUrl());

    wsClient
      .connect()
      .then(() => {
        setIsConnected(true);

        // Load initial logs
        api.getSessionLogs(100).then((initialLogs) => {
          setLogs(initialLogs);
        });

        // Listen for new logs
        wsClient.onLog((log) => {
          setLogs((prev) => [...prev, log].slice(-1000));
        });
      })
      .catch((error) => {
        console.error('WebSocket connection failed', error);
      });

    return () => {
      wsClient.disconnect();
    };
  }, []);

  const addLog = (log: SessionLog) => {
    setLogs((prev) => [...prev, log].slice(-1000));
  };

  return {
    logs,
    isConnected,
    addLog,
    clear: () => setLogs([]),
  };
}