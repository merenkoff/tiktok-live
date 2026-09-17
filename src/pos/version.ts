// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Version of the `/api/pos` contract this backend speaks.
 *
 * Deliberately a single hand-bumped integer, not a negotiation scheme yet.
 * Today every POS build is treated as talking "v1" and the version is
 * **advisory** — the server logs a skew but does not reject (see
 * `pos.versioning.ts`). The point right now is only to have the seam in place
 * so a module released on its own cadence isn't silently talking to an
 * unversioned backend.
 *
 * Bump this (and `pos/src/platform/version.ts` on the client) the first time a
 * feature module is handed off for independent upgrades and a `/api/pos`
 * change would break an older module build. See `TechDocs/POS_API_VERSIONING.md`.
 *
 * 2 (verticals): `/catalog` and `/products` no longer carry `size`/`color`;
 * a variant has `attributes`, a derived `label` and a `unit`. A 1.x module
 * build (the shipped `stocktake`, for one) reads `item.size` and would show
 * bare product names, so this is exactly the break the version exists for.
 */
export const POS_API_VERSION = 2;

export interface PosApiVersionInfo {
  version: number;
}

export function posApiVersionInfo(): PosApiVersionInfo {
  return { version: POS_API_VERSION };
}

/** Response/request header carrying the integer POS API version. */
export const POS_API_VERSION_HEADER = 'x-pos-api-version';
