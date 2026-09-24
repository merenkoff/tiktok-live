// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { SheetRow } from '../data/db';

const STATUS_LABEL: Record<SheetRow['status'], string> = {
  counting: 'Рахую',
  queued: 'В черзі',
  error: 'Помилка, повторю',
  synced: 'Надіслано',
  dead: 'Відхилено',
};

const STATUS_TONE: Record<SheetRow['status'], string> = {
  counting: 'bg-sq-blue/10 text-sq-blue',
  queued: 'bg-amber-50 text-amber-800',
  error: 'bg-amber-50 text-amber-800',
  synced: 'bg-sq-success/10 text-sq-success-ink',
  dead: 'bg-sq-danger/10 text-sq-danger',
};

export function SheetStatusBadge({ sheet }: { sheet: SheetRow }) {
  const text =
    sheet.status === 'synced' && sheet.serverDocNumber
      ? `${STATUS_LABEL.synced} · ${sheet.serverDocNumber}`
      : STATUS_LABEL[sheet.status];
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-md text-xs font-medium whitespace-nowrap ${STATUS_TONE[sheet.status]}`}
    >
      {text}
    </span>
  );
}
