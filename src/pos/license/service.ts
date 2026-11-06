// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Disclosed licence activation (TechDocs/POS_LICENSING.md, phase 2).
//
// A licence-COMPLIANCE check, not a kill switch: it verifies the signed
// `LICENSE_KEY` locally, pings the author's activation server so a running copy
// can be counted, and caches a status the owner can read — but it NEVER blocks
// the POS. A missing, invalid, or unverifiable licence, or an unreachable
// server, only changes what `GET /license/status` reports and what is logged.
// This is what OwnNet 1.1 §1.150 permits ("licence-compliance checks that do
// not disable software the user already lawfully runs") and what keeps us out
// of §1.12(a) (kill switch) and §1.12(d) (undisclosed tracking): the ping
// carries ONLY licence-compliance data — the token, a per-install id, the API
// version and the public base URL — never user activity, catalogue or PII.
//
// Best-effort throughout, like `qr.service.ts`'s reconcile path: fetch with a
// hard timeout, and any failure is a `logger.warn` and a no-op, never a throw.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import { POS_API_VERSION } from '../version.js';
import { verifyLicenseToken, type LicenseClaim, type LicenseVerdict } from './token.js';

const REQUEST_TIMEOUT_MS = 5000;

/**
 * How long a licence stays `licensed` after the last successful ping before it
 * degrades to `unreachable`. The grace is generous on purpose: an outage of the
 * author's server, or of the shop's internet, must not flip an owner's status
 * to a scary word for a transient reason. It is informational either way — the
 * POS does not change behaviour.
 */
const GRACE_DAYS = 14;

export type LicenseStatus = 'unknown' | 'licensed' | 'unlicensed' | 'unreachable';

function licenseKey(): string {
  return process.env.LICENSE_KEY?.trim() ?? '';
}

function licenseServerUrl(): string {
  return process.env.LICENSE_SERVER_URL?.trim() || 'https://the-live.shop';
}

interface LicenseRow {
  instance_id: string;
  status: LicenseStatus;
  claim: LicenseClaim | null;
  last_ok_at: string | null;
  last_checked_at: string | null;
}

/** Read the singleton row (migration 094 seeds it, so it always exists). */
async function readRow(): Promise<LicenseRow | null> {
  const r = await pool.query(
    `SELECT instance_id, status, claim, last_ok_at, last_checked_at
       FROM pos_license_state WHERE id = 1`
  );
  return (r.rows[0] as LicenseRow | undefined) ?? null;
}

/**
 * The cached status, from the local token verdict and how long since the server
 * last answered. Pure, exported for tests.
 *
 * - token not valid (absent / bad / expired)        → `unlicensed`
 * - token valid, server answered within the grace   → `licensed`
 * - token valid, but no / stale successful ping      → `unreachable`
 */
export function computeStatus(
  verdict: LicenseVerdict,
  lastOkAt: Date | null,
  now: Date = new Date()
): LicenseStatus {
  if (!verdict.ok) return 'unlicensed';
  if (lastOkAt && now.getTime() - lastOkAt.getTime() <= GRACE_DAYS * 24 * 60 * 60 * 1000) {
    return 'licensed';
  }
  return 'unreachable';
}

export interface HeartbeatResult {
  status: LicenseStatus;
  /** The activation server answered 2xx to THIS ping (so the copy is counted). */
  server_ok: boolean;
}

/**
 * Verify the local token, ping the activation server, and cache the result.
 * Called on boot (`runBootHeartbeat`) and daily by the cron in `src/index.ts`.
 * Best-effort: returns the computed status and whether this ping reached the
 * server, and never throws, so a boot or a cron tick is never harmed by it.
 */
export async function runLicenseHeartbeat(): Promise<HeartbeatResult> {
  const now = new Date();
  const token = licenseKey();
  const verdict = verifyLicenseToken(token || undefined, { now });

  let row: LicenseRow | null = null;
  try {
    row = await readRow();
  } catch (error) {
    logger.warn('licence: cannot read state row', {
      error: error instanceof Error ? error.message : 'db_error',
    });
    return { status: verdict.ok ? 'licensed' : 'unlicensed', server_ok: false };
  }
  if (!row) {
    // No singleton row — migration 094 has not run on this DB. Nothing to do.
    return { status: verdict.ok ? 'licensed' : 'unlicensed', server_ok: false };
  }

  // Ping regardless of local verdict: an absent or invalid token pinging in is
  // exactly how the author counts an unauthorized copy (phase 2F). The payload
  // is licence-compliance only.
  let serverOk = false;
  try {
    const res = await fetch(`${licenseServerUrl()}/api/license/activation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: token || null,
        instance_id: row.instance_id,
        pos_api_version: POS_API_VERSION,
        public_base_url: process.env.PUBLIC_BASE_URL ?? null,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    serverOk = res.ok;
    if (!res.ok) {
      logger.warn('licence: activation server non-2xx', { status: res.status });
    }
  } catch (error) {
    logger.warn('licence: activation server unreachable', {
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
  }

  const lastOkAt = serverOk ? now : row.last_ok_at ? new Date(row.last_ok_at) : null;
  const status = computeStatus(verdict, lastOkAt, now);
  const claim = verdict.ok ? verdict.claim : null;

  try {
    await pool.query(
      `UPDATE pos_license_state
          SET status = $1,
              claim = $2::jsonb,
              last_checked_at = $3,
              last_ok_at = COALESCE($4, last_ok_at)
        WHERE id = 1`,
      [status, claim ? JSON.stringify(claim) : null, now.toISOString(), serverOk ? now.toISOString() : null]
    );
  } catch (error) {
    logger.warn('licence: cannot write state row', {
      error: error instanceof Error ? error.message : 'db_error',
    });
  }

  if (status !== 'licensed') {
    logger.warn('licence not validated', { status, reason: verdict.ok ? 'server' : verdict.reason });
  }
  return { status, server_ok: serverOk };
}

export interface BootHeartbeatOptions {
  /** How many pings to try before giving up until the daily cron. */
  attempts?: number;
  /** Pause between attempts. */
  retryDelayMs?: number;
  /** Test seam: the heartbeat to run. */
  run?: () => Promise<HeartbeatResult>;
  /** Test seam: the sleeper. */
  sleep?: (ms: number) => Promise<void>;
}

const BOOT_ATTEMPTS = 3;
const BOOT_RETRY_DELAY_MS = 2 * 60 * 1000;

function sleepUnref(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Never keep the process alive for a retry.
    if (typeof t === 'object' && 'unref' in t) t.unref();
  });
}

/**
 * The boot-time heartbeat. The author's own deployment pings ITSELF on
 * `https://the-live.shop`, and during a Railway deploy the public domain still
 * points at the container being replaced — the 2026-11-06 boots each timed out
 * there, so the first ping with a freshly set `LICENSE_KEY` was lost until the
 * daily cron, a day later. So this runs AFTER the server listens and, when the
 * ping did not reach the server, tries again a couple of minutes later, a few
 * times. Returns the last result; never throws.
 */
export async function runBootHeartbeat(options: BootHeartbeatOptions = {}): Promise<HeartbeatResult> {
  const attempts = Math.max(1, options.attempts ?? BOOT_ATTEMPTS);
  const delay = options.retryDelayMs ?? BOOT_RETRY_DELAY_MS;
  const run = options.run ?? runLicenseHeartbeat;
  const sleep = options.sleep ?? sleepUnref;
  let last: HeartbeatResult = { status: 'unknown', server_ok: false };
  for (let i = 1; i <= attempts; i += 1) {
    try {
      last = await run();
    } catch (error) {
      logger.warn('licence: boot heartbeat failed', {
        attempt: i,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    if (last.server_ok || i === attempts) break;
    logger.info(`licence: activation ping not delivered, retrying in ${Math.round(delay / 1000)}s`, { attempt: i });
    await sleep(delay);
  }
  return last;
}

export interface LicenseStatusView {
  status: LicenseStatus;
  instance_id: string | null;
  licensee: string | null;
  plan: string | null;
  expires_at: string | null;
  last_ok_at: string | null;
  last_checked_at: string | null;
  server_url: string;
  /** Why the local token is not valid, when it isn't — for the owner's screen. */
  token_reason: string | null;
}

/** What `GET /api/pos/license/status` returns to an owner. Never includes a secret. */
export async function getLicenseStatusForOwner(): Promise<LicenseStatusView> {
  const verdict = verifyLicenseToken(licenseKey() || undefined);
  let row: LicenseRow | null = null;
  try {
    row = await readRow();
  } catch {
    row = null;
  }
  return {
    status: row?.status ?? (verdict.ok ? 'licensed' : 'unlicensed'),
    instance_id: row?.instance_id ?? null,
    licensee: verdict.ok ? verdict.claim.licensee : null,
    plan: verdict.ok ? verdict.claim.plan ?? null : null,
    expires_at: verdict.ok ? verdict.claim.expires_at ?? null : null,
    last_ok_at: row?.last_ok_at ?? null,
    last_checked_at: row?.last_checked_at ?? null,
    server_url: licenseServerUrl(),
    token_reason: verdict.ok ? null : verdict.reason,
  };
}
