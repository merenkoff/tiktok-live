// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Записано без мережі» — the desktop's queue on «Борги» and on a customer's
// statement (G3_DEBTS.md §6).
//
// The goods in every row are already with the customer; the row is how the
// debt reaches the server. So the panel never lets one disappear quietly: a
// row the server refused stays here in red with the server's own sentence
// until a person sends it again or, having read what that means, removes it.
// Nothing at all when the queue is empty — the screen is what it always was.

import { useState } from 'react';
import { formatUah, useOfflineStatus } from '@pos/platform';
import { SectionHead } from '@pos/platform/ui';
import type { IssueRow } from '../data/db';
import { discardIssue, retryIssue } from '../data/queue';
import { syncIssues } from '../data/sync';
import { goodsText } from '../lib/debt';
import { queueStatusText, queuedAt } from '../lib/queueText';

export function QueuePanel({ rows, showCustomer = true }: { rows: IssueRow[]; showCustomer?: boolean }) {
  const online = useOfflineStatus((s) => s.online);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (rows.length === 0) return null;
  const waiting = rows.filter((row) => row.status !== 'dead').length;

  async function sendNow() {
    setSending(true);
    try {
      await syncIssues();
    } finally {
      setSending(false);
      void useOfflineStatus.getState().refreshPending();
    }
  }

  async function retry(id: string) {
    await retryIssue(id);
    if (online) void sendNow();
  }

  async function discard(id: string) {
    setConfirming(null);
    await discardIssue(id);
    void useOfflineStatus.getState().refreshPending();
  }

  return (
    <section className="rounded-card bg-white ring-1 ring-amber-200 p-4 mb-5" data-testid="debts-queue">
      <SectionHead
        title="Записано без мережі"
        count={rows.length}
        action={
          online && waiting > 0 ? (
            <button type="button" className="font-semibold text-sq-blue disabled:opacity-50" disabled={sending} onClick={() => void sendNow()}>
              {sending ? 'Надсилаю…' : 'Надіслати зараз'}
            </button>
          ) : undefined
        }
      />
      <p className="mt-1 text-[13px] text-sq-muted">
        Товар уже в покупця. Ці записи підуть на сервер, щойно буде звʼязок, — до того їх видно лише на цій касі.
      </p>
      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.id} className="sq-row" data-testid="debts-queue-row">
            <div className="flex items-start gap-3 w-full py-2">
              <span className="min-w-0 flex-1">
                {showCustomer && <span className="block text-[15px] font-semibold truncate">{row.customerName}</span>}
                <span className="block text-[13px] text-sq-muted">
                  {queuedAt(row.createdAt)} · {goodsText(row.lines.length)}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
                <span className={`block text-[13px] ${row.status === 'dead' ? 'text-red-600' : 'text-sq-muted'}`}>
                  {queueStatusText(row)}
                </span>
              </span>
              <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(row.totalCents)}</span>
            </div>
            {row.status === 'dead' && (
              <div className="flex flex-wrap items-center gap-2 pb-3">
                {confirming === row.id ? (
                  <>
                    <span className="w-full text-[13px] text-red-700">
                      Запис зникне з каси й не потрапить на сервер, а товар уже в покупця. Прибрати?
                    </span>
                    <button type="button" className="sq-btn-quiet min-h-[40px] text-red-600" onClick={() => void discard(row.id)}>
                      Так, прибрати
                    </button>
                    <button type="button" className="sq-btn-quiet min-h-[40px]" onClick={() => setConfirming(null)}>
                      Ні
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="sq-btn-quiet min-h-[40px]" onClick={() => void retry(row.id)}>
                      Надіслати ще раз
                    </button>
                    <button type="button" className="sq-btn-quiet min-h-[40px] text-red-600" onClick={() => setConfirming(row.id)}>
                      Прибрати
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
