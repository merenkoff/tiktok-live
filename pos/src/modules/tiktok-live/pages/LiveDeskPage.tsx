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
import { AlertTriangle, Download, MessageCircle, ShoppingBag, Video, WifiOff, Wrench, type Glyph } from '@pos/platform/ui';

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
  icon: Glyph;
  title: string;
  body: string;
}> = {
  host_too_old: {
    icon: Download,
    title: 'Застосунок каси застарів для модуля ефіру',
    body: 'Оновіть застосунок до останньої версії. Якщо після оновлення нічого не змінилось — передайте код нижче в підтримку.',
  },
  server_missing_bridge: {
    icon: Wrench,
    title: 'Сервер не підтримує модуль ефіру',
    body: 'Схоже, сервер магазину ще не оновлено. Передайте код нижче в підтримку — оновлення на нашому боці.',
  },
  server_error: {
    icon: AlertTriangle,
    title: 'Сервер відповів помилкою',
    body: 'Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку.',
  },
  network: {
    icon: WifiOff,
    title: 'Немає зʼєднання з сервером',
    body: 'Модуль ефіру працює лише онлайн. Перевірте інтернет і спробуйте ще раз.',
  },
  unknown: {
    icon: AlertTriangle,
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
        icon={Video}
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
    <div className="flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text">
      <div className="flex flex-wrap items-center gap-3 px-4 md:px-7 py-4 md:min-h-[72px]">
        <Video size={24} className="shrink-0" />
        <h1 className="text-2xl font-bold text-sq-heading">Прямий ефір</h1>
        <span
          className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-xs font-medium ${
            isActive
              ? 'bg-sq-success/10 text-sq-success-ink'
              : 'ring-1 ring-inset ring-sq-divider text-sq-secondary'
          }`}
          data-testid="session-status"
        >
          <span
            aria-hidden
            className={`h-2 w-2 flex-shrink-0 rounded-full ${isActive ? 'bg-sq-success' : 'bg-sq-muted'}`}
          />
          {isActive ? 'Активна' : 'Зупинена'}
        </span>
      </div>

      <div className="animate-fade-up space-y-5 px-4 md:px-7 pb-6">
        <section className="rounded-card bg-white shadow-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <p className="text-[15px] text-sq-secondary">
              {username ? `Акаунт @${username} · ` : ''}
              WebSocket:{' '}
              <span className={isConnected ? 'text-sq-success-ink' : 'text-sq-danger'}>
                {isConnected ? 'підключено' : 'відключено'}
              </span>
            </p>

            {isActive && (
              <div className="rounded-xl bg-sq-sidebar px-[18px] py-3 text-center">
                <div className="text-[13px] font-medium text-sq-secondary">Тривалість</div>
                <div className="mt-0.5 text-[26px] font-bold leading-tight text-sq-success-ink tabular-nums">
                  {duration}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 pt-5 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
            <SessionControl
              isActive={isActive}
              onStart={() => void start()}
              onStop={() => void stop()}
              isStarting={isStarting}
              isStopping={isStopping}
            />
            {actionError && <span className="text-sm text-red-600">{actionError}</span>}
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
        </section>

        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col gap-3">
            <span className="sq-section-label">Статистика ефіру</span>
            <StatCard label="Замовлень" value={orderCount} icon={ShoppingBag} />
            <StatCard label="Коментарів" value={commentCount} icon={MessageCircle} />
            <StatCard label="Помилок" value={errorCount} icon={AlertTriangle} alert={errorCount > 0} />
          </div>

          <div className="flex flex-col gap-3">
            <span className="sq-section-label">Лайв-лог</span>
            <LiveLogs logs={logs} isConnected={isConnected} onReconnect={reconnect} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  alert,
}: {
  label: string;
  value: number;
  icon: Glyph;
  /** A count the operator should look at — the only figure drawn in colour. */
  alert?: boolean;
}) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3.5 rounded-card bg-white shadow-card px-[18px] py-4">
      <Icon size={24} className="shrink-0" />
      <div>
        <div className="text-[13px] font-medium text-sq-secondary">{label}</div>
        <div
          className={`text-[26px] font-bold leading-tight tabular-nums ${
            alert ? 'text-sq-danger' : 'text-sq-heading'
          }`}
        >
          {value}
        </div>
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
  icon?: Glyph;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  diagnostic?: LiveDiagnostic | null;
}) {
  const Icon = icon;
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-sq-bg grid place-items-center px-4 py-8">
      <div className="animate-fade-up w-full max-w-md rounded-card bg-white shadow-card p-8 text-center">
        {Icon && (
          <div className="mb-4 flex justify-center">
            <Icon size={48} />
          </div>
        )}
        <h2 className="text-[19px] font-bold text-sq-heading">{title}</h2>
        {body && <p className="mt-2 text-[15px] leading-relaxed text-sq-secondary">{body}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="pos-btn-primary mt-6 min-h-11 px-5 rounded-xl text-[15px]"
          >
            {action.label}
          </button>
        )}
        {diagnostic && <SupportCode diagnostic={diagnostic} />}
      </div>
    </div>
  );
}
