// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Борги» — who owes the shop, the longest-owing first (G3_DEBTS.md §5).
//
// The paper notebook's front page: a name, a sum and how long it has waited.
// «Усі з лімітом» adds the customers the owner gave credit who owe nothing right
// now — the list a limit is managed from. A customer with no limit is not here
// at all; credit is given on the customer's own card.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUah, useOfflineStatus } from '@pos/platform';
import { PageHeader, Segmented, Wallet } from '@pos/platform/ui';
import { debtsApi } from '../lib/debtsApi';
import { ageText, goodsText, matchesDebtor, plural } from '../lib/debt';
import { debtFailure } from '../lib/errors';
import type { Debtor } from '../lib/types';
import { Frame, type DebtsFrame } from '../components/Frame';

type Scope = 'owing' | 'all';

export function DebtorsPage({ frame }: { frame: DebtsFrame }) {
  const online = useOfflineStatus((s) => s.online);
  const [scope, setScope] = useState<Scope>('owing');
  const [rows, setRows] = useState<Debtor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!online) return undefined;
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
  }, [scope, online]);

  const shown = useMemo(() => (rows ?? []).filter((row) => matchesDebtor(row, query)), [rows, query]);
  const owing = (rows ?? []).filter((row) => row.balance_cents > 0);
  const total = owing.reduce((sum, row) => sum + row.balance_cents, 0);

  return (
    <Frame frame={frame}>
      <PageHeader
        glyph={Wallet}
        title="Борги"
        subtitle="Хто скільки винен магазину — найдовше першими. Записати під запис можна з кошика, коли обрано покупця з лімітом."
      />

      {!online ? (
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">Журнал боргу живе на сервері — без звʼязку його не прочитати.</p>
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

          {rows && owing.length > 0 && (
            <p className="text-[15px] text-sq-secondary tabular-nums" data-testid="debts-total">
              Разом винні <span className="font-semibold text-sq-heading">{formatUah(total)}</span> ·{' '}
              {owing.length} {plural(owing.length, 'покупець', 'покупці', 'покупців')}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {!rows && !error && <p className="text-sm text-sq-muted">Завантаження…</p>}

          {rows && shown.length === 0 && (
            <div className="sq-card p-6 text-center text-[15px] text-sq-secondary">
              {query
                ? 'Нікого не знайдено'
                : scope === 'owing'
                  ? 'Ніхто нічого не винен.'
                  : 'Ще нікому не дозволено під запис. Ліміт ставить власник у картці покупця.'}
            </div>
          )}

          {shown.length > 0 && (
            <ul className="rounded-card bg-white shadow-card overflow-hidden" data-testid="debtors">
              {shown.map((row) => (
                <li key={row.customer_id} className="sq-row last:shadow-none">
                  <Link
                    to={String(row.customer_id)}
                    className="flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5 hover:bg-sq-sidebar/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold truncate">{row.name}</span>
                      <span className="block text-[13px] text-sq-muted truncate">
                        {[row.phone, row.locked ? 'записи заблоковано' : null].filter(Boolean).join(' · ')}
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Frame>
  );
}
