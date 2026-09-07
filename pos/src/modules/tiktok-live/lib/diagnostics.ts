// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Turns "the live feed won't start" into something a cashier can read out over
// the phone and we can act on without a screen-share.
//
// This module is the piece of the POS most likely to be running against a shell
// or a backend of a different age (it is downloaded per store, on its own
// cadence — roadmap #13), and the three ways that goes wrong look identical to
// the user: an empty screen. The support code separates them at a glance —
// which side is behind, and by how much:
//
//   TL-HOST-1.0.8-1.0.4     module 1.0.8 on shell 1.0.4 → the CASHIER needs updating
//   TL-SRV404-1.0.8-1.0.8   shell fine, bridge route absent → the SERVER is behind
//   TL-NET-1.0.8-1.0.8      neither — the till is offline
//   TL-CFG-1.0.8-1.0.8      everything current, the store just isn't linked yet
//
// Deliberately free of anything identifying: no token, no TikTok nickname, no
// store name. Versions, a reason and an HTTP status are enough to route a
// ticket, and this string gets pasted into chats we do not control.

import { apiOrigin, hostVersion, missingHostApi, HostTooOldError } from './hostPlatform';
import { LiveApiError, LiveNotConfiguredError } from './errors';

/**
 * This module's own build version — deliberately NOT `import { POS_APP_VERSION }
 * from '../../../platform/version'` even though that is exactly what
 * `remote-entry.ts` does for the same value.
 *
 * `remote-entry.ts` is the only synchronous entry point, so its imports never
 * fork the bundle. This file, by contrast, is reachable from the lazily-loaded
 * `LiveDeskPage` chunk (`SupportCode` → here) as well. Importing the *module*
 * `platform/version.ts` from both places would give Rollup a real shared
 * dependency edge between the entry graph and the async-chunk graph, and it
 * factors that into a separate hashed chunk — which `remoteVerify.ts` does NOT
 * hash-check (by design: it verifies `remote-entry.js` and `style.css` only,
 * treating everything else as an ordinary lazy chunk). That would turn the
 * entry point itself into an unverified two-file load instead of one verified
 * file, silently, the next time someone touches this constant.
 *
 * `__POS_APP_VERSION__` is a `define`-time string literal (`vite.tiktok-live-
 * remote.config.ts`), not a real import — referencing it directly here costs
 * one duplicated line instead of a shared module, so no such edge exists.
 */
const MODULE_VERSION: string =
  typeof __POS_APP_VERSION__ === 'string' ? __POS_APP_VERSION__ : '0.0.0-dev';

export type LiveFailureReason =
  | 'not_configured'
  | 'host_too_old'
  | 'server_missing_bridge'
  | 'server_error'
  | 'network'
  | 'unknown';

export interface LiveDiagnostic {
  /** The short string shown on screen and quoted to support. */
  code: string;
  reason: LiveFailureReason;
  /** HTTP status of the bridge call, when there was a response. */
  status: number | null;
  /** Host contract symbols this shell does not provide (see `hostPlatform`). */
  missingHostApi: string[];
  moduleVersion: string;
  hostVersion: string;
  /** Which backend was addressed — '' means same origin as the page. */
  apiBase: string;
  at: string;
}

const REASON_TAG: Record<LiveFailureReason, string> = {
  not_configured: 'CFG',
  host_too_old: 'HOST',
  server_missing_bridge: 'SRV404',
  server_error: 'SRV',
  network: 'NET',
  unknown: 'UNK',
};

/**
 * The HTTP status behind a failure: axios shape (the bridge call), or this
 * module's own errors, which carry the status the LIVE API returned.
 */
function httpStatus(error: unknown): number | null {
  if (error instanceof LiveNotConfiguredError || error instanceof LiveApiError) {
    return error.status;
  }
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === 'number' ? status : null;
}

function classify(error: unknown, status: number | null): LiveFailureReason {
  if (error instanceof HostTooOldError) return 'host_too_old';
  if (status === 409) return 'not_configured';
  if (status === 404) return 'server_missing_bridge';
  if (status !== null) return 'server_error';
  // An axios error with no `response` never reached the server: offline, DNS,
  // CORS, or a blocked WebSocket/XHR. Anything non-Error is a genuine unknown.
  if (error instanceof Error) return 'network';
  return 'unknown';
}

export function supportCode(d: Omit<LiveDiagnostic, 'code'>): string {
  const tag =
    d.reason === 'server_error' && d.status !== null
      ? `${REASON_TAG.server_error}${d.status}`
      : REASON_TAG[d.reason];
  return `TL-${tag}-${d.moduleVersion}-${d.hostVersion}`;
}

/** Classify a bridge failure into something reportable. */
export function diagnose(error: unknown): LiveDiagnostic {
  const status = httpStatus(error);
  const partial: Omit<LiveDiagnostic, 'code'> = {
    reason: classify(error, status),
    status,
    missingHostApi: missingHostApi(),
    moduleVersion: MODULE_VERSION,
    hostVersion: hostVersion(),
    apiBase: apiOrigin(),
    at: new Date().toISOString(),
  };
  return { ...partial, code: supportCode(partial) };
}

/** The block behind "показати деталі" — what the copy button puts on the clipboard. */
export function diagnosticText(d: LiveDiagnostic): string {
  return JSON.stringify({ module: 'tiktok-live', ...d }, null, 2);
}

const reported = new Set<string>();

/**
 * Log a failure once per distinct code, and park the latest on
 * `window.__POS_TIKTOK_LIVE_DIAG__` so a support call can read it back out of
 * the console without a rebuild. Once-per-code because the reconnect loop and
 * the 5-second poller would otherwise repeat the same line forever.
 */
export function reportLiveFailure(d: LiveDiagnostic): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __POS_TIKTOK_LIVE_DIAG__?: LiveDiagnostic }).__POS_TIKTOK_LIVE_DIAG__ =
      d;
  }
  if (reported.has(d.code)) return;
  reported.add(d.code);
  console.error(`[tiktok-live] ${d.code}`, d);
}

/** Tests only — the once-per-code guard is module-level state. */
export function resetReportedFailures(): void {
  reported.clear();
}
