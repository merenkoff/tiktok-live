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
  queued: 'bg-amber-100 text-amber-800',
  error: 'bg-amber-100 text-amber-800',
  synced: 'bg-emerald-100 text-emerald-800',
  dead: 'bg-red-100 text-red-800',
};

export function SheetStatusBadge({ sheet }: { sheet: SheetRow }) {
  const text =
    sheet.status === 'synced' && sheet.serverDocNumber
      ? `${STATUS_LABEL.synced} · ${sheet.serverDocNumber}`
      : STATUS_LABEL[sheet.status];
  return (
    <span className={`rounded-sq px-2 py-0.5 text-xs font-medium ${STATUS_TONE[sheet.status]}`}>
      {text}
    </span>
  );
}
