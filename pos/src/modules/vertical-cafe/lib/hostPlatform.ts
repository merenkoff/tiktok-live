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
 * Host symbols this catalog cannot render without.
 *
 * The modifier five arrived with platform 13, together with the third
 * argument of `addItem`. That is the case this list exists for: a platform-12
 * host would link this module fine and then silently drop the answers a
 * barista picked, ringing every oat latte at the card price. Naming a 13-only
 * symbol makes such a host fall back to the bundled catalog instead.
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

/** Which parts of the contract this host does not provide. Empty = compatible. */
export function missingHostApi(): string[] {
  const h = host as Record<string, unknown>;
  return REQUIRED_HOST_API.filter((name) => !hasFn(h[name]));
}
