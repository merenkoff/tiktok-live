// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/OfflinePanel.tsx
//
// The offline state of the ПРРО register: how many tax-office codes are in
// reserve, and what the current offline session is doing
// (TechDocs/POS_FISCAL_OFFLINE.md §3, §5).
//
// Deliberately NOT merged into `OfflineStatusBanner` in the host shell. That
// banner is about the TILL being offline — no route to our API, sales queued in
// IndexedDB. This is about the PROVIDER being unreachable from the backend,
// while the till itself is perfectly online. Showing both as one "офлайн" is
// how a cashier ends up making the wrong call about whether they can sell.
//
// Provider-neutral, so it lives in `fiscal-core`: which provider is behind the
// reserve changes nothing about what the cashier is being told.

import type { FiscalStatus, OfflineSessionView } from '../types';

function time(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/** Everything that is not `done` or `abandoned` still has to reach the tax office. */
function totalDocs(docs: OfflineSessionView['documents']): number {
  return docs.pending + docs.done + docs.abandoned;
}

function SessionLine({ session }: { session: OfflineSessionView }) {
  const docs = session.documents;
  const total = totalDocs(docs);

  if (session.status === 'stuck') {
    return (
      <div role="alert" className="rounded-sq bg-red-50 px-3 py-2 text-sm text-red-700">
        <p className="font-semibold">Офлайн-чеки не надіслані в ДПС</p>
        {session.error_message && <p className="mt-1">{session.error_message}</p>}
        <p className="mt-1">
          Чеків у сесії: {total}. Зверніться до власника магазину — потрібен ручний розбір.
        </p>
      </div>
    );
  }

  if (session.status === 'replaying') {
    return (
      <div className="rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-semibold">Надсилаємо чеки в ДПС…</p>
        <p className="mt-1">
          {docs.done} з {total}
          {!session.go_offline_sent && ' · готуємо касу'}
        </p>
      </div>
    );
  }

  // `open`: we are selling from the reserve right now.
  return (
    <div className="rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">Працюємо офлайн з {time(session.started_at)}</p>
      <p className="mt-1">
        Чеків у сесії: {total}. Зв’язок із ПРРО відновиться автоматично — чеки підуть у ДПС самі.
      </p>
    </div>
  );
}

/**
 * Renders nothing at all unless the store actually sells offline.
 *
 * Same rule as `FiscalBadge` with `'none'`: a store that does not use offline
 * mode sees exactly the screen it saw before this shipped.
 */
export function OfflinePanel({ status }: { status: FiscalStatus }) {
  const offline = status.offline;
  if (!offline?.enabled) return null;

  const free = offline.codes?.free ?? 0;
  const mine = offline.codes?.leased_to_me ?? 0;
  // A quarter of the target left is the point where the owner still has time to
  // react before the reserve is gone; the refill cron runs every 10 minutes and
  // needs the provider to be reachable to top it up.
  const low = free < Math.max(1, Math.floor(offline.codes_target / 4));

  return (
    <div className="rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-2">
      <p className="sq-section-label">Офлайн-режим ПРРО</p>
      <p className={`text-sm font-semibold ${low ? 'text-amber-600' : 'text-sq-secondary'}`}>
        Запас фіскальних кодів: {free}
      </p>
      {mine > 0 && (
        // The store's reserve is not what this till can spend: only the codes
        // leased to it travel into an outage with it (фаза 3).
        <p className="text-sm text-sq-secondary">Із них на цій касі: {mine}</p>
      )}
      {low && (
        <p className="text-xs text-amber-700">
          Запас майже вичерпано. Поки ПРРО доступне, він поповнюється автоматично.
        </p>
      )}
      {offline.session && <SessionLine session={offline.session} />}
    </div>
  );
}
