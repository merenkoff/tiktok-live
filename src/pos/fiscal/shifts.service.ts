// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/shifts.service.ts
//
// The ПРРО shift lifecycle: resolve a store's provider context, keep a session,
// and mirror the provider's shift into `pos_fiscal_shifts`.
//
// Direction of truth matters here and is easy to get backwards. **The provider
// owns the shift; our table is a mirror.** Вчасно's Device Manager can open a
// shift we know nothing about, and a shift can expire at the tax service while
// our row still says "open". Every read reconciles our row to what the provider
// reports, never the reverse. The row exists so the auto-close cron and the
// owner's reports have something to scan — not to decide anything.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import { POS_API_VERSION } from '../version.js';
import { asFiscalError, FiscalError } from './errors.js';
// `ledger.ts`, not `fiscal.service.ts` — the orchestrator imports this module,
// so reaching back into it here would be a cycle. That is why the ledger is
// its own file.
import { abandonShiftDocs } from './ledger.js';
import { getProvider } from './providers/index.js';
import * as runtime from './runtime.js';
import { getFiscalCredentials, getFiscalSettings } from './settings.service.js';
import type {
  FiscalCallCtx,
  FiscalCredentials,
  FiscalProvider,
  FiscalReport,
  FiscalShiftClosed,
  FiscalShiftState,
  PosFiscalSettings,
} from './types.js';

/**
 * ПРРО caps a shift at 24h. We aim to close at 23:30 elapsed so a late cron
 * tick, a slow provider or a brief outage still lands inside the limit.
 */
export const SHIFT_MAX_AGE_MS = 23.5 * 60 * 60 * 1000;

/** Identifies this client to the provider (`X-Client-Name` / `-Version`). */
export const FISCAL_CLIENT_NAME = 'the-live-shop-pos';
export const FISCAL_CLIENT_VERSION = String(POS_API_VERSION);

/** Everything needed to talk to one store's provider. */
export interface FiscalContext {
  storeId: number;
  settings: PosFiscalSettings;
  creds: FiscalCredentials;
  provider: FiscalProvider;
  /** Which cash register — `pos_fiscal_settings.config.cashRegisterKey`, or ''. */
  registerKey: string;
}

export interface PosFiscalShiftRow {
  id: number;
  store_id: number;
  provider: string;
  cash_register_key: string;
  provider_shift_id: string | null;
  status: 'opening' | 'open' | 'closing' | 'closed' | 'error';
  opened_at: Date | null;
  closed_at: Date | null;
  auto_close_due_at: Date | null;
  z_report_text: string | null;
}

function readRegisterKey(config: Readonly<Record<string, unknown>>): string {
  const value = config.cashRegisterKey;
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
}

/**
 * Resolve a store's fiscal context, or null when it does not fiscalise.
 *
 * Null is the normal answer for most stores, not an error — the caller treats
 * it as "skip fiscalisation entirely".
 */
export async function resolveContext(storeId: number): Promise<FiscalContext | null> {
  const settings = await getFiscalSettings(storeId);
  if (!settings?.enabled || !settings.provider) return null;

  const creds = await getFiscalCredentials(storeId);
  if (!creds) return null;

  return {
    storeId,
    settings,
    creds,
    // Throws `not_configured` when no adapter is compiled in for the chosen
    // provider — loud, rather than falling through to an un-fiscalised sale.
    provider: getProvider(settings.provider),
    registerKey: readRegisterKey(creds.config),
  };
}

/** A live session, signing in only when the cached one is missing or stale. */
export async function getSession(ctx: FiscalContext, signal: AbortSignal) {
  const cached = runtime.getCachedSession(ctx.storeId);
  if (cached) return cached;
  try {
    const session = await ctx.provider.signIn(ctx.creds, signal);
    runtime.setCachedSession(ctx.storeId, session);
    runtime.markProviderOk(ctx.storeId);
    return session;
  } catch (error) {
    runtime.invalidateSession(ctx.storeId);
    throw asFiscalError(error, 'Не вдалося увійти в ПРРО');
  }
}

export async function buildCallCtx(
  ctx: FiscalContext,
  signal: AbortSignal
): Promise<FiscalCallCtx> {
  return {
    storeId: ctx.storeId,
    creds: ctx.creds,
    session: await getSession(ctx, signal),
    clientName: FISCAL_CLIENT_NAME,
    clientVersion: FISCAL_CLIENT_VERSION,
    signal,
  };
}

/**
 * The provider's current shift, cached for {@link runtime.SHIFT_TTL_MS}.
 *
 * `force` skips the cache — used after any `shift_*` failure, where the cached
 * reading is exactly the thing that turned out to be wrong.
 */
export async function getShiftState(
  ctx: FiscalContext,
  signal: AbortSignal,
  opts: { force?: boolean } = {}
): Promise<FiscalShiftState | null> {
  if (!opts.force) {
    const cached = runtime.getCachedShift(ctx.storeId);
    if (cached) return cached;
  }
  const callCtx = await buildCallCtx(ctx, signal);
  try {
    const state = await ctx.provider.getShift(callCtx);
    runtime.setCachedShift(ctx.storeId, state);
    runtime.markProviderOk(ctx.storeId);
    if (state) await mirrorOpenShift(ctx, state, null);
    return state;
  } catch (error) {
    const fiscal = asFiscalError(error, 'Не вдалося отримати стан зміни ПРРО');
    if (fiscal.kind === 'auth_expired') runtime.invalidateSession(ctx.storeId);
    runtime.invalidateShift(ctx.storeId);
    throw fiscal;
  }
}

/**
 * Write the provider's open shift into our mirror.
 *
 * `ON CONFLICT` on the partial unique index (`status IN ('opening','open',
 * 'closing')`) is what keeps exactly one live row per register when two tills
 * reconcile at the same moment: the second one updates the first one's row
 * instead of failing.
 */
async function mirrorOpenShift(
  ctx: FiscalContext,
  state: FiscalShiftState,
  staffId: number | null
): Promise<PosFiscalShiftRow | null> {
  if (state.status !== 'open') return null;

  const openedAt = state.openedAt ? new Date(state.openedAt) : new Date();
  const autoCloseDueAt = state.autoCloseAt
    ? new Date(state.autoCloseAt)
    : new Date(openedAt.getTime() + SHIFT_MAX_AGE_MS);

  const result = await pool.query(
    `INSERT INTO pos_fiscal_shifts
       (store_id, provider, cash_register_key, provider_shift_id, status,
        opened_at, auto_close_due_at, opened_by_staff_id)
     VALUES ($1, $2, $3, $4, 'open', $5, $6, $7)
     ON CONFLICT (store_id, cash_register_key)
       WHERE status IN ('opening', 'open', 'closing')
     DO UPDATE SET
       provider_shift_id = EXCLUDED.provider_shift_id,
       status = 'open',
       opened_at = COALESCE(pos_fiscal_shifts.opened_at, EXCLUDED.opened_at),
       auto_close_due_at = EXCLUDED.auto_close_due_at,
       error_code = NULL,
       error_message = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      ctx.storeId,
      ctx.settings.provider,
      ctx.registerKey,
      state.providerShiftId,
      openedAt,
      autoCloseDueAt,
      staffId,
    ]
  );
  return result.rows[0] as PosFiscalShiftRow;
}

/** Mark our mirror closed. Provider-side closing has already happened. */
async function mirrorClosedShift(
  storeId: number,
  registerKey: string,
  closed: FiscalShiftClosed
): Promise<void> {
  await pool.query(
    `UPDATE pos_fiscal_shifts
     SET status = 'closed',
         closed_at = COALESCE($3::timestamptz, NOW()),
         z_report = $4::jsonb,
         z_report_text = $5,
         updated_at = NOW()
     WHERE store_id = $1 AND cash_register_key = $2
       AND status IN ('opening', 'open', 'closing')`,
    [
      storeId,
      registerKey,
      closed.closedAt,
      JSON.stringify(closed.zReport ?? null),
      closed.zReportText,
    ]
  );
}

/** Our mirror row for the currently live shift, if any. */
export async function getLiveShiftRow(
  storeId: number,
  registerKey: string
): Promise<PosFiscalShiftRow | null> {
  const result = await pool.query(
    `SELECT * FROM pos_fiscal_shifts
     WHERE store_id = $1 AND cash_register_key = $2
       AND status IN ('opening', 'open', 'closing')`,
    [storeId, registerKey]
  );
  return (result.rows[0] as PosFiscalShiftRow) ?? null;
}

/**
 * An open shift, opening one if the store allows it.
 *
 * Throws `shift_closed` when `auto_open_shift` is off — the cashier is then
 * told to open the shift explicitly, which is what a store that wants a
 * deliberate start-of-day expects.
 */
export async function ensureOpenShift(
  ctx: FiscalContext,
  signal: AbortSignal,
  staffId: number | null = null
): Promise<FiscalShiftState> {
  const current = await getShiftState(ctx, signal);
  if (current?.status === 'open') return current;

  if (!ctx.settings.auto_open_shift) {
    throw new FiscalError('Зміну ПРРО не відкрито', 'shift_closed');
  }
  return openShift(ctx, signal, staffId);
}

/**
 * Open a shift at the provider and mirror it.
 *
 * `autoCloseAt` is passed down because some providers (Checkbox) will close the
 * shift themselves at that time. Our cron stays as the backstop for the ones
 * that will not — belt and braces, since an over-24h shift is a compliance
 * problem, not a cosmetic one.
 */
export async function openShift(
  ctx: FiscalContext,
  signal: AbortSignal,
  staffId: number | null = null
): Promise<FiscalShiftState> {
  const callCtx = await buildCallCtx(ctx, signal);
  const autoCloseAt = new Date(Date.now() + SHIFT_MAX_AGE_MS);
  try {
    const state = await ctx.provider.openShift(callCtx, { autoCloseAt });
    runtime.setCachedShift(ctx.storeId, state);
    runtime.markProviderOk(ctx.storeId);
    await mirrorOpenShift(ctx, state, staffId);
    return state;
  } catch (error) {
    const fiscal = asFiscalError(error, 'Не вдалося відкрити зміну ПРРО');
    if (fiscal.kind === 'auth_expired') runtime.invalidateSession(ctx.storeId);
    runtime.invalidateShift(ctx.storeId);
    throw fiscal;
  }
}

export async function closeShift(
  ctx: FiscalContext,
  signal: AbortSignal
): Promise<FiscalShiftClosed> {
  const callCtx = await buildCallCtx(ctx, signal);
  // Read the row BEFORE closing: `mirrorClosedShift` flips it out of the live
  // statuses, after which we could no longer find which shift to sweep.
  const liveRow = await getLiveShiftRow(ctx.storeId, ctx.registerKey);
  try {
    const closed = await ctx.provider.closeShift(callCtx);
    runtime.setCachedShift(ctx.storeId, null);
    runtime.markProviderOk(ctx.storeId);
    await mirrorClosedShift(ctx.storeId, ctx.registerKey, closed);
    await sweepShiftDocuments(liveRow);
    return closed;
  } catch (error) {
    const fiscal = asFiscalError(error, 'Не вдалося закрити зміну ПРРО');
    if (fiscal.kind === 'auth_expired') runtime.invalidateSession(ctx.storeId);
    runtime.invalidateShift(ctx.storeId);
    // The provider saying "there is no open shift" means our mirror is the
    // thing that is wrong. Reconcile it rather than leaving a ghost row the
    // cron will retry forever.
    if (fiscal.kind === 'shift_closed') {
      await pool.query(
        `UPDATE pos_fiscal_shifts
         SET status = 'closed', closed_at = NOW(), updated_at = NOW()
         WHERE store_id = $1 AND cash_register_key = $2
           AND status IN ('opening', 'open', 'closing')`,
        [ctx.storeId, ctx.registerKey]
      );
      // Same sweep on this exit: the shift is gone at the provider, so nothing
      // still attached to it can ever be registered against it.
      await sweepShiftDocuments(liveRow);
    }
    throw fiscal;
  }
}

/**
 * Abandon whatever the closing shift never managed to fiscalise.
 *
 * This is what bounds the retry window. A ПРРО receipt belongs to its shift and
 * the Z-report sums that shift's receipts, so a document registered after the
 * Z-report corrupts both reports. Failing to sweep is far worse than sweeping
 * something recoverable, so a failure here is logged, never rethrown — the
 * shift really did close, and the caller must be told that.
 */
async function sweepShiftDocuments(row: PosFiscalShiftRow | null): Promise<void> {
  if (!row) return;
  try {
    const abandoned = await abandonShiftDocs(Number(row.id));
    if (abandoned > 0) {
      logger.warn('Fiscal documents abandoned with their shift', {
        shiftId: Number(row.id),
        storeId: Number(row.store_id),
        abandoned,
      });
    }
  } catch (error) {
    logger.error('Failed to sweep fiscal documents of a closed shift', {
      shiftId: Number(row.id),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function xReport(
  ctx: FiscalContext,
  signal: AbortSignal
): Promise<FiscalReport> {
  const callCtx = await buildCallCtx(ctx, signal);
  try {
    const report = await ctx.provider.xReport(callCtx);
    runtime.markProviderOk(ctx.storeId);
    return report;
  } catch (error) {
    const fiscal = asFiscalError(error, 'Не вдалося отримати X-звіт');
    if (fiscal.kind === 'auth_expired') runtime.invalidateSession(ctx.storeId);
    throw fiscal;
  }
}

export interface CloseDueShiftsResult {
  closed: number;
  failed: number;
}

/**
 * Close every shift past its 24h deadline.
 *
 * Claim-then-work, not work-inside-a-transaction: the row is flipped to
 * `'closing'` under `FOR UPDATE SKIP LOCKED` and committed immediately, and
 * only then does the provider call happen. Holding a transaction open across a
 * network call would keep a row lock for the provider's whole latency.
 *
 * `SKIP LOCKED` is load-bearing: Railway may run more than one replica, and
 * unlike `reconcileQrPayments` a double `closeShift` is **not** idempotent —
 * the second one would either fail or close a shift someone just opened.
 */
export async function closeDueShifts(
  opts: { limit?: number; signal?: AbortSignal } = {}
): Promise<CloseDueShiftsResult> {
  const limit = opts.limit ?? 20;
  const claimed = await pool.query(
    `UPDATE pos_fiscal_shifts SET status = 'closing', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM pos_fiscal_shifts
       WHERE status = 'open' AND auto_close_due_at IS NOT NULL AND auto_close_due_at < NOW()
       ORDER BY auto_close_due_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     RETURNING *`,
    [limit]
  );

  let closed = 0;
  let failed = 0;

  for (const row of claimed.rows as PosFiscalShiftRow[]) {
    const storeId = Number(row.store_id);
    const signal = opts.signal ?? AbortSignal.timeout(20_000);
    try {
      const ctx = await resolveContext(storeId);
      if (!ctx) {
        // Fiscalisation was turned off while a shift was still open. Nothing
        // can close it at the provider any more; stop scanning it.
        await markShiftError(row.id, 'not_configured', 'Fiscalisation disabled');
        failed += 1;
        continue;
      }
      await closeShift(ctx, signal);
      closed += 1;
      logger.info('Fiscal shift auto-closed', { storeId, shiftId: Number(row.id) });
    } catch (error) {
      failed += 1;
      const fiscal = asFiscalError(error, 'Auto-close failed');
      // Back to 'open' so the next tick retries — except for a terminal cause,
      // which would just fail identically every five minutes.
      if (fiscal.kind === 'not_configured' || fiscal.kind === 'auth_rejected') {
        await markShiftError(row.id, fiscal.kind, fiscal.message);
      } else {
        await pool.query(
          `UPDATE pos_fiscal_shifts
           SET status = 'open', error_code = $2, error_message = $3, updated_at = NOW()
           WHERE id = $1`,
          [row.id, fiscal.kind, fiscal.message.slice(0, 500)]
        );
      }
      logger.error('Fiscal shift auto-close failed', {
        storeId,
        shiftId: Number(row.id),
        kind: fiscal.kind,
        message: fiscal.message,
      });
    }
  }

  return { closed, failed };
}

async function markShiftError(
  shiftId: number,
  code: string,
  message: string
): Promise<void> {
  await pool.query(
    `UPDATE pos_fiscal_shifts
     SET status = 'error', error_code = $2, error_message = $3, updated_at = NOW()
     WHERE id = $1`,
    [shiftId, code, message.slice(0, 500)]
  );
}

export interface FiscalStatus {
  enabled: boolean;
  provider: string | null;
  /** Credentials present and an adapter compiled in for the provider. */
  configured: boolean;
  auto_open_shift: boolean;
  shift: {
    status: 'open' | 'closed';
    provider_shift_id: string | null;
    opened_at: string | null;
    auto_close_due_at: string | null;
  } | null;
  /** Set when the status could not be read; the UI shows it verbatim. */
  error: { code: string; message: string } | null;
}

/**
 * A cheap status summary for the till and the module's screens.
 *
 * Never throws: an unreachable provider is a *state* to display, not a failed
 * request. The one caller that must not proceed on a bad state is the checkout
 * pre-flight, and that one calls `ensureOpenShift` directly.
 */
export async function getStatus(storeId: number, signal: AbortSignal): Promise<FiscalStatus> {
  const settings = await getFiscalSettings(storeId);
  const base: FiscalStatus = {
    enabled: Boolean(settings?.enabled),
    provider: settings?.provider ?? null,
    configured: false,
    auto_open_shift: settings?.auto_open_shift ?? true,
    shift: null,
    error: null,
  };
  if (!base.enabled) return base;

  let ctx: FiscalContext | null = null;
  try {
    ctx = await resolveContext(storeId);
  } catch (error) {
    const fiscal = asFiscalError(error, 'ПРРО не налаштовано');
    return { ...base, error: { code: fiscal.kind, message: fiscal.message } };
  }
  if (!ctx) {
    return { ...base, error: { code: 'not_configured', message: 'ПРРО не налаштовано' } };
  }

  base.configured = true;
  try {
    const state = await getShiftState(ctx, signal);
    return {
      ...base,
      shift: state
        ? {
            status: state.status,
            provider_shift_id: state.providerShiftId,
            opened_at: state.openedAt,
            auto_close_due_at: state.autoCloseAt,
          }
        : null,
    };
  } catch (error) {
    const fiscal = asFiscalError(error, 'Немає звʼязку з ПРРО');
    return { ...base, error: { code: fiscal.kind, message: fiscal.message } };
  }
}
