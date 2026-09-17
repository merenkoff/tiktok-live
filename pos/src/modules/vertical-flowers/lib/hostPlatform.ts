// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// This module's single point of contact with the host shell.
//
// A namespace import, not named ones, for the same reason `tiktok-live` uses
// one: this bundle ships independently and can meet a host older than itself.
// `import { useSalesCatalog } from '@pos/platform'` against a host that lacks
// it is a link-time `SyntaxError` thrown before any module code runs — the
// cashier would get a screen that dead-ends with nothing saying why. A
// namespace import always links, which turns that into a value we can inspect.
//
// The `typeof` guards look redundant to TypeScript (it resolves the barrel
// against THIS checkout, where everything exists) and are not: they are what a
// runtime host built before `PLATFORM_VERSION` 4 trips over.
//
// Since a signed manifest carries `minHostPlatform`, a host older than the
// build usually refuses to import this at all. This file covers the hosts that
// predate that check, and the case where a store is pointed at a build from a
// newer checkout than the till has.

import * as host from '@pos/platform';

/** Host symbols this catalog cannot render without. */
export const REQUIRED_HOST_API = ['useSalesCatalog', 'useCartStore', 'useVertical'] as const;

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
  const h = host as Record<string, unknown>;
  return REQUIRED_HOST_API.filter((name) => !hasFn(h[name]));
}
