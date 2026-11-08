// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The DEPLOYMENT's side of the licence-gated module delivery
// (TechDocs/POS_OPENCORE.md §8; the author's side is `moduleDelivery.ts`).
//
// Every copy — the author's own included — exchanges its LICENSE_KEY at
// `<LICENSE_SERVER_URL>/api/modules/token` for a delivery token, keeps it in the
// singleton licence row, and puts it into the module URLs its tills receive at
// login (`withModuleTokens`). So the licence key never leaves the server, the
// tills need no change (web, tablet and desktop all just load the URL they are
// given), and `pos_stores.module_remotes` keeps the bare URL the super admin
// typed — only the login answer carries the token.
//
// Best-effort throughout, like the licence heartbeat: no key, an unreachable
// author's server or a refusal leave the last token (or none) in place and
// never delay a login. Without a token the URLs stay bare, which is exactly
// what they were before.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import type { ModuleRemoteEntry } from '../core/modules.js';
import { licenseKey, licenseServerUrl } from './service.js';

export interface StoredModuleToken {
  token: string;
  expires_at: Date;
}

let cached: StoredModuleToken | null | undefined; // undefined = not read yet
let lastRefreshAt = 0;
const REFRESH_THROTTLE_MS = 60_000;

/** Test seam: forget the in-memory copy so the next read goes to the row. */
export function resetModuleTokenCacheForTests(): void {
  cached = undefined;
  lastRefreshAt = 0;
  inflight = null;
}

function usable(t: StoredModuleToken | null | undefined, now = Date.now()): StoredModuleToken | null {
  return t && t.expires_at.getTime() > now ? t : null;
}

/** The token to put into URLs now, or null. Reads the row once per process. */
export async function currentModuleToken(): Promise<string | null> {
  if (cached === undefined) {
    try {
      const result = await pool.query(
        `SELECT module_token, module_token_expires_at FROM pos_license_state WHERE id = 1`
      );
      const row = result.rows[0] as { module_token: string | null; module_token_expires_at: Date | null } | undefined;
      cached =
        row?.module_token && row.module_token_expires_at
          ? { token: row.module_token, expires_at: new Date(row.module_token_expires_at) }
          : null;
    } catch (error) {
      logger.warn('module token: read failed', { error: error instanceof Error ? error.message : 'query_failed' });
      return null;
    }
  }
  const live = usable(cached);
  if (!live) void refreshModuleTokenThrottled();
  return live?.token ?? null;
}

export type ModuleTokenRefresh = 'refreshed' | 'no_key' | 'refused' | 'unreachable';

/**
 * Ask the author's server for this licence's delivery token and keep it.
 * Never throws. A refusal (403 — a forged or unknown licence) clears the kept
 * token; an unreachable server keeps it.
 */
export async function refreshModuleToken(): Promise<ModuleTokenRefresh> {
  lastRefreshAt = Date.now();
  const key = licenseKey();
  if (!key) return 'no_key';
  let res: Response;
  try {
    res = await fetch(`${licenseServerUrl().replace(/\/+$/, '')}/api/modules/token`, {
      method: 'POST',
      headers: { 'x-license-key': key },
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    logger.warn('module token: author server unreachable', {
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
    return 'unreachable';
  }
  if (res.status === 403) {
    await store(null);
    logger.warn('module token: licence refused by the author server');
    return 'refused';
  }
  if (!res.ok) {
    logger.warn('module token: author server non-2xx', { status: res.status });
    return 'unreachable';
  }
  try {
    const body = (await res.json()) as { token?: unknown; expires_at?: unknown };
    const expires = typeof body.expires_at === 'string' ? new Date(body.expires_at) : null;
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9._-]{20,600}$/.test(body.token) || !expires || Number.isNaN(expires.getTime())) {
      logger.warn('module token: malformed answer');
      return 'unreachable';
    }
    await store({ token: body.token, expires_at: expires });
    return 'refreshed';
  } catch (error) {
    logger.warn('module token: unreadable answer', { error: error instanceof Error ? error.message : 'parse_failed' });
    return 'unreachable';
  }
}

// The refresh in flight, so `moduleTokenForUpdate` can wait for the one a stale
// `currentModuleToken` has just started instead of finding the throttle shut.
let inflight: Promise<void> | null = null;

async function refreshModuleTokenThrottled(): Promise<void> {
  if (inflight) return inflight;
  if (Date.now() - lastRefreshAt < REFRESH_THROTTLE_MS) return;
  inflight = refreshModuleToken()
    .then(() => undefined, () => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The delivery token a till presents to the author's update feed
 * (TechDocs/POS_LICENSING.md 2D-B), or null. Unlike `currentModuleToken`, which
 * starts a refresh and answers at once (a login must never wait for the author's
 * server), this waits for it: the cashier has just pressed «Оновити», and
 * answering «no token» while the very refresh that would produce one is running
 * would make the first press after a long quiet spell fail for nothing.
 */
export async function moduleTokenForUpdate(): Promise<string | null> {
  const known = await currentModuleToken();
  if (known) return known;
  await refreshModuleTokenThrottled();
  return usable(cached)?.token ?? null;
}

async function store(t: StoredModuleToken | null): Promise<void> {
  cached = t;
  try {
    await pool.query(
      `UPDATE pos_license_state SET module_token = $1, module_token_expires_at = $2 WHERE id = 1`,
      [t?.token ?? null, t?.expires_at ?? null]
    );
  } catch (error) {
    logger.warn('module token: write failed', { error: error instanceof Error ? error.message : 'update_failed' });
  }
}

/**
 * Boot: after the server listens (the author's copy asks itself through its
 * public domain, which during a deploy still points at the old container), a
 * few tries two minutes apart, like the boot heartbeat. Never throws.
 */
export async function refreshModuleTokenOnBoot(tries = 3, pauseMs = 120_000): Promise<ModuleTokenRefresh> {
  let outcome: ModuleTokenRefresh = 'unreachable';
  for (let i = 0; i < tries; i++) {
    outcome = await refreshModuleToken();
    if (outcome !== 'unreachable') return outcome;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return outcome;
}

const BARE_MODULE_PATH = /^\/api\/modules\/(?!t\/)([a-z0-9][a-z0-9-]{0,40}\/\d+\.\d+\.\d+\/.+)$/;

/** Pure: one URL with the token put in, when it is a bare module URL of `serverUrl`. */
export function withModuleToken(url: string, token: string | null, serverUrl: string): string {
  if (!token) return url;
  let parsed: URL;
  let server: URL;
  try {
    parsed = new URL(url);
    server = new URL(serverUrl);
  } catch {
    return url;
  }
  if (parsed.origin !== server.origin) return url;
  const match = BARE_MODULE_PATH.exec(parsed.pathname);
  if (!match) return url;
  parsed.pathname = `/api/modules/t/${token}/${match[1]}`;
  return parsed.toString();
}

/** Pure: a store's `module_remotes` as a till should receive it. */
export function withModuleTokens(
  remotes: Record<string, string | ModuleRemoteEntry>,
  token: string | null,
  serverUrl: string
): Record<string, string | ModuleRemoteEntry> {
  if (!token) return remotes;
  const out: Record<string, string | ModuleRemoteEntry> = {};
  for (const [id, value] of Object.entries(remotes)) {
    out[id] =
      typeof value === 'string'
        ? withModuleToken(value, token, serverUrl)
        : { ...value, url: withModuleToken(value.url, token, serverUrl) };
  }
  return out;
}

/** `module_remotes` for a login answer: bare URLs of the licence server get this copy's token. */
export async function moduleRemotesForTill(
  remotes: Record<string, string | ModuleRemoteEntry>
): Promise<Record<string, string | ModuleRemoteEntry>> {
  return withModuleTokens(remotes, await currentModuleToken(), licenseServerUrl());
}
