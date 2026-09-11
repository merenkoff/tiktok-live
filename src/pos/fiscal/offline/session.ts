// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/session.ts
//
// An offline session (`pos_fiscal_offline_sessions`): one stretch of selling
// while the provider cannot be reached, replayed to it in order afterwards.
// TechDocs/POS_FISCAL_OFFLINE.md §5 and the phase-2 plan.
//
// Phase 2 knows one holder — the server (case B). A till-held session (case C)
// reuses the same rows and replay in phase 3.
//
// Two invariants live here and nowhere else:
//   * at most one live session per register — the partial unique index, and
//     `openServerSession` racing against itself simply returns the winner;
//   * `offline_seq` is dense and monotonic — `stampNext` locks the session row
//     for the length of the stamp, so two checkouts of the same store queue
//     rather than interleave.
//
// `go-offline` itself spends a tax-office code, so opening a session takes one
// from the pool and remembers it; the replay sends it with `started_at`.

import { pool } from '../../../db.js';
import { logger } from '../../../logger.js';
import { FiscalError } from '../errors.js';
import { stampOfflineDocument } from '../ledger.js';
import type { FiscalContext } from '../shifts.service.js';
import { takeFreeCodes } from './pool.js';

export type OfflineSessionStatus = 'open' | 'replaying' | 'closed' | 'stuck';
export type OfflineSessionHolder = 'server' | 'device';

export interface OfflineSessionRow {
  id: number;
  store_id: number;
  cash_register_key: string;
  holder: OfflineSessionHolder;
  device_id: string | null;
  shift_id: number | null;
  started_at: Date;
  go_offline_code: string | null;
  go_offline_tx_id: string | null;
  status: OfflineSessionStatus;
  ended_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  last_go_online_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OfflineDocStamp {
  fiscalCode: string;
  fiscalDate: Date;
  seq: number;
}

/** pg hands BIGINT back as strings; callers compare ids, so normalise once here. */
function toRow(raw: Record<string, unknown> | undefined): OfflineSessionRow | null {
  if (!raw) return null;
  return {
    ...(raw as unknown as OfflineSessionRow),
    id: Number(raw.id),
    store_id: Number(raw.store_id),
    shift_id: raw.shift_id == null ? null : Number(raw.shift_id),
  };
}

export async function getSession(id: number): Promise<OfflineSessionRow | null> {
  const result = await pool.query(`SELECT * FROM pos_fiscal_offline_sessions WHERE id = $1`, [id]);
  return toRow(result.rows[0]);
}

/** The register's `open` or `replaying` session, if any. */
export async function getLiveSession(
  storeId: number,
  registerKey: string
): Promise<OfflineSessionRow | null> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_offline_sessions
     WHERE store_id = $1 AND cash_register_key = $2 AND status IN ('open', 'replaying')
     LIMIT 1`,
    [storeId, registerKey]
  );
  return toRow(result.rows[0]);
}

/** Every live server-held session — the replay's worklist, oldest first. `storeId` narrows it (tests). */
export async function listLiveServerSessions(
  opts: { storeId?: number; limit?: number } = {}
): Promise<OfflineSessionRow[]> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_offline_sessions
     WHERE holder = 'server' AND status IN ('open', 'replaying')
       AND ($2::bigint IS NULL OR store_id = $2::bigint)
     ORDER BY started_at ASC
     LIMIT $1`,
    [opts.limit ?? 50, opts.storeId ?? null]
  );
  return result.rows.map((row) => toRow(row) as OfflineSessionRow);
}

/**
 * Open a server-held session for the register, or return the live one.
 *
 * The INSERT and the code for `go-offline` are one transaction: losing the
 * race on the partial unique index rolls the code back into the pool, and an
 * empty pool leaves no half-open session behind. `started_at` is now — we are
 * here because the provider is down *now*, so it is ≥ anything it delivered;
 * the replay re-checks that against the ledger before sending `go-offline`.
 */
export async function openServerSession(
  ctx: FiscalContext,
  shiftId: number | null
): Promise<OfflineSessionRow> {
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query('BEGIN');
    inTx = true;
    const inserted = await client.query(
      `INSERT INTO pos_fiscal_offline_sessions
         (store_id, cash_register_key, holder, shift_id, started_at, status)
       VALUES ($1, $2, 'server', $3, NOW(), 'open')
       ON CONFLICT (store_id, cash_register_key) WHERE status IN ('open', 'replaying') DO NOTHING
       RETURNING *`,
      [ctx.storeId, ctx.registerKey, shiftId]
    );
    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      inTx = false;
      const live = await getLiveSession(ctx.storeId, ctx.registerKey);
      if (live) return live;
      // The winner closed between our INSERT and this read — a retry would
      // open a new one; the caller re-runs preflight.
      throw new FiscalError('Офлайн-сесію щойно завершено, повторіть продаж', 'unknown');
    }
    const session = toRow(inserted.rows[0]) as OfflineSessionRow;

    const [code] = await takeFreeCodes(
      ctx.storeId,
      ctx.registerKey,
      1,
      { status: 'used', receiptId: null },
      client
    );
    if (!code) {
      await client.query('ROLLBACK');
      inTx = false;
      throw new FiscalError('Закінчились офлайн-коди ПРРО', 'offline_codes_exhausted');
    }

    const updated = await client.query(
      `UPDATE pos_fiscal_offline_sessions SET go_offline_code = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [session.id, code.fiscal_code]
    );
    await client.query('COMMIT');
    inTx = false;
    logger.warn('Fiscal offline session opened (server)', {
      storeId: ctx.storeId,
      sessionId: session.id,
      shiftId,
      goOfflineCode: code.fiscal_code,
    });
    return toRow(updated.rows[0]) as OfflineSessionRow;
  } catch (error) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Stamp the next document of a session: next free code + now + next seq.
 *
 * Locks the session row (`FOR UPDATE`) for the duration, which is what makes
 * `offline_seq` dense under concurrent checkouts, and refuses once the session
 * is no longer `open` — a `replaying` session is being sent and must not grow.
 */
export async function stampNext(sessionId: number, receiptId: number): Promise<OfflineDocStamp> {
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query('BEGIN');
    inTx = true;
    const locked = await client.query(
      `SELECT * FROM pos_fiscal_offline_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );
    const session = toRow(locked.rows[0]);
    if (!session) throw new FiscalError('Офлайн-сесію не знайдено', 'unknown');
    if (session.status === 'replaying') {
      throw new FiscalError('ПРРО надсилає офлайн-чеки — повторіть за хвилину', 'replaying');
    }
    if (session.status !== 'open') {
      throw new FiscalError('Офлайн-сесію завершено, повторіть продаж', 'unknown');
    }

    const seqRow = await client.query(
      `SELECT COALESCE(MAX(offline_seq), 0) + 1 AS seq
       FROM pos_fiscal_receipts WHERE offline_session_id = $1`,
      [sessionId]
    );
    const seq = Number(seqRow.rows[0].seq);

    const [code] = await takeFreeCodes(
      session.store_id,
      session.cash_register_key,
      1,
      { status: 'used', receiptId },
      client
    );
    if (!code) throw new FiscalError('Закінчились офлайн-коди ПРРО', 'offline_codes_exhausted');

    const fiscalDate = new Date();
    await stampOfflineDocument(client, receiptId, {
      sessionId,
      seq,
      fiscalCode: code.fiscal_code,
      fiscalDate,
    });
    await client.query('COMMIT');
    inTx = false;
    return { fiscalCode: code.fiscal_code, fiscalDate, seq };
  } catch (error) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Sessions that need the owner, newest first. */
export async function listStuckSessions(storeId: number, limit = 20): Promise<OfflineSessionRow[]> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_offline_sessions
     WHERE store_id = $1 AND status = 'stuck'
     ORDER BY ended_at DESC NULLS LAST, id DESC
     LIMIT $2`,
    [storeId, limit]
  );
  return result.rows.map((row) => toRow(row) as OfflineSessionRow);
}

// ── Lifecycle (the replay drives these) ─────────────────────────────────────

async function setStatus(
  id: number,
  from: OfflineSessionStatus[],
  set: string,
  params: unknown[]
): Promise<OfflineSessionRow | null> {
  const result = await pool.query(
    `UPDATE pos_fiscal_offline_sessions SET ${set}, updated_at = NOW()
     WHERE id = $1 AND status = ANY($2::varchar[])
     RETURNING *`,
    [id, from, ...params]
  );
  return toRow(result.rows[0]);
}

/** `open` → `replaying`: no more documents may be stamped; the send begins. */
export function markReplaying(id: number): Promise<OfflineSessionRow | null> {
  return setStatus(id, ['open'], `status = 'replaying'`, []);
}

/** The provider accepted `go-offline`; never send it again for this session. */
export function markGoOfflineSent(id: number, txId: string | null): Promise<OfflineSessionRow | null> {
  return setStatus(id, ['open', 'replaying'], `go_offline_tx_id = COALESCE($3, go_offline_tx_id, 'sent')`, [txId]);
}

/** `go-online` was called — throttle the next one. */
export function markGoOnlineSent(id: number): Promise<OfflineSessionRow | null> {
  return setStatus(id, ['replaying'], `last_go_online_at = NOW()`, []);
}

/** The provider reports the register online again: the session is over. */
export function markClosed(id: number): Promise<OfflineSessionRow | null> {
  return setStatus(id, ['replaying'], `status = 'closed', ended_at = NOW()`, []);
}

/** Needs the owner: parked with a reason, documents left as they are. */
export function markStuck(id: number, code: string, message: string): Promise<OfflineSessionRow | null> {
  return setStatus(
    id,
    ['open', 'replaying'],
    `status = 'stuck', error_code = $3, error_message = $4, ended_at = NOW()`,
    [code.slice(0, 64), message.slice(0, 500)]
  );
}
