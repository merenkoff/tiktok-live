// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a row of the desktop's queue says about itself — pure, so the words are
// pinned by a test.

import type { IssueRow } from '../data/db';
import { plural } from './debt';

/** «Чекає мережі», «Не вдалося надіслати: … Каса спробує ще раз сама», «Сервер не прийняв: …». */
export function queueStatusText(row: Pick<IssueRow, 'status' | 'lastError' | 'attempts' | 'deadReason'>): string {
  if (row.status === 'queued') return 'Чекає мережі';
  const why = row.lastError?.trim() || 'невідома помилка';
  if (row.status === 'error') return `Не вдалося надіслати: ${why}. Каса спробує ще раз сама.`;
  if (row.deadReason === 'attempts_exhausted') {
    return `Не вдалося надіслати після ${row.attempts} ${plural(row.attempts, 'спроби', 'спроб', 'спроб')}: ${why}`;
  }
  return `Сервер не прийняв: ${why}`;
}

/** «24.10, 14:05» — when the goods left. */
export function queuedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
