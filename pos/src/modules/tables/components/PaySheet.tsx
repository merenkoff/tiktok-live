// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paying a table bill (phase К4g, TechDocs/POS_TABLES.md §4.4).
//
// The screen asks one question at a time, in the order the guests answer it:
// **хто платить** (everything, or these dishes), then **чим** (cash, card),
// and «порівну на N» is a stepper on top of the first answer rather than a
// third mode. Two ways of dividing a bill exist, and they are not two
// settings of one mechanism:
//
//   за позиціями — кожна частина свій чек (свій перелік товарів);
//   порівну      — один чек, оплачений кількома рядками.
//
// The line between them is drawn by law, not taste: a sale carries at most
// one fiscal receipt. So the screen never asks «як ділимо?» as an abstract
// question — picking dishes IS the first kind, and the stepper IS the second.
//
// Splitting by dishes is done one guest at a time rather than composed as N
// parts in advance: that is how it happens at the table (one card at a time),
// each part is its own transaction anyway (§4.4 rule 3), and what is left to
// pay is simply the lines still without a `sale_id`.
//
// QR is deliberately absent: a dynamic QR needs the invoice screen the host
// owns on `/register`, and a waiter's tablet that starts one and walks away
// would leave an invoice nobody watches.
//
// Cash is rounded when the store rounds (НБУ № 25, TechDocs/POS_CASH_ROUNDING.md):
// the receipt's cash total, never a card. «Порівну» splits the sum AFTER
// rounding, because the rounding belongs to the one receipt, not to each guest.
//
// Cash is taken like at the till (track ДК, Д15): «Отримано» with the till's
// quick amounts, «Решта» / «Не вистачає» beside it, and what the guest handed
// over is what is sent — the server keeps the change off the money, exactly
// as for a till's sale. Only for one payer: «порівну на N» stays N exact shares.
//
// A store with a second register — another ФОП's (track ДК, ДК3-Г): a part of
// food and alcohol is two receipts. «Порівну» is gone (Д6), the sums come from
// the server's quote (the same plan the payment follows), cash is one
// «Отримано» for both, and a card goes through each ФОП's terminal in turn
// before the one request (Д14).

import { useEffect, useMemo, useState } from 'react';
import { formatUah } from '@pos/platform';
import { ArrowLeft, Banknote, Check, CreditCard, Minus, Plus, Split } from '@pos/platform/ui';
import type { Glyph } from '@pos/platform/ui';
import { evenShares, lineCents, payableLines, selectionCents, waitingForBar } from '../lib/pay';
import { lineTitle } from '../lib/bill';
import { cashRoundingFor, quickCashAmountsFor } from '../lib/hostPlatform';
import type { BillReceiptQuote, PayPart } from '../lib/tablesApi';
import type { Bill } from '../lib/types';

export interface PaySheetProps {
  bill: Bill;
  busy?: boolean;
  /** The store's cash-rounding step from the login; absent or 0 = none. */
  cashRoundingStep?: number;
  onClose: () => void;
  /** `cashRounding` is the step to send — 0 when nothing was rounded. */
  onPay: (parts: PayPart[], cashRounding: number) => void;
  /**
   * Set in a store with a second register (track ДК): what each receipt of
   * this payment would come to, from the server. Its presence is the switch —
   * no «порівну», sums from the quote, a card terminal by terminal.
   */
  quote?: ((parts: PayPart[], cashRounding: number) => Promise<{ receipts: BillReceiptQuote[]; due_cents: number }>) | null;
  /**
   * The server's refusal of the last payment, in its words — this sheet is
   * opaque and covers the bill's own banner, so the sentence is drawn here.
   */
  error?: string | null;
}

/** «Каса 2 · Бар» — whose terminal and whose receipt. */
function registerTitle(receipt: BillReceiptQuote): string {
  const name = receipt.label?.trim();
  return name ? `Каса ${receipt.register_no} · ${name}` : `Каса ${receipt.register_no}`;
}

/** «820» / «819,50» — typed amounts as the waiter reads them back. */
function centsToText(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

function textToCents(text: string): number {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

type Method = 'cash' | 'card';

const METHODS: Array<{ id: Method; label: string; glyph: Glyph }> = [
  { id: 'cash', label: 'Готівка', glyph: Banknote },
  { id: 'card', label: 'Картка', glyph: CreditCard },
];

/** «−0,23 ₴» / «+0,20 ₴» — the host's `formatSignedUah` is platform 19, too new to name. */
function signedUah(cents: number): string {
  return `${cents < 0 ? '−' : '+'}${formatUah(Math.abs(cents))}`;
}

export function PaySheet({ bill, busy, cashRoundingStep, onClose, onPay, quote = null, error = null }: PaySheetProps): JSX.Element {
  const lines = useMemo(() => payableLines(bill), [bill]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(lines.map(({ line }) => line.id))
  );
  const [ways, setWays] = useState(1);
  const [method, setMethod] = useState<Method>('card');
  const dual = quote != null;

  const total = selectionCents(lines, selected);
  const whole = selected.size === lines.length;
  const rounding = method === 'cash' ? cashRoundingFor(total, cashRoundingStep) : { step: 0 as const, deltaCents: 0 };

  // Two registers: the receipts this payment would ring, re-read whenever
  // the dishes or the method change.
  const [receipts, setReceipts] = useState<{ list: BillReceiptQuote[]; due: number } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [cardTaken, setCardTaken] = useState(0);
  const selectedKey = [...selected].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!quote) return;
    setReceipts(null);
    setQuoteError(null);
    setCardTaken(0);
    if (selected.size === 0) return;
    let cancelled = false;
    const part: PayPart = {
      ...(whole ? {} : { line_ids: [...selected] }),
      payments: [{ method, amount_cents: 0 }],
    };
    quote([part], method === 'cash' ? Number(cashRoundingStep ?? 0) : 0)
      .then((answer) => {
        if (!cancelled) setReceipts({ list: answer.receipts, due: answer.due_cents });
      })
      .catch((error: unknown) => {
        const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
        if (!cancelled) setQuoteError(typeof data?.error === 'string' ? data.error : 'Не вдалося порахувати чеки');
      });
    return () => {
      cancelled = true;
    };
    // `selectedKey` stands for `selected`; `whole` follows from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, selectedKey, method, cashRoundingStep]);

  // What the guests hand over: the cash total after rounding, the card total
  // as it is — and with two registers, the sum of the quoted receipts.
  const due = dual ? (receipts?.due ?? 0) : total + rounding.deltaCents;
  const dualRounding = dual ? (receipts?.list ?? []).reduce((sum, r) => sum + r.rounding_cents, 0) : 0;
  const shares = evenShares(due, dual ? 1 : ways);

  // «Отримано» (Д15): one payer by cash. The amount on screen is the till's
  // guess until the waiter types — then it is theirs.
  const takesCash = method === 'cash' && (dual || ways === 1);
  const [received, setReceived] = useState('');
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    if (!typed) setReceived(due > 0 ? centsToText(due) : '');
  }, [due, typed]);
  const receivedCents = textToCents(received);
  const short = takesCash ? Math.max(0, due - receivedCents) : 0;
  const change = takesCash ? Math.max(0, receivedCents - due) : 0;
  const quick = takesCash && due > 0 ? quickCashAmountsFor(due) : [];

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // A pour whose bottle the bar has not opened yet (ДК5, Д18): its part
  // cannot be paid, so the sheet says which and offers the rest.
  const waiting = waitingForBar(lines, selected);

  function pay(): void {
    if (due <= 0 || short > 0 || waiting.length > 0) return;
    // Two registers by card: each ФОП's terminal in turn, then the one request (Д14).
    if (dual && method === 'card' && receipts && cardTaken + 1 < receipts.list.length) {
      setCardTaken(cardTaken + 1);
      return;
    }
    // A part without `line_ids` means «everything still owed» — which is not
    // the same as listing today's ids, because between this render and the
    // request another waiter may have fired one more round.
    const part: PayPart = {
      ...(whole ? {} : { line_ids: [...selected] }),
      payments: takesCash
        ? [{ method, amount_cents: receivedCents }]
        : shares.map((amount_cents) => ({ method, amount_cents })),
    };
    const step = dual
      ? dualRounding !== 0
        ? Number(cashRoundingStep ?? 0)
        : 0
      : rounding.deltaCents !== 0
        ? rounding.step
        : 0;
    onPay([part], step);
  }

  const terminal = dual && method === 'card' && receipts ? receipts.list[cardTaken] : null;
  const takenText =
    dual && method === 'card' && receipts && cardTaken > 0
      ? receipts.list
          .slice(0, cardTaken)
          .map((r) => `${formatUah(r.due_cents)} на терміналі «${registerTitle(r)}»`)
          .join(', ')
      : null;

  const chosen = lines.filter(({ line }) => selected.has(line.id)).length;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-sq-bg" data-testid="pay-sheet">
      <header className="flex shrink-0 items-center gap-3.5 px-4 md:px-7 min-h-[68px]">
        <button
          type="button"
          className="shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
          onClick={onClose}
          data-testid="pay-close"
        >
          <ArrowLeft size={20} />
          Стіл {bill.table_name}
        </button>
        <p className="flex-1 min-w-0 truncate text-center text-xl font-bold text-sq-heading md:pr-24">
          Оплата · стіл {bill.table_name}
        </p>
      </header>

      <div className="flex-1 min-h-0 overflow-auto md:overflow-hidden px-4 md:px-7 pb-4 md:pb-6 flex flex-col md:flex-row gap-4 md:gap-5">
        <section className="md:flex-1 min-w-0 rounded-card bg-white shadow-card px-5 py-4 flex flex-col md:min-h-0">
          <div className="flex items-center justify-between pb-2 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
            <p className="text-[15px] font-bold text-sq-blue">Що оплачуємо</p>
            <button
              type="button"
              className="min-h-9 text-[15px] font-semibold text-sq-blue"
              data-testid="pay-select-all"
              onClick={() =>
                setSelected(whole ? new Set() : new Set(lines.map(({ line }) => line.id)))
              }
            >
              {whole ? 'Зняти все' : 'Обрати все'}
            </button>
          </div>

          <div className="md:flex-1 md:min-h-0 md:overflow-auto">
            {lines.map(({ line, round }) => {
              const on = selected.has(line.id);
              return (
                <button
                  key={line.id}
                  type="button"
                  data-testid={`pay-line-${line.id}`}
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggle(line.id)}
                  className="flex w-full min-h-[54px] items-center gap-3.5 text-left shadow-[0_1px_0_#E6E8EC]"
                >
                  <span
                    aria-hidden
                    className={`w-[22px] h-[22px] rounded-md shrink-0 grid place-items-center ${
                      on ? 'bg-sq-blue text-white' : 'ring-2 ring-inset ring-sq-divider'
                    }`}
                  >
                    {on && <Check size={16} />}
                  </span>
                  <span className="min-w-0 flex-1 py-1.5">
                    <span className={`block truncate text-base ${on ? 'text-sq-text' : 'text-sq-secondary'}`}>
                      {line.quantity > 1 && <span className="tabular-nums">{line.quantity}× </span>}
                      {lineTitle(line, true)}
                    </span>
                    <span className="block text-[13px] text-sq-muted">
                      раунд {round.seq}
                      {line.bottle_pending && (
                        <span className="font-semibold text-amber-800" data-testid={`pay-line-waiting-${line.id}`}>
                          {' '}
                          · чекає марку з бару
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`shrink-0 text-base tabular-nums ${on ? 'text-sq-text' : 'text-sq-muted'}`}>
                    {formatUah(lineCents(line))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="md:w-[420px] md:shrink-0 flex flex-col gap-3.5">
          <div className="rounded-card bg-white shadow-card px-5 py-[18px] flex flex-col gap-2.5">
            <div className="flex justify-between text-[15px] text-sq-secondary">
              <span>
                Вибрано {chosen} з {lines.length}
              </span>
              <span className="tabular-nums">{formatUah(total)}</span>
            </div>
            {!dual && (
            <div className="flex items-center justify-between py-2 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]">
              <span className="flex items-center gap-2.5 text-base text-sq-text">
                <Split size={24} />
                Порівну на
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Менше"
                  className={stepClass}
                  data-testid="pay-ways-less"
                  disabled={busy || ways <= 1}
                  onClick={() => setWays((n) => Math.max(1, n - 1))}
                >
                  <Minus size={20} />
                </button>
                <span className="w-11 text-center text-[17px] font-semibold tabular-nums" data-testid="pay-ways">
                  {ways}
                </span>
                <button
                  type="button"
                  aria-label="Більше"
                  className={stepClass}
                  data-testid="pay-ways-more"
                  disabled={busy || ways >= 10}
                  onClick={() => setWays((n) => Math.min(10, n + 1))}
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
            )}
            {dual && (
              <div className="py-2 space-y-1 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]" data-testid="pay-receipts">
                <p className="text-[13px] text-sq-muted">Два ФОП — кожен свій чек, один спосіб оплати</p>
                {receipts?.list.map((r, i) => (
                  <div
                    key={r.register_no}
                    className={`flex justify-between text-[15px] tabular-nums ${
                      terminal && i === cardTaken ? 'font-semibold text-sq-text' : 'text-sq-secondary'
                    }`}
                    data-testid={`pay-receipt-${r.register_no}`}
                  >
                    <span>
                      {method === 'card' && i < cardTaken ? '✓ ' : ''}
                      {registerTitle(r)}
                    </span>
                    <span>{formatUah(r.due_cents)}</span>
                  </div>
                ))}
                {!receipts && !quoteError && selected.size > 0 && (
                  <p className="text-[15px] text-sq-muted">Рахуємо чеки…</p>
                )}
                {quoteError && (
                  <p role="alert" className="text-[15px] text-sq-danger" data-testid="pay-quote-error">
                    {quoteError}
                  </p>
                )}
              </div>
            )}
            {!dual && ways > 1 && (
              <p className="text-[13px] text-sq-muted tabular-nums" data-testid="pay-shares">
                {shares.map((c) => formatUah(c)).join(' + ')} — один чек, {ways} оплат
              </p>
            )}
            {(dual ? dualRounding : rounding.deltaCents) !== 0 && (
              <div className="flex justify-between text-[15px] text-sq-secondary" data-testid="pay-rounding">
                <span>Заокруглення готівки</span>
                <span className="tabular-nums">{signedUah(dual ? dualRounding : rounding.deltaCents)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-sq-heading">До сплати</span>
              <span className="text-[30px] font-bold text-sq-heading tabular-nums" data-testid="pay-due">
                {formatUah(due)}
              </span>
            </div>
          </div>

          <div className="flex gap-2.5">
            {METHODS.map((m) => {
              const on = method === m.id;
              const Icon = m.glyph;
              return (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`pay-method-${m.id}`}
                  aria-pressed={on}
                  onClick={() => {
                    setMethod(m.id);
                    setTyped(false);
                  }}
                  className={`flex-1 min-h-16 rounded-[14px] bg-white inline-flex items-center justify-center gap-2.5 text-base font-semibold text-sq-text ${
                    on ? 'ring-2 ring-sq-blue' : 'ring-1 ring-sq-divider'
                  }`}
                >
                  <Icon size={24} />
                  {m.label}
                </button>
              );
            })}
          </div>

          {takesCash && due > 0 && (
            <div className="rounded-card bg-white shadow-card px-5 py-4 flex flex-col gap-3" data-testid="pay-cash">
              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-[14px] ring-2 ring-sq-blue px-3.5 py-2.5 flex flex-col cursor-text">
                  <span className="text-[13px] text-sq-secondary">Отримано</span>
                  <span className="flex items-baseline gap-1 text-[24px] font-bold text-sq-heading tabular-nums">
                    <input
                      aria-label="Отримано готівкою"
                      className="min-w-0 w-full bg-transparent outline-none border-0 p-0"
                      inputMode="decimal"
                      value={received}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        setReceived(e.target.value.replace(/[^\d,.]/g, '').replace('.', ','));
                        setTyped(true);
                      }}
                      data-testid="pay-received"
                    />
                    <span className="shrink-0">₴</span>
                  </span>
                </label>
                <div className="rounded-[14px] bg-sq-sidebar px-3.5 py-2.5 flex flex-col" data-testid="pay-change">
                  <span className="text-[13px] text-sq-secondary">{short > 0 ? 'Не вистачає' : 'Решта'}</span>
                  <span
                    className={`text-[24px] font-bold tabular-nums truncate ${
                      short > 0 ? 'text-sq-danger' : 'text-sq-success'
                    }`}
                  >
                    {formatUah(short > 0 ? short : change)}
                  </span>
                </div>
              </div>
              {quick.length > 0 && (
                <div className="flex gap-2">
                  {quick.map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => {
                        setReceived(centsToText(cents));
                        setTyped(true);
                      }}
                      className="flex-1 min-w-0 h-11 rounded-sq bg-sq-empty hover:bg-sq-selected text-base font-semibold tabular-nums truncate px-1"
                      data-testid={`pay-quick-${cents}`}
                    >
                      {formatUah(cents)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {takenText && (
            <p className="text-[13px] text-amber-800" data-testid="pay-card-taken">
              Уже проведено {takenText}. Якщо наступний термінал відмовить — поверніть їх на терміналі; оплату ще не
              записано.
            </p>
          )}

          {waiting.length > 0 && (
            <p className="text-[15px] text-amber-800" data-testid="pay-waiting-bar">
              Бар ще не відсканував марку нової пляшки для{' '}
              {waiting.map(({ line }) => `«${lineTitle(line, true)}»`).join(', ')}. Зніміть цю страву, щоб оплатити
              решту, або зачекайте на бар.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[15px] text-sq-danger" data-testid="pay-error">
              {error}
            </p>
          )}

          <div className="flex-1" />
          <button
            type="button"
            className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
            data-testid="pay-submit"
            disabled={busy || due <= 0 || short > 0 || waiting.length > 0 || (dual && !receipts)}
            onClick={pay}
          >
            {terminal
              ? `Пройшла на терміналі «${registerTitle(terminal)}» · ${formatUah(terminal.due_cents)}`
              : change > 0
                ? `Прийняти ${formatUah(receivedCents)} · решта ${formatUah(change)}`
                : `Оплатити ${formatUah(due)}${whole ? '' : ' (частина)'}`}
          </button>
        </section>
      </div>
    </div>
  );
}

const stepClass =
  'w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40';
