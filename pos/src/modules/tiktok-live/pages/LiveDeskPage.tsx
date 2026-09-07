// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ported from `admin/src/pages/SessionPage.tsx`, minus its `<Header>` and
// full-page chrome — inside the POS shell the host layout (`CashierLayout` /
// `AdminLayout`) already provides those — plus the states that only exist here:
// the POS→LIVE token bridge resolving, and a store that isn't connected to a
// TikTok account yet.

import { useEffect, useState } from 'react';
import { usePosShell } from '../lib/hostPlatform';
import { useLiveAuth } from '../hooks/useLiveAuth';
import { useLiveLogs } from '../hooks/useLiveLogs';
import { useLiveSession } from '../hooks/useLiveSession';
import { LiveLogs } from '../components/LiveLogs';
import { SessionControl } from '../components/SessionControl';
import { SupportCode } from '../components/SupportCode';
import type { LiveDiagnostic, LiveFailureReason } from '../lib/diagnostics';

/**
 * What to tell the operator per failure, keyed by reason so the copy and the
 * support code can't drift apart. Each one names WHO has to act — the point of
 * the whole diagnostic: a cashier should not be told to "check the connection"
 * when the actual fix is an app update or a call to us.
 *
 * `not_configured` is absent on purpose: it has its own screen below, because
 * it is an errand for the store owner rather than a fault.
 */
const FAILURE_COPY: Record<Exclude<LiveFailureReason, 'not_configured'>, {
  icon: string;
  title: string;
  body: string;
}> = {
  host_too_old: {
    icon: '⬆️',
    title: 'Застосунок каси застарів для модуля ефіру',
    body: 'Оновіть застосунок до останньої версії. Якщо після оновлення нічого не змінилось — передайте код нижче в підтримку.',
  },
  server_missing_bridge: {
    icon: '🛠',
    title: 'Сервер не підтримує модуль ефіру',
    body: 'Схоже, сервер магазину ще не оновлено. Передайте код нижче в підтримку — оновлення на нашому боці.',
  },
  server_error: {
    icon: '⚠️',
    title: 'Сервер відповів помилкою',
    body: 'Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку.',
  },
  network: {
    icon: '📡',
    title: 'Немає зʼєднання з сервером',
    body: 'Модуль ефіру працює лише онлайн. Перевірте інтернет і спробуйте ще раз.',
  },
  unknown: {
    icon: '⚠️',
    title: 'Не вдалося підключитися до TikTok LIVE',
    body: 'Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку.',
  },
};

function formatDuration(startedAt: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function LiveDeskPage() {
  const shell = usePosShell();
  const { status, username, diagnostic, refresh } = useLiveAuth();
  const ready = status === 'ready';
  const {
    session,
    isActive,
    isError,
    diagnostic: pollDiagnostic,
    isStarting,
    isStopping,
    actionError,
    start,
    stop,
  } = useLiveSession(ready);
  const { logs, isConnected, reconnect } = useLiveLogs(ready);
  const [duration, setDuration] = useState('00:00:00');

  const startedAt = session?.started_at ?? null;
  useEffect(() => {
    if (!isActive || !startedAt) {
      setDuration('00:00:00');
      return;
    }
    setDuration(formatDuration(startedAt));
    const timer = setInterval(() => setDuration(formatDuration(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  if (status === 'loading') {
    return <CenteredCard title="Підключення до TikTok LIVE…" />;
  }

  if (status === 'not-configured') {
    return (
      <CenteredCard
        icon="🔌"
        title="Магазин не під’єднано до TikTok LIVE"
        body={
          shell === 'web'
            ? 'Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього ефір буде доступний і в касі, і в адмінці.'
            : 'Власник має вказати нікнейм TikTok-акаунта в Налаштуваннях магазину у веб-адмінці.'
        }
        action={{ label: 'Спробувати ще раз', onClick: refresh }}
        diagnostic={diagnostic}
      />
    );
  }

  if (status === 'error') {
    const copy = FAILURE_COPY[
      (diagnostic?.reason as Exclude<LiveFailureReason, 'not_configured'>) ?? 'unknown'
    ] ?? FAILURE_COPY.unknown;
    return (
      <CenteredCard
        icon={copy.icon}
        title={copy.title}
        body={copy.body}
        action={{ label: 'Спробувати ще раз', onClick: refresh }}
        diagnostic={diagnostic}
      />
    );
  }

  const orderCount = logs.filter((l) => l.log_type === 'order').length;
  const commentCount = logs.filter((l) => l.log_type === 'tiktok_comment').length;
  const errorCount = logs.filter((l) => l.log_type === 'error').length;

  return (
    <div className="animate-fade-up space-y-6 text-sq-text">
      <div className="sq-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 flex-shrink-0 rounded-full ${
                  isActive ? 'bg-emerald-500' : 'bg-sq-muted'
                }`}
              />
              <h2 className="text-2xl font-semibold">Прямий ефір</h2>
              <span
                className={`rounded-sq px-2 py-0.5 text-xs font-semibold ${
                  isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-sq-empty text-sq-secondary'
                }`}
                data-testid="session-status"
              >
                {isActive ? 'Активна' : 'Зупинена'}
              </span>
            </div>
            <p className="mt-2 text-sm text-sq-secondary">
              {username ? `Акаунт @${username} · ` : ''}
              WebSocket:{' '}
              <span className={isConnected ? 'text-emerald-700' : 'text-rose-700'}>
                {isConnected ? 'підключено' : 'відключено'}
              </span>
            </p>
          </div>

          {isActive && (
            <div className="rounded-sq border border-sq-divider bg-sq-bg px-6 py-3 text-center">
              <div className="sq-section-label">Тривалість</div>
              <div className="mt-1 font-mono text-3xl font-semibold text-emerald-700">
                {duration}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-sq-divider pt-6">
          <SessionControl
            isActive={isActive}
            onStart={() => void start()}
            onStop={() => void stop()}
            isStarting={isStarting}
            isStopping={isStopping}
          />
          {actionError && <span className="text-sm text-rose-700">{actionError}</span>}
          {isError && (
            <span className="text-sm text-sq-secondary">
              Статус ефіру недоступний — повторюємо спробу…
              {pollDiagnostic && (
                <>
                  {' '}
                  <code
                    data-testid="live-poll-support-code"
                    className="select-all font-mono text-xs text-sq-muted"
                  >
                    {pollDiagnostic.code}
                  </code>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-4">
          <span className="sq-section-label">Статистика ефіру</span>
          <StatCard label="Замовлень" value={orderCount} icon="🛍" tone="text-emerald-700" />
          <StatCard label="Коментарів" value={commentCount} icon="💬" tone="text-blue-700" />
          <StatCard
            label="Помилок"
            value={errorCount}
            icon="⚠"
            tone={errorCount > 0 ? 'text-rose-700' : 'text-sq-muted'}
          />
        </div>

        <div className="space-y-2">
          <span className="sq-section-label">Лайв-лог</span>
          <LiveLogs logs={logs} isConnected={isConnected} onReconnect={reconnect} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: string;
  tone: string;
}) {
  return (
    <div className="sq-card flex items-center gap-4 p-4">
      <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-sq bg-sq-bg text-xl">
        {icon}
      </div>
      <div>
        <div className="sq-section-label">{label}</div>
        <div className={`font-mono text-2xl font-bold ${tone}`}>{value}</div>
      </div>
    </div>
  );
}

function CenteredCard({
  icon,
  title,
  body,
  action,
  diagnostic,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  diagnostic?: LiveDiagnostic | null;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="sq-card animate-fade-up max-w-md p-8 text-center">
        {icon && <div className="mb-4 text-4xl">{icon}</div>}
        <h2 className="text-lg font-semibold text-sq-text">{title}</h2>
        {body && <p className="mt-3 text-sm leading-relaxed text-sq-secondary">{body}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="sq-btn-primary mt-6 px-4 py-2.5"
          >
            {action.label}
          </button>
        )}
        {diagnostic && <SupportCode diagnostic={diagnostic} />}
      </div>
    </div>
  );
}
