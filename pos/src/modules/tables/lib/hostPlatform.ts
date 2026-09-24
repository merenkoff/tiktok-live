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
 * Deliberately short, and deliberately all dotted or already-old names:
 * tables need nothing that platform 13 did not already export, so
 * `PLATFORM_VERSION` stays where К2 left it. A member reached through a dot
 * (`api.posRequest`) is resolved key by key, which is why adding one costs no
 * export name at all.
 */
export const REQUIRED_HOST_API = [
  'api.posRequest',
  'useOfflineStatus',
  'formatUah',
  // The menu beside the bill (К4l) is the till's own catalog machinery: tags,
  // folders, search and the shell-aware fetch, so the desktop till reads its
  // mirror and the web reads the server without this module knowing which it
  // is on. `useVertical` is what names the size row on the sheet.
  'useSalesCatalog',
  'useVertical',
  // The tap rule of the picker, borrowed whole from the café till: the
  // arithmetic and the wording of a question belong to the host, and a second
  // copy here would drift from the server's the first time either changed.
  'groupsOf',
  'defaultModifierIds',
  'needsModifierSheet',
  // К4h: the pre-bill. Platform 14 — the Tauri command behind it is the
  // host's, and a module reaching `invoke` itself would bundle a second copy
  // of the Tauri API. `getMeta` is how the till's configured receipt printer
  // is found; on the web both are present and simply never used, because the
  // shell there is not a till.
  'printPrecheck',
  'getMeta',
  'usePosShell',
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
 * screen that renders before the probe still gets a clean rejection instead
 * of a `TypeError`.
 *
 * Called as a METHOD of `host.api`, never as a detached function: it reaches
 * its axios client through `this`, and a detached call fails inside the host
 * before any request leaves the page — which the hall map would report as
 * «Не вдалося прочитати зал» with nothing on the network to explain it. The
 * kitchen board lost an afternoon to exactly that (К3c).
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
