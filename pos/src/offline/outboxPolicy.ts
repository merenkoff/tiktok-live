// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/offline/outboxPolicy.ts
//
// When to retry a queued document, when to give up on it, and what to tell the
// cashier. Pure, so the whole matrix is testable without IndexedDB.
//
// Before this existed the outbox had two failure modes that only showed up
// under a permanent rejection:
//   * the backoff was measured from `createdAt`, and the table maxes at 60s, so
//     any row older than a minute was retried on **every** tick — forever;
//   * there was no terminal state, so a row the server will never accept sat in
//     the pending count and pinned the offline banner for good.

import axios from 'axios';
import { isNetworkError } from '../services/api';
import type { OutboxRow, OutboxType } from './db';

/** Delay between attempts. The last entry is the ceiling. */
const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

/**
 * Attempts before a document is given up on.
 *
 * Same threshold the backend ledger abandons a fiscal document at, so a sale
 * and its receipt stop being retried at roughly the same time.
 */
export const MAX_ATTEMPTS = 8;

export function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/**
 * When this row may next be attempted.
 *
 * Measured from the **last attempt**, not from creation. Rows written by older
 * builds have no `lastAttemptAt` and fall back to `createdAt` — identical to
 * the old behaviour until their next attempt, correct from then on.
 */
export function dueAt(row: Pick<OutboxRow, 'createdAt' | 'attempts' | 'lastAttemptAt'>): number {
  return (row.lastAttemptAt ?? row.createdAt) + backoff(row.attempts);
}

export function isDue(
  row: Pick<OutboxRow, 'status' | 'createdAt' | 'attempts' | 'lastAttemptAt'>,
  now = Date.now()
): boolean {
  if (row.status === 'dead') return false;
  if (row.status !== 'error') return true;
  return now >= dueAt(row);
}

export type DeadReason =
  | 'rejected'
  | 'sale_voided'
  | 'attempts_exhausted'
  | 'blocked_by_customer';

export interface SyncVerdict {
  /** True when retrying can never succeed. */
  terminal: boolean;
  message: string;
  reason?: DeadReason;
  /**
   * Only meaningful when terminal: true when the server definitely created
   * nothing, so discarding the row must hand local stock back. A voided sale is
   * the opposite — `voidSale` already returned the stock server-side.
   */
  nothingWritten?: boolean;
}

const TYPE_LABEL: Record<OutboxType, string> = {
  sale: 'Чек',
  customer: 'Клієнт',
};

/**
 * Classify a sync failure.
 *
 * Note what is deliberately absent: no branch on `sale_voided`, and none on
 * 502 vs 503. The next attempt turns every fiscal ambiguity into a definitive
 * answer by itself —
 *   * 503 (pre-flight refused) wrote nothing, so retrying is free;
 *   * a 502 that kept the sale means the sale exists, so the replay hits the
 *     server's `client_uuid` pre-check and comes back **200 with the sale**;
 *   * a 502 that voided it means the replay comes back **409**, which is
 *     terminal here.
 * That is exactly what the server's 409 answer was added for.
 */
export function classifySyncError(error: unknown, type: OutboxType): SyncVerdict {
  const label = TYPE_LABEL[type];

  if (isNetworkError(error)) {
    return { terminal: false, message: `${label}: немає відповіді сервера` };
  }

  const status = axios.isAxiosError(error) ? (error.response?.status ?? 0) : 0;
  const raw = axios.isAxiosError(error) ? error.response?.data : undefined;
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
  const serverMessage =
    typeof data?.message === 'string'
      ? data.message
      : typeof data?.error === 'string'
        ? data.error
        : null;

  if (status === 409 && data?.error === 'sale_voided_not_fiscalised') {
    return {
      terminal: true,
      reason: 'sale_voided',
      // The server voided it, which returned the stock there too.
      nothingWritten: false,
      message: `${label}: скасовано через збій ПРРО — проведіть продаж наново`,
    };
  }
  if (status === 409) {
    return {
      terminal: true,
      reason: 'rejected',
      nothingWritten: false,
      message: `${label}: ${serverMessage ?? 'сервер відхилив цей документ'}`,
    };
  }

  // An expired session is not this row's fault — the caller stops the whole
  // drain rather than burning an attempt on every queued document.
  if (status === 401) {
    return { terminal: false, message: `${label}: сесію завершено — увійдіть знову` };
  }

  if (status === 429 || status >= 500) {
    return {
      terminal: false,
      message: `${label}: ${serverMessage ?? 'сервер тимчасово недоступний'}`,
    };
  }

  if (status >= 400) {
    // 400/404/422 — the payload itself is wrong, and it will not improve.
    return {
      terminal: true,
      reason: 'rejected',
      nothingWritten: true,
      message: `${label}: ${serverMessage ?? 'сервер відхилив цей документ'}`,
    };
  }

  return { terminal: false, message: `${label}: не вдалося синхронізувати` };
}

/** The row state after an attempt that produced `verdict`. */
export function nextRowState(
  row: Pick<OutboxRow, 'attempts'>,
  verdict: SyncVerdict,
  now = Date.now()
): Pick<OutboxRow, 'status' | 'attempts' | 'lastAttemptAt' | 'lastError'> &
  Partial<Pick<OutboxRow, 'deadReason' | 'nothingWritten'>> {
  const attempts = row.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const dead = verdict.terminal || exhausted;

  return {
    status: dead ? 'dead' : 'error',
    attempts,
    lastAttemptAt: now,
    lastError: verdict.message,
    ...(dead
      ? {
          deadReason: verdict.terminal
            ? (verdict.reason ?? 'rejected')
            : ('attempts_exhausted' as const),
          // Exhaustion tells us nothing about what the server did, so never
          // hand stock back on that path.
          nothingWritten: verdict.terminal ? (verdict.nothingWritten ?? false) : false,
        }
      : {}),
  };
}
