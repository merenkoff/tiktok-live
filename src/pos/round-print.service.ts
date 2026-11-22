// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/round-print.service.ts
//
// The print queue of a table's rounds (TechDocs/POS_TABLES.md §11, «Друк
// раундів»; migration 109). A round is fired from a waiter's tablet, the bar's
// till or a guest's phone — none of them where the kitchen's printer is — so
// `fireRoundTx` leaves a job per station, and the desktop whose «Обладнання»
// holds that station's printer takes it, prints the ticket and says so.
//
// The same rules as the «Чеки столів» queue (`receipt-print.service.ts`):
//   * taking a job is a lease, not a print: a desktop that took it and did not
//     confirm within two minutes (printer jammed, app closed) gives it back;
//   * a job older than twelve hours is dropped — yesterday's dinner is not
//     worth surprising the morning cook with;
// and three of its own:
//   * a round cancelled before it printed is never printed;
//   * one cancelled after its ticket was printed or taken leaves a second job,
//     `kind = 'cancel'` (migration 110), printed as «СКАСОВАНО» with its lines;
//   * the ticket carries no prices: it is not a receipt.

import { pool } from '../db.js';
import { authorName } from './guest-author.js';
import { STATIONS_SQL } from './kitchen.service.js';
import { parseLineModifierSnapshot } from './modifiers.service.js';
import type { TagStation } from './tags.service.js';

/** How long a taken job stays the desktop's before it is handed out again. */
export const ROUND_PRINT_LEASE = `INTERVAL '2 minutes'`;
const LEASE = ROUND_PRINT_LEASE;
const MAX_AGE = `INTERVAL '12 hours'`;
const BATCH = 10;

export const ROUND_PRINT_STATIONS: readonly TagStation[] = ['kitchen', 'bar'];

export function isRoundPrintStation(value: unknown): value is TagStation {
  return value === 'kitchen' || value === 'bar';
}

/** The ticket that fires a round, or the one that takes it back. */
export type RoundPrintKind = 'fire' | 'cancel';

export function isRoundPrintKind(value: unknown): value is RoundPrintKind {
  return value === 'fire' || value === 'cancel';
}

export interface RoundPrintItem {
  product_name: string;
  /** The caption the round fixed — «M · вівсяне»; the till prints the answers apart. */
  variant_label: string;
  quantity: number;
  /** The answers, by name, as the round fixed them. */
  modifiers: string[];
  note: string | null;
}

export interface RoundPrintJob {
  round_id: number;
  /** `cancel`: print «СКАСОВАНО» — the kitchen already has this round on paper. */
  kind: RoundPrintKind;
  /** Which station's printer the ticket goes to. */
  station: TagStation;
  /** The ticket's heading — null when the store routes nothing by station. */
  heading: TagStation | null;
  table_name: string;
  hall_name: string;
  round_seq: number;
  fired_at: string;
  /** Who fired it, or «Гість · QR-меню». */
  staff_name: string;
  /** The bill's own note. */
  note: string | null;
  items: RoundPrintItem[];
}

/**
 * Take the round tickets waiting for this device's stations, oldest first.
 * `kinds` is what the desktop can print: a desktop before 2.9.3 asks for none
 * and gets only `fire` — it would print a `cancel` job as one more order.
 */
export async function claimRoundPrintJobs(
  storeId: number,
  deviceId: string,
  stations: readonly TagStation[],
  kinds: readonly RoundPrintKind[] = ['fire']
): Promise<RoundPrintJob[]> {
  if (stations.length === 0 || kinds.length === 0) return [];
  const claimed = await pool.query(
    `WITH picked AS (
       SELECT p.round_id, p.station, p.kind FROM pos_round_prints p
       JOIN pos_bill_rounds r ON r.id = p.round_id
       WHERE p.store_id = $1
         AND p.station = ANY($3::text[])
         AND p.kind = ANY($4::text[])
         AND p.printed_at IS NULL
         AND ((p.kind = 'fire' AND r.cancelled_at IS NULL)
           OR (p.kind = 'cancel' AND r.cancelled_at IS NOT NULL))
         AND p.requested_at > NOW() - ${MAX_AGE}
         AND (p.claimed_at IS NULL OR p.claimed_at < NOW() - ${LEASE} OR p.claimed_by = $2)
       ORDER BY p.requested_at, p.round_id, p.station, p.kind DESC
       LIMIT ${BATCH}
       FOR UPDATE OF p SKIP LOCKED
     )
     UPDATE pos_round_prints p
        SET claimed_by = $2, claimed_at = NOW()
       FROM picked
      WHERE p.round_id = picked.round_id AND p.station = picked.station AND p.kind = picked.kind
     RETURNING p.round_id, p.station, p.kind, p.requested_at`,
    [storeId, deviceId, stations, kinds]
  );
  if (claimed.rows.length === 0) return [];
  // RETURNING follows no ORDER BY: put a round's fire before its cancel.
  claimed.rows.sort(
    (a, b) =>
      new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime() ||
      Number(a.round_id) - Number(b.round_id) ||
      String(a.station).localeCompare(String(b.station)) ||
      (a.kind === b.kind ? 0 : a.kind === 'fire' ? -1 : 1)
  );

  const roundIds = [...new Set(claimed.rows.map((row) => Number(row.round_id)))];
  const heads = await pool.query(
    `SELECT r.id, r.seq, r.fired_at, r.fired_by_guest, b.note,
            t.name AS table_name, h.name AS hall_name, st.display_name AS staff_name
       FROM pos_bill_rounds r
       JOIN pos_bills b ON b.id = r.bill_id
       JOIN pos_tables t ON t.id = b.table_id
       JOIN pos_halls h ON h.id = t.hall_id
       LEFT JOIN pos_staff st ON st.id = r.fired_by
      WHERE r.store_id = $1 AND r.id = ANY($2::bigint[])`,
    [storeId, roundIds]
  );
  const headById = new Map(heads.rows.map((row) => [Number(row.id), row]));

  const lines = await pool.query(
    `SELECT i.round_id, i.product_name, i.variant_label, i.quantity, i.note, i.modifiers,
            ${STATIONS_SQL} AS stations
       FROM pos_bill_items i
      WHERE i.round_id = ANY($1::bigint[])
      ORDER BY i.round_id, i.sort_order, i.id`,
    [roundIds]
  );
  const stationsNamed = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM pos_tags WHERE store_id = $1 AND station IS NOT NULL) AS named`,
    [storeId]
  );
  const routed = stationsNamed.rows[0]?.named === true;

  const jobs: RoundPrintJob[] = [];
  for (const row of claimed.rows) {
    const roundId = Number(row.round_id);
    const station = row.station as TagStation;
    const head = headById.get(roundId);
    if (!head) continue;
    const items: RoundPrintItem[] = [];
    for (const line of lines.rows) {
      if (Number(line.round_id) !== roundId) continue;
      // The same rule the job was queued by: a line with no station is the
      // kitchen's; a store without stations prints every line on one ticket.
      const lineStations = (Array.isArray(line.stations) ? line.stations : []).filter(isRoundPrintStation);
      const at = lineStations.length > 0 ? lineStations : ['kitchen'];
      if (routed && !at.includes(station)) continue;
      const note = typeof line.note === 'string' && line.note.trim() ? line.note.trim() : null;
      items.push({
        product_name: String(line.product_name ?? ''),
        variant_label: String(line.variant_label ?? ''),
        quantity: Number(line.quantity),
        modifiers: parseLineModifierSnapshot(line.modifiers).map((m) => m.name),
        note,
      });
    }
    jobs.push({
      round_id: roundId,
      kind: row.kind === 'cancel' ? 'cancel' : 'fire',
      station,
      heading: routed ? station : null,
      table_name: String(head.table_name),
      hall_name: String(head.hall_name ?? ''),
      round_seq: Number(head.seq),
      fired_at: new Date(head.fired_at as string).toISOString(),
      staff_name: authorName(head.staff_name, head.fired_by_guest),
      note: typeof head.note === 'string' && head.note.trim() ? head.note.trim() : null,
      items,
    });
  }
  return jobs;
}

/**
 * The desktop printed it. Idempotent: a second confirmation changes nothing.
 * `kind` defaults to `fire`, which is all a desktop before 2.9.3 confirms.
 */
export async function markRoundPrinted(
  storeId: number,
  roundId: number,
  station: TagStation,
  kind: RoundPrintKind = 'fire'
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE pos_round_prints SET printed_at = COALESCE(printed_at, NOW())
      WHERE store_id = $1 AND round_id = $2 AND station = $3 AND kind = $4
     RETURNING round_id`,
    [storeId, roundId, station, kind]
  );
  return (result.rowCount ?? 0) > 0;
}
