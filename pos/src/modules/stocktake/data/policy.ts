// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Retry policy for queued count sheets. The same numbers as the shell's
 * `offline/outboxPolicy.ts`, copied rather than imported: that policy is not
 * on the `@pos/platform` surface, and widening the surface for one module is
 * a `PLATFORM_VERSION` bump nobody else needs. A module owns its queue
 * end to end (TechDocs/POS_MODULE_OFFLINE_DATA.md).
 */

import type { SheetRow } from './db';

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

/** Attempts before a sheet is given up on — matches the shell's outbox. */
export const MAX_ATTEMPTS = 8;

export function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/** Whether a sheet may be attempted now. `queued` is always due; `error` waits its backoff. */
export function isDue(
  sheet: Pick<SheetRow, 'status' | 'attempts' | 'lastAttemptAt' | 'createdAt'>,
  now = Date.now()
): boolean {
  if (sheet.status === 'queued') return true;
  if (sheet.status !== 'error') return false;
  return now >= (sheet.lastAttemptAt ?? sheet.createdAt) + backoff(sheet.attempts);
}
