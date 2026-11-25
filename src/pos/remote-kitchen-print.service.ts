// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/remote-kitchen-print.service.ts
//
// The kitchen's paper for a cafe's paid order (РК3, TechDocs/POS_REMOTE_KITCHEN.md
// §7.2; table `pos_remote_order_prints` in migration 117). The cafe pays at its
// own till, which is nowhere near the kitchen's printer, so the payment leaves
// a job and the kitchen's desktop takes it, prints it and says so — the rules
// of the round queue (`round-print.service.ts`), kept apart because a remote
// order is not a table's round:
//   * taking a job is a two-minute lease, not a print;
//   * a job older than twelve hours is dropped;
//   * an order cancelled before its ticket was taken is never printed, and
//     one cancelled after leaves a `cancel` job, printed as «СКАСОВАНО»;
//   * one ticket per order, the kitchen's station: a dark kitchen cooks
//     everything it is asked, and the bar is the cafe's;
//   * no prices: it is not a receipt.

import { pool } from '../db.js';
import { parseLineModifierSnapshot } from './modifiers.service.js';

type DbClient = { query: typeof pool.query };

const LEASE = `INTERVAL '2 minutes'`;
const MAX_AGE = `INTERVAL '12 hours'`;
const BATCH = 10;

export type RemotePrintKind = 'fire' | 'cancel';

export function isRemotePrintKind(value: unknown): value is RemotePrintKind {
  return value === 'fire' || value === 'cancel';
}

export interface RemotePrintItem {
  product_name: string;
  variant_label: string;
  quantity: number;
  /** The answers, by name, as the cafe's till fixed them. */
  modifiers: string[];
  note: string | null;
}

export interface RemotePrintJob {
  remote_order_id: number;
  kind: RemotePrintKind;
  /** The kitchen's own daily number, «П-12». */
  order_no: number | null;
  cafe_name: string;
  guest_label: string | null;
  note: string | null;
  paid_at: string;
  /** When the guest was told it would be there. */
  promised_at: string | null;
  items: RemotePrintItem[];
}

/** The payment: one ticket for the kitchen. Re-paying the same order queues nothing twice. */
export async function queueRemoteFireTx(client: DbClient, kitchenStoreId: number, orderId: number): Promise<void> {
  await client.query(
    `INSERT INTO pos_remote_order_prints (store_id, remote_order_id, kind)
     VALUES ($1, $2, 'fire')
     ON CONFLICT (remote_order_id, kind) DO NOTHING`,
    [kitchenStoreId, orderId]
  );
}

/**
 * The order was cancelled. A ticket nobody took yet simply never prints (the
 * claim skips cancelled orders); one already on paper — or in a desktop's
 * hands — gets its «СКАСОВАНО».
 */
export async function queueRemoteCancelTx(client: DbClient, kitchenStoreId: number, orderId: number): Promise<void> {
  await client.query(
    `INSERT INTO pos_remote_order_prints (store_id, remote_order_id, kind)
     SELECT $1, $2, 'cancel'
      WHERE EXISTS (
        SELECT 1 FROM pos_remote_order_prints
         WHERE remote_order_id = $2 AND kind = 'fire'
           AND (printed_at IS NOT NULL OR claimed_at > NOW() - ${LEASE}))
     ON CONFLICT (remote_order_id, kind) DO NOTHING`,
    [kitchenStoreId, orderId]
  );
}

/** Take the tickets waiting for this kitchen, oldest first; a fire before its cancel. */
export async function claimRemotePrintJobs(
  storeId: number,
  deviceId: string,
  kinds: readonly RemotePrintKind[] = ['fire', 'cancel']
): Promise<RemotePrintJob[]> {
  if (kinds.length === 0) return [];
  const claimed = await pool.query(
    `WITH picked AS (
       SELECT p.remote_order_id, p.kind FROM pos_remote_order_prints p
       JOIN pos_remote_orders o ON o.id = p.remote_order_id
       WHERE p.store_id = $1
         AND p.kind = ANY($3::text[])
         AND p.printed_at IS NULL
         AND ((p.kind = 'fire' AND o.status <> 'cancelled')
           OR (p.kind = 'cancel' AND o.status = 'cancelled'))
         AND p.requested_at > NOW() - ${MAX_AGE}
         AND (p.claimed_at IS NULL OR p.claimed_at < NOW() - ${LEASE} OR p.claimed_by = $2)
       ORDER BY p.requested_at, p.remote_order_id, p.kind DESC
       LIMIT ${BATCH}
       FOR UPDATE OF p SKIP LOCKED
     )
     UPDATE pos_remote_order_prints p
        SET claimed_by = $2, claimed_at = NOW()
       FROM picked
      WHERE p.remote_order_id = picked.remote_order_id AND p.kind = picked.kind
     RETURNING p.remote_order_id, p.kind, p.requested_at`,
    [storeId, deviceId, kinds]
  );
  if (claimed.rows.length === 0) return [];
  claimed.rows.sort(
    (a, b) =>
      new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime() ||
      Number(a.remote_order_id) - Number(b.remote_order_id) ||
      (a.kind === b.kind ? 0 : a.kind === 'fire' ? -1 : 1)
  );

  const orderIds = [...new Set(claimed.rows.map((row) => Number(row.remote_order_id)))];
  const heads = await pool.query(
    `SELECT o.id, o.order_no, o.guest_label, o.note, o.paid_at, o.requested_at, o.promised_at,
            cs.name AS cafe_name
       FROM pos_remote_orders o
       JOIN pos_stores cs ON cs.id = o.cafe_store_id
      WHERE o.kitchen_store_id = $1 AND o.id = ANY($2::bigint[])`,
    [storeId, orderIds]
  );
  const headById = new Map(heads.rows.map((row) => [Number(row.id), row]));
  const lines = await pool.query(
    `SELECT remote_order_id, product_name, variant_label, quantity, note, modifiers
       FROM pos_remote_order_items
      WHERE remote_order_id = ANY($1::bigint[])
      ORDER BY remote_order_id, sort_order, id`,
    [orderIds]
  );

  const jobs: RemotePrintJob[] = [];
  for (const row of claimed.rows) {
    const orderId = Number(row.remote_order_id);
    const head = headById.get(orderId);
    if (!head) continue;
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    jobs.push({
      remote_order_id: orderId,
      kind: row.kind === 'cancel' ? 'cancel' : 'fire',
      order_no: head.order_no == null ? null : Number(head.order_no),
      cafe_name: String(head.cafe_name ?? ''),
      guest_label: text(head.guest_label),
      note: text(head.note),
      paid_at: new Date((head.paid_at ?? head.requested_at) as string).toISOString(),
      promised_at: head.promised_at == null ? null : new Date(head.promised_at as string).toISOString(),
      items: lines.rows
        .filter((line) => Number(line.remote_order_id) === orderId)
        .map((line) => ({
          product_name: String(line.product_name ?? ''),
          variant_label: String(line.variant_label ?? ''),
          quantity: Number(line.quantity),
          modifiers: parseLineModifierSnapshot(line.modifiers).map((m) => m.name),
          note: text(line.note),
        })),
    });
  }
  return jobs;
}

/** The desktop printed it. Idempotent. */
export async function markRemotePrinted(storeId: number, orderId: number, kind: RemotePrintKind): Promise<boolean> {
  const result = await pool.query(
    `UPDATE pos_remote_order_prints SET printed_at = COALESCE(printed_at, NOW())
      WHERE store_id = $1 AND remote_order_id = $2 AND kind = $3
     RETURNING remote_order_id`,
    [storeId, orderId, kind]
  );
  return (result.rowCount ?? 0) > 0;
}
