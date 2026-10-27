// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/AttentionList.tsx
//
// The documents the retry cron gave up on, plus parked offline sessions —
// `GET /fiscal/attention`. Provider-neutral: every bundle's `/admin/fiscal`
// shows the same list (it lived inside the Checkbox page until the second
// provider bundle, CA6).

import { useEffect, useState } from 'react';
import { Check } from '@pos/platform/ui';
import { listFiscalAttention } from '../data/fiscalApi';
import { FiscalErrorCard } from './FiscalErrorCard';
import type { AttentionDoc, OfflineSessionView } from '../types';

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2) + ' ₴';
}

export function AttentionList() {
  const [docs, setDocs] = useState<AttentionDoc[] | null>(null);
  const [sessions, setSessions] = useState<OfflineSessionView[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    listFiscalAttention()
      .then((res) => {
        setDocs(res.documents);
        // Phase 2 added parked offline sessions to the same response. Their
        // documents may never have been sent at all, so they belong at the TOP
        // of this list: a stuck session is a bigger hole than one rejected
        // receipt, and only the owner can settle it with the provider.
        setSessions(res.sessions ?? []);
      })
      .catch(setError);
  }, []);

  if (error) return <FiscalErrorCard error={error} />;
  if (!docs) return <p className="py-3 text-[15px] text-sq-muted">Завантаження…</p>;
  if (docs.length === 0 && sessions.length === 0) {
    return (
      <p className="py-3 flex items-center gap-2 text-[15px] text-sq-secondary">
        <Check size={20} className="shrink-0 text-sq-success" />
        Немає документів, що потребують уваги.
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {sessions.map((session) => (
        <div
          key={`session-${session.id}`}
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700"
        >
          <p className="font-semibold">Офлайн-сесія #{session.id} зупинена</p>
          <p className="mt-1">{session.error_message ?? session.error_code ?? 'Причина невідома'}</p>
          <p className="mt-1 text-[13px] tabular-nums">
            Чеків: {session.documents.pending + session.documents.done + session.documents.abandoned}
            {' · не надіслано: '}
            {session.documents.pending} · з {new Date(session.started_at).toLocaleString('uk-UA')}
          </p>
          <p className="mt-1 text-[13px]">
            Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть.
          </p>
        </div>
      ))}

      {docs.length > 0 && (
        <ul>
          {docs.map((doc) => (
            <li key={doc.id} className="sq-row py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-base font-medium text-sq-text tabular-nums">
                  {doc.receipt_number ?? `#${doc.id}`}
                </span>
                <span className="text-[15px] text-sq-text tabular-nums">{formatCents(doc.total_cents)}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-red-600">
                {doc.error_message ?? doc.error_code ?? 'Помилка ПРРО'}
              </p>
              <p className="mt-0.5 text-[13px] text-sq-muted tabular-nums">
                Спроб: {doc.attempts} · {new Date(doc.created_at).toLocaleString('uk-UA')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
