// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/lease.ts
//
// The till's reserve of tax-office codes — case C of
// TechDocs/POS_FISCAL_OFFLINE.md (фаза 3, шаг 1).
//
// A till that loses the network has to stamp receipts on its own, and a
// tax-office code cannot be invented: it must have been fetched from the
// provider while there still was a connection. So the till carries a lease —
// codes marked `leased` to its device id in our pool, which we never spend
// ourselves — and refreshes it on every sync.
//
// Only the register holder gets one (§3а): one licence key is one register,
// and two tills stamping from one reserve would interleave two chains into a
// register that admits exactly one.
//
// The same call is how the till reports that its queue has drained
// (`outboxPending`), which is what releases the replay: `go-offline` fixes
// the chain's date, so it must not be sent while more receipts of the same
// stretch are still sitting on a till.

import { logger } from '../../../logger.js';
import type { FiscalContext } from '../shifts.service.js';
import { getLiveShiftRow } from '../shifts.service.js';
import { assertHolder } from './holder.js';
import { listLeasedCodes, takeFreeCodes } from './pool.js';
import { getLiveSession, markDeviceReady, type OfflineSessionStatus } from './session.js';

/**
 * How many codes a till carries.
 *
 * Fifty receipts is a long outage for one till, and the pool's own target
 * (`offline_codes_target`, 200 by default) keeps several of those in stock.
 * Deliberately a constant and not yet a store setting: nobody has needed a
 * different number, and an owner-facing knob whose wrong value silently caps
 * how long a shop can trade through an outage is worth avoiding until then.
 */
export const OFFLINE_LEASE_SIZE = 50;

export interface LeasedCodeView {
  fiscal_code: string;
  serial_id: number | null;
}

export interface LeaseShiftView {
  id: number;
  opened_at: string | null;
  auto_close_due_at: string | null;
}

export interface LeaseSessionView {
  id: number;
  holder: 'server' | 'device';
  device_id: string | null;
  client_session_id: string | null;
  status: OfflineSessionStatus;
  ready_at: string | null;
}

export interface LeaseView {
  lease_size: number;
  /** Every code the register still holds for this till, in spend order. */
  codes: LeasedCodeView[];
  /**
   * The shift the till may stamp inside. Null means it must not sell offline
   * at all: v1 opens no shift without a connection (§7).
   */
  shift: LeaseShiftView | null;
  /** ФН ПРРО — the till prints it and builds the tax-office QR from it. */
  register_fiscal_number: string | null;
  /** The register's live offline session, whoever holds it. */
  session: LeaseSessionView | null;
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

/**
 * Refresh the till's lease and tell it what it may do offline.
 *
 * Idempotent: the answer is always every code currently leased to this till,
 * topped up to {@link OFFLINE_LEASE_SIZE} if the pool can. A short answer is
 * not an error — it is the till's cue that an outage now has a limit.
 *
 * Throws `register_held` when another till owns the register; a free register
 * is claimed here exactly as a checkout would claim it.
 */
export async function leaseCodes(
  ctx: FiscalContext,
  deviceId: string,
  opts: { outboxPending: number }
): Promise<LeaseView> {
  await assertHolder(ctx, deviceId);

  // Before topping up: an empty queue means everything this till stamped is
  // now ours, so the replay may run. Ordering matters — the till reports the
  // count it had *after* uploading, and any document arriving later clears
  // this again.
  if (opts.outboxPending === 0) {
    const ready = await markDeviceReady(ctx.storeId, ctx.registerKey, deviceId);
    if (ready) {
      logger.info('Fiscal offline session ready for replay', {
        storeId: ctx.storeId,
        sessionId: ready.id,
        deviceId,
      });
    }
  }

  const held = await listLeasedCodes(ctx.storeId, ctx.registerKey, deviceId);
  const missing = OFFLINE_LEASE_SIZE - held.length;
  if (missing > 0) {
    await takeFreeCodes(ctx.storeId, ctx.registerKey, missing, { status: 'leased', deviceId });
  }

  const [codes, shiftRow, session] = await Promise.all([
    missing > 0 ? listLeasedCodes(ctx.storeId, ctx.registerKey, deviceId) : Promise.resolve(held),
    getLiveShiftRow(ctx.storeId, ctx.registerKey),
    getLiveSession(ctx.storeId, ctx.registerKey),
  ]);

  return {
    lease_size: OFFLINE_LEASE_SIZE,
    codes: codes.map((code) => ({ fiscal_code: code.fiscal_code, serial_id: code.serial_id })),
    // `opening`/`closing` are in-flight states: only a shift the provider has
    // actually opened may carry offline receipts.
    shift:
      shiftRow && shiftRow.status === 'open'
        ? {
            id: Number(shiftRow.id),
            opened_at: iso(shiftRow.opened_at),
            auto_close_due_at: iso(shiftRow.auto_close_due_at),
          }
        : null,
    register_fiscal_number: ctx.settings.register_fiscal_number ?? null,
    session: session
      ? {
          id: session.id,
          holder: session.holder,
          device_id: session.device_id,
          client_session_id: session.client_session_id,
          status: session.status,
          ready_at: iso(session.ready_at),
        }
      : null,
  };
}
