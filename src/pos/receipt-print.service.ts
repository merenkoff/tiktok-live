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
//     closing time is not worth surprising the morning shift with.

import { pool } from '../db.js';
import { getSale } from './sales.service.js';

const LEASE = `INTERVAL '2 minutes'`;
const MAX_AGE = `INTERVAL '12 hours'`;
const BATCH = 10;

export type PrintJob = NonNullable<Awaited<ReturnType<typeof getSale>>>;

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
         AND print_requested_at > NOW() - ${MAX_AGE}
         AND (print_claimed_at IS NULL OR print_claimed_at < NOW() - ${LEASE} OR print_claimed_by = $2)
       ORDER BY id
       LIMIT ${BATCH}
       FOR UPDATE SKIP LOCKED
     )
     UPDATE pos_sales s
        SET print_claimed_by = $2, print_claimed_at = NOW()
       FROM picked
      WHERE s.id = picked.id
     RETURNING s.id`,
    [storeId, deviceId]
  );
  const ids = claimed.rows.map((row) => Number(row.id)).sort((a, b) => a - b);
  const jobs: PrintJob[] = [];
  for (const id of ids) {
    const sale = await getSale(storeId, id);
    if (sale) jobs.push(sale);
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
