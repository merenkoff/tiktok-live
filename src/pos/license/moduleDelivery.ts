// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Licence-gated delivery of online-module bundles — the AUTHOR's side
// (TechDocs/POS_OPENCORE.md §8, TechDocs/POS_LICENSING.md phase 2D-C).
//
// Three rules shape it, each the answer to a way the first gate (#399 v1) did
// not work:
//
// 1. The credential travels IN THE PATH: `/api/modules/t/<token>/<id>/<ver>/…`.
//    A browser cannot add a header to `import()`, and a module's lazy chunks
//    load by RELATIVE paths, which keep the path prefix but drop a query —
//    `remoteVerify.ts` hash-checks only `remote-entry.js`/`style.css`, so a gate
//    that covered only the entry would leave every page chunk open.
// 2. The path token is NOT the licence key. A deployment exchanges its
//    LICENSE_KEY here (`issueModuleToken`) for a short HMAC token that names the
//    licence by fingerprint and expires; the licence key itself never reaches a
//    till. The token is the same for a whole 30-day window, so a desktop (whose
//    cache treats another URL as other code) re-downloads once a month, not
//    after every refresh.
// 3. What was given stays given (OwnNet §1.12: a licence-compliance check must
//    not disable software the user already lawfully runs). An authentic licence
//    that has EXPIRED still gets a token, scoped `issued`: it is served only the
//    module versions this licence was handed before (`pos_module_issues`), never
//    a new one. A forged, garbled or unknown-key licence gets nothing.
//
// Bytes are served VERBATIM — from the closed bundle store on the volume when
// the version is there, else from the public jsdelivr build (versions published
// before the store existed are public anyway) — so the host's Ed25519 check is
// unaffected. Everything stays a transparent proxy while `LICENSE_MODULE_GATE`
// is not 'on'.

import crypto from 'crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../../db.js';
import { POS_UPLOADS_DIR } from '../uploads.service.js';
import { verifyLicenseToken, type VerifyOptions } from './token.js';

export type ModuleTokenScope = 'all' | 'issued';

export interface ModuleTokenGrant {
  token: string;
  scope: ModuleTokenScope;
  /** ISO timestamp the token stops working. */
  expires_at: string;
}

export interface ModuleTokenClaim {
  /** Licence fingerprint: first 32 hex of sha256(licence token). */
  fp: string;
  scope: ModuleTokenScope;
  /** Unix seconds. */
  exp: number;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// v1.<28 base64url: 16 bytes fingerprint, 1 byte scope, 4 bytes exp>.<22 base64url: 16 bytes of HMAC>
// Compact on purpose: Fastify's default `maxParamLength` is 100, and the token
// is one path segment.
const TOKEN_RE = /^v1\.[A-Za-z0-9_-]{28}\.[A-Za-z0-9_-]{22}$/;
const SCOPE_BYTE: Record<ModuleTokenScope, number> = { all: 1, issued: 2 };

/** First 32 hex of sha256 of the licence token — the journal's key. */
export function licenseFingerprint(licenseToken: string): string {
  return crypto.createHash('sha256').update(licenseToken).digest('hex').slice(0, 32);
}

/**
 * The HMAC key the author's server signs delivery tokens with:
 * `MODULE_TOKEN_SECRET`, else one derived from a real `AUTH_SECRET`. Null when
 * neither is set — then this copy issues nothing (the route answers 503), which
 * is what every copy that is not the author's should do anyway.
 */
export function moduleTokenSecret(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const own = env.MODULE_TOKEN_SECRET?.trim();
  if (own) return Buffer.from(own, 'utf8');
  const auth = env.AUTH_SECRET?.trim();
  if (auth) return crypto.createHmac('sha256', auth).update('liveshop module delivery v1').digest();
  return null;
}

function sign(payloadB64: string, secret: Buffer): string {
  return crypto.createHmac('sha256', secret).update(`v1.${payloadB64}`).digest().subarray(0, 16).toString('base64url');
}

/** Pure: mint a delivery token for a claim. */
export function signModuleToken(claim: ModuleTokenClaim, secret: Buffer): string {
  const bytes = Buffer.alloc(21);
  Buffer.from(claim.fp, 'hex').copy(bytes, 0, 0, 16);
  bytes.writeUInt8(SCOPE_BYTE[claim.scope], 16);
  bytes.writeUInt32BE(claim.exp >>> 0, 17);
  const payload = bytes.toString('base64url');
  return `v1.${payload}.${sign(payload, secret)}`;
}

/** Pure: a delivery token's claim, or null when it is garbled, forged or expired. Never throws. */
export function verifyModuleToken(
  token: string | null | undefined,
  secret: Buffer | null,
  now: Date = new Date()
): ModuleTokenClaim | null {
  if (!token || !secret || !TOKEN_RE.test(token)) return null;
  const [, payload, mac] = token.split('.');
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const bytes = Buffer.from(payload, 'base64url');
  if (bytes.length !== 21) return null;
  const scopeByte = bytes.readUInt8(16);
  const scope: ModuleTokenScope | null = scopeByte === 1 ? 'all' : scopeByte === 2 ? 'issued' : null;
  if (!scope) return null;
  const exp = bytes.readUInt32BE(17);
  if (exp * 1000 <= now.getTime()) return null;
  return { fp: bytes.subarray(0, 16).toString('hex'), scope, exp };
}

/**
 * Pure: exchange a licence token for a delivery token. The expiry is the end of
 * the NEXT 30-day window, so every refresh inside one window returns the very
 * same token (30–60 days of life).
 */
export function issueModuleToken(
  licenseToken: string | null | undefined,
  secret: Buffer,
  options: VerifyOptions = {}
): { ok: true; grant: ModuleTokenGrant } | { ok: false; reason: string } {
  const verdict = verifyLicenseToken(licenseToken ?? undefined, options);
  let scope: ModuleTokenScope;
  if (verdict.ok) scope = 'all';
  else if (verdict.reason === 'expired') scope = 'issued'; // authentic, just past its date
  else return { ok: false, reason: verdict.reason };

  const now = (options.now ?? new Date()).getTime();
  const expMs = (Math.floor(now / WINDOW_MS) + 2) * WINDOW_MS;
  const claim: ModuleTokenClaim = {
    fp: licenseFingerprint((licenseToken ?? '').trim()),
    scope,
    exp: Math.floor(expMs / 1000),
  };
  return {
    ok: true,
    grant: { token: signModuleToken(claim, secret), scope, expires_at: new Date(expMs).toISOString() },
  };
}

// ── Paths ──────────────────────────────────────────────────────────────────

export interface ModulePath {
  id: string;
  version: string;
  /** The file inside the bundle, e.g. `remote-entry.js`, `assets/page-x.js`. */
  file: string;
}

/** Pure: a module-bundle path, or null — so this route can never fetch anything else. */
export function parseModulePath(id: string, version: string, file: string): ModulePath | null {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) return null;
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(file)) return null;
  if (file.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || seg.startsWith('.'))) return null;
  return { id, version, file };
}

/**
 * The closed bundle store (Р6): inside the uploads volume — the only persistent
 * disk the API has (Railway mounts it at `data/pos-uploads`) — under a dot
 * directory that `/pos-uploads/*` refuses to serve (`pos.plugin.ts`).
 */
export function moduleBundlesDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.MODULE_BUNDLES_DIR?.trim() || path.join(POS_UPLOADS_DIR, '.module-bundles');
}

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.sig': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export function contentTypeOf(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** The file from the closed store, or null when this version is not there. */
export async function readStoredBundleFile(p: ModulePath, dir = moduleBundlesDir()): Promise<Buffer | null> {
  const root = path.resolve(dir);
  const full = path.resolve(root, p.id, p.version, p.file);
  if (!full.startsWith(root + path.sep)) return null;
  if (!existsSync(full)) return null;
  const info = await stat(full);
  if (!info.isFile()) return null;
  return readFile(full);
}

/** Where a version published before the closed store existed still lives. */
export function upstreamUrlOf(p: ModulePath, env: NodeJS.ProcessEnv = process.env): string {
  const base = env.LICENSE_MODULE_UPSTREAM_BASE?.trim() || 'https://cdn.jsdelivr.net/gh';
  const gh = env.LICENSE_MODULE_GH?.trim() || 'merenkoff/tiktok-live';
  return `${base}/${gh}@module-${p.id}-v${p.version}/${p.id}/${p.file}`;
}

// ── The journal (Р7) ──────────────────────────────────────────────────────

export async function recordIssued(fp: string, p: ModulePath): Promise<void> {
  await pool.query(
    `INSERT INTO pos_module_issues (license_fp, module_id, version)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [fp, p.id, p.version]
  );
}

export async function wasIssued(fp: string, p: ModulePath): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM pos_module_issues WHERE license_fp = $1 AND module_id = $2 AND version = $3`,
    [fp, p.id, p.version]
  );
  return result.rows.length > 0;
}

export function moduleGateOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LICENSE_MODULE_GATE ?? '').trim() === 'on';
}
