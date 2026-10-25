// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paying a debt off — a fiscal receipt for the goods being paid for, at the
// prices they were given at (G3_DEBTS.md §3).
//
// The oldest lines first, whole (decision Д4): tapping a line takes it and
// every older one; there is no way to pick the third line without the first
// two. «Покупець дає» answers the question the counter actually asks — the
// customer holds out 500 ₴ — with how many of the oldest goods that closes.
// Any sum that closes no whole line is refused before it reaches the server,
// because money is only ever taken for particular goods.
//
// The lines are named to the server explicitly, never «everything»: another
// till may have added goods since this screen was read, and the receipt must
// be for exactly what the cashier sees here. A screen gone stale is the
// server's 409, and the statement is read again.
//
// The three ПРРО outcomes are the till's (`bill-payment` has the same):
// refused before anything was written — nothing happened, try again; the
// provider refused the receipt — it was undone and the goods are owed again;
// unclear — the money is taken, the receipt will be registered later, and the
// cashier must not ring it a second time (the server's `warning` says so).

import { useEffect, useMemo, useState } from 'react';
import { cashRoundingDelta, formatSignedUah, formatUah, storeCashRounding, useAuthStore } from '@pos/platform';
import { Banknote, Check, CreditCard, Printer, Segmented } from '@pos/platform/ui';
import { debtsApi, type PaymentRow } from '../lib/debtsApi';
import { creditLine, goodsText, lineTitle, linesCoveredBy, nextCount, prefixTotals, quantityText } from '../lib/debt';
import { debtFailure, unansweredFailure, type DebtFailure } from '../lib/errors';
import { customerScope } from '../lib/pendingKeys';
import { publishCredit } from '../lib/useCredit';
import { useReceiptPrint } from '../lib/useReceiptPrint';
import { useWriteKey } from '../lib/useWriteKey';
import type { DebtLine, PayDebtResult } from '../lib/types';
import { Sheet } from './Sheet';

type Method = PaymentRow['method'];

const NO_ANSWER = 'Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.';
const EARLIER_NO_ANSWER =
  'Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.';

interface Props {
  customerId: number;
  customerName: string;
  openLines: DebtLine[];
  onClose: () => void;
  /** After anything that changed the debt or showed the screen was stale. */
  onChanged: () => void;
}

export function PaySheet({ customerId, customerName, openLines, onClose, onChanged }: Props) {
  const auth = useAuthStore((s) => s.auth);
  const step = storeCashRounding(auth?.store.cash_rounding);
  const [count, setCount] = useState(openLines.length);
  const [method, setMethod] = useState<Method>('cash');
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);
  const writeKey = useWriteKey(customerScope('pay', customerId));
  // Opened again after a payment that got no answer: say so, and check first.
  const [failure, setFailure] = useState<DebtFailure | null>(() =>
    writeKey.replaying ? unansweredFailure(EARLIER_NO_ANSWER) : null
  );
  const [done, setDone] = useState<PayDebtResult | null>(null);
  const { print, printing, status, printablePortal } = useReceiptPrint();

  // The statement was read again under the sheet: keep the choice inside it.
  useEffect(() => {
    setCount((n) => Math.min(Math.max(n, 1), openLines.length));
  }, [openLines.length]);

  const totals = useMemo(() => prefixTotals(openLines), [openLines]);
  const total = count > 0 ? totals[count - 1] : 0;
  const rounding = method === 'cash' ? cashRoundingDelta(total, step) : 0;
  const due = total + rounding;

  const offerCents = (() => {
    const normalized = offer.replace(/\s/g, '').replace(',', '.');
    const n = Number(normalized);
    return normalized && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  })();
  const covered = offerCents != null ? linesCoveredBy(openLines, offerCents) : null;

  async function pay() {
    if (busy || count === 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await debtsApi.pay(customerId, {
        line_ids: openLines.slice(0, count).map((line) => line.id),
        payments: [{ method, amount_cents: due }],
        client_uuid: writeKey.current(),
        cash_rounding: method === 'cash' ? step : 0,
      });
      writeKey.answered();
      publishCredit(result.credit);
      setDone(result);
      onChanged();
      const fiscalOn = auth?.store.fiscal?.enabled ?? false;
      const registered = (result.fiscal ?? result.sale.fiscal)?.status === 'done';
      if ((auth?.store.auto_print_receipt ?? false) && (!fiscalOn || registered)) void print(result.sale);
    } catch (e) {
      const failed = debtFailure(e, 'Не вдалося прийняти оплату');
      // Unknown: the same key again — in this sheet and in the next one opened
      // for this customer — so the next tap finds the receipt if it was made.
      // Anything the server answered: a new attempt next time — a receipt ПРРО
      // refused is voided, and its key would only say so.
      if (failed.unknown) {
        writeKey.unanswered();
        setFailure({ ...failed, text: NO_ANSWER });
      } else {
        writeKey.answered();
        setFailure(failed);
      }
      if (failed.credit) publishCredit(failed.credit);
      if (failed.status != null && failed.status !== 400) onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet title="Оплату прийнято" onClose={onClose} testId="debts-pay-done">
        <div className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={40} />
          </div>
          {/* «Від Марія Золота» would need the genitive no till can build
              from a typed name; the name leads instead, in the nominative. */}
          <p className="text-[15px]">
            <span className="font-semibold">{customerName}</span> — прийнято{' '}
            <span className="font-semibold tabular-nums whitespace-nowrap">
              {formatUah(done.sale.total_cents + (done.sale.rounding_cents ?? 0))}
            </span>
            {done.sale.receipt_number && (
              <>
                , <span className="whitespace-nowrap">чек {done.sale.receipt_number}</span>
              </>
            )}
            .
          </p>
          <p className="text-[15px] tabular-nums">{creditLine(done.credit)}</p>
          {done.warning && (
            <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left">
              {done.warning}
            </p>
          )}
          {status && <p className="text-sm text-sq-secondary">{status}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="sq-btn-quiet flex-1 justify-center"
              disabled={printing}
              onClick={() => void print(done.sale)}
            >
              <Printer size={20} />
              Друкувати чек
            </button>
            <button type="button" className="pos-btn-primary flex-1 min-h-[48px] rounded-xl" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
        {printablePortal}
      </Sheet>
    );
  }

  return (
    <Sheet title="Прийняти оплату" onClose={onClose} wide testId="debts-pay-sheet">
      <div className="space-y-4">
        <p className="text-[13px] text-sq-muted">
          Гасяться найстаріші товари, цілими рядками. Торкніться товару, до якого гасити.
        </p>

        <ol className="rounded-xl ring-1 ring-sq-divider overflow-hidden" data-testid="debts-pay-lines">
          {openLines.map((line, index) => {
            const on = index < count;
            return (
              <li key={line.id} className="border-b border-sq-divider/70 last:border-b-0">
                <button
                  type="button"
                  aria-pressed={on}
                  className={`w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${on ? 'bg-sq-selected' : 'bg-white'}`}
                  onClick={() => setCount((n) => nextCount(n, index))}
                >
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full grid place-items-center ${on ? 'bg-sq-blue text-white' : 'ring-1 ring-sq-divider'}`}
                    aria-hidden
                  >
                    {on && <Check size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] truncate">{lineTitle(line)}</span>
                    <span className="block text-[13px] text-sq-muted">
                      {new Date(line.created_at).toLocaleDateString('uk-UA')} ·{' '}
                      {quantityText(line.remaining_quantity, line.unit, line.price_per)}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(line.owed_cents)}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <label className="block">
          <span className="text-[13px] font-semibold text-sq-secondary">Покупець дає, ₴ (необовʼязково)</span>
          <div className="mt-1 flex gap-2">
            <input
              className="pos-field min-w-0 flex-1"
              inputMode="decimal"
              value={offer}
              placeholder="Наприклад: 500"
              onChange={(e) => setOffer(e.target.value)}
            />
            {covered && covered.count > 0 && (
              <button type="button" className="sq-btn-quiet shrink-0" onClick={() => setCount(covered.count)}>
                Взяти
              </button>
            )}
          </div>
          {covered && (
            <span className="mt-1 block text-[13px] text-sq-secondary tabular-nums" data-testid="debts-pay-offer">
              {covered.count > 0
                ? `Закриває ${goodsText(covered.count)} на ${formatUah(covered.total)}`
                : `Не вистачає навіть на найстаріший товар (${formatUah(totals[0] ?? 0)})`}
            </span>
          )}
        </label>

        <Segmented<Method>
          value={method}
          onChange={setMethod}
          ariaLabel="Чим платить"
          className="w-full"
          options={[
            {
              value: 'cash',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Banknote size={20} />
                  Готівка
                </span>
              ),
            },
            {
              value: 'card',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard size={20} />
                  Картка
                </span>
              ),
            },
          ]}
        />

        <dl className="space-y-1 text-[15px] tabular-nums">
          <div className="flex justify-between gap-3">
            <dt className="text-sq-secondary">{goodsText(count)}</dt>
            <dd>{formatUah(total)}</dd>
          </div>
          {rounding !== 0 && (
            <div className="flex justify-between gap-3 text-sq-secondary">
              <dt>Заокруглення готівки</dt>
              <dd>{formatSignedUah(rounding)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 text-[17px] font-bold text-sq-heading">
            <dt>До сплати</dt>
            <dd data-testid="debts-pay-due">{formatUah(due)}</dd>
          </div>
        </dl>

        {failure && (
          <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-pay-error">
            {failure.text}
          </p>
        )}

        <button
          type="button"
          className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums"
          disabled={busy || count === 0}
          onClick={() => void pay()}
        >
          {busy ? 'Проводжу…' : failure?.unknown ? 'Перевірити ще раз' : `Прийняти ${formatUah(due)}`}
        </button>
      </div>
    </Sheet>
  );
}
