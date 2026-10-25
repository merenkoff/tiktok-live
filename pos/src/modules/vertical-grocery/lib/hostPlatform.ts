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
 * `isWeighed`, `displayUnit` and `lineAmountCents` arrived with platform 21,
 * together with `useCartStore.addWeighed` — a member of the store's state,
 * which a namespace probe cannot see. That is the case this list exists for:
 * a platform-20 host would link this module and then fail on the first tap of
 * a weighed tile, with no `addWeighed` to call. Naming a 21-only symbol makes
 * such a host fall back to the bundled catalog instead, which on a 20 host
 * sells the packed goods and refuses the weighed ones in words.
 *
 * `cashierApi.getCatalog` is the barcode lookup that leaves the grid alone
 * (see `GroceryCatalog`); a dotted name is resolved member by member.
 */
export const REQUIRED_HOST_API = [
  'useSalesCatalog',
  'useCartStore',
  'assetUrl',
  'isWeighed',
  'displayUnit',
  'lineAmountCents',
  'cashierApi.getCatalog',
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
