// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/index.ts
//
// Vertical lookup — the same table style as `fiscal/providers/index.ts`: one
// place that says which verticals exist, so adding a café is a single line plus
// its definition file. `registerVertical` is also the test seam.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import { cafeVertical } from './cafe.js';
import { clothingVertical } from './clothing.js';
import { flowersVertical } from './flowers.js';
import type { VerticalDefinition, VerticalId, VerticalPublicConfig } from './types.js';

/** Verticals compiled into this build. */
const BUILT_IN: VerticalDefinition[] = [clothingVertical, flowersVertical, cafeVertical];

/** What a store gets when nothing says otherwise — and the sell-screen fallback. */
export const DEFAULT_VERTICAL_ID: VerticalId = 'clothing';

const verticals = new Map<VerticalId, VerticalDefinition>();

function seed(): void {
  verticals.clear();
  for (const vertical of BUILT_IN) verticals.set(vertical.id, vertical);
}
seed();

export function hasVertical(id: unknown): id is VerticalId {
  return typeof id === 'string' && verticals.has(id as VerticalId);
}

/** The definition for `id`. Throws — an unknown id is a bug, not a fallback. */
export function getVertical(id: VerticalId): VerticalDefinition {
  const vertical = verticals.get(id);
  if (!vertical) throw new Error(`No vertical definition for "${id}"`);
  return vertical;
}

/**
 * The definition for a value read out of the database.
 *
 * Unlike `getVertical` this never throws: a column written by a newer build
 * (or by hand) must not break every login of that store. It degrades to
 * clothing — the generic catalog still sells — and says so in the log.
 */
export function verticalOrDefault(id: string | null | undefined): VerticalDefinition {
  if (hasVertical(id)) return getVertical(id);
  if (id != null && id !== '') {
    logger.warn('pos: unknown store vertical, falling back', { vertical: id });
  }
  return getVertical(DEFAULT_VERTICAL_ID);
}

/** The client's view: schema and units, no functions. */
export function publicConfigOf(def: VerticalDefinition): VerticalPublicConfig {
  return {
    id: def.id,
    title: def.title,
    attributes: def.attributes,
    units: [...def.units],
    defaultUnit: def.units[0],
    maxCompositionDepth: def.maxCompositionDepth,
  };
}

/** Every vertical this build ships, for the super admin's picker. */
export function listVerticals(): VerticalPublicConfig[] {
  return [...verticals.values()].map(publicConfigOf);
}

/** Install or replace a definition. Used by the built-ins and by tests. */
export function registerVertical(def: VerticalDefinition): void {
  verticals.set(def.id, def);
}

/** Restore the built-in set. Tests call this in `afterEach`. */
export function resetVerticals(): void {
  seed();
}

/** Minimal query surface — `pool` or a checked-out client inside a transaction. */
interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * The vertical of one store, straight from its row.
 *
 * Product and stock services take `(storeId, …)` and reach for this rather than
 * threading a definition through every signature; inside a transaction pass the
 * checked-out client so the read sees the same snapshot as the write.
 */
export async function loadStoreVertical(
  client: Queryable = pool,
  storeId?: number
): Promise<VerticalDefinition> {
  if (storeId == null) return getVertical(DEFAULT_VERTICAL_ID);
  const result = await client.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
  return verticalOrDefault(result.rows[0]?.vertical as string | undefined);
}

export { cafeVertical } from './cafe.js';
export { clothingVertical } from './clothing.js';
export { flowersVertical } from './flowers.js';
export {
  normalizeAttributes,
  normalizeUnit,
  normalizeVariant,
  searchableAttributeKeys,
  VerticalValidationError,
} from './attributes.js';
export type {
  AttributeSpec,
  AttributeType,
  AttributeValues,
  VerticalDefinition,
  VerticalId,
  VerticalPublicConfig,
} from './types.js';
