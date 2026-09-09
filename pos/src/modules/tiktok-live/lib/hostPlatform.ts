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
// fourth means one more version of the shell it can no longer run on.
//
// Since roadmap #12 track 2 the manifest's `minHostPlatform` keeps a host with
// an older `PLATFORM_VERSION` from importing this module at all
// (TechDocs/POS_MODULE_PLATFORM_VERSION.md). This file still matters for hosts
// built BEFORE that check existed — they ignore the field — and it is what
// turns a link failure into a support code instead of a blank screen.

import * as host from '@pos/platform';
import type { BridgeTokenResponse, LiveSettings, LiveSettingsPatch } from '../types';

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

// ── Optional capability: broadcast settings ────────────────────────────────
//
// Deliberately NOT part of `REQUIRED_HOST_API`. These back the module's ADMIN
// surface only; the till's broadcast screen never touches them. Requiring them
// would cost the desk one more shell version it can no longer run on, for a
// screen that shell's cashier cannot reach anyway (`mount: 'admin'` is web-only).
//
// So the settings page probes instead, and an older shell gets an explanatory
// "update the app" card rather than a dead route.

type SettingsApi = {
  liveSettings?: () => Promise<LiveSettings>;
  updateLiveSettings?: (patch: LiveSettingsPatch) => Promise<LiveSettings>;
  testLiveTelegram?: () => Promise<{ ok: boolean; username: string | null }>;
};

function settingsApi(): SettingsApi {
  return (host.api ?? {}) as SettingsApi;
}

/** Host symbols the settings screen needs, in report order. Empty = supported. */
export function missingSettingsApi(): string[] {
  const api = settingsApi();
  const missing: string[] = [];
  if (!hasFn(api.liveSettings)) missing.push('api.liveSettings');
  if (!hasFn(api.updateLiveSettings)) missing.push('api.updateLiveSettings');
  if (!hasFn(api.testLiveTelegram)) missing.push('api.testLiveTelegram');
  return missing;
}

/** Does this shell expose the settings proxy at all? */
export function hasSettingsApi(): boolean {
  return missingSettingsApi().length === 0;
}

function requireSettingsApi(): SettingsApi {
  const missing = missingSettingsApi();
  if (missing.length > 0) throw new HostTooOldError(missing);
  return settingsApi();
}

export function liveSettings(): Promise<LiveSettings> {
  try {
    return requireSettingsApi().liveSettings!();
  } catch (error) {
    return Promise.reject(error);
  }
}

export function updateLiveSettings(patch: LiveSettingsPatch): Promise<LiveSettings> {
  try {
    return requireSettingsApi().updateLiveSettings!(patch);
  } catch (error) {
    return Promise.reject(error);
  }
}

export function testLiveTelegram(): Promise<{ ok: boolean; username: string | null }> {
  try {
    return requireSettingsApi().testLiveTelegram!();
  } catch (error) {
    return Promise.reject(error);
  }
}
