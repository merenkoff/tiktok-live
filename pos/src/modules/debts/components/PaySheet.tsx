// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paying a debt off — a fiscal receipt for the goods being paid for, at the
// prices they were given at (G3_DEBTS.md §3).
//
// The oldest lines first (decision Д4): tapping a line takes it and every
// older one, whole; there is no way to pick the third line without the first
// two. «Покупець дає» answers the question the counter actually asks — the
// customer holds out 300 ₴ — and since Д4 was revised (2026-10-25, §11) any
// sum is taken: it closes the oldest lines whole, then as many units of the
// next one as it covers when that line is counted in pieces, and the rest
// becomes a «внесок» toward that same line — money for those goods that does
// not close them yet. A store with ПРРО has no «внесок» until the prepayment
// chain (step 2): there the units still go on a receipt, and the sheet says
// to hand the rest back. A typed sum is the plan; tapping a line goes back to
// whole lines.
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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cashRoundingDelta,
  formatSignedUah,
  formatUah,
  isOfflinePosEnabled,
  storeCashRounding,
  useAuthStore,
} from '@pos/platform';
import { Banknote, Check, CreditCard, Printer, Segmented } from '@pos/platform/ui';
import { debtsApi, type PaymentRow } from '../lib/debtsApi';
import {
  creditLine,
  goodsText,
  lineProgress,
  lineTitle,
  nextCount,
  planPayment,
  planRequest,
  planTakes,
  planTotal,
  planWords,
  prefixTotals,
  quantityText,
  takesParts,
  unitsOfText,
  type PayPlan,
} from '../lib/debt';
import { debtFailure, unansweredFailure, type DebtFailure } from '../lib/errors';
import { customerScope } from '../lib/pendingKeys';
import { buildPrepaySlip, printIssueSlip, slipOutcomeText, type PrepaySlipInput, type SlipOutcome } from '../lib/slip';
import { publishCredit } from '../lib/useCredit';
import { useReceiptPrint } from '../lib/useReceiptPrint';
import { useWriteKey } from '../lib/useWriteKey';
import type { DebtLine, DebtSale, PayDebtResult } from '../lib/types';
import { Sheet } from './Sheet';

type Method = PaymentRow['method'];

const NO_ANSWER = 'Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.';
const EARLIER_NO_ANSWER =
  'Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.';

interface Props {
  customerId: number;
  customerName: string;
  /** For the «ВНЕСОК» slip, when the statement has one. */
  customerPhone?: string;
  openLines: DebtLine[];
  onClose: () => void;
  /** After anything that changed the debt or showed the screen was stale. */
  onChanged: () => void;
}

/** «Кепка · L» — the line a «внесок» went to, as the server named it. */
function prepaidTitle(sale: DebtSale): string {
  const line = sale.debt_prepayment;
  if (!line) return '';
  return line.variant_label ? `${line.product_name} · ${line.variant_label}` : line.product_name;
}

function offerToCents(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return normalized && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function PaySheet({ customerId, customerName, customerPhone, openLines, onClose, onChanged }: Props) {
  const auth = useAuthStore((s) => s.auth);
  const step = storeCashRounding(auth?.store.cash_rounding);
  const fiscalOn = auth?.store.fiscal?.enabled ?? false;
  const [count, setCount] = useState(openLines.length);
  const [method, setMethod] = useState<Method>('cash');
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);
  // The server said this store fiscalises after all: no «внесок» on this sheet.
  const [chainRefused, setChainRefused] = useState(false);
  const writeKey = useWriteKey(customerScope('pay', customerId));
  // Opened again after a payment that got no answer: say so, and check first.
  const [failure, setFailure] = useState<DebtFailure | null>(() =>
    writeKey.replaying ? unansweredFailure(EARLIER_NO_ANSWER) : null
  );
  const [done, setDone] = useState<PayDebtResult | null>(null);
  const [slip, setSlip] = useState<SlipOutcome | null>(null);
  const lastSlip = useRef<PrepaySlipInput | null>(null);
  const { print, printing, status, printablePortal } = useReceiptPrint();

  // The statement was read again under the sheet: keep the choice inside it.
  useEffect(() => {
    setCount((n) => Math.min(Math.max(n, 1), openLines.length));
  }, [openLines.length]);

  const totals = useMemo(() => prefixTotals(openLines), [openLines]);
  const partial = takesParts(openLines);
  const offerCents = offerToCents(offer);
  // A typed sum is the plan; without one, the lines the cashier tapped.
  const plan: PayPlan | null = useMemo(
    () =>
      offerCents != null
        ? planPayment(openLines, offerCents, { method, step, partial, prepayAllowed: !fiscalOn && !chainRefused })
        : null,
    [openLines, offerCents, method, step, partial, fiscalOn, chainRefused]
  );

  const total = count > 0 ? totals[count - 1] : 0;
  const rounding = plan ? plan.roundingCents : method === 'cash' ? cashRoundingDelta(total, step) : 0;
  const due = plan ? planTotal(plan) : total + rounding;
  const canPay = plan ? planTakes(plan) : count > 0;

  function tapLine(index: number) {
    setOffer('');
    setCount((n) => (plan ? index + 1 : nextCount(n, index)));
  }

  async function printPrepaySlip(input: PrepaySlipInput) {
    lastSlip.current = input;
    setSlip(await printIssueSlip(buildPrepaySlip(input)));
  }

  async function pay() {
    if (busy || !canPay) return;
    setBusy(true);
    setFailure(null);
    const sent = plan;
    try {
      const result = await debtsApi.pay(customerId, {
        ...(sent
          ? planRequest(openLines, sent, method)
          : {
              line_ids: openLines.slice(0, count).map((line) => line.id),
              payments: [{ method, amount_cents: due }],
            }),
        client_uuid: writeKey.current(),
        cash_rounding: method === 'cash' ? step : 0,
      });
      writeKey.answered();
      publishCredit(result.credit);
      setDone(result);
      onChanged();
      const prepayment = result.prepayment ?? null;
      const receipt = prepayment && prepayment.id === result.sale.id ? null : result.sale;
      const registered = (result.fiscal ?? receipt?.fiscal)?.status === 'done';
      if (receipt && (auth?.store.auto_print_receipt ?? false) && (!fiscalOn || registered)) void print(receipt);
      // The «ВНЕСОК» slip goes where the handover slip goes: a desktop with a
      // printer for the station, and nowhere else (G3_DEBTS.md §5, §11).
      if (prepayment?.debt_prepayment && isOfflinePosEnabled()) {
        const lineId = prepayment.debt_prepayment.line_id;
        const before = openLines.find((line) => line.id === lineId);
        const after = result.open_lines.find((line) => line.id === lineId);
        if (before) {
          void printPrepaySlip({
            storeName: auth?.store.name ?? '',
            customer: { name: customerName, phone: customerPhone ?? null },
            staffName: auth?.staff.display_name ?? '',
            number: prepayment.receipt_number ?? null,
            at: new Date(prepayment.created_at),
            line: after ?? before,
            amountCents: prepayment.total_cents,
            leftCents: after?.owed_cents ?? Math.max(0, before.owed_cents - prepayment.total_cents),
            balanceAfterCents: result.credit.balance_cents,
          });
        }
      }
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
      if (failed.code === 'prepay_needs_chain') setChainRefused(true);
      if (failed.credit) publishCredit(failed.credit);
      if (failed.status != null && failed.status !== 400) onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const prepayment = done.prepayment ?? null;
    const receipt = prepayment && prepayment.id === done.sale.id ? null : done.sale;
    const receiptTaken = receipt ? receipt.total_cents + (receipt.rounding_cents ?? 0) : 0;
    const taken = receiptTaken + (prepayment?.total_cents ?? 0);
    const slipText = slipOutcomeText(slip);
    return (
      <Sheet title="Оплату прийнято" onClose={onClose} testId="debts-pay-done">
        <div className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={40} />
          </div>
          {/* «Від Марія Золота» would need the genitive no till can build
              from a typed name; the name leads instead, in the nominative. */}
          <p className="text-[15px]" data-testid="debts-pay-done-text">
            <span className="font-semibold">{customerName}</span> — прийнято{' '}
            <span className="font-semibold tabular-nums whitespace-nowrap">{formatUah(taken)}</span>
            {receipt && !prepayment && receipt.receipt_number && (
              <>
                , <span className="whitespace-nowrap">чек {receipt.receipt_number}</span>
              </>
            )}
            {receipt && prepayment && (
              <>
                : <span className="whitespace-nowrap">чек {receipt.receipt_number}</span> на{' '}
                <span className="tabular-nums whitespace-nowrap">{formatUah(receiptTaken)}</span> і внесок{' '}
                <span className="tabular-nums whitespace-nowrap">{formatUah(prepayment.total_cents)}</span> на «
                {prepaidTitle(prepayment)}»
              </>
            )}
            {!receipt && prepayment && <> як внесок на «{prepaidTitle(prepayment)}»</>}.
          </p>
          <p className="text-[15px] tabular-nums">{creditLine(done.credit)}</p>
          {done.warning && (
            <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left">
              {done.warning}
            </p>
          )}
          {status && <p className="text-sm text-sq-secondary">{status}</p>}
          {slipText && (
            <p className="text-sm text-sq-secondary" data-testid="debts-pay-slip">
              {slipText}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {receipt && (
              <button
                type="button"
                className="sq-btn-quiet flex-1 justify-center"
                disabled={printing}
                onClick={() => void print(receipt)}
              >
                <Printer size={20} />
                Друкувати чек
              </button>
            )}
            {slip && slip.kind !== 'none' && lastSlip.current && (
              <button
                type="button"
                className="sq-btn-quiet flex-1 justify-center"
                onClick={() => lastSlip.current && void printPrepaySlip(lastSlip.current)}
              >
                <Printer size={20} />
                Квитанція ще раз
              </button>
            )}
            <button type="button" className="pos-btn-primary flex-1 min-h-[48px] rounded-xl" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
        {printablePortal}
      </Sheet>
    );
  }

  const partIndex = plan && (plan.units || plan.prepay) ? plan.wholeCount : -1;
  const hint = !partial
    ? 'Гасяться найстаріші товари, цілими рядками. Торкніться товару, до якого гасити.'
    : !fiscalOn && !chainRefused
      ? 'Торкніться товару, до якого гасити, або впишіть суму від покупця: вона закриє найстаріші товари, а решта піде внеском на наступний.'
      : 'Торкніться товару, до якого гасити, або впишіть суму від покупця: вона закриє найстаріші товари — цілими або кількома штуками.';

  return (
    <Sheet title="Прийняти оплату" onClose={onClose} wide testId="debts-pay-sheet">
      <div className="space-y-4">
        <p className="text-[13px] text-sq-muted">{hint}</p>

        <ol className="rounded-xl ring-1 ring-sq-divider overflow-hidden" data-testid="debts-pay-lines">
          {openLines.map((line, index) => {
            const on = plan ? index < plan.wholeCount : index < count;
            const part = index === partIndex;
            const progress = lineProgress(line);
            return (
              <li key={line.id} className="border-b border-sq-divider/70 last:border-b-0">
                <button
                  type="button"
                  aria-pressed={on ? true : part ? 'mixed' : false}
                  className={`w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${on || part ? 'bg-sq-selected' : 'bg-white'}`}
                  onClick={() => tapLine(index)}
                >
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full grid place-items-center ${
                      on ? 'bg-sq-blue text-white' : part ? 'ring-2 ring-sq-blue text-sq-blue' : 'ring-1 ring-sq-divider'
                    }`}
                    aria-hidden
                  >
                    {on && <Check size={16} />}
                    {part && <span className="h-2.5 w-2.5 rounded-full bg-sq-blue" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] truncate">{lineTitle(line)}</span>
                    <span className="block text-[13px] text-sq-muted">
                      {new Date(line.created_at).toLocaleDateString('uk-UA')} ·{' '}
                      {quantityText(line.remaining_quantity, line.unit, line.price_per)}
                      {progress ? ` · ${progress}` : ''}
                    </span>
                    {part && plan && (
                      <span className="block text-[13px] font-semibold text-sq-blue tabular-nums" data-testid="debts-pay-part">
                        {[
                          plan.units ? `зараз ${unitsOfText(plan.units.quantity, line)}` : null,
                          plan.prepay ? `внесок ${formatUah(plan.prepay.cents)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(line.owed_cents)}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <label className="block">
          <span className="text-[13px] font-semibold text-sq-secondary">Покупець дає, ₴ (необовʼязково)</span>
          <input
            className="pos-field mt-1 w-full"
            inputMode="decimal"
            value={offer}
            placeholder="Наприклад: 500"
            onChange={(e) => setOffer(e.target.value)}
          />
          {plan && (
            <span className="mt-1 block space-y-0.5 text-[13px] text-sq-secondary tabular-nums" data-testid="debts-pay-offer">
              {planWords(plan, openLines).map((sentence) => (
                <span key={sentence} className="block">
                  {sentence}
                </span>
              ))}
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
          {plan ? (
            <>
              {plan.wholeCount > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">{goodsText(plan.wholeCount)}</dt>
                  <dd>{formatUah(plan.wholeCents)}</dd>
                </div>
              )}
              {plan.units && (
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary min-w-0 truncate">
                    {lineTitle(plan.units.line)} — {unitsOfText(plan.units.quantity, plan.units.line)}
                  </dt>
                  <dd>{formatUah(plan.units.cents)}</dd>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-between gap-3">
              <dt className="text-sq-secondary">{goodsText(count)}</dt>
              <dd>{formatUah(total)}</dd>
            </div>
          )}
          {rounding !== 0 && (
            <div className="flex justify-between gap-3 text-sq-secondary">
              <dt>Заокруглення готівки</dt>
              <dd>{formatSignedUah(rounding)}</dd>
            </div>
          )}
          {plan?.prepay && (
            <div className="flex justify-between gap-3">
              <dt className="text-sq-secondary min-w-0 truncate">Внесок на «{lineTitle(plan.prepay.line)}»</dt>
              <dd>{formatUah(plan.prepay.cents)}</dd>
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
          disabled={busy || !canPay}
          onClick={() => void pay()}
        >
          {busy ? 'Проводжу…' : failure?.unknown ? 'Перевірити ще раз' : `Прийняти ${formatUah(due)}`}
        </button>
      </div>
    </Sheet>
  );
}
