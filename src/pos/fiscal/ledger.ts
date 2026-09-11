// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/ledger.ts
//
// Every write to `pos_fiscal_receipts`, and every write to the `fiscal_status`
// projection on `pos_sales` / `pos_refunds`. Nothing else touches either.
//
// Why this is its own file rather than part of `fiscal.service.ts`: `closeShift`
// (`shifts.service.ts`) has to abandon the documents of the shift it is closing,
// and `fiscal.service.ts` imports `shifts.service.ts`. Putting the sweep here
// keeps that a tree instead of a cycle.
//
// **`'sent'` is never written.** The status exists in the CHECK constraint and
// stays there (dropping it would need a migration for nothing), but no code
// path produces it. Nobody branches on it; it relabels the crash window rather
// than closing it; and the same information is already free, because `attempts`
// is incremented *before* the provider call — so `status='pending' AND
// attempts>0` IS the crash-window marker. As an ownership flag it would be a
// bug: a status has no expiry, so a worker that dies mid-flight would strand
// the row forever, whereas `next_attempt_at` works as a self-healing lease.

import { pool } from '../../db.js';
import type { PoolClient } from 'pg';
import type { FiscalError } from './errors.js';
import type { FiscalResult } from './types.js';

/** The pool or a checked-out client — for writes that must join a caller's transaction. */
export type Queryable = Pick<PoolClient, 'query'>;

/** Attempts before a document is given up on and handed to the owner. */
export const MAX_ATTEMPTS = 8;

/** How long a claimed document is considered owned by a worker. */
const LEASE_MS = 90_000;

/** Cap on the exponential backoff between retries. */
const MAX_BACKOFF_SEC = 900;

export type FiscalDocType = 'sale' | 'refund' | 'service_in' | 'service_out';
export type FiscalLedgerStatus = 'pending' | 'sent' | 'done' | 'failed' | 'abandoned';
/** `online` = sent live; `offline` = stamped with a tax-office code, sent on session replay. */
export type FiscalDocMode = 'online' | 'offline';

/** The projection's vocabulary — deliberately smaller than the ledger's. */
export type FiscalProjection = 'none' | 'pending' | 'done' | 'failed';

export interface FiscalReceiptRow {
  id: number;
  store_id: number;
  doc_type: FiscalDocType;
  sale_id: number | null;
  refund_id: number | null;
  shift_id: number | null;
  provider: string;
  status: FiscalLedgerStatus;
  provider_request_id: string;
  provider_doc_id: string | null;
  fiscal_code: string | null;
  fiscal_date: Date | null;
  attempts: number;
  next_attempt_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  total_cents: number;
  mode: FiscalDocMode;
  offline_session_id: number | null;
  offline_seq: number | null;
  control_number: string | null;
  created_at: Date;
}

/**
 * The ledger has five states, the projection four.
 *
 * `pos_sales.fiscal_status` has no `'abandoned'` — its CHECK constraint allows
 * only `none|pending|done|failed` (migration 024). A naive
 * `SET fiscal_status = <ledger status>` is therefore a runtime CHECK violation
 * inside the sweep, in production. This mapping is the single place that
 * collapses the two vocabularies.
 */
export function projectionFor(status: FiscalLedgerStatus): FiscalProjection {
  switch (status) {
    case 'done':
      return 'done';
    case 'failed':
    case 'abandoned':
      return 'failed';
    default:
      return 'pending';
  }
}

/** Which table carries the projection for this document kind. */
function projectionTarget(row: {
  doc_type: FiscalDocType;
  sale_id: number | null;
  refund_id: number | null;
}): { table: 'pos_sales' | 'pos_refunds'; id: number } | null {
  if (row.doc_type === 'sale' && row.sale_id != null) {
    return { table: 'pos_sales', id: Number(row.sale_id) };
  }
  if (row.doc_type === 'refund' && row.refund_id != null) {
    return { table: 'pos_refunds', id: Number(row.refund_id) };
  }
  // Service receipts have no parent document, so nothing to project onto.
  return null;
}

function backoffSeconds(attempts: number): number {
  const base = Math.min(2 ** attempts, MAX_BACKOFF_SEC);
  // ±20% jitter so a provider outage doesn't produce a synchronised thundering
  // herd across every store when it recovers.
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export interface OpenDocumentInput {
  storeId: number;
  docType: FiscalDocType;
  saleId?: number | null;
  refundId?: number | null;
  shiftId?: number | null;
  provider: string;
  requestId: string;
  totalCents: number;
  requestPayload?: unknown;
  /** `offline` rows get their stamp from `stampOfflineDocument` and are never claimed by the retry pass. */
  mode?: FiscalDocMode;
}

/**
 * T1 — create the ledger row immediately before the provider call.
 *
 * `attempts` starts at 1, not 0: it counts *transmissions attempted*, and it is
 * written before the call precisely so a document that reliably kills the
 * process still burns its budget and gets abandoned, instead of looping.
 *
 * The projection is already `'pending'` — `completeSale`/`refundSale` wrote it
 * inside their own transaction, which is what makes a crash in the window
 * between COMMIT and this INSERT recoverable (the orphan-adoption pass).
 */
export async function openDocument(input: OpenDocumentInput): Promise<FiscalReceiptRow> {
  const result = await pool.query(
    `INSERT INTO pos_fiscal_receipts
       (store_id, doc_type, sale_id, refund_id, shift_id, provider, status,
        provider_request_id, total_cents, attempts, next_attempt_at, request_payload, mode)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, 1,
             NOW() + ($9 || ' milliseconds')::interval, $10::jsonb, $11)
     ON CONFLICT (store_id, provider_request_id) DO UPDATE SET
       attempts = pos_fiscal_receipts.attempts + 1,
       next_attempt_at = NOW() + ($9 || ' milliseconds')::interval,
       updated_at = NOW()
     RETURNING *`,
    [
      input.storeId,
      input.docType,
      input.saleId ?? null,
      input.refundId ?? null,
      input.shiftId ?? null,
      input.provider,
      input.requestId,
      input.totalCents,
      String(LEASE_MS),
      input.requestPayload === undefined ? null : JSON.stringify(input.requestPayload),
      input.mode ?? 'online',
    ]
  );
  return result.rows[0] as FiscalReceiptRow;
}

export interface OfflineDocumentStamp {
  sessionId: number;
  seq: number;
  fiscalCode: string;
  fiscalDate: Date;
}

/**
 * T1b — the offline stamp: the tax-office code IS the receipt's fiscal number,
 * the date is ours, and the position in the session fixes the replay order.
 *
 * Runs on the caller's client because the session takes the code in the same
 * transaction (`offline/session.ts`). `next_attempt_at` is cleared: the flat
 * retry pass must never pick this row up — the session replay sends it, in
 * order, after `go-offline`.
 */
export async function stampOfflineDocument(
  db: Queryable,
  rowId: number,
  stamp: OfflineDocumentStamp
): Promise<FiscalReceiptRow> {
  const result = await db.query(
    `UPDATE pos_fiscal_receipts SET
       mode = 'offline',
       offline_session_id = $2,
       offline_seq = $3,
       fiscal_code = $4,
       fiscal_date = $5::timestamptz,
       next_attempt_at = NULL,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [rowId, stamp.sessionId, stamp.seq, stamp.fiscalCode, stamp.fiscalDate]
  );
  return result.rows[0] as FiscalReceiptRow;
}

/** Every document of an offline session, in replay order. */
export async function listSessionDocuments(sessionId: number): Promise<FiscalReceiptRow[]> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_receipts
     WHERE offline_session_id = $1
     ORDER BY offline_seq ASC, id ASC`,
    [sessionId]
  );
  return result.rows as FiscalReceiptRow[];
}

/** The provider's id of the last document the session got through — the next one's `previousDocId`. */
export async function lastDoneProviderDocId(sessionId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT provider_doc_id FROM pos_fiscal_receipts
     WHERE offline_session_id = $1 AND status = 'done' AND provider_doc_id IS NOT NULL
     ORDER BY offline_seq DESC, id DESC
     LIMIT 1`,
    [sessionId]
  );
  return (result.rows[0]?.provider_doc_id as string | undefined) ?? null;
}

async function setProjection(
  client: PoolClient,
  row: Pick<FiscalReceiptRow, 'doc_type' | 'sale_id' | 'refund_id'>,
  status: FiscalLedgerStatus
): Promise<void> {
  const target = projectionTarget(row);
  if (!target) return;
  await client.query(
    `UPDATE ${target.table} SET fiscal_status = $2 WHERE id = $1`,
    [target.id, projectionFor(status)]
  );
}

/**
 * T2 — the provider accepted the document (directly, or via `duplicate` →
 * `fetchDocument`).
 *
 * **No status guard.** If the shift-close sweep abandoned this row while the
 * call was in flight and the provider then accepted it, `done` must win: the
 * receipt exists at the tax service, and the ledger has to say so.
 */
export async function markDone(
  row: FiscalReceiptRow,
  result: FiscalResult
): Promise<FiscalReceiptRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE pos_fiscal_receipts SET
         status = 'done',
         provider_doc_id = $2,
         fiscal_code = $3,
         fiscal_date = $4::timestamptz,
         tax_url = $5,
         qr_payload = $6,
         receipt_text = $7,
         vat_cents = $8,
         response_payload = $9::jsonb,
         control_number = COALESCE($10, control_number),
         next_attempt_at = NULL,
         error_code = NULL,
         error_message = NULL,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        row.id,
        result.providerDocId,
        result.fiscalCode,
        result.fiscalDate,
        result.taxUrl,
        result.qrPayload,
        result.receiptText,
        result.vatCents,
        JSON.stringify(result.raw ?? null),
        result.controlNumber ?? null,
      ]
    );
    await setProjection(client, row, 'done');
    await client.query('COMMIT');
    return updated.rows[0] as FiscalReceiptRow;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface MarkFailedOptions {
  /** Learned from a `duplicate` answer; makes the next attempt a GET, not a POST. */
  providerDocId?: string | null;
  /** Terminal kinds park with no `next_attempt_at`; they need a human. */
  park?: boolean;
}

/** T3 — the attempt failed. Schedules a retry unless parked or out of budget. */
export async function markFailed(
  row: FiscalReceiptRow,
  error: FiscalError,
  opts: MarkFailedOptions = {}
): Promise<FiscalReceiptRow> {
  const outOfBudget = row.attempts >= MAX_ATTEMPTS;
  const status: FiscalLedgerStatus = outOfBudget ? 'abandoned' : 'failed';
  const park = opts.park || outOfBudget;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE pos_fiscal_receipts SET
         status = $2,
         error_code = $3,
         error_message = $4,
         provider_doc_id = COALESCE($5, provider_doc_id),
         next_attempt_at = CASE WHEN $6::boolean THEN NULL
                                ELSE NOW() + ($7 || ' seconds')::interval END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        row.id,
        status,
        error.providerCode ?? error.kind,
        error.message.slice(0, 500),
        opts.providerDocId ?? null,
        park,
        String(backoffSeconds(row.attempts)),
      ]
    );
    await setProjection(client, row, status);
    await client.query('COMMIT');
    return updated.rows[0] as FiscalReceiptRow;
  } catch (dbError) {
    await client.query('ROLLBACK');
    throw dbError;
  } finally {
    client.release();
  }
}

/**
 * T4 — the sale this document belonged to was voided, so the document is moot.
 *
 * The projection stays `'failed'` (there is no `'abandoned'` there), which is
 * accurate: this sale was never fiscalised.
 */
export async function markAbandoned(
  rowId: number,
  reason: string,
  message: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE pos_fiscal_receipts SET
         status = 'abandoned', error_code = $2, error_message = $3,
         next_attempt_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'sent', 'failed')
       RETURNING doc_type, sale_id, refund_id`,
      [rowId, reason, message.slice(0, 500)]
    );
    if (updated.rows.length > 0) {
      await setProjection(client, updated.rows[0], 'abandoned');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Re-point a row at a different shift — used when a recovery reopened one. */
export async function restampShift(rowId: number, shiftId: number): Promise<void> {
  await pool.query(
    `UPDATE pos_fiscal_receipts SET shift_id = $2, updated_at = NOW() WHERE id = $1`,
    [rowId, shiftId]
  );
}

/**
 * T5 — every unfinished document of a shift, when that shift closes.
 *
 * This is what bounds the retry window. A ПРРО receipt belongs to its shift and
 * the Z-report sums that shift's receipts, so a document fiscalised after the
 * Z-report corrupts both. Once the shift is gone the document can never be
 * registered correctly; it becomes the owner's problem instead.
 */
export async function abandonShiftDocs(shiftId: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `UPDATE pos_fiscal_receipts SET
         status = 'abandoned',
         error_code = COALESCE(error_code, 'shift_closed'),
         error_message = COALESCE(error_message, 'Зміну закрито до фіскалізації документа'),
         next_attempt_at = NULL,
         updated_at = NOW()
       WHERE shift_id = $1 AND status IN ('pending', 'sent', 'failed')
       RETURNING doc_type, sale_id, refund_id`,
      [shiftId]
    );
    for (const row of rows.rows) {
      await setProjection(client, row, 'abandoned');
    }
    await client.query('COMMIT');
    return rows.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * T6, the backstops — documents no shift close will ever collect.
 *
 * `closeDueShifts` can park a shift in `'error'` without calling `closeShift`
 * (fiscalisation switched off, credentials rejected), and its documents are
 * then invisible to the sweep. The age net is what makes "every non-`done` row
 * has a bounded life" actually true rather than aspirational.
 *
 * Offline documents of a live session are exempt: they legitimately wait
 * hours for the provider to come back, and the session (36h limit, `stuck`)
 * bounds their life instead.
 */
export async function abandonStaleDocs(olderThanMs: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `UPDATE pos_fiscal_receipts r SET
         status = 'abandoned',
         error_code = COALESCE(error_code, 'stale'),
         error_message = COALESCE(error_message, 'Документ не фіскалізовано вчасно'),
         next_attempt_at = NULL,
         updated_at = NOW()
       WHERE r.status IN ('pending', 'sent', 'failed')
         AND r.created_at < NOW() - ($1 || ' milliseconds')::interval
         AND NOT EXISTS (
           SELECT 1 FROM pos_fiscal_offline_sessions os
           WHERE os.id = r.offline_session_id AND os.status IN ('open', 'replaying')
         )
       RETURNING r.doc_type, r.sale_id, r.refund_id`,
      [String(olderThanMs)]
    );
    for (const row of rows.rows) {
      await setProjection(client, row, 'abandoned');
    }
    await client.query('COMMIT');
    return rows.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * T6 — documents whose sale was voided after the row was written.
 *
 * `abortSale` voids first and abandons second (the reverse would strand a live
 * sale as abandoned). A crash in between leaves a voided sale carrying a
 * perfectly claimable `failed` row — and two minutes later the cron would send
 * the tax service a receipt for a sale whose stock has already been returned.
 */
export async function abandonVoidedSaleDocs(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `UPDATE pos_fiscal_receipts r SET
         status = 'abandoned',
         error_code = 'sale_voided',
         error_message = 'Продаж скасовано',
         next_attempt_at = NULL,
         updated_at = NOW()
       FROM pos_sales s
       WHERE r.sale_id = s.id
         AND r.doc_type = 'sale'
         AND r.status IN ('pending', 'sent', 'failed')
         AND s.status = 'voided'
       RETURNING r.doc_type, r.sale_id, r.refund_id`,
      []
    );
    for (const row of rows.rows) {
      await setProjection(client, row, 'abandoned');
    }
    await client.query('COMMIT');
    return rows.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Claim due documents for a retry pass.
 *
 * `FOR UPDATE ... SKIP LOCKED` on the ledger row only (`OF r`): Postgres cannot
 * lock the nullable side of an outer join. The claim bumps `attempts` and
 * re-leases, so an overlapping cron tick sees nothing to do.
 */
export async function claimDueDocuments(limit: number): Promise<FiscalReceiptRow[]> {
  const result = await pool.query(
    `UPDATE pos_fiscal_receipts SET
       attempts = attempts + 1,
       next_attempt_at = NOW() + ($2 || ' milliseconds')::interval,
       updated_at = NOW()
     WHERE id IN (
       SELECT r.id FROM pos_fiscal_receipts r
       LEFT JOIN pos_sales s ON s.id = r.sale_id
       WHERE r.status IN ('pending', 'failed')
         AND r.next_attempt_at IS NOT NULL
         AND r.next_attempt_at < NOW()
         AND r.attempts < $3
         -- Offline documents are sent by the session replay, in order.
         AND r.mode = 'online'
         -- Never re-send a document whose sale has been voided.
         AND (r.sale_id IS NULL OR s.status <> 'voided')
       ORDER BY r.next_attempt_at ASC
       FOR UPDATE OF r SKIP LOCKED
       LIMIT $1
     )
     RETURNING *`,
    [limit, String(LEASE_MS), MAX_ATTEMPTS]
  );
  return result.rows as FiscalReceiptRow[];
}

/** The ledger row for a sale, if any. */
export async function getSaleDocument(saleId: number): Promise<FiscalReceiptRow | null> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_receipts WHERE sale_id = $1 AND doc_type = 'sale'`,
    [saleId]
  );
  return (result.rows[0] as FiscalReceiptRow) ?? null;
}

export interface AttentionDoc {
  id: number;
  doc_type: FiscalDocType;
  sale_id: number | null;
  refund_id: number | null;
  receipt_number: string | null;
  total_cents: number;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  created_at: Date;
}

/** Documents that will never resolve themselves — the owner's worklist. */
export async function listAttentionDocs(
  storeId: number,
  limit = 100
): Promise<AttentionDoc[]> {
  const result = await pool.query(
    `SELECT r.id, r.doc_type, r.sale_id, r.refund_id, r.total_cents,
            r.error_code, r.error_message, r.attempts, r.created_at,
            COALESCE(s.receipt_number, rf.refund_number) AS receipt_number
     FROM pos_fiscal_receipts r
     LEFT JOIN pos_sales s ON s.id = r.sale_id
     LEFT JOIN pos_refunds rf ON rf.id = r.refund_id
     WHERE r.store_id = $1
       AND (r.status = 'abandoned' OR (r.status = 'failed' AND r.next_attempt_at IS NULL))
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [storeId, limit]
  );
  return result.rows as AttentionDoc[];
}
