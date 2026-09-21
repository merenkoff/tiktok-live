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

const METHODS: Array<{ id: Method; label: string }> = [
  { id: 'cash', label: 'Готівка' },
  { id: 'card', label: 'Картка' },
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

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-sq-bg" data-testid="pay-sheet">
      <div className="flex items-center justify-between gap-2 border-b border-sq-divider p-3">
        <p className="text-lg font-semibold">Оплата · стіл {bill.table_name}</p>
        <button type="button" className="sq-link" onClick={onClose} data-testid="pay-close">
          Назад
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="sq-section-label">Що оплачуємо</p>
          <button
            type="button"
            className="sq-link"
            data-testid="pay-select-all"
            onClick={() =>
              setSelected(whole ? new Set() : new Set(lines.map(({ line }) => line.id)))
            }
          >
            {whole ? 'Зняти все' : 'Обрати все'}
          </button>
        </div>

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
              className={`mb-1 flex w-full items-center justify-between gap-3 rounded-lg border p-2 text-left ${
                on ? 'border-sq-blue bg-sq-blue/10' : 'border-sq-divider'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">
                  <span className="tabular-nums">{line.quantity}×</span> {lineTitle(line, true)}
                </span>
                <span className="block text-xs text-sq-muted">раунд {round.seq}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatUah(lineCents(line))}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-sq-divider p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm text-sq-muted">Порівну на</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sq-btn-tile"
              data-testid="pay-ways-less"
              disabled={busy || ways <= 1}
              onClick={() => setWays((n) => Math.max(1, n - 1))}
            >
              −
            </button>
            <span className="min-w-8 text-center tabular-nums" data-testid="pay-ways">
              {ways}
            </span>
            <button
              type="button"
              className="sq-btn-tile"
              data-testid="pay-ways-more"
              disabled={busy || ways >= 10}
              onClick={() => setWays((n) => Math.min(10, n + 1))}
            >
              +
            </button>
          </div>
        </div>

        {ways > 1 && (
          <p className="mb-2 text-xs text-sq-muted" data-testid="pay-shares">
            {shares.map((c) => formatUah(c)).join(' + ')} — один чек, {ways} оплат
          </p>
        )}

        <div className="mb-2 flex gap-2">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`pay-method-${m.id}`}
              aria-pressed={method === m.id}
              onClick={() => setMethod(m.id)}
              className={`flex-1 rounded-lg border p-2 ${
                method === m.id ? 'border-sq-blue bg-sq-blue/10' : 'border-sq-divider'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="sq-btn-primary w-full"
          data-testid="pay-submit"
          disabled={busy || total <= 0}
          onClick={pay}
        >
          Оплатити {formatUah(total)}
          {whole ? '' : ' (частина)'}
        </button>
      </div>
    </div>
  );
}
