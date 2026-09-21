// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// This module's single point of contact with the host shell — a namespace
// import, for the reason `vertical-flowers/lib/hostPlatform.ts` spells out:
// this bundle ships on its own cadence and can meet a host older than itself,
// and a namespace import always links, which turns a missing export into a
// value we can inspect instead of a link-time `SyntaxError`.

import * as host from '@pos/platform';

/**
 * Host symbols this module cannot work without.
 *
 * The modifier five arrived with platform 13, together with the third
 * argument of `addItem`. That is the case this list exists for: a platform-12
 * host would link this module fine and then silently drop the answers a
 * barista picked, ringing every oat latte at the card price. Naming a 13-only
 * symbol makes such a host fall back to the bundled catalog instead.
 *
 * The kitchen board (К3c) adds two members that need no new export name —
 * `api.posRequest` (the generic `/api/pos/*` call `fiscal-core` probes the
 * same way) and `useOfflineStatus` — so `PLATFORM_VERSION` stays 13. A dotted
 * name is resolved member by member.
 */
export const REQUIRED_HOST_API = [
  'useSalesCatalog',
  'useCartStore',
  'useVertical',
  'assetUrl',
  'resolveLineModifiers',
  'lineCaption',
  'cartLineUid',
  'defaultModifierIds',
  'needsModifierSheet',
  'groupsOf',
  'useOfflineStatus',
  'api.posRequest',
] as const;

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

/** `host.a.b` for a dotted name, or undefined anywhere along the way. */
function member(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, key) => (o as Record<string, unknown> | undefined)?.[key], host);
}

/** Which parts of the contract this host does not provide. Empty = compatible. */
export function missingHostApi(): string[] {
  return REQUIRED_HOST_API.filter((name) => !hasFn(member(name)));
}

/**
 * `host.api.posRequest`, checked per call rather than once at load, so a
 * board that renders before the probe still gets a clean rejection instead
 * of a `TypeError`.
 *
 * Called as a method of `host.api`, never as a detached function: it is a
 * class method that reaches its axios client through `this`, and a detached
 * call fails inside the host before any request leaves the page — which the
 * board would report as «Не вдалося прочитати замовлення» with nothing on the
 * network to explain it.
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

/**
 * Ask the host to re-read its catalog — on the desktop, to refresh the offline
 * mirror so a stop-list toggle greys the tile at once. A host without the
 * member (older than К3c) simply keeps its next scheduled refresh; the board
 * is right either way, so this is not part of the contract.
 */
export async function refreshCatalog(): Promise<void> {
  const fn = member('cashierApi.refreshCatalog');
  if (hasFn(fn)) await (fn as () => Promise<void>)();
}
