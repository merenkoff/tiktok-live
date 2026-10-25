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
// not close them yet. A store with ПРРО takes a «внесок» only where its
// provider keeps prepayment chains (step 2, the statement's `fiscal`): there
// the «внесок» is a receipt of the line's chain, and a line paid by «внески»
// closes on a receipt of its own — so one sum may be several receipts, each
// rounded on its own, which the sheet adds up exactly as the server shares
// the money out. Elsewhere the units still go on a receipt and the sheet says
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
// When one of several documents stops, the ones before it stand: the
// sentence says what to hand back, and their receipts are offered for print.
// After no answer the SAME request goes again — the server goes on from the
// first document not written only for the same lines.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatSignedUah,
  formatUah,
  isOfflinePosEnabled,
  storeCashRounding,
  useAuthStore,
} from '@pos/platform';
import { Banknote, Check, CreditCard, Printer, Segmented } from '@pos/platform/ui';
import { debtsApi, type PayBody, type PaymentRow } from '../lib/debtsApi';
import {
  chainNote,
  chainedLines,
  creditLine,
  documentsRounding,
  goodsText,
  lineProgress,
  lineTitle,
  nextCount,
  partRegistered,
  partTakenCents,
  partTitle,
  payDocuments,
  paymentParts,
  planPayment,
  planRequest,
  planTakes,
  planTotal,
  planWords,
  plural,
  prefixTotals,
  prepayAllowed,
  printablePart,
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
import type { DebtFiscal, DebtLine, DebtSale, PayDebtPart, PayDebtResult } from '../lib/types';
import { Sheet } from './Sheet';

type Method = PaymentRow['method'];
type PayRequest = Omit<PayBody, 'client_uuid'>;

const NO_ANSWER = 'Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.';
const EARLIER_NO_ANSWER =
  'Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.';

interface Props {
  customerId: number;
  customerName: string;
  /** For the «ВНЕСОК» slip, when the statement has one. */
  customerPhone?: string;
  openLines: DebtLine[];
  /** What the store's ПРРО can do with the debt (079) — absent from an older backend. */
  fiscal?: DebtFiscal;
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

/** A request remembered by an earlier sheet of this customer that got no answer — only if it is one. */
function asRequest(value: unknown): PayRequest | null {
  return value && typeof value === 'object' && Array.isArray((value as PayRequest).payments)
    ? (value as PayRequest)
    : null;
}

/** The documents of a repayment, one per row, each with its own print button. */
function PartsList({
  parts,
  printing,
  onPrint,
  testId,
}: {
  parts: PayDebtPart[];
  printing: boolean;
  onPrint: (sale: DebtSale) => void;
  testId: string;
}) {
  return (
    <ul className="rounded-xl ring-1 ring-sq-divider overflow-hidden text-left" data-testid={testId}>
      {parts.map((part) => (
        <li
          key={part.sale.id}
          className="flex items-center gap-3 px-3 min-h-[52px] py-2 border-b border-sq-divider/70 last:border-b-0"
        >
          <span className="min-w-0 flex-1 text-[15px]">{partTitle(part)}</span>
          <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(partTakenCents(part))}</span>
          {printablePart(part) && (
            <button
              type="button"
              className="shrink-0 min-h-11 px-2 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
              disabled={printing}
              onClick={() => onPrint(part.sale)}
              aria-label={`Друкувати: ${partTitle(part)}`}
            >
              <Printer size={20} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PaySheet({ customerId, customerName, customerPhone, openLines, fiscal, onClose, onChanged }: Props) {
  const auth = useAuthStore((s) => s.auth);
  const step = storeCashRounding(auth?.store.cash_rounding);
  const fiscalOn = fiscal ? fiscal.on : (auth?.store.fiscal?.enabled ?? false);
  const [count, setCount] = useState(openLines.length);
  const [method, setMethod] = useState<Method>('cash');
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);
  // The server said this store takes no «внесок» after all: none on this sheet.
  const [chainRefused, setChainRefused] = useState(false);
  const writeKey = useWriteKey(customerScope('pay', customerId));
  // What the last write sent: after no answer it goes again unchanged — and a
  // sheet opened after an earlier one got none starts from what that one sent.
  const lastSent = useRef<PayRequest | null>(asRequest(writeKey.replayBody));
  // Opened again after a payment that got no answer: say so, and check first.
  const [failure, setFailure] = useState<DebtFailure | null>(() =>
    writeKey.replaying ? unansweredFailure(EARLIER_NO_ANSWER) : null
  );
  // The documents of a sum that went through before one of them did not.
  const [through, setThrough] = useState<PayDebtPart[]>([]);
  const [done, setDone] = useState<PayDebtResult | null>(null);
  const [slip, setSlip] = useState<SlipOutcome | null>(null);
  const lastSlip = useRef<PrepaySlipInput | null>(null);
  const { print, printMany, printing, status, printablePortal } = useReceiptPrint();

  // The statement was read again under the sheet: keep the choice inside it.
  useEffect(() => {
    setCount((n) => Math.min(Math.max(n, 1), openLines.length));
  }, [openLines.length]);

  const closesAlone = useMemo(() => chainedLines(fiscal), [fiscal]);
  const allowPrepay = prepayAllowed(fiscal, auth?.store.fiscal?.enabled ?? false) && !chainRefused;
  const totals = useMemo(() => prefixTotals(openLines), [openLines]);
  const partial = takesParts(openLines);
  const offerCents = offerToCents(offer);
  // A typed sum is the plan; without one, the lines the cashier tapped.
  const plan: PayPlan | null = useMemo(
    () =>
      offerCents != null
        ? planPayment(openLines, offerCents, { method, step, partial, prepayAllowed: allowPrepay, closesAlone })
        : null,
    [openLines, offerCents, method, step, partial, allowPrepay, closesAlone]
  );
  // The tapped lines are receipts too: a line paid by «внески» through its
  // chain closes on its own, and each receipt rounds its own cash.
  const tapped = useMemo(() => payDocuments(openLines.slice(0, count), null, closesAlone), [openLines, count, closesAlone]);

  const total = count > 0 ? totals[count - 1] : 0;
  const rounding = plan ? plan.roundingCents : method === 'cash' ? documentsRounding(tapped, step) : 0;
  const due = plan ? planTotal(plan) : total + rounding;
  // After no answer, what was sent goes again — not what the screen would plan now.
  const resend = failure?.unknown === true ? lastSent.current : null;
  const canPay = resend != null || (plan ? planTakes(plan) : count > 0);

  function tapLine(index: number) {
    setOffer('');
    setCount((n) => (plan ? index + 1 : nextCount(n, index)));
  }

  async function printPrepaySlip(input: PrepaySlipInput) {
    lastSlip.current = input;
    setSlip(await printIssueSlip(buildPrepaySlip(input)));
  }

  /** The documents that went through before one stopped, read back to print them. */
  async function loadThrough(saleIds: number[]) {
    const sales = await Promise.all(saleIds.map((id) => debtsApi.sale(id).catch(() => null)));
    setThrough(
      sales
        .filter((sale): sale is DebtSale => sale != null)
        .map((sale) => ({
          kind: sale.debt_prepayment ? 'prepayment' : sale.fiscal_chain_id ? 'chain_close' : 'receipt',
          sale,
          fiscal: null,
        }))
    );
  }

  async function pay() {
    if (busy || !canPay) return;
    setBusy(true);
    setFailure(null);
    setThrough([]);
    const sent: PayRequest = resend ?? {
      ...(plan
        ? planRequest(openLines, plan, method)
        : {
            line_ids: openLines.slice(0, count).map((line) => line.id),
            payments: [{ method, amount_cents: due }],
          }),
      cash_rounding: method === 'cash' ? step : 0,
    };
    lastSent.current = sent;
    try {
      const result = await debtsApi.pay(customerId, { ...sent, client_uuid: writeKey.current() });
      writeKey.answered();
      lastSent.current = null;
      publishCredit(result.credit);
      setDone(result);
      onChanged();
      const parts = paymentParts(result);
      // A store with ПРРО prints what ПРРО registered; one without, every receipt.
      const toPrint = parts.filter((part) => printablePart(part) && (!fiscalOn || partRegistered(part)));
      if (toPrint.length > 0 && (auth?.store.auto_print_receipt ?? false)) void printMany(toPrint.map((part) => part.sale));
      // The «ВНЕСОК» slip goes where the handover slip goes: a desktop with a
      // printer for the station, and nowhere else (G3_DEBTS.md §5, §11). A
      // «внесок» ПРРО registered has its receipt instead.
      const prepayment = parts.find((part) => part.kind === 'prepayment')?.sale ?? null;
      if (prepayment?.debt_prepayment && isOfflinePosEnabled() && (prepayment.fiscal_status ?? 'none') === 'none') {
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
      // Unknown: the same key and the same request again — in this sheet and
      // in the next one opened for this customer — so the next tap finds what
      // was written. Anything the server answered: a new attempt next time — a
      // receipt ПРРО refused is voided, and its key would only say so.
      if (failed.unknown) {
        writeKey.unanswered(sent);
        setFailure({ ...failed, text: NO_ANSWER });
      } else {
        writeKey.answered();
        lastSent.current = null;
        setFailure(failed);
        // Some of the sum went through: what is left is a new payment, from a
        // sum the cashier types again after handing the rest back.
        if (failed.saleIds.length > 0) {
          setOffer('');
          void loadThrough(failed.saleIds);
        }
      }
      if (failed.code === 'prepay_needs_chain') setChainRefused(true);
      if (failed.credit) publishCredit(failed.credit);
      if (failed.status != null && failed.status !== 400) onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const parts = paymentParts(done);
    const prepayment = parts.find((part) => part.kind === 'prepayment')?.sale ?? null;
    const receipts = parts.filter((part) => part.kind !== 'prepayment');
    const receipt = receipts.length === 1 ? receipts[0].sale : null;
    const receiptTaken = receipt ? partTakenCents(receipts[0]) : 0;
    const taken = parts.reduce((sum, part) => sum + partTakenCents(part), 0);
    const printable = parts.filter(printablePart);
    // One receipt and one «внесок» say it in a sentence; more documents list themselves.
    const listed = receipts.length > 1 || printable.length > 1;
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
            {listed && (
              <>
                : {parts.length} {plural(parts.length, 'документ', 'документи', 'документів')}
              </>
            )}
            {!listed && receipt && !prepayment && receipt.receipt_number && (
              <>
                , <span className="whitespace-nowrap">чек {receipt.receipt_number}</span>
              </>
            )}
            {!listed && receipt && prepayment && (
              <>
                : <span className="whitespace-nowrap">чек {receipt.receipt_number}</span> на{' '}
                <span className="tabular-nums whitespace-nowrap">{formatUah(receiptTaken)}</span> і внесок{' '}
                <span className="tabular-nums whitespace-nowrap">{formatUah(prepayment.total_cents)}</span> на «
                {prepaidTitle(prepayment)}»
              </>
            )}
            {!listed && !receipt && prepayment && <> як внесок на «{prepaidTitle(prepayment)}»</>}.
          </p>
          {listed && (
            <PartsList parts={parts} printing={printing} onPrint={(sale) => void print(sale)} testId="debts-pay-parts" />
          )}
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
            {!listed && printable.length === 1 && (
              <button
                type="button"
                className="sq-btn-quiet flex-1 justify-center"
                disabled={printing}
                onClick={() => void print(printable[0].sale)}
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
    : allowPrepay
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
            const note = chainNote(line);
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
                      {closesAlone(line) ? ' · окремим чеком' : ''}
                    </span>
                    {note && (
                      <span className="block text-[13px] text-amber-800" data-testid="debts-pay-chain-note">
                        {note}
                      </span>
                    )}
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
              {planWords(plan, openLines, fiscal).map((sentence) => (
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
          <div role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm space-y-2" data-testid="debts-pay-error">
            <p>{failure.text}</p>
            {through.length > 0 && (
              <PartsList parts={through} printing={printing} onPrint={(sale) => void print(sale)} testId="debts-pay-through" />
            )}
          </div>
        )}

        <button
          type="button"
          className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums"
          disabled={busy || !canPay}
          onClick={() => void pay()}
        >
          {busy ? 'Проводжу…' : failure?.unknown ? 'Перевірити ще раз' : `Прийняти ${formatUah(due)}`}
        </button>
        {printablePortal}
      </div>
    </Sheet>
  );
}
