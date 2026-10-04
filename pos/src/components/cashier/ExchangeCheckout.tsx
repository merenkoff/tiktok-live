// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ReactNode, useState } from 'react';
import { Banknote, CreditCard, Repeat, X, type Glyph } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';
import { differenceSentence, RETURNED_TO_UK } from '../../lib/exchange';
import { positionsText } from '../../lib/plural';
import type { ExchangeDraft, PaymentMethod, SalePaymentInput } from '../../types';

interface Props {
  draft: ExchangeDraft;
  /** The new receipt's total — the cart as it stands, discount included. */
  newTotalCents: number;
  itemCount: number;
  loading: boolean;
  /** Same contract as `CheckoutModal`: an opaque overlay has to carry its own error. */
  error?: { message: string; supportCode?: string | null; action?: ReactNode } | null;
  onClose: () => void;
  onConfirm: (payments: SalePaymentInput[]) => void;
}

/**
 * The exchange's payment screen (clothing R1): the two receipts side by side
 * and the difference between them. No number pad and no change: the return
 * receipt's sum is fixed by the goods coming back, the new receipt's by the
 * cart, and the cashier only chooses how the new receipt is paid — cash or
 * card, because a QR invoice would be raised for the FULL new amount while the
 * customer owes the difference, and a mixed payment of an exchange is a
 * sentence no one at the counter can say.
 */
export function ExchangeCheckout({
  draft,
  newTotalCents,
  itemCount,
  loading,
  error,
  onClose,
  onConfirm,
}: Props) {
  // Start from how they paid the first time; cash when that was a QR.
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'qr'>>(() =>
    draft.refund.method === 'card' ? 'card' : 'cash'
  );
  const difference = newTotalCents - draft.returnedCents;
  const methods: Array<{ method: Exclude<PaymentMethod, 'qr'>; glyph: Glyph; label: string }> = [
    { method: 'cash', glyph: Banknote, label: 'Готівка' },
    { method: 'card', glyph: CreditCard, label: 'Картка' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Обмін"
      className="fixed inset-0 z-50 bg-sq-bg flex flex-col animate-fade-up text-sq-text"
    >
      <header className="h-[68px] shrink-0 px-4 md:px-7 flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold text-sq-heading">Обмін за чеком {draft.receiptNumber}</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 -mr-2 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty"
          aria-label="Закрити"
        >
          <X size={20} />
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mx-4 md:mx-7 mb-4 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm shrink-0"
        >
          <p className="font-semibold">{error.message}</p>
          {error.supportCode && <p className="mt-1 text-xs text-red-600">Код: {error.supportCode}</p>}
          {error.action}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-4 md:pb-7 flex flex-col gap-4 select-none">
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white rounded-card shadow-card px-6 py-[22px]" data-testid="exchange-return">
            <p className="text-sm text-sq-secondary">Повертається · видатковий чек</p>
            <p className="text-[34px] leading-tight font-bold tracking-[-0.02em] text-sq-heading tabular-nums">
              −{formatUah(draft.returnedCents)}
            </p>
            <p className="text-[13px] text-sq-muted mt-1">
              {RETURNED_TO_UK[draft.refund.method]} · як платили за чеком {draft.receiptNumber}
            </p>
            <ul className="mt-3 space-y-1 text-[15px]">
              {draft.returnedLines.map((line, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {line.name}
                    {line.label ? <span className="text-sq-muted"> · {line.label}</span> : null}
                    {line.quantity > 1 ? <span className="text-sq-muted"> × {line.quantity}</span> : null}
                  </span>
                  <span className="tabular-nums shrink-0">{formatUah(line.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-card shadow-card px-6 py-[22px]" data-testid="exchange-sale">
            <p className="text-sm text-sq-secondary">
              Новий чек{itemCount ? ` · ${positionsText(itemCount)}` : ''}
            </p>
            <p
              className="text-[34px] leading-tight font-bold tracking-[-0.02em] text-sq-heading tabular-nums"
              data-testid="exchange-new-total"
            >
              {formatUah(newTotalCents)}
            </p>
            <p className="text-[13px] text-sq-muted mt-1">Оплата за новий чек</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {methods.map((m) => {
                const on = m.method === method;
                const Icon = m.glyph;
                return (
                  <button
                    key={m.method}
                    type="button"
                    disabled={loading}
                    aria-pressed={on}
                    onClick={() => setMethod(m.method)}
                    className={`min-h-14 rounded-[14px] flex items-center justify-center gap-2 px-3 text-[16px] font-semibold transition-colors disabled:opacity-50 ${
                      on ? 'bg-sq-selected ring-2 ring-sq-blue' : 'bg-sq-sidebar hover:bg-sq-selected'
                    }`}
                  >
                    <Icon size={22} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <section
          className={`rounded-card px-6 py-5 flex items-center gap-4 ${
            difference > 0
              ? 'bg-white shadow-card'
              : difference < 0
                ? 'bg-amber-50 text-amber-900'
                : 'bg-sq-success/10 text-sq-success-ink'
          }`}
          data-testid="exchange-difference"
        >
          <Repeat size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[22px] font-bold leading-tight tabular-nums">
              {differenceSentence(difference, draft, method)}
            </p>
            <p className="text-[13px] mt-1 opacity-80">
              Два чеки на повні суми: видатковий на {formatUah(draft.returnedCents)} і новий на{' '}
              {formatUah(newTotalCents)}. Різниця — лише те, що переходить через касу.
            </p>
          </div>
        </section>

        <div className="flex-1" />
        <button
          type="button"
          disabled={loading || itemCount === 0}
          onClick={() => onConfirm([{ method, amount_cents: newTotalCents }])}
          className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
          data-testid="exchange-confirm"
        >
          {loading ? 'Оформлення…' : 'Оформити обмін'}
        </button>
      </div>
    </div>
  );
}
