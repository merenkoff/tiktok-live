// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Turns a failed `/fiscal/*` call into something a cashier can read out over
// the phone. See `pos/src/modules/tiktok-live/lib/diagnostics.ts` for the
// pattern this copies — same reasoning applies to why it is copied rather than
// shared (this module needs its own `MODULE_VERSION` read, and its own
// support-code prefix).
//
// One thing this file has that tiktok-live's does not: every `/fiscal/*` route
// already answers a document/provider-level failure with its OWN support code
// (`supportCode()` in `src/pos/fiscal/errors.ts`, e.g. `FS-SHIFT-CLOSED`) — the
// backend has already done the precise classification by `FiscalErrorKind`.
// So `diagnose()` prefers that code verbatim over reinventing one, and only
// falls back to its own `FC-…` classification for failures the server never
// got to answer at all: a host too old to have `posRequest`, or the network.

import { apiOrigin, hostVersion, missingHostApi, HostTooOldError } from './hostPlatform';
import { isFiscalErrorBody, type FiscalErrorBody } from '../types';

/**
 * This module's own build version. Deliberately `__POS_APP_VERSION__` (a
 * `define`-time literal from `vite.fiscal-checkbox-remote.config.ts`), NOT an
 * import of `platform/version.ts` — see the identical comment in
 * `tiktok-live/lib/diagnostics.ts`. Importing the real module from both the
 * synchronous `remote-entry.ts` and this lazily-reachable file would give
 * Rollup a shared-dependency edge it hoists into a chunk `remoteVerify.ts`
 * does not hash-check, silently turning the verified entry into an unverified
 * two-file load.
 */
const MODULE_VERSION: string =
  typeof __POS_APP_VERSION__ === 'string' ? __POS_APP_VERSION__ : '0.0.0-dev';

export type FiscalFailureReason = 'host_too_old' | 'server' | 'network' | 'unknown';

export interface FiscalDiagnostic {
  code: string;
  reason: FiscalFailureReason;
  status: number | null;
  /** The server's own machine error code (`fiscal_unavailable`, `not_configured`, …), when present. */
  serverError: string | null;
  missingHostApi: string[];
  moduleVersion: string;
  hostVersion: string;
  apiBase: string;
  at: string;
}

const REASON_TAG: Record<FiscalFailureReason, string> = {
  host_too_old: 'HOST',
  server: 'SRV',
  network: 'NET',
  unknown: 'UNK',
};

function axiosBody(error: unknown): FiscalErrorBody | null {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  return isFiscalErrorBody(data) ? data : null;
}

function httpStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === 'number' ? status : null;
}

function classify(error: unknown, status: number | null): FiscalFailureReason {
  if (error instanceof HostTooOldError) return 'host_too_old';
  if (status !== null) return 'server';
  if (error instanceof Error) return 'network';
  return 'unknown';
}

/**
 * Classify any failure from a `posRequest` call. The server's own
 * `support_code` wins whenever the response carries one — it already knows
 * exactly which `FiscalErrorKind` this was.
 */
export function diagnose(error: unknown): FiscalDiagnostic {
  const status = httpStatus(error);
  const body = axiosBody(error);
  const partial = {
    reason: classify(error, status),
    status,
    serverError: body?.error ?? null,
    missingHostApi: missingHostApi(),
    moduleVersion: MODULE_VERSION,
    hostVersion: hostVersion(),
    apiBase: apiOrigin(),
    at: new Date().toISOString(),
  };
  const code =
    body?.support_code ??
    `FC-${partial.reason === 'server' && status !== null ? `${REASON_TAG.server}${status}` : REASON_TAG[partial.reason]}-${partial.moduleVersion}-${partial.hostVersion}`;
  return { ...partial, code };
}

/** The cashier-facing message, preferring what the server already said. */
export function diagnosticMessage(error: unknown, diagnostic: FiscalDiagnostic): string {
  const body = axiosBody(error);
  if (body?.message) return body.message;
  switch (diagnostic.reason) {
    case 'host_too_old':
      return 'Оновіть застосунок каси, щоб продовжити';
    case 'network':
      return 'Немає звʼязку з сервером';
    default:
      return 'Помилка ПРРО';
  }
}

/** JSON block behind "показати деталі" — what the copy button puts on the clipboard. */
export function diagnosticText(d: FiscalDiagnostic): string {
  return JSON.stringify({ module: 'fiscal-checkbox', ...d }, null, 2);
}

const reported = new Set<string>();

/**
 * Log a failure once per distinct code, and park the latest on
 * `window.__POS_FISCAL_DIAG__` so a support call can read it back out of the
 * console without a rebuild.
 */
export function reportFiscalFailure(d: FiscalDiagnostic): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __POS_FISCAL_DIAG__?: FiscalDiagnostic }).__POS_FISCAL_DIAG__ = d;
  }
  if (reported.has(d.code)) return;
  reported.add(d.code);
  console.error(`[fiscal] ${d.code}`, d);
}

/** Tests only — the once-per-code guard is module-level state. */
export function resetReportedFailures(): void {
  reported.clear();
}
