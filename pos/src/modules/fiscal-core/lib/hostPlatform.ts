// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's single point of contact with the host shell.
//
// See `pos/src/modules/tiktok-live/lib/hostPlatform.ts` — same pattern, same
// reasoning, copied deliberately rather than shared: `import * as host` (never
// named imports, or an older host fails to *link* the whole chunk instead of
// producing an inspectable value); `REQUIRED_HOST_API` + `missingHostApi()` +
// `HostTooOldError`.
//
// The contract here is smaller than tiktok-live's: exactly one symbol,
// `api.posRequest`. Every `/fiscal/*` call this bundle makes goes through it —
// see `../data/fiscalApi.ts` — so there is nothing else to probe for.

import * as host from '@pos/platform';

/** Host symbols this module cannot work without. */
export const REQUIRED_HOST_API = ['api.posRequest'] as const;

/** The host shell is older than this module — it lacks part of the contract. */
export class HostTooOldError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`host is missing: ${missing.join(', ')}`);
    this.name = 'HostTooOldError';
  }
}

function hasFn(value: unknown): boolean {
  return typeof value === 'function';
}

/** Which parts of the contract this host does not provide. Empty = compatible. */
export function missingHostApi(): string[] {
  const missing: string[] = [];
  if (!hasFn((host.api as { posRequest?: unknown } | undefined)?.posRequest)) {
    missing.push('api.posRequest');
  }
  return missing;
}

/** Build version of the host shell, for the support code. */
export function hostVersion(): string {
  return typeof host.POS_APP_VERSION === 'string' ? host.POS_APP_VERSION : 'unknown';
}

/**
 * API origin as the HOST has it baked in — diagnostics only, never load-bearing.
 * `posRequest` already inherits the right baseURL through the host's own axios
 * instance, so this is not part of `REQUIRED_HOST_API`; it just degrades to ''
 * on a host old enough to lack it.
 */
export function apiOrigin(): string {
  return hasFn(host.apiOrigin) ? host.apiOrigin() : '';
}

// Resolved once at module init, so the branch in `usePosShell` is a constant
// for the lifetime of the page and React's hook order stays stable.
const hostShellHook = hasFn(host.usePosShell) ? host.usePosShell : null;

/** `usePosShell`, degrading to the web shell on a host that has no such hook. */
export function usePosShell(): 'web' | 'cashier' {
  return hostShellHook ? hostShellHook() : 'web';
}

/**
 * `host.api.posRequest`, or a rejection an error card can render.
 *
 * Every call in `fiscalApi.ts` goes through this — checked once per call
 * rather than once at module load, so a page that renders before the check
 * still gets a clean error instead of a `TypeError: undefined is not a function`.
 */
export function posRequest<T>(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body?: unknown
): Promise<T> {
  const missing = missingHostApi();
  if (missing.length > 0) return Promise.reject(new HostTooOldError(missing));
  return (
    host.api as unknown as {
      posRequest: (m: string, p: string, b?: unknown) => Promise<T>;
    }
  ).posRequest(method, path, body);
}
