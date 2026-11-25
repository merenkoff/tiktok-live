// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// This module's single point of contact with the host shell — a namespace
// import, as in `pass/lib/hostPlatform.ts`: the bundle ships on its own
// cadence and can meet a host older than itself, and a namespace import always
// links, which turns a missing export into a value we can inspect instead of
// a link-time `SyntaxError`.

import * as host from '@pos/platform';

/** The id the host files this module's hold on «Оплатити» under. */
export const REMOTE_KITCHEN_MODULE_ID = 'remote-kitchen';

/**
 * Host symbols this module cannot work without — all of them old. What the
 * cafe's block needs of platform 25 (the cart's hold and order id) is probed
 * separately by `remoteCartControls`: without it the till sells as it did
 * before the remote kitchen, and the kitchen's strip still answers.
 */
export const REQUIRED_HOST_API = ['api.posRequest', 'useCartStore'] as const;

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
  return path.split('.').reduce<unknown>((o, key) => (o as Record<string, unknown> | undefined)?.[key], host);
}

/** Which parts of the contract this host does not provide. Empty = compatible. */
export function missingHostApi(): string[] {
  return REQUIRED_HOST_API.filter((name) => !hasFn(member(name)));
}

/**
 * `host.api.posRequest`, checked per call and called as a METHOD of
 * `host.api` — it reaches its axios client through `this`, and a detached call
 * fails inside the host before any request leaves the page (К3c).
 */
export function posRequest<T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  body?: unknown
): Promise<T> {
  const missing = missingHostApi();
  if (missing.length > 0) return Promise.reject(new HostTooOldError(missing));
  return (host.api as unknown as { posRequest: (m: string, p: string, b?: unknown) => Promise<T> }).posRequest(
    method,
    path,
    body
  );
}

/** The two cart members the «З кухні» block writes (platform 25). */
export interface RemoteCartControls {
  setCheckoutHold: (reason: string | null) => void;
  setRemoteOrderId: (id: number | null) => void;
}

/**
 * The cart's remote-kitchen setters, or null on a host older than platform
 * 25. The hold is filed under this module's id, so lifting it never lifts
 * another module's. Without them the block simply does not draw and the till
 * sells exactly as before the remote kitchen.
 */
export function remoteCartControls(): RemoteCartControls | null {
  const store = member('useCartStore') as { getState?: () => Record<string, unknown> } | undefined;
  const state = typeof store?.getState === 'function' ? store.getState() : null;
  if (!state || !hasFn(state.setCheckoutHold) || !hasFn(state.setRemoteOrderId)) return null;
  // Platform 25 keys holds by module; a cart with the hold as one shared
  // string is a build that never shipped, and is not supported.
  if (typeof state.checkoutHolds !== 'object' || state.checkoutHolds === null) return null;
  return {
    setCheckoutHold: (reason) =>
      (store!.getState!().setCheckoutHold as (moduleId: string, r: string | null) => void)(
        REMOTE_KITCHEN_MODULE_ID,
        reason
      ),
    setRemoteOrderId: (id) => (store!.getState!().setRemoteOrderId as (i: number | null) => void)(id),
  };
}

/** The server's sentence for a refusal, or ours when there is none. */
export function serverMessage(error: unknown, fallback: string): string {
  const sent = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error;
  return typeof sent === 'string' && sent.trim() ? sent : fallback;
}
