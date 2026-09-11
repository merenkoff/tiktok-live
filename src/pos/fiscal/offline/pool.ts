// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/pool.ts
//
// The server-side pool of tax-office offline codes (`pos_fiscal_offline_codes`).
// See TechDocs/POS_FISCAL_OFFLINE.md §3.
//
// A code is single-use at the tax office and is only "spent" there once a
// transaction carrying it is delivered. Until then the provider keeps handing
// the same codes back, so the pool is an upsert keyed by `fiscal_code`, never
// an append. The one thing we cannot see is the provider spending codes on its
// own (Checkbox goes offline by itself when the tax office times out and
// stamps receipts from the same reserve) — `refillOfflineCodes` notices that
// as "the provider has fewer than we asked for", and burns what it no longer
// lists.

import { pool } from '../../../db.js';
import { logger } from '../../../logger.js';
import { asFiscalError } from '../errors.js';
import type { Queryable } from '../ledger.js';
import { awaitSlot } from '../rateLimit.js';
import { rememberRegisterFiscalNumber } from '../settings.service.js';
import { buildCallCtx, resolveContext, type FiscalContext } from '../shifts.service.js';
import type { AskOfflineCodesStatus } from '../types.js';

export type OfflineCodeStatus = 'free' | 'leased' | 'used' | 'burned';

export interface OfflineCodeRow {
  id: number;
  store_id: number;
  cash_register_key: string;
  fiscal_code: string;
  serial_id: number | null;
  status: OfflineCodeStatus;
  lease_device_id: string | null;
  leased_at: Date | null;
  used_by_receipt_id: number | null;
  used_at: Date | null;
  fetched_at: Date;
}

export interface PoolCounts {
  free: number;
  leased: number;
  used: number;
  burned: number;
}

export async function countCodes(storeId: number, registerKey: string): Promise<PoolCounts> {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS n
     FROM pos_fiscal_offline_codes
     WHERE store_id = $1 AND cash_register_key = $2
     GROUP BY status`,
    [storeId, registerKey]
  );
  const counts: PoolCounts = { free: 0, leased: 0, used: 0, burned: 0 };
  for (const row of result.rows as Array<{ status: OfflineCodeStatus; n: number }>) {
    if (row.status in counts) counts[row.status] = Number(row.n);
  }
  return counts;
}

export interface RefillResult {
  /** What the provider said when we asked the tax office for more. */
  asked: AskOfflineCodesStatus | 'skipped';
  /** New codes written into the pool. */
  fetched: number;
  /** Free codes the provider no longer lists — spent behind our back. */
  burned: number;
}

/** How long one store's refill may take. Two provider calls, background priority. */
export const REFILL_TIMEOUT_MS = 30_000;

/** The cron will not queue behind live checkouts for longer than this. */
const REFILL_MAX_WAIT_MS = 250;

/**
 * Top the pool up to the store's `offline_codes_target`.
 *
 * `askOfflineCodes` only works while the provider is online, and a `timeout`
 * or `error` from it is NOT a reason to stop: the tax office may already have
 * handed out codes on an earlier ask that we never fetched, and the provider
 * serves `getOfflineCodes` from its own store even while the tax office is
 * down. So the ask is best-effort and the fetch always follows.
 */
export async function refillOfflineCodes(
  ctx: FiscalContext,
  signal: AbortSignal
): Promise<RefillResult> {
  const ops = ctx.provider.offline;
  if (!ops) return { asked: 'skipped', fetched: 0, burned: 0 };

  const target = ctx.settings.offline_codes_target;
  const before = await countCodes(ctx.storeId, ctx.registerKey);
  if (before.free >= target) return { asked: 'skipped', fetched: 0, burned: 0 };

  const granted = await awaitSlot(ctx.storeId, ctx.registerKey, 'background', signal, {
    maxWaitMs: REFILL_MAX_WAIT_MS,
  });
  if (!granted) return { asked: 'skipped', fetched: 0, burned: 0 };

  const callCtx = await buildCallCtx(ctx, signal);

  // Learn the register's own fiscal number while we are online and already
  // talking to the provider. One extra read per refill, and only until it is
  // cached: offline it is unobtainable, and the tax-office link needs it.
  if (!ctx.settings.register_fiscal_number) {
    try {
      const state = await ops.registerState(callCtx);
      await rememberRegisterFiscalNumber(ctx.storeId, state.fiscalNumber);
    } catch (error) {
      logger.warn('Offline codes: could not read the register state', {
        storeId: ctx.storeId,
        kind: asFiscalError(error, 'registerState failed').kind,
      });
    }
  }

  let asked: AskOfflineCodesStatus = 'error';
  try {
    const res = await ops.askOfflineCodes(callCtx, target);
    asked = res.status;
    if (res.status !== 'done') {
      logger.warn('Offline codes: ask did not complete', {
        storeId: ctx.storeId,
        status: res.status,
        error: res.error,
      });
    }
  } catch (error) {
    const fiscal = asFiscalError(error, 'ask-offline-codes failed');
    logger.warn('Offline codes: ask failed', {
      storeId: ctx.storeId,
      kind: fiscal.kind,
      message: fiscal.message,
    });
  }

  const codes = await ops.getOfflineCodes(callCtx, target);

  let fetched = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const code of codes) {
      const inserted = await client.query(
        `INSERT INTO pos_fiscal_offline_codes
           (store_id, cash_register_key, fiscal_code, serial_id, status, fetched_at)
         VALUES ($1, $2, $3, $4, 'free', NOW())
         ON CONFLICT (store_id, cash_register_key, fiscal_code) DO NOTHING`,
        [ctx.storeId, ctx.registerKey, code.fiscalCode, code.serialId]
      );
      fetched += inserted.rowCount ?? 0;
    }

    // The provider returned fewer than we asked for, so this IS its whole
    // remaining reserve — any free code of ours it did not list has been
    // spent outside our control. Only `free` rows: a leased code is still
    // unused at the provider (it lists it), and a used one is ours to send.
    let burned = 0;
    if (codes.length < target) {
      const listed = codes.map((c) => c.fiscalCode);
      const result = await client.query(
        `UPDATE pos_fiscal_offline_codes
         SET status = 'burned', updated_at = NOW()
         WHERE store_id = $1 AND cash_register_key = $2 AND status = 'free'
           AND NOT (fiscal_code = ANY($3::text[]))`,
        [ctx.storeId, ctx.registerKey, listed]
      );
      burned = result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    if (fetched > 0 || burned > 0) {
      logger.info('Offline codes pool refilled', {
        storeId: ctx.storeId,
        fetched,
        burned,
        asked,
        listed: codes.length,
        target,
      });
    }
    return { asked, fetched, burned };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type CodeMark = { status: 'leased'; deviceId: string } | { status: 'used'; receiptId: number | null };

/**
 * Take the next `n` free codes, lowest serial first, and mark them.
 *
 * `FOR UPDATE SKIP LOCKED` so two takers never get the same code — a leased
 * code that is also stamped on a server document would be refused by the
 * tax office as used twice.
 *
 * `db` lets a caller take the code inside its own transaction (an offline
 * session stamps a document and takes its code atomically), so a rollback
 * gives the code back instead of leaving a `used` row pointing at nothing.
 */
export async function takeFreeCodes(
  storeId: number,
  registerKey: string,
  n: number,
  mark: CodeMark,
  db: Queryable = pool
): Promise<OfflineCodeRow[]> {
  if (n <= 0) return [];
  const result = await db.query(
    `UPDATE pos_fiscal_offline_codes c SET
       status = $4::varchar,
       lease_device_id = $5::text,
       leased_at = CASE WHEN $4::varchar = 'leased' THEN NOW() ELSE leased_at END,
       used_by_receipt_id = $6::bigint,
       used_at = CASE WHEN $4::varchar = 'used' THEN NOW() ELSE used_at END,
       updated_at = NOW()
     WHERE c.id IN (
       SELECT id FROM pos_fiscal_offline_codes
       WHERE store_id = $1 AND cash_register_key = $2 AND status = 'free'
       ORDER BY serial_id ASC NULLS LAST, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $3
     )
     RETURNING *`,
    [
      storeId,
      registerKey,
      n,
      mark.status,
      mark.status === 'leased' ? mark.deviceId : null,
      mark.status === 'used' ? mark.receiptId : null,
    ]
  );
  const rows = result.rows as OfflineCodeRow[];
  rows.sort((a, b) => (a.serial_id ?? 0) - (b.serial_id ?? 0) || a.id - b.id);
  return rows;
}

/**
 * Give a till's lease back — to the pool (`free`) on a clean handover, or
 * `burned` when the till was force-taken and may have stamped receipts on
 * some of them that will never reach us in order.
 */
export async function releaseLeasedCodes(
  storeId: number,
  deviceId: string,
  to: 'free' | 'burned'
): Promise<number> {
  const result = await pool.query(
    `UPDATE pos_fiscal_offline_codes
     SET status = $3, lease_device_id = NULL, leased_at = NULL, updated_at = NOW()
     WHERE store_id = $1 AND lease_device_id = $2 AND status = 'leased'`,
    [storeId, deviceId, to]
  );
  return result.rowCount ?? 0;
}

// ── Cron entry ──────────────────────────────────────────────────────────────

let refillRunning = false;

export interface RefillAllResult {
  stores: number;
  fetched: number;
  burned: number;
  failed: number;
}

/**
 * Refill every store that has offline mode on. Runs from the ten-minute cron
 * in `src/index.ts`; self-guarded against overlapping ticks like the retry cron.
 */
export async function refillAllStores(
  opts: { limit?: number; signal?: AbortSignal; storeId?: number } = {}
): Promise<RefillAllResult> {
  const totals: RefillAllResult = { stores: 0, fetched: 0, burned: 0, failed: 0 };
  if (refillRunning) return totals;
  refillRunning = true;
  try {
    // `storeId` narrows the sweep to one store — for tests, which share a
    // database across workers; the cron always sweeps every store.
    const stores = await pool.query(
      `SELECT store_id FROM pos_fiscal_settings
       WHERE enabled AND offline_mode
         AND ($2::bigint IS NULL OR store_id = $2::bigint)
       ORDER BY store_id ASC
       LIMIT $1`,
      [opts.limit ?? 50, opts.storeId ?? null]
    );
    for (const row of stores.rows as Array<{ store_id: number }>) {
      const storeId = Number(row.store_id);
      try {
        const ctx = await resolveContext(storeId);
        if (!ctx?.provider.offline) continue;
        totals.stores += 1;
        const result = await refillOfflineCodes(
          ctx,
          opts.signal ?? AbortSignal.timeout(REFILL_TIMEOUT_MS)
        );
        totals.fetched += result.fetched;
        totals.burned += result.burned;
      } catch (error) {
        totals.failed += 1;
        const fiscal = asFiscalError(error, 'Offline codes refill failed');
        logger.error('Offline codes refill failed', {
          storeId,
          kind: fiscal.kind,
          message: fiscal.message,
        });
      }
    }
    return totals;
  } finally {
    refillRunning = false;
  }
}
