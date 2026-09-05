// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Optional network sink for module telemetry (roadmap #6). **Off by default** —
 * symmetrical to `POS_API_STRICT_VERSION` on the backend. Enable per build with
 * `VITE_POS_TELEMETRY_BEACON=1`, or per browser with
 * `localStorage.setItem('pos_telemetry_beacon', '1')`.
 *
 * When on, it forwards a whitelist of `ModuleEvent`s (never the `remote_load_ok`
 * chatter) to `POST /api/pos/client-telemetry` via `navigator.sendBeacon`
 * (falling back to a `keepalive` fetch). Best-effort: never throws, never
 * retries. Without the flag this module does nothing.
 */

import { posApiBase } from '../lib/urls';
import { POS_APP_VERSION } from '../platform/version';
import { onModuleEvent, type ModuleEvent, type StampedModuleEvent } from './telemetry';

const FLAG_KEY = 'pos_telemetry_beacon';

const FORWARDED: ReadonlySet<ModuleEvent['type']> = new Set<ModuleEvent['type']>([
  'session_manifest',
  'api_version_skew',
  'remote_load_error',
  'remote_load_fallback',
  'route_render_error',
]);

let started = false;

function isEnabled(): boolean {
  if (import.meta.env.VITE_POS_TELEMETRY_BEACON === '1') return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem('pos_session_id');
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem('pos_session_id', fresh);
    return fresh;
  } catch {
    return 'no-session-storage';
  }
}

function send(event: StampedModuleEvent): void {
  const url = `${posApiBase()}/client-telemetry`;
  const body = JSON.stringify({
    at: event.at,
    sessionId: sessionId(),
    appVersion: POS_APP_VERSION,
    event,
  });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* telemetry must never break the app */
  }
}

/** Idempotent. Wires the beacon iff the flag is set; otherwise a no-op. */
export function maybeStartTelemetryBeacon(): void {
  if (started || !isEnabled()) return;
  started = true;
  onModuleEvent((event) => {
    if (FORWARDED.has(event.type)) send(event);
  });
}
