// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Giving a line's ПРРО prepayment chain back (G3_DEBTS.md §11, 2-Б). The
// provider returns a chain only whole, so both things the till can do give
// back all of it at once:
//   · «Скасувати внески (N)» under an open line — every «внесок» of its chain
//     back to the customer as money; the sum is owed again;
//   · «Повернути товар» on the payment that closed a line through its chain —
//     the goods back on the shelf (or written off, «Брак»), and the receipt
//     and every «внесок» for them refunded. The debt is not reopened: it was
//     paid.
//
// It is a refund, not a sale: once the server has written it, the money goes
// back whatever ПРРО answers. A return receipt still to be registered is the
// warning on the done screen, never a reason to try again — and after no
// answer the same key goes again, so the second tap finds the first.

import { useState } from 'react';
import { formatUah, useAuthStore } from '@pos/platform';
import { Check, Printer } from '@pos/platform/ui';
import { debtsApi } from '../lib/debtsApi';
import { debtFailure, unansweredFailure, type DebtFailure } from '../lib/errors';
import { plural, prepaymentsText } from '../lib/debt';
import { chainScope } from '../lib/pendingKeys';
import { publishCredit } from '../lib/useCredit';
import { useReceiptPrint } from '../lib/useReceiptPrint';
import { useWriteKey } from '../lib/useWriteKey';
import type { ChainReturnPart, ChainReturnResult } from '../lib/types';
import { Sheet } from './Sheet';

const NO_ANSWER =
  'Немає відповіді від сервера — повернення могло пройти. «Перевірити ще раз» не поверне гроші вдруге.';
const EARLIER_NO_ANSWER =
  'Попереднє повернення цього товару не отримало відповіді — спершу перевірте його: «Перевірити ще раз» не поверне гроші вдруге.';

interface Props {
  mode: 'cancel' | 'goods';
  customerId: number;
  lineId: number;
  /** The goods, as the statement names them. */
  title: string;
  /** `cancel`: the «внески» given back; `goods`: every document of the chain. */
  count: number;
  /** What goes back to the customer. */
  cents: number;
  onClose: () => void;
  /** After anything that changed the debt or showed the screen was stale. */
  onChanged: () => void;
}

function refundOf(part: ChainReturnPart) {
  return part.sale.refunds.find((refund) => refund.id === part.refund_id) ?? null;
}

/** «Чек повернення RF-0007 · внесок № R-0000050» — one return receipt, as the done screen lists it. */
function returnTitle(part: ChainReturnPart): string {
  const number = refundOf(part)?.refund_number;
  const of = part.kind === 'prepayment' ? `внесок № ${part.sale.receipt_number}` : `чек ${part.sale.receipt_number}`;
  return `Чек повернення${number ? ` ${number}` : ''} · ${of}`;
}

function returnedCents(part: ChainReturnPart): number {
  const refund = refundOf(part);
  return (refund?.total_cents ?? 0) + (refund?.rounding_cents ?? 0);
}

function registered(part: ChainReturnPart): boolean {
  return (part.fiscal?.status ?? refundOf(part)?.fiscal_status) === 'done';
}

export function ChainReturnSheet({ mode, customerId, lineId, title, count, cents, onClose, onChanged }: Props) {
  const autoPrint = useAuthStore((s) => s.auth?.store.auto_print_receipt ?? false);
  const writeKey = useWriteKey(chainScope(mode, customerId, lineId));
  const [defect, setDefect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DebtFailure | null>(() =>
    writeKey.replaying ? unansweredFailure(EARLIER_NO_ANSWER) : null
  );
  const [done, setDone] = useState<ChainReturnResult | null>(null);
  const { printRefunds, printing, status, printablePortal } = useReceiptPrint();

  const print = (parts: ChainReturnPart[]) =>
    printRefunds(parts.map((part) => ({ sale: part.sale, refundId: part.refund_id, fiscal: part.fiscal })));

  async function giveBack() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const body = { line_id: lineId, client_uuid: writeKey.current() };
    try {
      const result =
        mode === 'cancel'
          ? await debtsApi.cancelPrepayments(customerId, body)
          : await debtsApi.returnChain(customerId, defect ? { ...body, reason_code: 'defect' } : body);
      writeKey.answered();
      publishCredit(result.credit);
      setDone(result);
      onChanged();
      const ready = result.parts.filter(registered);
      if (autoPrint && ready.length > 0) void print(ready);
    } catch (e) {
      const failed = debtFailure(e, mode === 'cancel' ? 'Не вдалося скасувати внески' : 'Не вдалося повернути товар');
      // Unknown: the same key again — here and in the next sheet for this
      // line — so the next tap finds the refunds if they were written.
      if (failed.unknown) {
        writeKey.unanswered();
        setFailure({ ...failed, text: NO_ANSWER });
      } else {
        writeKey.answered();
        setFailure(failed);
        onChanged();
      }
      if (failed.credit) publishCredit(failed.credit);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const n = done.parts.length;
    return (
      <Sheet title={mode === 'cancel' ? 'Внески повернуто' : 'Товар повернуто'} onClose={onClose} testId="debts-chain-done">
        <div className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={40} />
          </div>
          <p className="text-[15px]" data-testid="debts-chain-done-text">
            Покупцеві — <span className="font-semibold tabular-nums whitespace-nowrap">{formatUah(done.back_cents)}</span>:{' '}
            {n} {plural(n, 'чек', 'чеки', 'чеків')} повернення.
            {mode === 'cancel' ? ' Сума знову в борг.' : ''}
          </p>
          <ul className="rounded-xl ring-1 ring-sq-divider overflow-hidden text-left" data-testid="debts-chain-returns">
            {done.parts.map((part) => (
              <li
                key={part.refund_id}
                className="flex items-center gap-3 px-3 min-h-[52px] py-2 border-b border-sq-divider/70 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-[15px]">{returnTitle(part)}</span>
                <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(returnedCents(part))}</span>
                <button
                  type="button"
                  className="shrink-0 min-h-11 px-2 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
                  disabled={printing}
                  onClick={() => void print([part])}
                  aria-label={`Друкувати: ${returnTitle(part)}`}
                >
                  <Printer size={20} />
                </button>
              </li>
            ))}
          </ul>
          {done.warning && (
            <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left" data-testid="debts-chain-warning">
              {done.warning}
            </p>
          )}
          {status && <p className="text-sm text-sq-secondary">{status}</p>}
          <button type="button" className="pos-btn-primary w-full min-h-[48px] rounded-xl" onClick={onClose}>
            Готово
          </button>
        </div>
        {printablePortal}
      </Sheet>
    );
  }

  return (
    <Sheet
      title={mode === 'cancel' ? 'Скасувати внески?' : 'Повернути товар?'}
      onClose={onClose}
      testId={mode === 'cancel' ? 'debts-cancel-prepayments' : 'debts-chain-return'}
    >
      <div className="space-y-4">
        {mode === 'cancel' ? (
          <p className="text-[15px]" data-testid="debts-chain-words">
            Поверніть покупцеві <span className="font-semibold tabular-nums whitespace-nowrap">{formatUah(cents)}</span> —{' '}
            {prepaymentsText(count, cents)} за «{title}». Ця сума знову стане боргом. ПРРО поверне всі внески за цей
            товар разом — окремо один внесок не повертається.
          </p>
        ) : (
          <p className="text-[15px]" data-testid="debts-chain-words">
            «{title}» — на полицю, покупцеві —{' '}
            <span className="font-semibold tabular-nums whitespace-nowrap">{formatUah(cents)}</span>: чек погашення і всі
            внески за цей товар. ПРРО поверне їх разом — {count} {plural(count, 'чек', 'чеки', 'чеків')} повернення.
          </p>
        )}
        {mode === 'goods' && (
          <label className="flex items-center gap-3 min-h-11 text-[15px]">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={defect}
              onChange={(e) => setDefect(e.target.checked)}
              data-testid="debts-chain-defect"
            />
            Брак — списати, а не на полицю
          </label>
        )}
        {failure && (
          <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-chain-error">
            {failure.text}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="sq-btn-quiet flex-1 justify-center min-h-[48px]" onClick={onClose}>
            Ні
          </button>
          <button
            type="button"
            className="pos-btn-primary flex-1 min-h-[48px] rounded-xl"
            disabled={busy}
            onClick={() => void giveBack()}
          >
            {busy ? 'Повертаю…' : failure?.unknown ? 'Перевірити ще раз' : `Повернути ${formatUah(cents)}`}
          </button>
        </div>
      </div>
      {printablePortal}
    </Sheet>
  );
}
