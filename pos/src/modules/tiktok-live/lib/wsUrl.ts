// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { apiOrigin } from './hostPlatform';

/**
 * Absolute origin of the LIVE API, or '' for same-origin.
 *
 * Same backend as `/api/pos`. Deliberately the HOST's `VITE_API_BASE`, not this
 * module's own: the two are baked at different build times and on the Tauri
 * cashier only the host's is right (the desktop build has no same-origin
 * server). See `hostPlatform.ts`.
 */
export function liveApiBase(): string {
  return apiOrigin();
}

/** `https://host` → `wss://host`, `http://host` → `ws://host`. */
function toWsOrigin(origin: string): string {
  if (origin.startsWith('https://')) return `wss://${origin.slice(8)}`;
  if (origin.startsWith('http://')) return `ws://${origin.slice(7)}`;
  return origin;
}

/**
 * The log-stream WebSocket URL for a LIVE token.
 *
 * The token travels in the query string because that is the only channel a
 * browser `WebSocket` gives you (no custom headers). Inherited from the admin
 * SPA; it means a 7-day LIVE token can land in proxy/access logs — see
 * TechDocs/POS_LIVE_SELLING_MODULE.md.
 */
export function liveWsUrl(token: string): string {
  const origin = liveApiBase();
  const wsOrigin = origin
    ? toWsOrigin(origin)
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  return `${wsOrigin}/api/sessions/logs/stream?token=${encodeURIComponent(token)}`;
}
