// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/holder.ts
//
// The register holder — which till currently owns the store's provider
// register. TechDocs/POS_FISCAL_OFFLINE.md §3а.
//
// Why a lock at all: an offline session replays `go-offline(at)` and the
// provider requires `at` to be ≥ the last transaction the tax office received
// on that register. With two tills selling on one register, one of them going
// offline while the other keeps selling online breaks that ordering and, per
// the provider's own warning, the register. So while `offline_mode` is on,
// exactly one till may use the register; every other caller is refused with
// `register_held` (409) and can ask for a handover.
//
// The lock is NOT the shift: the shift belongs to the register and survives a
// handover; the lock moves with the hardware.
//
// Everything here is a single UPDATE guarded by the current holder in its
// WHERE clause — no transactions spanning provider calls, no in-memory state
// (the heartbeat throttle in runtime.ts is the one exception, and it only
// suppresses writes).

import { pool } from '../../../db.js';
import { logger } from '../../../logger.js';
import { FiscalError } from '../errors.js';
import * as runtime from '../runtime.js';
import type { FiscalContext } from '../shifts.service.js';
import { releaseLeasedCodes } from './pool.js';

/** A holder silent for longer is shown as "не відповідає — можливо, продає офлайн". */
export const HOLDER_STALE_MS = 5 * 60 * 1000;

export interface HandoverRequestView {
  device_id: string;
  name: string | null;
  requested_at: string | null;
}

export interface HolderView {
  device_id: string;
  name: string | null;
  since: string | null;
  last_seen_at: string | null;
  stale: boolean;
  handover_request: HandoverRequestView | null;
}

interface HolderRow {
  holder_device_id: string | null;
  holder_name: string | null;
  holder_since: Date | null;
  holder_last_seen_at: Date | null;
  handover_device_id: string | null;
  handover_name: string | null;
  handover_requested_at: Date | null;
}

const HOLDER_COLUMNS = `holder_device_id, holder_name, holder_since, holder_last_seen_at,
     handover_device_id, handover_name, handover_requested_at`;

function iso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toView(row: HolderRow | undefined, now = Date.now()): HolderView | null {
  if (!row?.holder_device_id) return null;
  const lastSeen = row.holder_last_seen_at ? new Date(row.holder_last_seen_at).getTime() : null;
  return {
    device_id: row.holder_device_id,
    name: row.holder_name,
    since: iso(row.holder_since),
    last_seen_at: iso(row.holder_last_seen_at),
    stale: lastSeen === null || now - lastSeen > HOLDER_STALE_MS,
    handover_request: row.handover_device_id
      ? {
          device_id: row.handover_device_id,
          name: row.handover_name,
          requested_at: iso(row.handover_requested_at),
        }
      : null,
  };
}

async function readRow(storeId: number): Promise<HolderRow | undefined> {
  const result = await pool.query(
    `SELECT ${HOLDER_COLUMNS} FROM pos_fiscal_settings WHERE store_id = $1`,
    [storeId]
  );
  return result.rows[0] as HolderRow | undefined;
}

export async function getHolder(storeId: number): Promise<HolderView | null> {
  return toView(await readRow(storeId));
}

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().slice(0, 80);
  return trimmed || null;
}

export type ClaimResult = { ok: true; holder: HolderView } | { ok: false; holder: HolderView };

/**
 * Take the register when it is free, or confirm it is already ours.
 *
 * The WHERE clause is the whole concurrency story: two tills claiming at once
 * both run this UPDATE, and only the one that finds `holder_device_id IS NULL`
 * changes anything. Re-claiming our own lock refreshes the heartbeat and
 * clears a stale handover request from ourselves.
 */
export async function claimRegister(
  storeId: number,
  deviceId: string,
  name: unknown
): Promise<ClaimResult> {
  const result = await pool.query(
    `UPDATE pos_fiscal_settings SET
       holder_device_id = $2,
       holder_name = COALESCE($3, holder_name),
       holder_since = CASE WHEN holder_device_id = $2 THEN holder_since ELSE NOW() END,
       holder_last_seen_at = NOW(),
       handover_device_id = CASE WHEN handover_device_id = $2 THEN NULL ELSE handover_device_id END,
       handover_name = CASE WHEN handover_device_id = $2 THEN NULL ELSE handover_name END,
       handover_requested_at = CASE WHEN handover_device_id = $2 THEN NULL ELSE handover_requested_at END,
       updated_at = NOW()
     WHERE store_id = $1 AND (holder_device_id IS NULL OR holder_device_id = $2)
     RETURNING ${HOLDER_COLUMNS}`,
    [storeId, deviceId, cleanName(name)]
  );
  if (result.rows.length > 0) {
    return { ok: true, holder: toView(result.rows[0] as HolderRow) as HolderView };
  }
  const current = await getHolder(storeId);
  if (!current) {
    // No settings row at all — nothing to hold. Callers gate on `offline_mode`
    // first, so this is a programming error rather than a user-facing state.
    throw new FiscalError('ПРРО не налаштовано', 'not_configured');
  }
  return { ok: false, holder: current };
}

/** Heartbeat. Cheap: skipped unless the throttle in runtime.ts says it is due. */
export async function touchHolder(storeId: number, deviceId: string): Promise<void> {
  if (!runtime.shouldTouchHolder(storeId)) return;
  await pool.query(
    `UPDATE pos_fiscal_settings SET holder_last_seen_at = NOW()
     WHERE store_id = $1 AND holder_device_id = $2`,
    [storeId, deviceId]
  );
}

async function hasLiveSession(storeId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM pos_fiscal_offline_sessions
     WHERE store_id = $1 AND status IN ('open', 'replaying') LIMIT 1`,
    [storeId]
  );
  return result.rows.length > 0;
}

export type ReleaseResult = 'ok' | 'not_holder' | 'session_open';

/** Give the register up voluntarily (till logs out for the day). */
export async function releaseRegister(storeId: number, deviceId: string): Promise<ReleaseResult> {
  const row = await readRow(storeId);
  if (row?.holder_device_id !== deviceId) return 'not_holder';
  if (await hasLiveSession(storeId)) return 'session_open';
  await releaseLeasedCodes(storeId, deviceId, 'free');
  await pool.query(
    `UPDATE pos_fiscal_settings SET
       holder_device_id = NULL, holder_name = NULL, holder_since = NULL,
       holder_last_seen_at = NULL, updated_at = NOW()
     WHERE store_id = $1 AND holder_device_id = $2`,
    [storeId, deviceId]
  );
  return 'ok';
}

export type HandoverRequestResult =
  | { status: 'requested'; holder: HolderView }
  | { status: 'claimed'; holder: HolderView }
  | { status: 'already_holder'; holder: HolderView };

/**
 * Ask the holder to hand the register over. A newer request replaces an older
 * one from another till — the holder sees one question at a time. When the
 * register is simply free, take it: there is nobody to ask.
 */
export async function requestHandover(
  storeId: number,
  deviceId: string,
  name: unknown
): Promise<HandoverRequestResult> {
  const current = await getHolder(storeId);
  if (current?.device_id === deviceId) return { status: 'already_holder', holder: current };
  if (!current) {
    const claim = await claimRegister(storeId, deviceId, name);
    if (claim.ok) return { status: 'claimed', holder: claim.holder };
  }
  const result = await pool.query(
    `UPDATE pos_fiscal_settings SET
       handover_device_id = $2, handover_name = $3, handover_requested_at = NOW(), updated_at = NOW()
     WHERE store_id = $1 AND holder_device_id IS NOT NULL AND holder_device_id <> $2
     RETURNING ${HOLDER_COLUMNS}`,
    [storeId, deviceId, cleanName(name)]
  );
  const holder = toView(result.rows[0] as HolderRow | undefined) ?? (await getHolder(storeId));
  if (!holder) throw new FiscalError('ПРРО не налаштовано', 'not_configured');
  return { status: 'requested', holder };
}

export type HandoverConfirmResult =
  | { status: 'ok'; holder: HolderView }
  | { status: 'not_holder'; holder: HolderView | null }
  | { status: 'no_request'; holder: HolderView }
  | { status: 'handover_blocked'; holder: HolderView; reason: 'outbox_pending' | 'session_open' };

/**
 * The holder agrees. Three conditions, all checked here (§3а): the holder is
 * online (it is the one calling), its outbox is empty (`outboxPending`, as
 * the till reports it), and no offline session of its own is still open or
 * replaying. Then the lease goes back to the pool and the lock moves. The
 * shift is untouched — a hardware swap must not cut the day into two Z-reports.
 */
export async function confirmHandover(
  storeId: number,
  deviceId: string,
  outboxPending: number
): Promise<HandoverConfirmResult> {
  const row = await readRow(storeId);
  const holder = toView(row);
  if (!holder || holder.device_id !== deviceId) return { status: 'not_holder', holder };
  if (!row?.handover_device_id) return { status: 'no_request', holder };
  if (outboxPending > 0) return { status: 'handover_blocked', holder, reason: 'outbox_pending' };
  if (await hasLiveSession(storeId)) {
    return { status: 'handover_blocked', holder, reason: 'session_open' };
  }

  await releaseLeasedCodes(storeId, deviceId, 'free');
  const result = await pool.query(
    `UPDATE pos_fiscal_settings SET
       holder_device_id = handover_device_id,
       holder_name = handover_name,
       holder_since = NOW(),
       holder_last_seen_at = NOW(),
       handover_device_id = NULL, handover_name = NULL, handover_requested_at = NULL,
       updated_at = NOW()
     WHERE store_id = $1 AND holder_device_id = $2 AND handover_device_id IS NOT NULL
     RETURNING ${HOLDER_COLUMNS}`,
    [storeId, deviceId]
  );
  const next = toView(result.rows[0] as HolderRow | undefined);
  if (!next) return { status: 'not_holder', holder: await getHolder(storeId) };
  runtime.invalidateStore(storeId);
  logger.info('Fiscal register handed over', { storeId, from: deviceId, to: next.device_id });
  return { status: 'ok', holder: next };
}

export type ForceResult =
  | { status: 'ok'; holder: HolderView; stuck_sessions: number; burned_codes: number }
  | { status: 'no_target' };

/**
 * The owner takes the register away from a holder that cannot confirm
 * (broken machine, stuck offline). Anything that till still had in flight is
 * lost to the automatic path: its open session is marked `stuck` for the
 * attention list, its leased codes are burned (some may be on receipts we
 * will never see in order). The target defaults to whoever asked for the
 * handover.
 */
export async function forceHandover(
  storeId: number,
  target: { deviceId?: string | null; name?: unknown }
): Promise<ForceResult> {
  const row = await readRow(storeId);
  const toDevice = target.deviceId || row?.handover_device_id || null;
  if (!toDevice) return { status: 'no_target' };
  const toName = cleanName(target.name) ?? (toDevice === row?.handover_device_id ? row?.handover_name ?? null : null);
  const previous = row?.holder_device_id ?? null;

  let stuck = 0;
  let burned = 0;
  if (previous && previous !== toDevice) {
    const sessions = await pool.query(
      `UPDATE pos_fiscal_offline_sessions
       SET status = 'stuck', error_code = 'register_taken',
           error_message = 'Касу примусово передано іншому пристрою', ended_at = NOW(), updated_at = NOW()
       WHERE store_id = $1 AND device_id = $2 AND status IN ('open', 'replaying')`,
      [storeId, previous]
    );
    stuck = sessions.rowCount ?? 0;
    burned = await releaseLeasedCodes(storeId, previous, 'burned');
  }

  const result = await pool.query(
    `UPDATE pos_fiscal_settings SET
       holder_device_id = $2,
       holder_name = $3,
       holder_since = CASE WHEN holder_device_id = $2 THEN holder_since ELSE NOW() END,
       holder_last_seen_at = NOW(),
       handover_device_id = NULL, handover_name = NULL, handover_requested_at = NULL,
       updated_at = NOW()
     WHERE store_id = $1
     RETURNING ${HOLDER_COLUMNS}`,
    [storeId, toDevice, toName]
  );
  const holder = toView(result.rows[0] as HolderRow | undefined);
  if (!holder) throw new FiscalError('ПРРО не налаштовано', 'not_configured');
  runtime.invalidateStore(storeId);
  logger.warn('Fiscal register force-taken', { storeId, from: previous, to: toDevice, stuck, burned });
  return { status: 'ok', holder, stuck_sessions: stuck, burned_codes: burned };
}

/**
 * The checkout gate. Only bites while `offline_mode` is on for a provider
 * that can actually go offline; otherwise several online tills on one
 * register are fine (the provider orders their transactions itself).
 *
 * A free register is taken by the first till that sells — a single-till
 * store never sees a claim screen. A caller with no device id (the web
 * shell) can never hold it, because it can never go offline in a way we can
 * replay.
 */
export async function assertHolder(ctx: FiscalContext, deviceId: string | null): Promise<void> {
  if (!ctx.settings.offline_mode || !ctx.provider.offline) return;

  if (!deviceId) {
    throw new FiscalError(
      'В офлайн-режимі ПРРО продає лише касовий застосунок',
      'register_held',
      { providerCode: 'no_device', raw: { holder: await getHolder(ctx.storeId) } }
    );
  }

  const claim = await claimRegister(ctx.storeId, deviceId, null);
  if (claim.ok) return;
  throw new FiscalError('Касу ПРРО зайнято іншим пристроєм', 'register_held', {
    providerCode: 'register_held',
    raw: { holder: claim.holder },
  });
}

/** What a `register_held` error carries for the 409 body. */
export function holderFromError(error: FiscalError): HolderView | null {
  const raw = error.raw as { holder?: HolderView | null } | undefined;
  return raw?.holder ?? null;
}
