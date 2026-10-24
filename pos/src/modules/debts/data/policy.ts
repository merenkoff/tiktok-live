// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Retry policy for queued handovers. The numbers of the shell's
 * `offline/outboxPolicy.ts` and of `stocktake`, copied rather than imported:
 * that policy is not on the `@pos/platform` surface, and widening the surface
 * for one module is a `PLATFORM_VERSION` bump nobody else needs. A module owns
 * its queue end to end (TechDocs/POS_MODULE_OFFLINE_DATA.md).
 */

import type { IssueRow } from './db';

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

/** Attempts before a handover is given up on — matches the shell's outbox. */
export const MAX_ATTEMPTS = 8;

export function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/** Whether a row may be sent now. `queued` is always due; `error` waits its backoff. */
export function isDue(
  row: Pick<IssueRow, 'status' | 'attempts' | 'lastAttemptAt' | 'createdAt'>,
  now = Date.now()
): boolean {
  if (row.status === 'queued') return true;
  if (row.status !== 'error') return false;
  return now >= (row.lastAttemptAt ?? row.createdAt) + backoff(row.attempts);
}

/**
 * The server will never take this request as it is: a 4xx other than a
 * timeout or a rate limit. A 5xx, a 408 and a 429 are the server's trouble
 * and are tried again.
 */
export function isRejection(status: number | undefined): boolean {
  return status != null && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
