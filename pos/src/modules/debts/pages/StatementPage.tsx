// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One customer's page of the notebook: what is owed, line by line, oldest
// first, and the journal of everything that happened to it, newest first.
//
// The cashier takes money (a fiscal receipt for the oldest goods) and takes
// goods back; the owner also writes a debt off and sets the limit. Every write
// answers with the debt as it now stands, and the page reads the statement
// again for the journal — the page never adds up a balance of its own.
//
// On the desktop (PR3) the handovers of this customer still in the till's
// queue are shown above the statement — and without a network they are all
// the page can show: the statement is the server's.

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatSignedUah, formatUah, isOfflinePosEnabled, useAuthStore, useOfflineStatus } from '@pos/platform';
import { ArrowLeft, SectionHead } from '@pos/platform/ui';
import { debtsApi } from '../lib/debtsApi';
import {
  ageText,
  chainCancelOffer,
  chainNote,
  chainReturnOffer,
  creditLine,
  entryLabel,
  lineProgress,
  lineTitle,
  quantityText,
  undoablePrepayments,
} from '../lib/debt';
import { debtFailure } from '../lib/errors';
import { publishCredit } from '../lib/useCredit';
import { useQueue, useQueueDrained } from '../lib/useQueue';
import type { DebtEntry, DebtLine, DebtStatement } from '../lib/types';
import { ChainReturnSheet } from '../components/ChainReturnSheet';
import { Frame, type DebtsFrame } from '../components/Frame';
import { QueuePanel } from '../components/QueuePanel';
import { LimitEditor } from '../components/LimitEditor';
import { PaySheet } from '../components/PaySheet';
import { ReturnSheet } from '../components/ReturnSheet';
import { UndoPrepaySheet } from '../components/UndoPrepaySheet';
import { WriteOffSheet } from '../components/WriteOffSheet';

type Open = 'pay' | 'return' | 'writeoff' | null;

export function StatementPage({ frame }: { frame: DebtsFrame }) {
  const { customerId: raw } = useParams();
  const customerId = Number(raw);
  const online = useOfflineStatus((s) => s.online);
  const queue = isOfflinePosEnabled();
  // An offline login holds no token the server would take — as good as no network.
  const reachable = online && (!queue || api.hasLiveJwt());
  const role = useAuthStore((s) => s.auth?.staff.role ?? null);
  const owner = role === 'owner';
  const queued = useQueue(Number.isInteger(customerId) ? customerId : undefined);

  const [statement, setStatement] = useState<DebtStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  // The line is taken when the sheet opens: a refusal re-reads the statement,
  // and the sheet must stay to say why even if those goods closed meanwhile.
  const [undo, setUndo] = useState<{ entry: DebtEntry; line: DebtLine } | null>(null);
  // A line's ПРРО chain given back (2-Б) — taken when the sheet opens, for the same reason.
  const [chain, setChain] = useState<{
    mode: 'cancel' | 'goods';
    lineId: number;
    title: string;
    count: number;
    cents: number;
  } | null>(null);

  const reload = useCallback(() => setEpoch((n) => n + 1), []);
  // A handover of this customer that has just reached the server is in the journal now.
  useQueueDrained(queued, reload);

  useEffect(() => {
    if (!reachable || !Number.isInteger(customerId) || customerId <= 0) return undefined;
    let live = true;
    debtsApi
      .statement(customerId)
      .then((next) => {
        if (!live) return;
        setStatement(next);
        setError(null);
        publishCredit(next.credit, next.customer);
      })
      .catch((e) => {
        if (live) setError(debtFailure(e, 'Не вдалося прочитати виписку').text);
      });
    return () => {
      live = false;
    };
  }, [customerId, reachable, epoch]);

  const back = (
    <Link to=".." relative="path" className="-ml-1 inline-flex items-center gap-1 min-h-11 pr-1 text-[15px] font-semibold text-sq-blue">
      <ArrowLeft size={20} aria-hidden />
      Борги
    </Link>
  );

  if (!reachable) {
    return (
      <Frame frame={frame}>
        {back}
        <div className="mt-3">
          <QueuePanel rows={queued} showCustomer={false} />
        </div>
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">Журнал боргу живе на сервері — без звʼязку його не прочитати.</p>
        </div>
      </Frame>
    );
  }

  if (!statement) {
    return (
      <Frame frame={frame}>
        {back}
        <p className={`mt-3 text-sm ${error ? 'text-red-600' : 'text-sq-muted'}`}>{error ?? 'Завантаження…'}</p>
      </Frame>
    );
  }

  const { customer, credit, open_lines: lines, entries } = statement;
  const owed = lines.reduce((sum, line) => sum + line.owed_cents, 0);
  const undoable = undoablePrepayments(entries, lines, { owner });

  return (
    <Frame frame={frame}>
      {back}
      <header className="mt-2 mb-5 space-y-1">
        <h2 className="text-[28px] font-bold text-sq-heading leading-tight">{customer.name}</h2>
        {customer.phone && <p className="text-[15px] text-sq-muted">{customer.phone}</p>}
        <p className="text-[17px] tabular-nums" data-testid="debts-statement-credit">
          {credit.limit_cents == null && credit.balance_cents === 0 ? 'Під запис не дозволено' : creditLine(credit)}
        </p>
        {statement.oldest_open_at && (
          <p className="text-[13px] text-sq-muted">Найстаріший борг — {ageText(statement.oldest_open_at)}</p>
        )}
      </header>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <QueuePanel rows={queued} showCustomer={false} />

      {lines.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button type="button" className="pos-btn-primary min-h-[48px] px-5 rounded-xl text-[16px]" onClick={() => setOpen('pay')}>
            Прийняти оплату
          </button>
          <button type="button" className="sq-btn-quiet min-h-[48px]" onClick={() => setOpen('return')}>
            Повернути товар
          </button>
          {owner && (
            <button type="button" className="sq-btn-quiet min-h-[48px] text-red-600" onClick={() => setOpen('writeoff')}>
              Списати
            </button>
          )}
        </div>
      )}

      <section className="mb-7">
        <SectionHead title="Винно" count={lines.length} action={lines.length > 0 ? <span className="tabular-nums">{formatUah(owed)}</span> : undefined} />
        {lines.length === 0 ? (
          <p className="py-4 text-[15px] text-sq-secondary">Нічого не винно.</p>
        ) : (
          <ul data-testid="debts-open-lines">
            {lines.map((line) => (
              <li key={line.id} className="sq-row">
                <div className="flex items-center gap-3 w-full min-h-[52px] py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] truncate">{lineTitle(line)}</span>
                    <span className="block text-[13px] text-sq-muted">
                      {new Date(line.created_at).toLocaleDateString('uk-UA')} ·{' '}
                      {quantityText(line.remaining_quantity, line.unit, line.price_per)}
                      {lineProgress(line) ? ` (${lineProgress(line)})` : ''}
                      {line.note ? ` · ${line.note}` : ''}
                    </span>
                    {chainNote(line) && <span className="block text-[13px] text-amber-800">{chainNote(line)}</span>}
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(line.owed_cents)}</span>
                </div>
                {(() => {
                  const offer = chainCancelOffer(line, statement.fiscal);
                  return offer ? (
                    <button
                      type="button"
                      className="-mt-1 mb-1 min-h-11 text-[15px] font-semibold text-sq-blue"
                      data-testid={`debts-cancel-prepayments-${line.id}`}
                      onClick={() =>
                        setChain({ mode: 'cancel', lineId: line.id, title: lineTitle(line), count: offer.count, cents: offer.cents })
                      }
                    >
                      Скасувати внески ({offer.count})
                    </button>
                  ) : null;
                })()}
              </li>
            ))}
          </ul>
        )}
      </section>

      {owner && (
        <section className="mb-7">
          <SectionHead title="Ліміт" />
          <div className="pt-3">
            <LimitEditor credit={credit} touch={frame === 'till'} />
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Журнал" count={entries.length} />
        {entries.length === 0 ? (
          <p className="py-4 text-[15px] text-sq-secondary">Ще нічого не записано.</p>
        ) : (
          <ul data-testid="debts-journal">
            {entries.map((entry) => (
              <li key={entry.id} className="sq-row">
                <div className="flex items-center gap-3 w-full min-h-[52px] py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">
                      {entryLabel(entry)}
                      {/* A «внесок» has a number from the receipt counter but is no receipt. */}
                      {entry.receipt_number ? ` · ${entry.prepayment ? '№' : 'чек'} ${entry.receipt_number}` : ''}
                    </span>
                    <span className="block text-[13px] text-sq-muted">
                      {new Date(entry.created_at).toLocaleString('uk-UA')}
                      {entry.staff_name ? ` · ${entry.staff_name}` : ''}
                      {entry.offline ? ' · без мережі' : ''}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </span>
                  </span>
                  <span
                    className={`text-[15px] font-semibold tabular-nums shrink-0 ${entry.amount_cents > 0 ? 'text-sq-heading' : 'text-sq-success-ink'}`}
                  >
                    {formatSignedUah(entry.amount_cents)}
                  </span>
                  {chainReturnOffer(entry, statement.fiscal) && (
                    <button
                      type="button"
                      className="shrink-0 min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
                      data-testid={`debts-chain-return-${entry.id}`}
                      onClick={() => {
                        const offer = chainReturnOffer(entry, statement.fiscal);
                        if (offer) {
                          setChain({
                            mode: 'goods',
                            lineId: offer.line_id,
                            title: lineTitle(offer),
                            count: offer.documents,
                            cents: offer.back_cents,
                          });
                        }
                      }}
                    >
                      Повернути товар
                    </button>
                  )}
                  {undoable.has(entry.id) && (
                    <button
                      type="button"
                      className="shrink-0 min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
                      onClick={() => {
                        const line = lines.find((l) => l.id === entry.prepay_line_id);
                        if (line) setUndo({ entry, line });
                      }}
                    >
                      Скасувати
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open === 'pay' && (
        <PaySheet
          customerId={customer.id}
          customerName={customer.name}
          customerPhone={customer.phone}
          openLines={lines}
          fiscal={statement.fiscal}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      )}
      {open === 'return' && (
        <ReturnSheet customerId={customer.id} openLines={lines} onClose={() => setOpen(null)} onChanged={reload} />
      )}
      {undo && (
        <UndoPrepaySheet entry={undo.entry} line={undo.line} onClose={() => setUndo(null)} onChanged={reload} />
      )}
      {chain && (
        <ChainReturnSheet
          mode={chain.mode}
          customerId={customer.id}
          lineId={chain.lineId}
          title={chain.title}
          count={chain.count}
          cents={chain.cents}
          onClose={() => setChain(null)}
          onChanged={reload}
        />
      )}
      {open === 'writeoff' && owner && (
        <WriteOffSheet customerId={customer.id} openLines={lines} onClose={() => setOpen(null)} onChanged={reload} />
      )}
    </Frame>
  );
}
