// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// This module's single point of contact with the host shell — a namespace
// import, as in `tables/lib/hostPlatform.ts`: the bundle ships on its own
// cadence and can meet a host older than itself, and a namespace import always
// links, which turns a missing export into a value we can inspect instead of
// a link-time `SyntaxError`.

import * as host from '@pos/platform';

/**
 * Host symbols this module cannot work without — all of them old, so
 * `PLATFORM_VERSION` does not move for «Роздача».
 */
export const REQUIRED_HOST_API = ['api.posRequest', 'useOfflineStatus', 'useAuthStore'] as const;

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
export function posRequest<T>(method: 'get' | 'post', path: string, body?: unknown): Promise<T> {
  const missing = missingHostApi();
  if (missing.length > 0) return Promise.reject(new HostTooOldError(missing));
  return (host.api as unknown as { posRequest: (m: string, p: string, b?: unknown) => Promise<T> }).posRequest(
    method,
    path,
    body
  );
}

/** The server's sentence for a refusal, or ours when there is none. */
export function serverMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string') return data.error;
  return fallback;
}

/** The refusal's `code` (`over_served`, `undo_expired`, …), when the server named one. */
export function serverCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

/** Whether the request got an answer at all — a refusal is an answer, a timeout is not. */
export function hasAnswer(error: unknown): boolean {
  return typeof (error as { response?: { status?: unknown } })?.response?.status === 'number';
}
