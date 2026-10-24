// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Борги» — who owes the shop, the longest-owing first (G3_DEBTS.md §5).
//
// The paper notebook's front page: a name, a sum and how long it has waited.
// «Усі з лімітом» adds the customers the owner gave credit who owe nothing right
// now — the list a limit is managed from. A customer with no limit is not here
// at all; credit is given on the customer's own card.
//
// On the desktop till (PR3, §6) two things come on top. The handovers written
// down without a network head the page until they reach the server — and the
// ones the server refused stay there for a person. And without a network the
// list is the till's mirror: what the server said last, with those handovers
// added, read-only — a statement lives on the server.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatUah, isOfflinePosEnabled, useAuthStore, useOfflineStatus } from '@pos/platform';
import { PageHeader, Segmented, Wallet } from '@pos/platform/ui';
import { listMirror, mirrorFilledAt } from '../data/mirror';
import { onQueueChange, pendingByCustomer } from '../data/queue';
import { debtsApi } from '../lib/debtsApi';
import { ageText, goodsText, isOverLimit, matchesDebtor, plural } from '../lib/debt';
import { debtFailure } from '../lib/errors';
import { useQueue, useQueueDrained } from '../lib/useQueue';
import type { Debtor } from '../lib/types';
import { Frame, type DebtsFrame } from '../components/Frame';
import { QueuePanel } from '../components/QueuePanel';

type Scope = 'owing' | 'all';

interface Mirror {
  rows: Debtor[];
  /** When the till last had the whole list; null when it never had it. */
  filledAt: number | null;
}

function stampOf(at: number): string {
  return new Date(at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function DebtorsPage({ frame }: { frame: DebtsFrame }) {
  const online = useOfflineStatus((s) => s.online);
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const queue = isOfflinePosEnabled();
  // An offline login holds no token the server would take — as good as no network.
  const reachable = online && (!queue || api.hasLiveJwt());
  const queued = useQueue();
  const [scope, setScope] = useState<Scope>('owing');
  const [rows, setRows] = useState<Debtor[] | null>(null);
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [epoch, setEpoch] = useState(0);

  // A handover that has just reached the server changes the list.
  useQueueDrained(
    queued,
    useCallback(() => setEpoch((n) => n + 1), [])
  );

  useEffect(() => {
    if (!reachable) return undefined;
    let live = true;
    setError(null);
    debtsApi
      .debtors(scope === 'all')
      .then((answer) => {
        if (live) setRows(answer.debtors);
      })
      .catch((e) => {
        if (live) setError(debtFailure(e, 'Не вдалося прочитати борги').text);
      });
    return () => {
      live = false;
    };
  }, [scope, reachable, epoch]);

  // The desktop without a network: the mirror, with what this till wrote down on top.
  useEffect(() => {
    if (reachable || !queue || storeId == null) {
      setMirror(null);
      return undefined;
    }
    let live = true;
    const read = async () => {
      const [mirrored, pending, filledAt] = await Promise.all([
        listMirror(storeId),
        pendingByCustomer(storeId),
        mirrorFilledAt(storeId),
      ]);
      if (!live) return;
      setMirror({
        filledAt,
        rows: mirrored
          .map((row) => ({
            customer_id: row.customerId,
            name: row.name,
            phone: row.phone,
            balance_cents: row.balanceCents + (pending.get(row.customerId) ?? 0),
            limit_cents: row.limitCents,
            locked: row.locked,
            open_lines: 0,
            oldest_open_at: null,
          }))
          .sort((a, b) => b.balance_cents - a.balance_cents || a.name.localeCompare(b.name, 'uk')),
      });
    };
    void read();
    const off = onQueueChange(() => void read());
    return () => {
      live = false;
      off();
    };
  }, [reachable, queue, storeId]);

  const offline = !reachable && queue;
  const source = offline ? (mirror?.rows ?? null) : rows;
  // Online the server already answered for the scope; the mirror holds both halves.
  const scoped = useMemo(
    () =>
      (source ?? []).filter(
        (row) => (!offline || scope === 'all' || row.balance_cents > 0) && matchesDebtor(row, query)
      ),
    [source, offline, scope, query]
  );
  const owing = (source ?? []).filter((row) => row.balance_cents > 0);
  const total = owing.reduce((sum, row) => sum + row.balance_cents, 0);

  return (
    <Frame frame={frame}>
      <PageHeader
        glyph={Wallet}
        title="Борги"
        subtitle="Хто скільки винен магазину — найдовше першими. Записати під запис можна з кошика, коли обрано покупця з лімітом."
      />

      <QueuePanel rows={queued} />

      {!reachable && !queue ? (
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">Журнал боргу живе на сервері — без звʼязку його не прочитати.</p>
        </div>
      ) : offline && mirror && mirror.filledAt == null ? (
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">
            Каса ще жодного разу не отримала список боргів — він зʼявиться після першого сеансу з мережею.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Scope>
              value={scope}
              onChange={setScope}
              ariaLabel="Кого показати"
              options={[
                { value: 'owing', label: 'Винні' },
                { value: 'all', label: 'Усі з лімітом' },
              ]}
            />
            <input
              // 12rem before it wraps: on a phone the box takes its own line
              // rather than squeezing to «Імʼя або телеф».
              className={`${frame === 'admin' ? 'sq-input' : 'pos-field'} min-w-[12rem] flex-1`}
              value={query}
              placeholder="Імʼя або телефон"
              aria-label="Пошук покупця"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {offline && mirror?.filledAt != null && (
            <p className="text-[13px] text-amber-800" data-testid="debts-mirror-note">
              Без мережі — за даними каси на {stampOf(mirror.filledAt)}, разом із записаним без мережі. Виписку
              відкриє мережа.
            </p>
          )}

          {source && owing.length > 0 && (
            <p className="text-[15px] text-sq-secondary tabular-nums" data-testid="debts-total">
              Разом винні <span className="font-semibold text-sq-heading">{formatUah(total)}</span> ·{' '}
              {owing.length} {plural(owing.length, 'покупець', 'покупці', 'покупців')}
            </p>
          )}

          {error && !offline && <p className="text-sm text-red-600">{error}</p>}
          {!source && !(error && !offline) && <p className="text-sm text-sq-muted">Завантаження…</p>}

          {source && scoped.length === 0 && (
            <div className="sq-card p-6 text-center text-[15px] text-sq-secondary">
              {query
                ? 'Нікого не знайдено'
                : scope === 'owing'
                  ? 'Ніхто нічого не винен.'
                  : 'Ще нікому не дозволено під запис. Ліміт ставить власник у картці покупця.'}
            </div>
          )}

          {scoped.length > 0 && (
            <ul className="rounded-card bg-white shadow-card overflow-hidden" data-testid="debtors">
              {scoped.map((row) => (
                <li key={row.customer_id} className="sq-row last:shadow-none">
                  {offline ? (
                    <div className="flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5">
                      <DebtorLine row={row} />
                    </div>
                  ) : (
                    <Link
                      to={String(row.customer_id)}
                      className="flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5 hover:bg-sq-sidebar/60"
                    >
                      <DebtorLine row={row} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Frame>
  );
}

function DebtorLine({ row }: { row: Debtor }) {
  const over = isOverLimit(row);
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold truncate">{row.name}</span>
        <span className="block text-[13px] text-sq-muted truncate">
          {[row.phone, row.locked ? 'записи заблоковано' : null].filter(Boolean).join(' · ')}
          {over && (
            <span className="text-amber-800" data-testid="debtor-over-limit">
              {row.phone || row.locked ? ' · ' : ''}понад ліміт
            </span>
          )}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-[16px] font-semibold tabular-nums">{formatUah(row.balance_cents)}</span>
        <span className="block text-[13px] text-sq-muted">
          {row.oldest_open_at
            ? `${goodsText(row.open_lines)} · ${ageText(row.oldest_open_at)}`
            : row.limit_cents != null
              ? `ліміт ${formatUah(row.limit_cents)}`
              : ''}
        </span>
      </span>
    </>
  );
}
