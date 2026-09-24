// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a stock document is called and drawn with. One table, because the hub's
// action cards, its «Останні документи» and the document page itself must show
// a write-off with the same glyph — a different picture in each place would
// read as three different things.

import { AlertTriangle, ClipboardCheck, Puzzle, Truck, Wrench, type Glyph } from '@pos/platform/ui';

export const TYPE_LABEL: Record<string, string> = {
  receipt: 'Прихід',
  writeoff: 'Списання',
  adjustment: 'Корекція',
  inventory: 'Інвентаризація',
  production: 'Виробництво',
};

export const TYPE_GLYPH: Record<string, Glyph> = {
  receipt: Truck,
  writeoff: AlertTriangle,
  adjustment: Wrench,
  inventory: ClipboardCheck,
  production: Puzzle,
};

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Чернетка',
  posted: 'Проведено',
  voided: 'Скасовано',
  reversed: 'Відмінено',
};

/**
 * A status chip. Only two states carry a colour: a posted document is done
 * (green) and a draft still waits for someone (amber); a voided or reversed one
 * is history and stays grey.
 */
export function statusChipClass(status: string): string {
  const base = 'h-[22px] px-2 rounded-md inline-flex items-center shrink-0 text-xs font-medium';
  if (status === 'posted') return `${base} bg-sq-success/10 text-sq-success-ink`;
  if (status === 'draft') return `${base} bg-amber-50 text-amber-800`;
  return `${base} ring-1 ring-inset ring-sq-divider text-sq-secondary`;
}
