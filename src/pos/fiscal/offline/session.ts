// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/session.ts
//
// An offline session (`pos_fiscal_offline_sessions`): one stretch of selling
// while the provider cannot be reached, replayed to it in order afterwards.
// TechDocs/POS_FISCAL_OFFLINE.md §5 and the phase-2 plan.
//
// Both holders live here. The server opens a session when the provider is
// unreachable from our side (case B); a till opens one by syncing a sale it
// stamped from its own lease while it had no network (case C, фаза 3). The
// rows, the stamping and the replay are the same — what differs is who chose
// the code and the date, and whether the replay has to wait for a till to
// finish uploading (`ready_at`).
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
import { lastOnlineDeliveredAt, stampOfflineDocument, type Queryable } from '../ledger.js';
import { buildTaxUrl } from '../taxUrl.js';
import type { FiscalContext } from '../shifts.service.js';
import { takeFreeCodes, useLeasedCode } from './pool.js';

export type OfflineSessionStatus = 'open' | 'replaying' | 'closed' | 'stuck';
export type OfflineSessionHolder = 'server' | 'device';

export interface OfflineSessionRow {
  id: number;
  store_id: number;
  cash_register_key: string;
  holder: OfflineSessionHolder;
  device_id: string | null;
  /** The till's own id for the offline stretch these documents came from. */
  client_session_id: string | null;
  /** The till reported an empty queue; null means more of its receipts may still be coming. */
  ready_at: Date | null;
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
  /** The tax-office check link we composed; null when ФН ПРРО is not cached yet. */
  taxUrl: string | null;
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

/**
 * How long a session whose till never came back may block the replay.
 *
 * A till that dies mid-sync would otherwise hold its session open forever —
 * `ready_at` never arrives. After this we replay what we have; a receipt that
 * turns up afterwards opens its own session and the owner settles it by hand.
 */
export const DEVICE_READY_GRACE_MS = 60 * 60 * 1000;

/**
 * The replay's worklist, oldest first. `storeId` narrows it (tests).
 *
 * A session the server holds alone is always ready: nothing else can add to
 * it. One that carries a till's documents waits for that till to say its
 * queue is empty, because `go-offline` fixes the chain's date and a receipt
 * arriving after it would be refused.
 */
export async function listReplayableSessions(
  opts: { storeId?: number; limit?: number } = {}
): Promise<OfflineSessionRow[]> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_offline_sessions
     WHERE status IN ('open', 'replaying')
       AND ($2::bigint IS NULL OR store_id = $2::bigint)
       AND (device_id IS NULL
            OR ready_at IS NOT NULL
            OR updated_at < NOW() - ($3 || ' milliseconds')::interval)
     ORDER BY started_at ASC
     LIMIT $1`,
    [opts.limit ?? 50, opts.storeId ?? null, String(DEVICE_READY_GRACE_MS)]
  );
  return result.rows.map((row) => toRow(row) as OfflineSessionRow);
}

export interface OpenSessionOpts {
  holder: OfflineSessionHolder;
  shiftId: number | null;
  deviceId?: string | null;
  clientSessionId?: string | null;
  /** When the stretch began. Defaults to now — right, when we learn of it as it happens. */
  startedAt?: Date;
  /**
   * Refuse to open without a code for `go-offline` (rolling back).
   *
   * True for the server: the sale has not happened yet, so refusing costs
   * nothing and an unsendable session is worse. False for a till's document:
   * that sale is already rung and printed, and a session with no code parks
   * itself at the replay, which is where the owner can see it.
   */
  requireCode: boolean;
}

/**
 * Open a session for the register, or return the live one.
 *
 * The INSERT and the code for `go-offline` are one transaction: losing the
 * race on the partial unique index rolls the code back into the pool, and an
 * empty pool leaves no half-open session behind. The replay re-checks
 * `started_at` against the ledger before sending `go-offline`.
 */
export async function openSession(
  ctx: FiscalContext,
  opts: OpenSessionOpts
): Promise<OfflineSessionRow> {
  const { holder, shiftId } = opts;
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query('BEGIN');
    inTx = true;
    const inserted = await client.query(
      `INSERT INTO pos_fiscal_offline_sessions
         (store_id, cash_register_key, holder, shift_id, started_at, status,
          device_id, client_session_id)
       VALUES ($1, $2, $4, $3, COALESCE($5::timestamptz, NOW()), 'open', $6, $7)
       ON CONFLICT (store_id, cash_register_key) WHERE status IN ('open', 'replaying') DO NOTHING
       RETURNING *`,
      [
        ctx.storeId,
        ctx.registerKey,
        shiftId,
        holder,
        opts.startedAt ?? null,
        opts.deviceId ?? null,
        opts.clientSessionId ?? null,
      ]
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
    if (!code && opts.requireCode) {
      await client.query('ROLLBACK');
      inTx = false;
      throw new FiscalError('Закінчились офлайн-коди ПРРО', 'offline_codes_exhausted');
    }
    if (!code) {
      // The till already sold on this stretch; there is no undoing that. The
      // replay will fail `go-offline` without a code and park the session,
      // which is the owner's signal to settle it with the provider.
      logger.error('Fiscal offline session opened without a go-offline code', {
        storeId: ctx.storeId,
        sessionId: session.id,
        deviceId: opts.deviceId ?? null,
      });
    }

    const updated = await client.query(
      `UPDATE pos_fiscal_offline_sessions SET go_offline_code = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [session.id, code?.fiscal_code ?? null]
    );
    await client.query('COMMIT');
    inTx = false;
    logger.warn('Fiscal offline session opened', {
      storeId: ctx.storeId,
      sessionId: session.id,
      holder,
      deviceId: opts.deviceId ?? null,
      shiftId,
      startedAt: opts.startedAt ?? null,
      goOfflineCode: code?.fiscal_code ?? null,
    });
    return toRow(updated.rows[0]) as OfflineSessionRow;
  } catch (error) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Case B: the provider is unreachable from here and the sale has not happened yet. */
export function openServerSession(
  ctx: FiscalContext,
  shiftId: number | null
): Promise<OfflineSessionRow> {
  return openSession(ctx, { holder: 'server', shiftId, requireCode: true });
}

/**
 * The latest moment the tax office already knows about for this register.
 *
 * `go-offline` must be dated after it, or the chain goes backwards and the
 * provider refuses — its own warning is that this breaks the register. Four
 * things push it forward: a delivered online receipt, a previous session's
 * `go-online`, a Z-report (which is why a shift that auto-closed while a till
 * was still offline shows up here rather than as a silent corruption), and the
 * opening of the shift the documents will land in.
 *
 * That last one is not a precaution but an observed rule: the sandbox run of
 * 2026-09-12 had a receipt refused with `date.fiscal_date_logic`, "Час
 * фіскалізації чека повинен бути більше ніж час відкриття зміни". A till that
 * stays dark across a shift boundary would otherwise hand us receipts dated
 * before the shift that is open when it reconnects, and every one of them
 * would be refused individually. Parking the session instead puts it in front
 * of the owner once, with a reason.
 */
export async function offlineChainFloor(
  storeId: number,
  registerKey: string
): Promise<Date | null> {
  const [delivered, marks] = await Promise.all([
    lastOnlineDeliveredAt(storeId),
    pool.query(
      `SELECT
         (SELECT MAX(last_go_online_at) FROM pos_fiscal_offline_sessions
          WHERE store_id = $1 AND cash_register_key = $2 AND status = 'closed') AS went_online,
         (SELECT MAX(closed_at) FROM pos_fiscal_shifts
          WHERE store_id = $1 AND cash_register_key = $2 AND status = 'closed') AS shift_closed,
         (SELECT MAX(opened_at) FROM pos_fiscal_shifts
          WHERE store_id = $1 AND cash_register_key = $2
            AND status IN ('opening', 'open', 'closing')) AS shift_opened`,
      [storeId, registerKey]
    ),
  ]);
  const row = marks.rows[0] as {
    went_online: Date | null;
    shift_closed: Date | null;
    shift_opened: Date | null;
  };
  const candidates = [delivered, row?.went_online ?? null, row?.shift_closed ?? null, row?.shift_opened ?? null]
    .filter((at): at is Date => at != null)
    .map((at) => new Date(at))
    .sort((a, b) => b.getTime() - a.getTime());
  return candidates[0] ?? null;
}

export interface DeviceDocumentInput {
  deviceId: string;
  /** The till's id for its offline stretch. */
  clientSessionId: string;
  shiftId: number | null;
  /** The moment the till printed the receipt — its clock, and the document's date. */
  fiscalDate: Date;
}

/**
 * The session a till's offline document belongs to — joining the live one or
 * opening its own.
 *
 * Joining matters: the provider may have gone down while the till was still
 * online (case B), and then the till went down too. Both stretches are one
 * outage for the register, and the replay sends them as one chain in date
 * order. A session already being sent cannot grow — the till retries in a
 * minute, by which time the session is closed and its receipt opens a fresh one.
 */
export async function sessionForDeviceDocument(
  ctx: FiscalContext,
  input: DeviceDocumentInput
): Promise<OfflineSessionRow> {
  const live = await getLiveSession(ctx.storeId, ctx.registerKey);
  if (live) {
    if (live.status !== 'open') {
      throw new FiscalError('ПРРО надсилає офлайн-чеки — повторіть за хвилину', 'replaying');
    }
    // The session now holds a till's documents, so the replay has to wait for
    // that till's queue to drain — including when the session was opened
    // server-side and knows nothing about the till yet.
    const adopted = await pool.query(
      `UPDATE pos_fiscal_offline_sessions SET
         device_id = COALESCE(device_id, $2),
         client_session_id = COALESCE(client_session_id, $3),
         ready_at = NULL,
         updated_at = NOW()
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [live.id, input.deviceId, input.clientSessionId]
    );
    const row = toRow(adopted.rows[0]);
    if (row) return row;
    // It started replaying between the read and the update.
    throw new FiscalError('ПРРО надсилає офлайн-чеки — повторіть за хвилину', 'replaying');
  }

  return openSession(ctx, {
    holder: 'device',
    shiftId: input.shiftId,
    deviceId: input.deviceId,
    clientSessionId: input.clientSessionId,
    startedAt: await deviceSessionStart(ctx, input.fiscalDate),
    requireCode: false,
  });
}

/**
 * When to tell the provider this register went offline.
 *
 * It has to be before the first receipt of the stretch and after everything
 * the tax office already has, and we only learn of the stretch once the till
 * reconnects — so the date is reconstructed rather than observed. A second
 * before the first receipt, nudged forward if that would land on the wrong
 * side of a delivered document. When even the nudge cannot fit between the
 * two, the honest early date stays and the replay parks the session for the
 * owner: pretending otherwise would corrupt the register's chain.
 */
async function deviceSessionStart(ctx: FiscalContext, firstDocAt: Date): Promise<Date> {
  const floor = await offlineChainFloor(ctx.storeId, ctx.registerKey);
  const early = new Date(firstDocAt.getTime() - 1000);
  if (!floor || floor < early) return early;
  const nudged = new Date(floor.getTime() + 1000);
  return nudged <= firstDocAt ? nudged : early;
}

/**
 * The till says its outbox is empty: every receipt it stamped on this stretch
 * is with us, so the replay may start. Cleared again by the next document.
 */
export async function markDeviceReady(
  storeId: number,
  registerKey: string,
  deviceId: string
): Promise<OfflineSessionRow | null> {
  const result = await pool.query(
    `UPDATE pos_fiscal_offline_sessions SET ready_at = COALESCE(ready_at, NOW()), updated_at = NOW()
     WHERE store_id = $1 AND cash_register_key = $2 AND device_id = $3 AND status = 'open'
     RETURNING *`,
    [storeId, registerKey, deviceId]
  );
  return toRow(result.rows[0]);
}

/**
 * Record a document the till stamped itself: its code, its clock, our order.
 *
 * The position (`offline_seq`) is ours even though the till numbered its own
 * receipts — documents of one stretch can arrive interleaved with sales the
 * till rings online while its queue drains, and only the server sees all of
 * them. The replay sends by fiscal date, so the position is a tie-break, not
 * the order itself.
 *
 * Spending the code and stamping the row are one transaction: a code that is
 * not this till's leaves the document unstamped and the sale refused.
 */
export async function stampDeviceNext(
  sessionId: number,
  receiptId: number,
  input: { deviceId: string; fiscalCode: string; fiscalDate: Date }
): Promise<OfflineDocStamp> {
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
    if (session.status !== 'open') {
      throw new FiscalError('ПРРО надсилає офлайн-чеки — повторіть за хвилину', 'replaying');
    }

    const seqRow = await client.query(
      `SELECT COALESCE(MAX(offline_seq), 0) + 1 AS seq
       FROM pos_fiscal_receipts WHERE offline_session_id = $1`,
      [sessionId]
    );
    const seq = Number(seqRow.rows[0].seq);

    const code = await useLeasedCode(
      client,
      session.store_id,
      session.cash_register_key,
      input.deviceId,
      input.fiscalCode,
      receiptId
    );
    if (!code) {
      throw new FiscalError(
        'Код ПРРО не належить цій касі або вже використаний',
        'offline_code_invalid',
        { providerCode: 'offline_code_invalid' }
      );
    }

    const taxUrl = await buildStampTaxUrl(client, {
      receiptId,
      storeId: session.store_id,
      fiscalCode: input.fiscalCode,
      fiscalDate: input.fiscalDate,
    });
    await stampOfflineDocument(client, receiptId, {
      sessionId,
      seq,
      fiscalCode: input.fiscalCode,
      fiscalDate: input.fiscalDate,
      taxUrl,
    });
    await client.query('COMMIT');
    inTx = false;
    return { fiscalCode: input.fiscalCode, fiscalDate: input.fiscalDate, seq, taxUrl };
  } catch (error) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The tax-office QR for a stamp, built here rather than after the replay: the
 * link is the register's number plus what the stamp itself decides
 * (TechDocs/POS_FISCAL_OFFLINE.md — a real receipt verifies without `mac`).
 * The cabinet finds the document only once it is delivered, which is what the
 * «ОФЛАЙН» mark next to the QR is telling the customer.
 */
async function buildStampTaxUrl(
  db: Queryable,
  input: { receiptId: number; storeId: number; fiscalCode: string; fiscalDate: Date }
): Promise<string | null> {
  const totals = await db.query(
    `SELECT total_cents, (SELECT register_fiscal_number FROM pos_fiscal_settings
                          WHERE store_id = $2) AS fn
     FROM pos_fiscal_receipts WHERE id = $1`,
    [input.receiptId, input.storeId]
  );
  const fn = (totals.rows[0]?.fn as string | null) ?? null;
  if (!fn) return null;
  return buildTaxUrl({
    fiscalCode: input.fiscalCode,
    fiscalDate: input.fiscalDate,
    registerFiscalNumber: fn,
    totalCents: Number(totals.rows[0]?.total_cents ?? 0),
  });
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
    const taxUrl = await buildStampTaxUrl(client, {
      receiptId,
      storeId: session.store_id,
      fiscalCode: code.fiscal_code,
      fiscalDate,
    });

    await stampOfflineDocument(client, receiptId, {
      sessionId,
      seq,
      fiscalCode: code.fiscal_code,
      fiscalDate,
      taxUrl,
    });
    await client.query('COMMIT');
    inTx = false;
    return { fiscalCode: code.fiscal_code, fiscalDate, seq, taxUrl };
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
