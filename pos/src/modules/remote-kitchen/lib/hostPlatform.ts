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

/** Kitchen dishes agreed by phone offline (the host's `RemotePhoneAgreement`, platform 25). */
export interface RemotePhoneAgreement {
  minutes: number;
  agreed_at: string;
}

/** The cart members the «З кухні» block writes (platform 25). */
export interface RemoteCartControls {
  setCheckoutHold: (reason: string | null) => void;
  setRemoteOrderId: (id: number | null) => void;
  /**
   * The phone agreement the offline sale carries (РК5, §8); absent on a host
   * that cannot queue one — there kitchen dishes simply wait for the network.
   */
  setRemotePhone?: (agreement: RemotePhoneAgreement | null) => void;
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
    ...(hasFn(state.setRemotePhone)
      ? {
          setRemotePhone: (agreement: RemotePhoneAgreement | null) =>
            (store!.getState!().setRemotePhone as (a: RemotePhoneAgreement | null) => void)(agreement),
        }
      : {}),
  };
}

/** One word on a catalog tile — the host's `TileMark` (platform 25), mirrored. */
export interface TileMark {
  text: string;
  blocked: boolean;
}

/**
 * Puts this module's words on the store's catalog tiles by variant id, or
 * null on a host older than platform 25 (it has no marks, and the tiles stay
 * as they were). Null marks take them all off.
 */
export function tileMarkSetter(): ((marks: Readonly<Record<number, TileMark>> | null) => void) | null {
  const store = member('useCartStore') as { getState?: () => Record<string, unknown> } | undefined;
  const state = typeof store?.getState === 'function' ? store.getState() : null;
  if (!state || !hasFn(state.setTileMarks)) return null;
  return (marks) =>
    (store!.getState!().setTileMarks as (moduleId: string, m: Readonly<Record<number, TileMark>> | null) => void)(
      REMOTE_KITCHEN_MODULE_ID,
      marks
    );
}

/** The browser's own word: the only one the web shell has. */
function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Whether the till's offline runtime keeps `useOfflineStatus.online` moving —
 * the desktop and the tablet. The web shell starts no runtime: there the store
 * is seeded once from `navigator.onLine` and never moves again.
 */
function runtimeTracksOnline(): boolean {
  const enabled = member('isOfflineReadsEnabled');
  return typeof enabled === 'function' && (enabled as () => unknown)() === true;
}

/**
 * Is the till online: what its own offline banner says (`useOfflineStatus`)
 * where a runtime keeps that current, the browser's `navigator.onLine`
 * everywhere else. Subscribe with `onOnlineChange`.
 */
export function isOnline(): boolean {
  if (!runtimeTracksOnline()) return browserOnline();
  const store = member('useOfflineStatus') as { getState?: () => { online?: unknown } } | undefined;
  const online = typeof store?.getState === 'function' ? store.getState().online : undefined;
  return typeof online === 'boolean' ? online : browserOnline();
}

/**
 * Calls `listener` when the till goes on- or offline — only on a CHANGE of
 * `isOnline()`, never on every update of the offline store (its pending
 * counts move after every sale and sync pass). Returns the unsubscribe.
 */
export function onOnlineChange(listener: () => void): () => void {
  let last = isOnline();
  const check = () => {
    const now = isOnline();
    if (now === last) return;
    last = now;
    listener();
  };
  const stops: Array<() => void> = [];
  const store = member('useOfflineStatus') as { subscribe?: (l: () => void) => () => void } | undefined;
  if (typeof store?.subscribe === 'function') stops.push(store.subscribe(check));
  if (typeof window !== 'undefined') {
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    stops.push(() => {
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    });
  }
  return () => stops.forEach((stop) => stop());
}

/**
 * Whether the login says this store cooks for a linked cafe (`store.remote_kitchen`,
 * read at login and `/me`). Draws the kitchen's «Прийом запитів» on the till;
 * an older login without the field reads as no.
 */
export function isKitchenStore(): boolean {
  const store = member('useAuthStore') as { getState?: () => { auth?: { store?: { remote_kitchen?: unknown } } | null } };
  return typeof store?.getState === 'function' && store.getState().auth?.store?.remote_kitchen === true;
}

/**
 * The signed-in store's id, or null before a login. What a cached answer is
 * kept under, so signing into another store on the same till never reads the
 * first store's answer, nor the setup another store kept for offline.
 */
export function currentStoreId(): number | null {
  const store = member('useAuthStore') as { getState?: () => { auth?: { store?: { id?: unknown } } | null } };
  const id = typeof store?.getState === 'function' ? store.getState().auth?.store?.id : undefined;
  return typeof id === 'number' ? id : null;
}

/** The server's sentence for a refusal, or ours when there is none. */
export function serverMessage(error: unknown, fallback: string): string {
  const sent = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error;
  return typeof sent === 'string' && sent.trim() ? sent : fallback;
}
