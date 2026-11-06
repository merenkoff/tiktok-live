// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Author-side licence-activation ingest + read (TechDocs/POS_LICENSING.md,
// phase 2F). This runs on the AUTHOR's deployment (the-live.shop): it records
// the heartbeat pings every install sends to `POST /api/license/activation`
// (src/pos/license/service.ts on the client side) and answers the super
// admin's read of them.
//
// It is a COMPLIANCE record, never a lever on the copy: nothing here can
// disable anyone. What it gives the author is counting (distinct installs per
// licence), an over-limit signal (installs > the token's instance_limit) and a
// clone signal (one instance_id reported from two origins), each with the
// origin to contact for legal follow-up (OwnNet 1.1 §1.150).

import crypto from 'crypto';
import { pool } from '../../db.js';
import { verifyLicenseToken } from './token.js';

/** The ping body a client install POSTs. All fields are client-reported. */
export interface ActivationPing {
  token?: unknown;
  instance_id?: unknown;
  pos_api_version?: unknown;
  public_base_url?: unknown;
}

export class ActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivationError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** sha256 hex of the token string — a licence's stable identity. '' = no token. */
function fingerprint(token: string): string {
  return token ? crypto.createHash('sha256').update(token).digest('hex') : '';
}

/** Normalize a client-reported base URL to a bare http(s) origin, else ''. */
export function normalizeBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin.toLowerCase();
  } catch {
    return '';
  }
}

interface RecordOptions {
  now?: Date;
  /** Trusted keys override, for tests. Production uses TRUSTED_LICENSE_KEYS. */
  keys?: Readonly<Record<string, string>>;
  /** The network address the ping came from (migration 096); '' / undefined = unknown. */
  remoteIp?: string;
}

/**
 * The address a request came from, behind Railway's edge: `request.ip` there
 * is the proxy's (TechDocs/POS_SINGLE_INSTANCE.md), the client's is the LAST
 * entry of `X-Forwarded-For` — the one the proxy itself appended, so a client
 * that sends its own header cannot put a made-up first entry in front of it.
 * Falls back to `request.ip` off the proxy (local dev, tests). Display only,
 * never a limiter key.
 */
export function remoteIpOf(request: { ip: string; headers: Record<string, unknown> }): string {
  const fwd = request.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[fwd.length - 1] : fwd;
  const last = typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(Boolean).pop() : undefined;
  const ip = (last || request.ip || '').trim();
  return ip.length <= 64 ? ip : '';
}

/**
 * Record one heartbeat ping. Idempotent per (licence, instance, origin): a
 * repeated ping only bumps seen_count/last_seen. Throws ActivationError on a
 * malformed instance id (→ 400 at the route); any other field is accepted as
 * reported, because an unknown/invalid token pinging in is exactly what we want
 * to count.
 */
export async function recordActivation(ping: ActivationPing, options: RecordOptions = {}): Promise<void> {
  const now = options.now ?? new Date();
  const instanceId = typeof ping.instance_id === 'string' ? ping.instance_id.trim() : '';
  if (!UUID_RE.test(instanceId)) throw new ActivationError('bad instance_id');

  const token = typeof ping.token === 'string' ? ping.token.trim() : '';
  const verdict = verifyLicenseToken(token || undefined, { now, keys: options.keys });
  const fp = fingerprint(token);
  const baseUrl = normalizeBaseUrl(ping.public_base_url);
  const apiVersion = Number.isInteger(ping.pos_api_version) ? (ping.pos_api_version as number) : null;
  const licensee = verdict.ok ? verdict.claim.licensee : null;
  const plan = verdict.ok ? verdict.claim.plan ?? null : null;
  const instanceLimit =
    verdict.ok && Number.isInteger(verdict.claim.instance_limit) ? (verdict.claim.instance_limit as number) : null;

  const remoteIp = options.remoteIp?.trim() || null;

  await pool.query(
    `INSERT INTO pos_license_activations
       (license_fingerprint, instance_id, public_base_url, verified, licensee, plan,
        instance_limit, pos_api_version, first_seen, last_seen, seen_count, remote_ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 1, $10)
     ON CONFLICT (license_fingerprint, instance_id, public_base_url) DO UPDATE SET
       verified        = EXCLUDED.verified,
       licensee        = EXCLUDED.licensee,
       plan            = EXCLUDED.plan,
       instance_limit  = EXCLUDED.instance_limit,
       pos_api_version = EXCLUDED.pos_api_version,
       last_seen       = EXCLUDED.last_seen,
       seen_count      = pos_license_activations.seen_count + 1,
       remote_ip       = COALESCE(EXCLUDED.remote_ip, pos_license_activations.remote_ip)`,
    [fp, instanceId, baseUrl, verdict.ok, licensee, plan, instanceLimit, apiVersion, now.toISOString(), remoteIp]
  );
}

export interface LicenseSummary {
  /** sha256 of the token, or '' for the «без ключа» group. */
  fingerprint: string;
  /** Any ping for this licence verified (Ed25519, unexpired). */
  verified: boolean;
  licensee: string | null;
  plan: string | null;
  instance_limit: number | null;
  /** Distinct instance ids = how many copies run. */
  installs: number;
  /** Distinct non-empty origins seen. */
  origins: number;
  /** installs > instance_limit (only when a limit is in the token). */
  over_limit: boolean;
  /** Some instance id reported from more than one origin — a likely clone. */
  cloned: boolean;
  first_seen: string;
  last_seen: string;
  total_pings: number;
}

export interface LicenseOrigin {
  url: string;
  /** The address the last ping of this row came from; null when unknown (migration 096). */
  ip: string | null;
  first_seen: string;
  last_seen: string;
  seen_count: number;
}

export interface LicenseInstance {
  instance_id: string;
  verified: boolean;
  last_seen: string;
  /** '' origin is reported as the literal "(невідомо)" to the reader. */
  origins: LicenseOrigin[];
  /** This id reported from more than one origin. */
  cloned: boolean;
}

export interface LicenseDetail extends LicenseSummary {
  instances: LicenseInstance[];
}

function summaryFromRow(row: Record<string, unknown>): LicenseSummary {
  const installs = Number(row.installs);
  const instanceLimit = row.instance_limit === null ? null : Number(row.instance_limit);
  return {
    fingerprint: String(row.fingerprint),
    verified: Boolean(row.verified),
    licensee: (row.licensee as string | null) ?? null,
    plan: (row.plan as string | null) ?? null,
    instance_limit: instanceLimit,
    installs,
    origins: Number(row.origins),
    over_limit: instanceLimit !== null && installs > instanceLimit,
    cloned: Boolean(row.cloned),
    first_seen: new Date(row.first_seen as string).toISOString(),
    last_seen: new Date(row.last_seen as string).toISOString(),
    total_pings: Number(row.total_pings),
  };
}

/** One row per licence, most recently seen first. */
export async function listLicenses(): Promise<LicenseSummary[]> {
  const r = await pool.query(
    `WITH inst AS (
       SELECT license_fingerprint, instance_id,
              count(DISTINCT NULLIF(public_base_url, '')) AS origins
         FROM pos_license_activations
        GROUP BY license_fingerprint, instance_id
     )
     SELECT a.license_fingerprint AS fingerprint,
            bool_or(a.verified) AS verified,
            (array_agg(a.licensee ORDER BY a.last_seen DESC) FILTER (WHERE a.verified))[1] AS licensee,
            (array_agg(a.plan ORDER BY a.last_seen DESC) FILTER (WHERE a.verified))[1] AS plan,
            max(a.instance_limit) AS instance_limit,
            count(DISTINCT a.instance_id) AS installs,
            count(DISTINCT NULLIF(a.public_base_url, '')) AS origins,
            min(a.first_seen) AS first_seen,
            max(a.last_seen) AS last_seen,
            sum(a.seen_count) AS total_pings,
            bool_or(i.origins > 1) AS cloned
       FROM pos_license_activations a
       JOIN inst i
         ON i.license_fingerprint = a.license_fingerprint
        AND i.instance_id = a.instance_id
      GROUP BY a.license_fingerprint
      ORDER BY max(a.last_seen) DESC`
  );
  return r.rows.map(summaryFromRow);
}

/** Everything for one licence, including every copy and the origins it ran on. */
export async function getLicense(fingerprint: string): Promise<LicenseDetail | null> {
  const fp = fingerprint === 'none' ? '' : fingerprint;
  const summaries = await listLicenses();
  const summary = summaries.find((s) => s.fingerprint === fp);
  if (!summary) return null;

  const r = await pool.query(
    `SELECT instance_id, public_base_url, verified, first_seen, last_seen, seen_count, remote_ip
       FROM pos_license_activations
      WHERE license_fingerprint = $1
      ORDER BY instance_id, last_seen DESC`,
    [fp]
  );

  const byInstance = new Map<string, LicenseInstance>();
  for (const row of r.rows as Array<Record<string, unknown>>) {
    const id = String(row.instance_id);
    let inst = byInstance.get(id);
    if (!inst) {
      inst = { instance_id: id, verified: false, last_seen: '', origins: [], cloned: false };
      byInstance.set(id, inst);
    }
    if (row.verified) inst.verified = true;
    const lastSeen = new Date(row.last_seen as string).toISOString();
    if (!inst.last_seen || lastSeen > inst.last_seen) inst.last_seen = lastSeen;
    inst.origins.push({
      url: (row.public_base_url as string) || '',
      ip: (row.remote_ip as string | null) || null,
      first_seen: new Date(row.first_seen as string).toISOString(),
      last_seen: lastSeen,
      seen_count: Number(row.seen_count),
    });
  }
  const instances = [...byInstance.values()].map((inst) => ({
    ...inst,
    cloned: inst.origins.filter((o) => o.url !== '').length > 1,
  }));
  instances.sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));

  return { ...summary, instances };
}

/**
 * Forget every ping of one licence (the super admin's «Видалити записи»): the
 * rows of a fingerprint — 'none' / '' for the keyless group. The usual reason
 * is a copy that pinged before its `LICENSE_KEY` was set and so left a
 * «Без ключа» row beside its real licence forever. A copy that still runs
 * pings again, so nothing is lost but history. Returns how many rows went.
 */
export async function deleteLicense(fingerprint: string): Promise<number> {
  const fp = fingerprint === 'none' ? '' : fingerprint;
  const r = await pool.query(`DELETE FROM pos_license_activations WHERE license_fingerprint = $1`, [fp]);
  return r.rowCount ?? 0;
}

// --- Ingest rate limit (global, in-memory) --------------------------------
// Behind Railway's proxy `request.ip` is the proxy's, so a per-IP window is
// meaningless (TechDocs/POS_SINGLE_INSTANCE.md) — the same reasoning as
// src/crm/limits.ts. A real fleet pings ~once a day per install plus on boot;
// a burst past the ceiling is abnormal and refusing the rest for a few minutes
// costs nothing (the UNIQUE row means honest repeats never grow the table).
const ACTIVATION_WINDOW_MS = 10 * 60 * 1000;
const ACTIVATION_MAX = 600;
let activationHits: number[] = [];

export function activationAllowed(now = Date.now()): boolean {
  activationHits = activationHits.filter((t) => now - t < ACTIVATION_WINDOW_MS);
  if (activationHits.length >= ACTIVATION_MAX) return false;
  activationHits.push(now);
  return true;
}

/** Test seam. */
export function resetActivationLimits(): void {
  activationHits = [];
}

export const ACTIVATION_LIMITS = { ACTIVATION_MAX, ACTIVATION_WINDOW_MS } as const;
