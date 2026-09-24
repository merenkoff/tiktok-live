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
