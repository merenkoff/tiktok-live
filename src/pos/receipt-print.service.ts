// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/receipt-print.service.ts
//
// The queue of receipts to print on the store's «Чеки столів» printer (track
// ДК, decision Д13, TechDocs/POS_DUAL_REGISTER.md): a waiter's tablet has no
// printer, so paying a table's bill asks for the paper (`payBill` stamps
// `print_requested_at`), and the desktop that holds that printer takes the
// jobs, prints each with its own ФОП's requisites and says so.
//
// Rules that are easy to get backwards:
//   * a receipt prints only once its document is registered (`done`) or the
//     store does not fiscalise (`none`) — never a receipt without its fiscal
//     number; one the retry is still working on waits;
//   * taking a job is a lease, not a print: a desktop that took it and did not
//     confirm within two minutes (printer jammed, app closed) gives it back;
//   * a job older than twelve hours is dropped — a receipt nobody printed by
//     closing time is not worth surprising the morning shift with; a phone's
//     receipt lives ten minutes (`print_expires_at`, migration 113): the buyer
//     left with the QR, and a computer switched on after a blackout must not
//     print the afternoon's receipts (the owner's word, 2026-11-23).
//
// A phone (the web or the PWA till, TechDocs/POS_PHONE_TILL.md Т2) asks for
// its receipt with `print_on_till` on the sale, and again — as a copy — with
// `POST /sales/:id/print-request`; `GET /sales/:id/print-status` tells it
// whether the paper came out.

import { pool } from '../db.js';
import { getSale } from './sales.service.js';

const LEASE = `INTERVAL '2 minutes'`;
const MAX_AGE = `INTERVAL '12 hours'`;
const BATCH = 10;
/** How long a receipt asked for from a phone waits for the computer. */
export const PHONE_PRINT_MINUTES = 10;

export type PrintJob = NonNullable<Awaited<ReturnType<typeof getSale>>> & {
  /** Print «КОПІЯ ЧЕКА» on top: the receipt was asked for again. */
  print_copy?: boolean;
};

/** Why a receipt cannot be printed again: said in words, 409. */
export class PrintRefusal extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'PrintRefusal';
  }
}

export interface PrintStatus {
  requested_at: string | null;
  printed_at: string | null;
  expires_at: string | null;
  /**
   * The computer with the printer, which asks for receipts every five seconds
   * while it is on: `online` — it asked within half a minute; `offline` — it
   * did once, not lately (no light?); `none` — none has since the server
   * started, and the phone then says nothing about paper, a store with no
   * computer being the common case. In memory: one replica by design
   * (TechDocs/POS_SINGLE_INSTANCE.md).
   */
  till: 'none' | 'online' | 'offline';
}

const TILL_ONLINE_MS = 30_000;

const tillSeen = new Map<number, number>();

/** A computer with the printer asked for its receipts just now. */
export function noteTillPoll(storeId: number): void {
  tillSeen.set(storeId, Date.now());
}

function tillState(storeId: number): PrintStatus['till'] {
  const at = tillSeen.get(storeId);
  if (at == null) return 'none';
  return Date.now() - at <= TILL_ONLINE_MS ? 'online' : 'offline';
}

/** Tests start from a server that has seen no computer. */
export function forgetTillPollsForTests(): void {
  tillSeen.clear();
}

function iso(value: unknown): string | null {
  return value == null ? null : new Date(value as string).toISOString();
}

/**
 * Put a receipt in the queue (a phone's sale, `print_on_till`). Ten minutes
 * to live; a receipt already queued keeps its job.
 */
export async function queueReceipt(storeId: number, saleId: number): Promise<void> {
  await pool.query(
    `UPDATE pos_sales
        SET print_requested_at = NOW(),
            print_expires_at = NOW() + make_interval(mins => $3)
      WHERE store_id = $1 AND id = $2 AND print_requested_at IS NULL`,
    [storeId, saleId, PHONE_PRINT_MINUTES]
  );
}

/**
 * «Друкувати ще раз» / «Друкувати на касі»: the receipt goes into the queue
 * again — a copy once one has printed. Not for a voided receipt, one with a
 * return (its goods are not the paper's any more, and the return has its own
 * receipt) or a «внесок» toward a debt (no goods at all). Null when the sale
 * is not this store's.
 */
export async function requestReprint(storeId: number, saleId: number): Promise<PrintStatus | null> {
  const found = await pool.query(
    `SELECT s.status, s.debt_prepay_item_id, s.printed_at,
            EXISTS (SELECT 1 FROM pos_refunds r WHERE r.sale_id = s.id) AS refunded
       FROM pos_sales s
      WHERE s.store_id = $1 AND s.id = $2`,
    [storeId, saleId]
  );
  const row = found.rows[0];
  if (!row) return null;
  // A return first: a receipt returned whole is `refunded`, not voided.
  if (row.refunded) throw new PrintRefusal('За цим чеком було повернення — його чек уже не такий, як на папері');
  if (row.status !== 'completed') throw new PrintRefusal('Чек скасовано — друкувати нічого');
  if (row.debt_prepay_item_id != null) throw new PrintRefusal('Внесок за борг не друкується як чек');
  const result = await pool.query(
    `UPDATE pos_sales
        SET print_requested_at = NOW(),
            print_expires_at = NOW() + make_interval(mins => $3),
            print_copy = (printed_at IS NOT NULL OR print_copy),
            printed_at = NULL,
            print_claimed_by = NULL,
            print_claimed_at = NULL
      WHERE store_id = $1 AND id = $2
      RETURNING print_requested_at, printed_at, print_expires_at`,
    [storeId, saleId, PHONE_PRINT_MINUTES]
  );
  const updated = result.rows[0];
  return {
    requested_at: iso(updated.print_requested_at),
    printed_at: iso(updated.printed_at),
    expires_at: iso(updated.print_expires_at),
    till: tillState(storeId),
  };
}

/** Where a receipt's paper stands — what the phone shows under its QR. */
export async function printStatus(storeId: number, saleId: number): Promise<PrintStatus | null> {
  const result = await pool.query(
    `SELECT print_requested_at, printed_at,
            COALESCE(print_expires_at, print_requested_at + ${MAX_AGE}) AS expires_at
       FROM pos_sales
      WHERE store_id = $1 AND id = $2`,
    [storeId, saleId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    requested_at: iso(row.print_requested_at),
    printed_at: iso(row.printed_at),
    expires_at: iso(row.expires_at),
    till: tillState(storeId),
  };
}

/** Take the receipts waiting for this device's printer, oldest first. */
export async function claimPrintJobs(storeId: number, deviceId: string): Promise<PrintJob[]> {
  const claimed = await pool.query(
    `WITH picked AS (
       SELECT id FROM pos_sales
       WHERE store_id = $1
         AND print_requested_at IS NOT NULL
         AND printed_at IS NULL
         AND status = 'completed'
         AND fiscal_status IN ('done', 'none')
         AND COALESCE(print_expires_at, print_requested_at + ${MAX_AGE}) > NOW()
         AND (print_claimed_at IS NULL OR print_claimed_at < NOW() - ${LEASE} OR print_claimed_by = $2)
       ORDER BY id
       LIMIT ${BATCH}
       FOR UPDATE SKIP LOCKED
     )
     UPDATE pos_sales s
        SET print_claimed_by = $2, print_claimed_at = NOW()
       FROM picked
      WHERE s.id = picked.id
     RETURNING s.id, s.print_copy`,
    [storeId, deviceId]
  );
  const rows = claimed.rows
    .map((row) => ({ id: Number(row.id), copy: row.print_copy === true }))
    .sort((a, b) => a.id - b.id);
  const jobs: PrintJob[] = [];
  for (const { id, copy } of rows) {
    const sale = await getSale(storeId, id);
    if (sale) jobs.push(copy ? { ...sale, print_copy: true } : sale);
  }
  return jobs;
}

/** The desktop printed it. Idempotent: a second confirmation changes nothing. */
export async function markPrinted(storeId: number, saleId: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE pos_sales SET printed_at = COALESCE(printed_at, NOW())
     WHERE store_id = $1 AND id = $2 AND print_requested_at IS NOT NULL
     RETURNING id`,
    [storeId, saleId]
  );
  return (result.rowCount ?? 0) > 0;
}
