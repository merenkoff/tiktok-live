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

import { useMemo, useState } from 'react';
import { formatUah } from '@pos/platform';
import { ArrowLeft, Banknote, Check, CreditCard, Minus, Plus, Split } from '@pos/platform/ui';
import type { Glyph } from '@pos/platform/ui';
import { evenShares, lineCents, payableLines, selectionCents } from '../lib/pay';
import { lineTitle } from '../lib/bill';
import type { PayPart } from '../lib/tablesApi';
import type { Bill } from '../lib/types';

export interface PaySheetProps {
  bill: Bill;
  busy?: boolean;
  onClose: () => void;
  onPay: (parts: PayPart[]) => void;
}

type Method = 'cash' | 'card';

const METHODS: Array<{ id: Method; label: string; glyph: Glyph }> = [
  { id: 'cash', label: 'Готівка', glyph: Banknote },
  { id: 'card', label: 'Картка', glyph: CreditCard },
];

export function PaySheet({ bill, busy, onClose, onPay }: PaySheetProps): JSX.Element {
  const lines = useMemo(() => payableLines(bill), [bill]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(lines.map(({ line }) => line.id))
  );
  const [ways, setWays] = useState(1);
  const [method, setMethod] = useState<Method>('card');

  const total = selectionCents(lines, selected);
  const whole = selected.size === lines.length;
  const shares = evenShares(total, ways);

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pay(): void {
    if (total <= 0) return;
    // A part without `line_ids` means «everything still owed» — which is not
    // the same as listing today's ids, because between this render and the
    // request another waiter may have fired one more round.
    const part: PayPart = {
      ...(whole ? {} : { line_ids: [...selected] }),
      payments: shares.map((amount_cents) => ({ method, amount_cents })),
    };
    onPay([part]);
  }

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
                    <span className="block text-[13px] text-sq-muted">раунд {round.seq}</span>
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
            {ways > 1 && (
              <p className="text-[13px] text-sq-muted tabular-nums" data-testid="pay-shares">
                {shares.map((c) => formatUah(c)).join(' + ')} — один чек, {ways} оплат
              </p>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-sq-heading">До сплати</span>
              <span className="text-[30px] font-bold text-sq-heading tabular-nums">{formatUah(total)}</span>
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
                  onClick={() => setMethod(m.id)}
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

          <div className="flex-1" />
          <button
            type="button"
            className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
            data-testid="pay-submit"
            disabled={busy || total <= 0}
            onClick={pay}
          >
            Оплатити {formatUah(total)}
            {whole ? '' : ' (частина)'}
          </button>
        </section>
      </div>
    </div>
  );
}

const stepClass =
  'w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40';
