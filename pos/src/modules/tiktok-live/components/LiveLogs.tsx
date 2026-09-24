// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/components/LiveLogs.tsx`: same feed, same auto-scroll,
// same reconnect affordance, restyled from the admin SPA's CSS variables onto
// Tailwind + the POS `sq-*` layer — a Things list: a colour glyph per type,
// a hairline under every row.
//
// Every per-type class below is a COMPLETE literal string in the map. Tailwind
// generates this module's stylesheet by scanning its source (see
// `scripts/module-tailwind.mjs`), so a composed class like `text-${c}`
// would compile to nothing and ship unstyled — `check:tiktok-live-css-coverage`
// exists to catch exactly that.

import { useEffect, useRef } from 'react';
import type { SessionLog, SessionLogType } from '../types';
import { AlertTriangle, FileText, Info, MessageCircle, PackageCheck, RefreshCw, Video, type Glyph } from '@pos/platform/ui';

interface LiveLogsProps {
  logs: SessionLog[];
  isConnected: boolean;
  onReconnect?: () => void;
}

/** The type's caption. The glyph carries the colour; only a failure is red in words too. */
const LABEL_CLASS: Record<SessionLogType, string> = {
  tiktok_comment: 'text-sq-secondary',
  telegram_message: 'text-sq-secondary',
  order: 'text-sq-success-ink',
  error: 'text-sq-danger',
  info: 'text-sq-secondary',
};

const ICON: Record<SessionLogType, Glyph> = {
  tiktok_comment: Video,
  telegram_message: MessageCircle,
  order: PackageCheck,
  error: AlertTriangle,
  info: Info,
};

const LABEL: Record<SessionLogType, string> = {
  tiktok_comment: 'TikTok',
  telegram_message: 'Telegram',
  order: 'Замовлення',
  error: 'Помилка',
  info: 'Інфо',
};

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
    <div
      className="flex h-[600px] flex-col overflow-hidden rounded-card bg-white shadow-card"
      data-testid="live-logs"
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-3 px-5 py-3.5 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
        <div>
          <div className="text-[15px] font-bold text-sq-heading">Стрічка ефіру</div>
          <div className="text-[13px] text-sq-muted tabular-nums">
            {logs.length} повідомлень · автоскрол увімкнено
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                isConnected ? 'bg-sq-success' : 'bg-sq-danger'
              }`}
            />
            <span className={isConnected ? 'text-sq-success-ink' : 'text-sq-danger'}>
              {isConnected ? 'Підключено' : 'Відключено'}
            </span>
          </span>

          {!isConnected && onReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              title="Перепідключити без перезавантаження сторінки"
              className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-sq bg-white ring-1 ring-sq-divider text-[13px] font-semibold text-sq-text hover:bg-sq-sidebar"
            >
              <RefreshCw size={16} />
              Перепідключити
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto px-5">
        {logs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
            <Video size={48} className="mb-2" />
            <div className="text-[15px] font-semibold text-sq-text">Повідомлень поки немає</div>
            <div className="text-[15px] text-sq-secondary">
              Почніть ефір — коментарі та замовлення з TikTok LIVE з’являться тут
            </div>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} data-testid="live-log-row" className="sq-row flex gap-3 py-3">
              <LogIcon type={log.log_type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[13px] font-semibold ${
                      LABEL_CLASS[log.log_type] ?? 'text-sq-secondary'
                    }`}
                  >
                    {LABEL[log.log_type] ?? log.log_type}
                  </span>
                  <span className="ml-auto text-[13px] text-sq-muted tabular-nums">
                    {formatTime(log.created_at)}
                  </span>
                </div>

                <p className="mt-0.5 break-words text-[15px] leading-snug text-sq-text">{log.message}</p>

                {log.data && Object.keys(log.data).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(log.data).map(([key, value]) => (
                      <span key={key} className="font-mono text-[11px] text-sq-muted">
                        <span className="text-sq-secondary">{key}:</span> {JSON.stringify(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LogIcon({ type }: { type: SessionLogType }) {
  const Icon = ICON[type] ?? FileText;
  return <Icon size={24} className="shrink-0" />;
}
