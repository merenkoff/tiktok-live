// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The small status marks a receipt row carries, in Things' voice: a quiet
// ringed chip for the ordinary state, a tinted one only where the cashier has
// to notice something. Shared by the owner's «Продажі» and the till's «Чеки»,
// which used to spell the same four statuses twice.

import type { ReactNode } from 'react';

type ChipTone = 'neutral' | 'success' | 'warning' | 'danger';

const TONE: Record<ChipTone, string> = {
  neutral: 'ring-1 ring-inset ring-sq-divider text-sq-secondary',
  success: 'bg-sq-success/10 text-sq-success-ink',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-sq-danger/10 text-sq-danger',
};

export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-md text-xs font-medium whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const SALE_STATUS_UK: Record<string, string> = {
  completed: 'Завершено',
  voided: 'Скасовано',
  refunded: 'Повернено',
  partially_refunded: 'Часткове повернення',
};

function statusTone(status: string): ChipTone {
  if (status === 'voided' || status === 'refunded') return 'danger';
  if (status === 'partially_refunded') return 'warning';
  return 'neutral';
}

export function SaleStatusChip({ status }: { status: string }) {
  return <Chip tone={statusTone(status)}>{SALE_STATUS_UK[status] ?? status}</Chip>;
}

/**
 * The two halves of an exchange (migration 064), each pointing at the other:
 * on the NEW receipt «Обмін чека R-…» (where the goods came back from), on
 * the original «Обмін → R-…» (what they were swapped for). Quiet, because
 * neither needs doing anything about — it is the link that matters.
 */
export function ExchangeChip({
  of,
  to,
}: {
  /** The receipt this sale swapped goods from. */
  of?: string | null;
  /** The receipt a refund of this sale became. */
  to?: string | null;
}) {
  if (of) return <Chip>Обмін чека {of}</Chip>;
  if (to) return <Chip>Обмін → {to}</Chip>;
  return null;
}

/**
 * A «внесок» toward goods taken «під запис» (migration 078): money with no
 * goods lines, so the list says what it is rather than show an empty receipt.
 * Undone from the customer's statement in «Борги», never refunded here.
 */
export function DebtPrepaymentChip({ on }: { on?: boolean | null }) {
  if (!on) return null;
  return <Chip>Внесок за борг</Chip>;
}

/**
 * In a receipt's details, in place of its (absent) goods lines: which
 * «під запис» goods a «внесок» went to.
 */
export function DebtPrepaymentLine({
  prepayment,
}: {
  prepayment?: { product_name: string; variant_label: string; amount_cents: number } | null;
}) {
  if (!prepayment) return null;
  const title = prepayment.variant_label
    ? `${prepayment.product_name} · ${prepayment.variant_label}`
    : prepayment.product_name;
  return (
    <p className="sq-row min-h-12 py-2 text-[15px] text-sq-secondary" data-testid="sale-debt-prepayment">
      Внесок за борг: «{title}». Товар лишається під запис, доки його не оплачено повністю; скасовують внесок у
      виписці покупця в «Боргах».
    </p>
  );
}
