// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/waiter-calls.service.ts — a guest at a table calls a waiter or asks
// for the bill from the QR menu (TechDocs/POS_QR_MENU.md, phase Q8; migration
// 068). A call carries no dishes and no money: it is «somebody, come to table
// 5», answered by a waiter's «Іду».
//
// Two audiences, like `guest-orders.service.ts`:
//
//   the GUEST (no login; the route has already checked the store token, the
//   owner's switch, the table and its key) — call, look, cancel;
//   the WAITER (`ensurePosAuth`) — what is live, «Іду».
//
// Rules that are easy to get wrong:
//
// - One live call per (table, kind). The partial unique index in 068 makes a
//   double tap — or the whole table tapping at once — one call, with no lock:
//   the loser of the race reads the winner's row.
// - A call lives CALL_TTL_MINUTES. After that the guest is told nobody came and
//   may call again; the waiter's screen drops it.
// - After a waiter answered, the same table may call again only after
//   RECALL_COOLDOWN_MS — in memory, per process, keyed by table (the API runs
//   one replica, TechDocs/POS_SINGLE_INSTANCE.md; there is no usable IP).
//   Without it a bored child presses «Покликати» the moment the waiter turns
//   away, all evening.
// - A guest sees only their own table's calls, and nothing of the waiter.

import { pool } from '../db.js';
import type { MenuTable } from './public-menu/menu.service.js';

export class WaiterCallError extends Error {}
export class WaiterCallNotFound extends WaiterCallError {}
/** 409: the call is no longer live (the guest cancelled it, or it expired). */
export class WaiterCallConflict extends WaiterCallError {}
/** 429: called again too soon after a waiter answered. */
export class WaiterCallTooSoon extends WaiterCallError {}

export type WaiterCallKind = 'waiter' | 'bill';
export const WAITER_CALL_KINDS: readonly WaiterCallKind[] = ['waiter', 'bill'];

export const CALL_TTL_MINUTES = 15;
export const RECALL_COOLDOWN_MS = 60 * 1000;

type CallStatus = 'pending' | 'answered' | 'expired' | 'cancelled';

/** What the guest's phone is told about a call of their table. */
export interface GuestCallView {
  kind: WaiterCallKind;
  status: CallStatus;
  created_at: string;
  answered_at: string | null;
}

/** A live call, as a waiter's screen shows it. */
export interface LiveWaiterCall {
  id: number;
  kind: WaiterCallKind;
  table_id: number;
  table_name: string;
  hall_name: string;
  created_at: string;
  expires_at: string;
  /** The table has an open bill — «Попросити рахунок» has something to bring. */
  has_open_bill: boolean;
}

const answeredAt = new Map<string, number>();

/** Test seam: forget when tables were last answered. */
export function resetWaiterCallLimits(): void {
  answeredAt.clear();
}

function cooldownKey(storeId: number, tableId: number, kind: WaiterCallKind): string {
  return `${storeId}:${tableId}:${kind}`;
}

function kindOf(raw: unknown): WaiterCallKind {
  if (raw === 'waiter' || raw === 'bill') return raw;
  throw new WaiterCallError('kind має бути waiter або bill');
}

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}

function viewOf(row: Record<string, unknown>): GuestCallView {
  return {
    kind: row.kind as WaiterCallKind,
    status: row.status as CallStatus,
    created_at: iso(row.created_at),
    answered_at: row.answered_at == null ? null : iso(row.answered_at),
  };
}

/** Calls nobody answered in time stop being calls. Called wherever they are read. */
export async function expireStaleCalls(storeId: number): Promise<void> {
  await pool.query(
    `UPDATE pos_waiter_calls SET status = 'expired'
      WHERE store_id = $1 AND status = 'pending' AND expires_at < NOW()`,
    [storeId]
  );
}

// ── the guest ───────────────────────────────────────────────────────

/**
 * A guest calls. A second tap while the first call is live is the same call;
 * a new one right after a waiter answered is refused for a minute.
 */
export async function createCall(storeId: number, table: MenuTable, rawKind: unknown): Promise<GuestCallView> {
  const kind = kindOf(rawKind);
  await expireStaleCalls(storeId);
  const live = await pool.query(
    `SELECT * FROM pos_waiter_calls WHERE store_id = $1 AND table_id = $2 AND kind = $3 AND status = 'pending'`,
    [storeId, table.id, kind]
  );
  if (live.rows.length > 0) return viewOf(live.rows[0]);

  const last = answeredAt.get(cooldownKey(storeId, table.id, kind));
  if (last !== undefined && Date.now() - last < RECALL_COOLDOWN_MS) {
    throw new WaiterCallTooSoon('Офіціант щойно відповів — зачекайте хвилинку');
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO pos_waiter_calls (store_id, table_id, kind, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))
       RETURNING *`,
      [storeId, table.id, kind, CALL_TTL_MINUTES]
    );
    return viewOf(inserted.rows[0]);
  } catch (error) {
    // Two phones at one table tapping at once: the loser reads the winner's call.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      const won = await pool.query(
        `SELECT * FROM pos_waiter_calls WHERE store_id = $1 AND table_id = $2 AND kind = $3 AND status = 'pending'`,
        [storeId, table.id, kind]
      );
      if (won.rows.length > 0) return viewOf(won.rows[0]);
    }
    throw error;
  }
}

/**
 * What the guest's phone shows: each kind's latest call of this table from the
 * last half hour — live, answered («Офіціант іде»), expired or cancelled.
 */
export async function listOwnCalls(storeId: number, table: MenuTable): Promise<GuestCallView[]> {
  await expireStaleCalls(storeId);
  const result = await pool.query(
    `SELECT DISTINCT ON (kind) *
       FROM pos_waiter_calls
      WHERE store_id = $1 AND table_id = $2 AND created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY kind, created_at DESC, id DESC`,
    [storeId, table.id]
  );
  return result.rows.map(viewOf);
}

/** The guest takes a call back while it is live. Cancelling what is gone is fine. */
export async function cancelOwnCall(storeId: number, table: MenuTable, rawKind: unknown): Promise<{ cancelled: true }> {
  const kind = kindOf(rawKind);
  await pool.query(
    `UPDATE pos_waiter_calls SET status = 'cancelled'
      WHERE store_id = $1 AND table_id = $2 AND kind = $3 AND status = 'pending'`,
    [storeId, table.id, kind]
  );
  return { cancelled: true };
}

// ── the waiter ──────────────────────────────────────────────────────

/** Every live call — one table's, or the whole store's — oldest first. */
export async function listLiveCalls(storeId: number, tableId?: number): Promise<LiveWaiterCall[]> {
  await expireStaleCalls(storeId);
  const result = await pool.query(
    `SELECT c.id, c.kind, c.table_id, c.created_at, c.expires_at, t.name AS table_name, h.name AS hall_name,
            EXISTS (SELECT 1 FROM pos_bills b WHERE b.store_id = c.store_id AND b.table_id = c.table_id AND b.status = 'open') AS has_open_bill
       FROM pos_waiter_calls c
       JOIN pos_tables t ON t.id = c.table_id
       JOIN pos_halls h ON h.id = t.hall_id
      WHERE c.store_id = $1 AND c.status = 'pending' AND ($2::bigint IS NULL OR c.table_id = $2)
      ORDER BY c.created_at ASC, c.id ASC`,
    [storeId, tableId ?? null]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind as WaiterCallKind,
    table_id: Number(row.table_id),
    table_name: String(row.table_name),
    hall_name: String(row.hall_name),
    created_at: iso(row.created_at),
    expires_at: iso(row.expires_at),
    has_open_bill: row.has_open_bill === true,
  }));
}

/**
 * A waiter's «Іду». Idempotent: a second tap, or a second waiter, answers
 * `already: true`. A call the guest cancelled or that expired is a 409 — the
 * waiter's screen drops it on its next read.
 */
export async function answerCall(input: {
  storeId: number;
  staffId: number;
  callId: number;
}): Promise<{ status: 'answered'; already: boolean }> {
  const updated = await pool.query(
    `UPDATE pos_waiter_calls
        SET status = 'answered', answered_at = NOW(), answered_by = $3
      WHERE store_id = $1 AND id = $2 AND status = 'pending' AND expires_at >= NOW()
      RETURNING table_id, kind`,
    [input.storeId, input.callId, input.staffId]
  );
  if (updated.rows.length > 0) {
    const row = updated.rows[0];
    answeredAt.set(cooldownKey(input.storeId, Number(row.table_id), row.kind as WaiterCallKind), Date.now());
    return { status: 'answered', already: false };
  }
  const current = await pool.query(`SELECT status FROM pos_waiter_calls WHERE store_id = $1 AND id = $2`, [
    input.storeId,
    input.callId,
  ]);
  if (current.rows.length === 0) throw new WaiterCallNotFound('Виклик не знайдено');
  const status = String(current.rows[0].status);
  if (status === 'answered') return { status: 'answered', already: true };
  throw new WaiterCallConflict(status === 'cancelled' ? 'Гість скасував виклик' : 'Виклик застарів');
}
