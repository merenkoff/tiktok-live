// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The module's `offline` hooks (TechDocs/POS_MODULE_OFFLINE_DATA.md). The
 * desktop's offline runtime calls `syncIssues()` after its own outbox —
 * customers, then sales — on every tick with a network and a live session,
 * and adds `pendingCount()` to the till's «Очікує синк». Nothing drives them
 * on the web or the tablet, which write nothing offline.
 *
 * A pass does two things, in this order:
 *  1. sends every due handover to `POST /debts/issue` with `offline_at` — the
 *     moment the goods left, so the journal and the oldest-first rule put it
 *     there. The row's id is the `client_uuid`: a send whose answer was lost
 *     is a replay next time, never a second debt;
 *  2. reads the whole list again (`GET /debts?all=1`) into the mirror, so the
 *     next outage starts from today's limits. After the sends, so the list
 *     already holds them; at most once a minute when nothing was sent.
 *
 * There is no hook for "the shell refreshed its snapshot", so the mirror is
 * refreshed here — the one moment the module is sure to have a network.
 *
 * Never throws: every outcome is written to the row. The policy is the
 * shell's — no connection burns no attempt; a 401 stops the pass (nothing will
 * succeed until the next login); a refusal kills the row for a person to see
 * on «Борги»; anything else is retried with backoff.
 */

import { api, isNetworkError, isUnauthorized } from '@pos/platform';
import { debtsApi } from '../lib/debtsApi';
import { announceCredit } from '../lib/creditStore';
import { db, quietly, type IssueRow } from './db';
import { applyDebtors, writeCredit } from './mirror';
import { notifyQueue } from './queue';
import { isDue, isRejection, MAX_ATTEMPTS } from './policy';

/** How often the whole list is read again on a pass that sent nothing. */
export const MIRROR_EVERY_MS = 60_000;

let running = false;
let mirroredAt = 0;

/** For tests: the next pass reads the list whatever happened before. */
export function resetSyncState(): void {
  running = false;
  mirroredAt = 0;
}

function currentStore(): number | null {
  return api.loadAuth()?.store.id ?? null;
}

function errorText(error: unknown): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string') return data.error;
  return error instanceof Error ? error.message : String(error);
}

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/** Handovers this store's till still has to send — the share of «Очікує синк». */
export function pendingCount(): Promise<number> {
  const storeId = currentStore();
  if (storeId == null) return Promise.resolve(0);
  return quietly(
    async () =>
      (await db.issues.where('storeId').equals(storeId).toArray()).filter(
        (row) => row.status === 'queued' || row.status === 'error'
      ).length,
    0
  );
}

async function send(storeId: number, row: IssueRow): Promise<void> {
  const result = await debtsApi.issue({
    customer_id: row.customerId,
    items: row.items,
    cart_discount: row.cartDiscount,
    client_uuid: row.id,
    ...(row.note ? { note: row.note } : {}),
    offline_at: new Date(row.createdAt).toISOString(),
  });
  // The row leaves the queue and its customer's mirror takes the server's
  // word in one step, so the debt is never counted in neither place.
  await quietly(
    () =>
      db.transaction('rw', db.issues, db.credit, async () => {
        await db.issues.delete(row.id);
        await writeCredit(storeId, result.credit, { name: row.customerName, phone: row.customerPhone });
      }),
    undefined
  );
  announceCredit(result.credit);
}

/** One pass over the due rows. The number sent, or `stop` when the session is gone. */
async function drain(storeId: number): Promise<number | 'stop'> {
  // Another store's rows wait for that store: this session's token cannot file them.
  const due = (await quietly(() => db.issues.where('storeId').equals(storeId).toArray(), [] as IssueRow[]))
    .filter((row) => isDue(row))
    .sort((a, b) => a.createdAt - b.createdAt);

  let sent = 0;
  for (const row of due) {
    try {
      await send(storeId, row);
      sent += 1;
    } catch (error) {
      if (isUnauthorized(error)) return 'stop';
      const now = Date.now();
      // No connection is not this row's fault — no attempt burned, still queued.
      if (isNetworkError(error)) {
        await quietly(() => db.issues.update(row.id, { lastAttemptAt: now, lastError: 'Немає звʼязку' }), 0);
        continue;
      }
      const rejected = isRejection(httpStatus(error));
      const attempts = row.attempts + 1;
      const dead = rejected || attempts >= MAX_ATTEMPTS;
      await quietly(
        () =>
          db.issues.update(row.id, {
            status: dead ? 'dead' : 'error',
            attempts,
            lastAttemptAt: now,
            lastError: errorText(error),
            ...(dead ? { deadReason: rejected ? 'rejected' : 'attempts_exhausted' } : {}),
          }),
        0
      );
    }
  }
  return sent;
}

async function refreshMirror(storeId: number, force: boolean): Promise<void> {
  const startedAt = Date.now();
  if (!force && startedAt - mirroredAt < MIRROR_EVERY_MS) return;
  try {
    const { debtors } = await debtsApi.debtors(true);
    await applyDebtors(storeId, debtors, startedAt);
    mirroredAt = startedAt;
  } catch {
    // A cache: the next pass reads it again.
  }
}

/** The `sync` hook. Re-entrancy guarded: the shell's tick and a screen's own call can overlap. */
export async function syncIssues(): Promise<void> {
  if (running) return;
  const storeId = currentStore();
  if (storeId == null) return;
  running = true;
  try {
    const sent = await drain(storeId);
    if (sent === 'stop') return;
    await refreshMirror(storeId, sent > 0);
  } finally {
    running = false;
    notifyQueue();
  }
}
