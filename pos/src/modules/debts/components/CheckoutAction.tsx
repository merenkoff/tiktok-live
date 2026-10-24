// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Під запис» beside «Оплатити» — the host's `checkout.Action` slot (Г2).
//
// The goods leave with the customer and the shop writes them to the customer's
// tab: no money, no fiscal receipt (scheme A, TechDocs/grocery/G3_DEBTS.md).
// The receipt comes when the customer pays the debt off.
//
// What the button says before anyone taps is decided by `issueBlock`: no
// customer, no network, a bouquet assembled at the counter, a customer the
// owner gave no limit, a locked one, and a cart above what is still allowed
// (decision Д3 — the till does not let it through and says so in figures). The
// server checks every one of them again under the customer's lock.
//
// The key of the write (`client_uuid`) is made when the sheet opens and kept
// until it closes. A tap that timed out is then a replay on the second tap, not
// a second debt for the same bread — and so is the tap in a sheet opened again
// on the same cart for the same customer (`pendingKeys`). While such a write is
// unanswered the limit does not stop the check: if the write did land, the
// balance already holds it, and «over the limit» would be that very write.

import { useCallback, useMemo, useState } from 'react';
import { formatUah, useOfflineStatus } from '@pos/platform';
import { Wallet } from '@pos/platform/ui';
import type { CheckoutActionProps } from '../../types';
import { debtsApi } from '../lib/debtsApi';
import { creditLine, issueBlock, issueItems } from '../lib/debt';
import { debtFailure, unansweredFailure, type DebtFailure } from '../lib/errors';
import { issueScope, rememberUnanswered, settle, unansweredKey } from '../lib/pendingKeys';
import { publishCredit, useCredit } from '../lib/useCredit';
import type { DebtWriteResult } from '../lib/types';
import { Sheet } from './Sheet';

const NOTE_MAX = 200;

/** What still stops a write that may already have landed: nothing to check it with or against. */
const HARD_BLOCKS = new Set(['no_customer', 'offline', 'assembled']);

const NO_ANSWER = 'Немає відповіді від сервера — запис міг пройти. «Перевірити ще раз» не запише борг удруге.';
const EARLIER_NO_ANSWER =
  'Попередній запис цього кошика лишився без відповіді — він міг пройти. «Перевірити ще раз» не запише борг удруге.';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export default function CheckoutAction({ lines, customer, cartDiscount, totalCents, onCompleted }: CheckoutActionProps) {
  const online = useOfflineStatus((s) => s.online);
  const customerId = customer?.id ?? null;
  const { credit, reload } = useCredit(customerId);
  const items = useMemo(() => issueItems(lines), [lines]);
  const scope = customerId != null ? issueScope(customerId, items, cartDiscount) : null;

  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DebtFailure | null>(null);
  const [done, setDone] = useState<DebtWriteResult | null>(null);

  // Closing the success pane IS «готово»: the host empties the cart and
  // re-reads stock. Any way out of it counts, or a cashier who taps the
  // backdrop would be left with a cart that is already on the tab.
  const close = useCallback(() => {
    const finished = done != null;
    setOpen(false);
    setKey(null);
    setNote('');
    setFailure(null);
    setDone(null);
    if (finished) onCompleted();
  }, [done, onCompleted]);

  if (lines.length === 0 && !open) return null;

  const pending = scope != null ? unansweredKey(scope) : null;
  const judged = issueBlock({ customerId, credit, totalCents, lines, online });
  const block = judged && pending != null && !HARD_BLOCKS.has(judged.code) ? null : judged;

  function start() {
    const replay = scope != null ? unansweredKey(scope) : null;
    setKey(replay ?? crypto.randomUUID());
    setFailure(replay ? unansweredFailure(EARLIER_NO_ANSWER) : null);
    setDone(null);
    setOpen(true);
    reload();
  }

  async function issue() {
    if (customerId == null || scope == null || key == null || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await debtsApi.issue({
        customer_id: customerId,
        items,
        cart_discount: cartDiscount,
        client_uuid: key,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      settle(scope);
      publishCredit(result.credit);
      setDone(result);
    } catch (e) {
      const failed = debtFailure(e, 'Не вдалося записати під запис');
      // An unknown outcome keeps the key — here and for a sheet opened again
      // on this cart — so the next tap replays rather than doubles. A definite
      // refusal frees it: the next tap is a new attempt.
      if (failed.unknown) {
        rememberUnanswered(scope, key);
        setFailure({ ...failed, text: NO_ANSWER });
      } else {
        settle(scope);
        setFailure(failed);
        setKey(crypto.randomUUID());
      }
      if (failed.code === 'over_limit' || failed.code === 'no_credit' || failed.code === 'credit_locked') reload();
    } finally {
      setBusy(false);
    }
  }

  const balance = credit?.balance_cents ?? 0;
  const after = balance + totalCents;
  // Only why it cannot. What the customer owes and may still take is the
  // strip under their name one line up (`customer.Panel`), and saying it twice
  // would put two identical lines into a cart that has room for neither.
  const hint =
    block?.text ?? (pending != null ? 'Попередній запис цього кошика лишився без відповіді — відкрийте й перевірте' : null);

  return (
    <>
      <div data-testid="debts-checkout-action">
        <button
          type="button"
          className="w-full min-h-[48px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
          disabled={block != null}
          onClick={start}
        >
          <Wallet size={20} />
          Під запис
        </button>
        {hint && (
          <p
            className={`mt-1 text-[13px] leading-snug ${block?.code === 'over_limit' ? 'text-amber-800' : 'text-sq-muted'}`}
            data-testid="debts-checkout-hint"
          >
            {hint}
          </p>
        )}
      </div>

      {open && customer && (
        <Sheet title={done ? 'Записано під запис' : 'Під запис'} onClose={close} testId="debts-issue-sheet">
          {done ? (
            <div className="space-y-3">
              <p className="text-[15px]">
                <span className="font-semibold">{customer.name}</span> забирає товари на{' '}
                <span className="font-semibold tabular-nums">{formatUah(done.entry.amount_cents)}</span>.
              </p>
              {done.replay && (
                <p className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-issue-replay">
                  Цей запис уже був зроблений о {timeOf(done.entry.created_at)} — удруге борг не записано.
                </p>
              )}
              <p className="text-[15px] tabular-nums" data-testid="debts-issue-after">
                {creditLine(done.credit)}
              </p>
              <p className="text-[13px] text-sq-muted">
                Фіскальний чек буде, коли покупець погасить борг.
              </p>
              <button type="button" className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]" onClick={close}>
                Готово
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-[17px] font-semibold">{customer.name}</p>
                {customer.phone && <p className="text-[13px] text-sq-muted">{customer.phone}</p>}
              </div>
              <dl className="space-y-1.5 text-[15px] tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">У кошику</dt>
                  <dd className="font-semibold">{formatUah(totalCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">Борг зараз</dt>
                  <dd>{credit ? formatUah(balance) : '…'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">Борг стане</dt>
                  <dd className="font-semibold">
                    {credit ? formatUah(after) : '…'}
                    {credit?.limit_cents != null && (
                      <span className="font-normal text-sq-muted"> з {formatUah(credit.limit_cents)}</span>
                    )}
                  </dd>
                </div>
              </dl>
              <label className="block">
                <span className="text-[13px] font-semibold text-sq-secondary">Примітка (необовʼязково)</span>
                <input
                  className="pos-field mt-1 w-full"
                  value={note}
                  maxLength={NOTE_MAX}
                  placeholder="Наприклад: до зарплати"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {(block || failure) && (
                <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-issue-error">
                  {failure?.text ?? block?.text}
                </p>
              )}
              <button
                type="button"
                className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums"
                disabled={busy || block != null}
                onClick={() => void issue()}
              >
                {busy ? 'Записую…' : failure?.unknown ? 'Перевірити ще раз' : `Записати ${formatUah(totalCents)} у борг`}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
