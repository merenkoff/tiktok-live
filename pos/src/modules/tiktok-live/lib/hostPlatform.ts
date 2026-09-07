// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's single point of contact with the host shell.
//
// WHY A NAMESPACE IMPORT. This module ships as a standalone signed bundle that
// a store can be pointed at independently of the shell it runs in, so it can
// meet a host older than itself. With named imports (`import { apiOrigin } from
// '@pos/platform'`) a host that lacks one of them fails to *link* the chunk:
// a `SyntaxError` at `import()` time, thrown before a line of module code runs.
// The user would get a working nav item that dead-ends in the generic route
// error boundary, and nothing anywhere would say why.
//
// `import * as host` always links, whatever the host exports. That turns a hard
// link error into a value we can inspect — see `missingHostApi()`, which feeds
// the support code on the error screen (`diagnostics.ts`).
//
// KEEP THE `typeof` GUARDS. TypeScript resolves `@pos/platform` against THIS
// checkout, so every symbol below looks defined to the compiler and the guards
// look redundant. They are not: they are what a *runtime* host older than this
// build trips over. Removing them restores the silent-dead-end behaviour above.
//
// The contract this module needs is small on purpose — three symbols. Adding a
// fourth means one more version of the shell it can no longer run on, so weigh
// it against roadmap #1 (a real platform-surface version) first.

import * as host from '@pos/platform';
import type { BridgeTokenResponse } from '../types';

/** Host symbols this module cannot work without, in `missingHostApi()` order. */
export const REQUIRED_HOST_API = ['apiOrigin', 'api.liveSessionToken', 'usePosShell'] as const;

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

/**
 * Which parts of the contract this host does not provide. Empty = compatible.
 * Recomputed per call (cheap, and never cached into a stale answer).
 */
export function missingHostApi(): string[] {
  const missing: string[] = [];
  if (!hasFn(host.apiOrigin)) missing.push('apiOrigin');
  if (!hasFn((host.api as { liveSessionToken?: unknown } | undefined)?.liveSessionToken)) {
    missing.push('api.liveSessionToken');
  }
  if (!hasFn(host.usePosShell)) missing.push('usePosShell');
  return missing;
}

/** Build version of the host shell, for the support code. */
export function hostVersion(): string {
  return typeof host.POS_APP_VERSION === 'string' ? host.POS_APP_VERSION : 'unknown';
}

/** API origin as the HOST has it baked in — never this module's own build env. */
export function apiOrigin(): string {
  return hasFn(host.apiOrigin) ? host.apiOrigin() : '';
}

// Resolved once at module init, so the branch in `usePosShell` below is a
// constant for the lifetime of the page and React's hook order stays stable.
const hostShellHook = hasFn(host.usePosShell) ? host.usePosShell : null;

/** `usePosShell`, degrading to the web shell on a host that has no such hook. */
export function usePosShell(): 'web' | 'cashier' {
  return hostShellHook ? hostShellHook() : 'web';
}

/** `POST /api/pos/live/session-token` through the host's authenticated client. */
export function liveSessionToken(): Promise<BridgeTokenResponse> {
  const missing = missingHostApi();
  if (missing.length > 0) return Promise.reject(new HostTooOldError(missing));
  return (host.api as unknown as { liveSessionToken: () => Promise<BridgeTokenResponse> })
    .liveSessionToken();
}
