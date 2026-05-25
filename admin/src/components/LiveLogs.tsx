// admin/src/components/LiveLogs.tsx

import { useEffect, useRef } from 'react';
import type { SessionLog } from '../types';

interface LiveLogsProps {
  logs: SessionLog[];
  isConnected: boolean;
  onReconnect?: () => void;
}

export function LiveLogs({ logs, isConnected, onReconnect }: LiveLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getBorderColor = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':  return 'var(--blue)';
      case 'telegram_message':return 'var(--purple)';
      case 'order':           return 'var(--accent)';
      case 'error':           return 'var(--red)';
      case 'info':            return 'var(--yellow)';
      default:                return 'var(--border-default)';
    }
  };

  const getTextColor = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':  return 'var(--blue)';
      case 'telegram_message':return 'var(--purple)';
      case 'order':           return 'var(--accent)';
      case 'error':           return 'var(--red)';
      case 'info':            return 'var(--yellow)';
      default:                return 'var(--text-muted)';
    }
  };

  const getDimColor = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':  return 'var(--blue-dim)';
      case 'telegram_message':return 'var(--purple-dim)';
      case 'order':           return 'var(--green-dim)';
      case 'error':           return 'var(--red-dim)';
      case 'info':            return 'var(--yellow-dim)';
      default:                return 'transparent';
    }
  };

  const getLogIcon = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':  return '🎬';
      case 'telegram_message':return '💬';
      case 'order':           return '✅';
      case 'error':           return '❌';
      case 'info':            return 'ℹ️';
      default:                return '📝';
    }
  };

  const getLabel = (logType: string): string => {
    switch (logType) {
      case 'tiktok_comment':  return 'TikTok';
      case 'telegram_message':return 'Telegram';
      case 'order':           return 'Замовлення';
      case 'error':           return 'Помилка';
      case 'info':            return 'Інфо';
      default:                return logType;
    }
  };

  const formatTime = (timestamp: string): string =>
    new Date(timestamp).toLocaleTimeString('uk-UA', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  return (
    <div className="card" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '600px',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px' }}>
            Live Messages
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {logs.length} повідомлень · автоскрол увімкнено
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: isConnected ? 'var(--accent)' : 'var(--red)',
              boxShadow: isConnected ? '0 0 6px var(--accent-glow)' : 'none',
              animation: isConnected ? 'pulse-dot 1.8s ease infinite' : 'none',
            }} />
            <span style={{
              fontSize: '12px',
              color: isConnected ? 'var(--accent)' : 'var(--red)',
              fontWeight: 600,
            }}>
              {isConnected ? 'Підключено' : 'Відключено'}
            </span>
          </div>

          {/* Reconnect button — does NOT reload the page */}
          {!isConnected && onReconnect && (
            <button
              onClick={onReconnect}
              className="btn-ghost"
              style={{ padding: '6px 14px', fontSize: '12px' }}
              title="Перепідключити WebSocket без перезавантаження"
            >
              ↺ Перепідключити
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {logs.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '8px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '32px', opacity: 0.4 }}>📭</span>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Повідомлень поки немає</div>
            <div style={{ fontSize: '13px' }}>
              Запустіть сесію та почніть приймати замовлення з TikTok LIVE
            </div>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                borderLeft: `3px solid ${getBorderColor(log.log_type)}`,
                background: getDimColor(log.log_type),
                transition: 'background 0.15s',
              }}
            >
              {/* Row 1: icon + label + time */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '5px',
              }}>
                <span style={{ fontSize: '14px', lineHeight: 1 }}>
                  {getLogIcon(log.log_type)}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: getTextColor(log.log_type),
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>
                  {getLabel(log.log_type)}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {formatTime(log.created_at)}
                </span>
              </div>

              {/* Row 2: message */}
              <p style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                lineHeight: '1.5',
                wordBreak: 'break-word',
              }}>
                {log.message}
              </p>

              {/* Row 3: extra data */}
              {log.data && Object.keys(log.data).length > 0 && (
                <div style={{
                  marginTop: '6px',
                  paddingTop: '6px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  {Object.entries(log.data).map(([key, value]) => (
                    <span key={key} style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{key}:</span>{' '}
                      {JSON.stringify(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
