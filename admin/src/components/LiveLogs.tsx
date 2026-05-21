// admin/src/components/LiveLogs.tsx

import { useEffect, useRef } from 'react';
import type { SessionLog } from '../types';

interface LiveLogsProps {
  logs: SessionLog[];
  isConnected: boolean;
}

export function LiveLogs({ logs, isConnected }: LiveLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':
        return 'bg-blue-50 border-l-4 border-blue-500 text-blue-900';
      case 'telegram_message':
        return 'bg-purple-50 border-l-4 border-purple-500 text-purple-900';
      case 'order':
        return 'bg-green-50 border-l-4 border-green-500 text-green-900';
      case 'error':
        return 'bg-red-50 border-l-4 border-red-500 text-red-900';
      case 'info':
        return 'bg-yellow-50 border-l-4 border-yellow-500 text-yellow-900';
      default:
        return 'bg-gray-50 border-l-4 border-gray-500 text-gray-900';
    }
  };

  const getLogIcon = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':
        return '🎬';
      case 'telegram_message':
        return '💬';
      case 'order':
        return '✅';
      case 'error':
        return '❌';
      case 'info':
        return 'ℹ️';
      default:
        return '📝';
    }
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col h-[600px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Live Messages</h2>
          <p className="text-blue-100 text-sm mt-1">Real-time order & chat monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
          <span className="text-sm">{isConnected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">No messages yet</p>
              <p className="text-sm">Start a session and begin taking orders from TikTok LIVE</p>
            </div>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`p-4 rounded-lg ${getLogColor(log.log_type)} transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getLogIcon(log.log_type)}</span>
                    <span className="font-semibold text-sm capitalize">{log.log_type.replace('_', ' ')}</span>
                    <span className="text-xs opacity-70 ml-auto">{formatTime(log.created_at)}</span>
                  </div>
                  <p className="text-sm break-words">{log.message}</p>
                  {log.data && Object.keys(log.data).length > 0 && (
                    <div className="text-xs opacity-75 mt-2 space-y-1">
                      {Object.entries(log.data).map(([key, value]) => (
                        <div key={key}>
                          <strong>{key}:</strong> {JSON.stringify(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-100 border-t p-4 text-xs text-gray-600">
        <p>Showing {logs.length} messages • Auto-scrolling enabled</p>
      </div>
    </div>
  );
}