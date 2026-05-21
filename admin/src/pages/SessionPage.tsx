// admin/src/pages/SessionPage.tsx

import { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { useLogs } from '../hooks/useLogs';
import { Header } from '../components/Header';
import { SessionControl } from '../components/SessionControl';
import { LiveLogs } from '../components/LiveLogs';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function SessionPage() {
  const { session, isLoading, isActive, start, stop, isStarting, isStopping } = useSession();
  const { logs, isConnected } = useLogs();
  const [duration, setDuration] = useState('00:00');

  // Update duration timer
  useEffect(() => {
    if (!isActive || !session?.started_at) return;

    const interval = setInterval(() => {
      const start = new Date(session.started_at!).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setDuration(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, session?.started_at]);

  const orderCount = logs.filter((log) => log.log_type === 'order').length;
  const errorCount = logs.filter((log) => log.log_type === 'error').length;
  const commentCount = logs.filter((log) => log.log_type === 'tiktok_comment').length;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Status Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Live Session</h1>
              <p className="text-gray-600 mt-2">
                Status: <span className={`font-bold ${isActive ? 'text-green-600' : 'text-gray-600'}`}>
                  {isActive ? '● Running' : '● Stopped'}
                </span>
              </p>
            </div>
            <div className="text-right">
              {isActive && (
                <div className="text-4xl font-bold text-blue-600 font-mono">{duration}</div>
              )}
            </div>
          </div>

          {/* WebSocket Status */}
          <div className="mb-6 pb-6 border-b">
            <p className="text-sm text-gray-600">
              WebSocket: <span className={`font-bold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </span>
            </p>
          </div>

          {/* Session Control */}
          <SessionControl
            isActive={isActive}
            onStart={start}
            onStop={stop}
            isStarting={isStarting}
            isStopping={isStopping}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Statistics */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-gray-600 text-sm font-medium mb-2">Orders Created</h3>
              <p className="text-4xl font-bold text-green-600">{orderCount}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-gray-600 text-sm font-medium mb-2">TikTok Comments</h3>
              <p className="text-4xl font-bold text-blue-600">{commentCount}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-gray-600 text-sm font-medium mb-2">Errors</h3>
              <p className={`text-4xl font-bold ${errorCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {errorCount}
              </p>
            </div>

            {/* Quick Links */}
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="font-bold text-blue-900 mb-3">ℹ️ Quick Help</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>✓ Start session before going LIVE</li>
                <li>✓ Watch logs for order confirmations</li>
                <li>✓ Errors appear in red</li>
                <li>✓ Customer messages in purple</li>
              </ul>
            </div>
          </div>

          {/* Live Logs */}
          <div className="lg:col-span-2">
            <LiveLogs logs={logs} isConnected={isConnected} />
          </div>
        </div>
      </div>
    </div>
  );
}