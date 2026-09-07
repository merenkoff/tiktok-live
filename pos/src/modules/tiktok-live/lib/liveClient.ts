// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's client for the TikTok LIVE API (`/api/sessions/*`).
//
// Two auth systems meet here. The POS session is the one the operator actually
// has; the LIVE side wants its own bearer token. `POST /api/pos/live/session-
// token` (backend `src/pos/routes/live.routes.ts`) bridges them, and this file
// owns the resulting token: cache it, attach it, re-mint it when the LIVE side
// says it is stale. The module never shows a second login screen.
//
// The LIVE token is a stateless HMAC with no server-side store, so minting is
// cheap and idempotent — losing the cache costs one request, never a session.

import { liveSessionToken } from './hostPlatform';
import { liveApiBase } from './wsUrl';
import { LiveApiError, LiveNotConfiguredError } from './errors';
import type { LiveSession, SessionLog } from '../types';

// Re-exported so callers keep importing the module's errors from one place.
export { LiveApiError, LiveNotConfiguredError } from './errors';

const STORAGE_KEY = 'live_token';
/** Re-mint this long before `expiresAt` rather than waiting for a 401. */
const REMINT_BEFORE_MS = 24 * 60 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: string;
  username: string;
}

let cached: CachedToken | null = null;
let loadedFromStorage = false;
let inFlight: Promise<CachedToken> | null = null;

/** HTTP status of an axios-shaped error, without importing axios into this chunk. */
function httpStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === 'number' ? status : null;
}

function readCache(): CachedToken | null {
  if (cached) return cached;
  if (loadedFromStorage) return null;
  loadedFromStorage = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cached = JSON.parse(raw) as CachedToken;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Forget the cached LIVE token — on `live_not_configured`, and for tests.
 * `loadedFromStorage` goes back to false so the next read starts from scratch;
 * the entry has just been removed, so that read finds nothing.
 */
export function resetLiveAuth(): void {
  cached = null;
  loadedFromStorage = false;
  inFlight = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode — the in-memory cache is enough */
  }
}

async function mint(): Promise<CachedToken> {
  try {
    const res = await liveSessionToken();
    const next: CachedToken = {
      token: res.token,
      expiresAt: res.expiresAt,
      username: res.user.tiktok_username,
    };
    cached = next;
    loadedFromStorage = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode — keep it in memory only */
    }
    return next;
  } catch (error) {
    if (httpStatus(error) === 409) {
      resetLiveAuth();
      throw new LiveNotConfiguredError();
    }
    throw error;
  }
}

/**
 * The current LIVE token, minting one if the cache is empty, close to expiry,
 * or `force`d (after a 401). Concurrent callers share one in-flight mint.
 */
export async function bridgeToken(opts: { force?: boolean } = {}): Promise<string> {
  if (opts.force) {
    cached = null;
  } else {
    const hit = readCache();
    if (hit && Date.parse(hit.expiresAt) - Date.now() > REMINT_BEFORE_MS) return hit.token;
  }
  if (!inFlight) {
    inFlight = mint().finally(() => {
      inFlight = null;
    });
  }
  return (await inFlight).token;
}

/** The TikTok account this store is broadcasting as, once a token has been minted. */
export function liveUsername(): string | null {
  return readCache()?.username ?? null;
}

function request(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${liveApiBase()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

/**
 * Call the LIVE API with a bridged token. A 401 buys exactly one re-mint and
 * one retry — a second 401 is a real failure, not a reason to loop.
 */
async function liveFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await request(path, init, await bridgeToken());
  if (res.status === 401) {
    res = await request(path, init, await bridgeToken({ force: true }));
  }
  if (!res.ok) throw new LiveApiError(res.status, `${init.method ?? 'GET'} ${path} → ${res.status}`);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const liveClient = {
  bridgeToken,
  /** `null` when no session is running — an empty state, not an error. */
  getCurrentSession: () => liveFetch<LiveSession | null>('/api/sessions/current'),
  getSessionLogs: (limit = 100) => liveFetch<SessionLog[]>(`/api/sessions/logs?limit=${limit}`),
  startSession: () => liveFetch<LiveSession>('/api/sessions/start', { method: 'POST' }),
  stopSession: () => liveFetch<{ success: boolean }>('/api/sessions/stop', { method: 'POST' }),
};
