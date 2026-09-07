// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/components/LiveLogs.tsx`: same feed, same auto-scroll,
// same reconnect affordance, restyled from the admin SPA's CSS variables onto
// Tailwind + the POS `sq-*` layer.
//
// Every per-type class below is a COMPLETE literal string in the map. Tailwind
// generates this module's stylesheet by scanning its source (see
// `scripts/module-tailwind.mjs`), so a composed class like `border-l-${c}-500`
// would compile to nothing and ship unstyled — `check:tiktok-live-css-coverage`
// exists to catch exactly that.

import { useEffect, useRef } from 'react';
import type { SessionLog, SessionLogType } from '../types';

interface LiveLogsProps {
  logs: SessionLog[];
  isConnected: boolean;
  onReconnect?: () => void;
}

const ROW_CLASS: Record<SessionLogType, string> = {
  tiktok_comment: 'border-l-blue-500 bg-blue-50',
  telegram_message: 'border-l-violet-500 bg-violet-50',
  order: 'border-l-emerald-500 bg-emerald-50',
  error: 'border-l-rose-500 bg-rose-50',
  info: 'border-l-amber-500 bg-amber-50',
};

const LABEL_CLASS: Record<SessionLogType, string> = {
  tiktok_comment: 'text-blue-700',
  telegram_message: 'text-violet-700',
  order: 'text-emerald-700',
  error: 'text-rose-700',
  info: 'text-amber-700',
};

const ICON: Record<SessionLogType, string> = {
  tiktok_comment: '🎬',
  telegram_message: '💬',
  order: '✅',
  error: '❌',
  info: 'ℹ️',
};

const LABEL: Record<SessionLogType, string> = {
  tiktok_comment: 'TikTok',
  telegram_message: 'Telegram',
  order: 'Замовлення',
  error: 'Помилка',
  info: 'Інфо',
};

const FALLBACK_ROW = 'border-l-sq-divider bg-sq-bg';

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LiveLogs({ logs, isConnected, onReconnect }: LiveLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="sq-card flex h-[600px] flex-col overflow-hidden" data-testid="live-logs">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-sq-divider px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-sq-text">Стрічка ефіру</div>
          <div className="text-xs text-sq-muted">
            {logs.length} повідомлень · автоскрол увімкнено
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                isConnected ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className={isConnected ? 'text-emerald-700' : 'text-rose-700'}>
              {isConnected ? 'Підключено' : 'Відключено'}
            </span>
          </span>

          {!isConnected && onReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              title="Перепідключити без перезавантаження сторінки"
              className="rounded-sq border border-sq-divider px-3 py-1.5 text-xs font-medium text-sq-secondary hover:bg-sq-bg"
            >
              ↺ Перепідключити
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {logs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sq-muted">
            <span className="text-3xl opacity-40">📭</span>
            <div className="text-sm font-semibold text-sq-secondary">Повідомлень поки немає</div>
            <div className="text-sm">
              Почніть ефір — коментарі та замовлення з TikTok LIVE з’являться тут
            </div>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              data-testid="live-log-row"
              className={`rounded-sq border-l-[3px] px-3.5 py-2.5 ${
                ROW_CLASS[log.log_type] ?? FALLBACK_ROW
              }`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm leading-none">{ICON[log.log_type] ?? '📝'}</span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    LABEL_CLASS[log.log_type] ?? 'text-sq-secondary'
                  }`}
                >
                  {LABEL[log.log_type] ?? log.log_type}
                </span>
                <span className="ml-auto font-mono text-[11px] text-sq-muted">
                  {formatTime(log.created_at)}
                </span>
              </div>

              <p className="break-words text-[13px] leading-relaxed text-sq-text">{log.message}</p>

              {log.data && Object.keys(log.data).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2 border-t border-black/5 pt-1.5">
                  {Object.entries(log.data).map(([key, value]) => (
                    <span key={key} className="font-mono text-[11px] text-sq-muted">
                      <span className="text-sq-secondary">{key}:</span> {JSON.stringify(value)}
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
