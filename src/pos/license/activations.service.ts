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
  /** `true` from a development run (migration 106); a copy older than the field sends none. */
  dev?: unknown;
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

/** What an address may look like: IPv4 or IPv6 text, nothing else. */
const ADDRESS_RE = /^[0-9a-fA-F:.]{3,45}$/;

function addressOr(raw: unknown): string {
  const text = (Array.isArray(raw) ? raw[raw.length - 1] : raw);
  if (typeof text !== 'string') return '';
  const last = text.split(',').map((part) => part.trim()).filter(Boolean).pop() ?? '';
  return ADDRESS_RE.test(last) ? last : '';
}

/**
 * The address a request came from, behind Railway's edge. `request.ip` there
 * is the proxy's (TechDocs/POS_SINGLE_INSTANCE.md); the client's is in
 * `X-Real-IP`, the header the edge sets for exactly this (Railway docs,
 * «Public Networking → Specs & Limits»).
 *
 * Until 2026-11-20 this read the LAST entry of `X-Forwarded-For`, on the
 * assumption that the edge appends the client there. It does not: that entry is
 * the edge node the request came through. The author's own server was recorded
 * as 152.233.13.165 (CDN77 Amsterdam) while Railway's HTTP log gave its real
 * address, and a development copy on Google Cloud as 152.233.40.1 (CDN77
 * Chicago) — an address that pointed at nobody. `X-Forwarded-For` is kept as
 * the second choice for a proxy that sets no `X-Real-IP`, then `request.ip`
 * off any proxy (local dev, tests). Display only, never a limiter key — so a
 * header a client could forge elsewhere costs nothing here.
 */
export function remoteIpOf(request: { ip: string; headers: Record<string, unknown> }): string {
  return (
    addressOr(request.headers['x-real-ip']) ||
    addressOr(request.headers['x-forwarded-for']) ||
    addressOr(request.ip)
  );
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
  // Only the literal `true` marks a development run: anything else — absent
  // from an older copy, or junk — leaves the row unmarked.
  const dev = ping.dev === true;

  await pool.query(
    `INSERT INTO pos_license_activations
       (license_fingerprint, instance_id, public_base_url, verified, licensee, plan,
        instance_limit, pos_api_version, first_seen, last_seen, seen_count, remote_ip, dev)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 1, $10, $11)
     ON CONFLICT (license_fingerprint, instance_id, public_base_url) DO UPDATE SET
       verified        = EXCLUDED.verified,
       licensee        = EXCLUDED.licensee,
       plan            = EXCLUDED.plan,
       instance_limit  = EXCLUDED.instance_limit,
       pos_api_version = EXCLUDED.pos_api_version,
       last_seen       = EXCLUDED.last_seen,
       seen_count      = pos_license_activations.seen_count + 1,
       remote_ip       = COALESCE(EXCLUDED.remote_ip, pos_license_activations.remote_ip),
       dev             = EXCLUDED.dev`,
    [fp, instanceId, baseUrl, verdict.ok, licensee, plan, instanceLimit, apiVersion, now.toISOString(), remoteIp, dev]
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
  /**
   * How many of them are development runs — every row of the install says
   * `dev` (migration 106). They stay inside `installs` and the over-limit
   * check: the mark tells the reader what a copy is, it does not un-count it.
   */
  dev_installs: number;
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
  /** A development run: every row of this install was last pinged with `dev`. */
  dev: boolean;
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
    dev_installs: Number(row.dev_installs ?? 0),
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
              count(DISTINCT NULLIF(public_base_url, '')) AS origins,
              bool_and(dev) AS dev
         FROM pos_license_activations
        GROUP BY license_fingerprint, instance_id
     )
     SELECT a.license_fingerprint AS fingerprint,
            bool_or(a.verified) AS verified,
            (array_agg(a.licensee ORDER BY a.last_seen DESC) FILTER (WHERE a.verified))[1] AS licensee,
            (array_agg(a.plan ORDER BY a.last_seen DESC) FILTER (WHERE a.verified))[1] AS plan,
            max(a.instance_limit) AS instance_limit,
            count(DISTINCT a.instance_id) AS installs,
            count(DISTINCT a.instance_id) FILTER (WHERE i.dev) AS dev_installs,
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
    `SELECT instance_id, public_base_url, verified, first_seen, last_seen, seen_count, remote_ip, dev
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
      inst = { instance_id: id, verified: false, dev: true, last_seen: '', origins: [], cloned: false };
      byInstance.set(id, inst);
    }
    if (row.verified) inst.verified = true;
    if (!row.dev) inst.dev = false;
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
