// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Ships finished count sheets to the server as draft `inventory` documents
 * (`POST /api/pos/stock/counts`). These two functions are what the module hands
 * the shell as its `offline` hooks: the shell's runtime calls `syncSheets()`
 * after its own outbox and adds `pendingCount()` to the till's banner
 * (TechDocs/POS_MODULE_OFFLINE_DATA.md). On the web shell there is no runtime —
 * the page calls `syncSheets()` itself right after finishing a sheet.
 *
 * Idempotency is the sheet id, sent as `client_uuid`: a retry after a lost
 * response gets the same document back, never a second one.
 */

import { api, isNetworkError, isUnauthorized } from '@pos/platform';
import { db, type SheetRow } from './db';
import { isDue, MAX_ATTEMPTS } from './policy';

let running = false;

export function pendingCount(): Promise<number> {
  return db.sheets.where('status').anyOf(['queued', 'error']).count();
}

function errorText(error: unknown): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string') return data.error;
  return error instanceof Error ? error.message : String(error);
}

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

async function submit(sheet: SheetRow): Promise<void> {
  const lines = await db.lines.where('sheetId').equals(sheet.id).toArray();
  const doc = await api.submitStockCount({
    client_uuid: sheet.id,
    note: sheet.note,
    lines: lines.map((l) => ({ variant_id: l.variantId, counted_qty: l.countedQty })),
  });
  await db.sheets.update(sheet.id, {
    status: 'synced',
    serverDocId: doc.id,
    serverDocNumber: doc.doc_number,
    lastAttemptAt: Date.now(),
    lastError: undefined,
  });
}

/**
 * One pass over every due sheet. Never throws; every outcome is written to the
 * sheet row. Re-entrancy guard, because the shell's tick and a page's
 * "finish" can overlap.
 */
export async function syncSheets(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = (await db.sheets.where('status').anyOf(['queued', 'error']).toArray())
      .filter((s) => isDue(s))
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const sheet of due) {
      try {
        await submit(sheet);
      } catch (error) {
        // The session is gone: nothing here will succeed until the next login.
        if (isUnauthorized(error)) return;
        const now = Date.now();
        // No connection is not this sheet's fault — no attempt burned, stays queued.
        if (isNetworkError(error)) {
          await db.sheets.update(sheet.id, { lastAttemptAt: now, lastError: "Немає зв'язку" });
          continue;
        }
        const status = httpStatus(error);
        const rejected = status != null && status >= 400 && status < 500;
        const attempts = sheet.attempts + 1;
        const dead = rejected || attempts >= MAX_ATTEMPTS;
        await db.sheets.update(sheet.id, {
          status: dead ? 'dead' : 'error',
          attempts,
          lastAttemptAt: now,
          lastError: errorText(error),
          ...(dead ? { deadReason: rejected ? 'rejected' : 'attempts_exhausted' } : {}),
        });
      }
    }
  } finally {
    running = false;
  }
}
