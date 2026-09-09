// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/gtin-cache.service.ts

import { pool } from '../../db.js';
import { isInternalBarcode } from './internal-code.js';
import { normalizeGtin } from './normalize.js';
import {
  sourcePriorityList,
  sourceScore,
  type GtinHint,
  type GtinLookupResult,
  type GtinSource,
} from './types.js';

function mapCache(row: Record<string, unknown>): GtinHint {
  return {
    gtin: String(row.gtin),
    name: row.name == null ? null : String(row.name),
    brand: row.brand == null ? null : String(row.brand),
    image_url: row.image_url == null ? null : String(row.image_url),
    best_source: row.best_source == null ? null : String(row.best_source),
    blocked: row.blocked_at != null,
    filled_at: row.filled_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function trimName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const t = name.trim();
  return t ? t.slice(0, 500) : null;
}

function isBetterCandidate(
  incoming: { source: string; name: string | null },
  current: { best_source: string | null; name: string | null }
): boolean {
  if (!incoming.name) return false;
  if (!current.name) return true;
  const inScore = sourceScore(incoming.source);
  const curScore = sourceScore(current.best_source ?? '');
  if (inScore > curScore) return true;
  if (inScore < curScore) return false;
  // Same rank. A second manual edit is someone correcting the first, so the
  // newer text wins even when it is shorter ("Молоко" replacing "Молоко 3.2%").
  if (incoming.source === 'manual') return true;
  // Between automatic sources of equal rank, prefer the longer human title.
  return incoming.name.length > (current.name?.length ?? 0);
}

/**
 * Read the cache row for a barcode.
 *
 * A tombstone comes back as a hint with `blocked: true` and a null `name`
 * rather than as `null` — callers already gate on `hint?.name`, and the scan
 * flow needs to see the block so it can skip the external fan-out entirely
 * instead of spending provider quota on a code the owner has rejected.
 */
export async function getGtinCache(code: string): Promise<GtinHint | null> {
  const norm = normalizeGtin(code);
  if (!norm.ok) return null;
  // A store-local code means nothing to anyone else: there is nothing to find
  // here, and the caller must not go spend provider quota looking either.
  if (isInternalBarcode(norm.display)) return null;
  const result = await pool.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [
    norm.canonical,
  ]);
  if (result.rows.length === 0) return null;
  return mapCache(result.rows[0]);
}

export async function recordLookupEvents(
  gtin: string,
  results: GtinLookupResult[],
  meta?: { storeId?: number; staffId?: number }
): Promise<void> {
  for (const r of results) {
    await pool.query(
      `INSERT INTO pos_gtin_lookup_events
         (gtin, source, found, name, brand, image_url, raw_json, store_id, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        gtin,
        r.source,
        r.found,
        trimName(r.name),
        trimName(r.brand),
        r.image_url ?? null,
        r.raw == null ? null : JSON.stringify(r.raw).slice(0, 8000),
        meta?.storeId ?? null,
        meta?.staffId ?? null,
      ]
    );
  }
}

/**
 * Fold the incoming results into a single candidate, using the same ranking the
 * cache uses. `brand`/`image_url` fall back to any other named result, so a
 * source that knows the title but not the brand still contributes the brand.
 */
function foldResults(results: GtinLookupResult[]): {
  name: string;
  brand: string | null;
  image_url: string | null;
  source: string;
} | null {
  let best: { name: string; brand: string | null; image_url: string | null; source: string } | null =
    null;
  let fallbackBrand: string | null = null;
  let fallbackImage: string | null = null;

  for (const r of results) {
    if (!r.found) continue;
    const name = trimName(r.name);
    if (!name) continue;

    const brand = trimName(r.brand);
    const image = r.image_url ?? null;
    if (!fallbackBrand && brand) fallbackBrand = brand;
    if (!fallbackImage && image) fallbackImage = image;

    if (
      !best ||
      isBetterCandidate({ source: r.source, name }, { best_source: best.source, name: best.name })
    ) {
      best = { name, brand, image_url: image, source: r.source };
    }
  }

  if (!best) return null;
  return {
    ...best,
    brand: best.brand ?? fallbackBrand,
    image_url: best.image_url ?? fallbackImage,
  };
}

/**
 * The `isBetterCandidate` rules, expressed against the stored row so the whole
 * decision happens inside one statement. `$7` carries the source priority list
 * (best first) so `GTIN_SOURCE_PRIORITY` stays the single source of truth; the
 * arithmetic mirrors `sourceScore` — index 0 scores `length`, unknown scores 0.
 */
const STORED_SCORE = `COALESCE(
  cardinality($7::text[]) + 1 - array_position($7::text[], pos_gtin_cache.best_source),
  0
)`;

const INCOMING_WINS = `(
  pos_gtin_cache.name IS NULL
  OR $6::int > ${STORED_SCORE}
  OR ($6::int = ${STORED_SCORE}
      AND ($5 = 'manual' OR length($2) > length(pos_gtin_cache.name)))
)`;

/**
 * Merge lookup results into the canonical cache. Returns the resulting hint, or
 * null when nothing usable was learned and nothing was cached before.
 *
 * ATOMICITY. This used to read the row, merge in JS, then INSERT or UPDATE.
 * Nothing guarded the gap: two callers that both saw "not cached" both inserted
 * and the second died on `pos_gtin_cache_pkey`, and two callers that both saw
 * the same row overwrote each other, which could demote a better source. Every
 * cache write goes through here (`/gtin/ingest`, `/gtin/lookup/quota-providers`,
 * `learnBatch`, the dump learn jobs, `learnFromManual`), and the cache is shared
 * by every store, so concurrent writers for one barcode are ordinary. It is now
 * a single upsert that keeps the better row whichever writer lands first.
 *
 * TOMBSTONES. A row an owner cleared (`blocked_at`) is left alone — the `WHERE`
 * on the upsert declines it. Every write path funnels through here, so that one
 * clause covers scanning, `learnBatch` and dump seeding alike.
 */
export async function ingestGtinResults(params: {
  code: string;
  results: GtinLookupResult[];
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);

  // NEVER cache a store-local code. `pos_gtin_cache` is keyed by GTIN alone
  // with no store_id, so a row written here would hand store A's product name
  // to store B, which minted the same-shaped code for something else. Every
  // write path funnels through this function, so this one clause covers
  // scanning, `learnBatch`, the supplier import and dump seeding alike.
  if (isInternalBarcode(norm.display)) return null;

  await recordLookupEvents(norm.canonical, params.results, {
    storeId: params.storeId,
    staffId: params.staffId,
  });

  const candidate = foldResults(params.results);
  if (!candidate) {
    // Nothing usable came back. Events are recorded either way; never create a
    // nameless cache row.
    return getGtinCache(norm.canonical);
  }

  const result = await pool.query(
    `INSERT INTO pos_gtin_cache (gtin, name, brand, image_url, best_source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (gtin) DO UPDATE SET
       name = CASE WHEN ${INCOMING_WINS} THEN EXCLUDED.name ELSE pos_gtin_cache.name END,
       brand = CASE WHEN ${INCOMING_WINS}
                    THEN COALESCE(EXCLUDED.brand, pos_gtin_cache.brand)
                    ELSE COALESCE(pos_gtin_cache.brand, EXCLUDED.brand) END,
       image_url = CASE WHEN ${INCOMING_WINS}
                        THEN COALESCE(EXCLUDED.image_url, pos_gtin_cache.image_url)
                        ELSE COALESCE(pos_gtin_cache.image_url, EXCLUDED.image_url) END,
       best_source = CASE WHEN ${INCOMING_WINS}
                          THEN EXCLUDED.best_source
                          ELSE pos_gtin_cache.best_source END,
       updated_at = CASE
         WHEN ${INCOMING_WINS}
           OR (pos_gtin_cache.brand IS NULL AND EXCLUDED.brand IS NOT NULL)
           OR (pos_gtin_cache.image_url IS NULL AND EXCLUDED.image_url IS NOT NULL)
         THEN NOW()
         ELSE pos_gtin_cache.updated_at
       END
     WHERE pos_gtin_cache.blocked_at IS NULL
     RETURNING *`,
    [
      norm.canonical,
      candidate.name,
      candidate.brand,
      candidate.image_url,
      candidate.source,
      sourceScore(candidate.source),
      sourcePriorityList(),
    ]
  );

  // No row back means the `WHERE` declined the update: an owner cleared this
  // entry, and no automatic source may refill it. Read it back as-is.
  if (result.rows.length === 0) return getGtinCache(norm.canonical);
  return mapCache(result.rows[0]);
}

export async function learnFromManual(params: {
  code: string;
  name: string;
  brand?: string | null;
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const name = trimName(params.name);
  if (!name) return null;
  const norm = normalizeGtin(params.code);
  if (!norm.ok) return null;
  return ingestGtinResults({
    code: norm.canonical,
    storeId: params.storeId,
    staffId: params.staffId,
    results: [
      {
        source: 'manual' satisfies GtinSource,
        found: true,
        name,
        brand: params.brand ?? null,
      },
    ],
  });
}

export async function setGtinManualEntry(params: {
  code: string;
  name: string;
  brand?: string | null;
  image_url?: string | null;
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);
  const name = trimName(params.name);
  if (!name) throw new Error('name required');

  await unblockGtin({ code: norm.canonical });
  return ingestGtinResults({
    code: norm.canonical,
    storeId: params.storeId,
    staffId: params.staffId,
    results: [
      {
        source: 'manual' satisfies GtinSource,
        found: true,
        name,
        brand: params.brand ?? null,
        image_url: params.image_url ?? null,
        raw: { action: 'manual_edit' },
      },
    ],
  });
}

/**
 * Clear a cache entry and keep it cleared.
 *
 * A plain DELETE would be undone by the next scan — the same external sources
 * would hand back the same wrong name. The row survives as a tombstone that
 * `ingestGtinResults` refuses to fill.
 */
export async function blockGtin(params: {
  code: string;
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);

  const r = await pool.query(
    `INSERT INTO pos_gtin_cache (gtin, blocked_at, blocked_by)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (gtin) DO UPDATE
       SET name = NULL, brand = NULL, image_url = NULL, best_source = NULL,
           blocked_at = NOW(), blocked_by = $2, updated_at = NOW()
     RETURNING *`,
    [norm.canonical, params.staffId ?? null]
  );
  await recordLookupEvents(
    norm.canonical,
    [{ source: 'manual', found: false, raw: { action: 'evict' } }],
    { storeId: params.storeId, staffId: params.staffId }
  );
  return mapCache(r.rows[0]);
}

/**
 * Lift a tombstone so the automatic sources may fill the entry again.
 *
 * A tombstone that was never anything else holds no data once unblocked, so the
 * row is dropped rather than left as a blank entry at the top of the owner's
 * list — "not in the cache" is exactly what it now means. Returns null in that
 * case, the same as any other miss.
 */
export async function unblockGtin(params: {
  code: string;
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);
  const r = await pool.query(
    `UPDATE pos_gtin_cache
     SET blocked_at = NULL, blocked_by = NULL, updated_at = NOW()
     WHERE gtin = $1 AND blocked_at IS NOT NULL
     RETURNING *`,
    [norm.canonical]
  );
  if (r.rows.length === 0) return getGtinCache(norm.canonical);
  if (r.rows[0].name == null) {
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1 AND name IS NULL`, [
      norm.canonical,
    ]);
    return null;
  }
  return mapCache(r.rows[0]);
}

export interface GtinCachePage {
  items: GtinHint[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Owner browse/search over the cache. `q` is matched as a barcode when it looks
 * like one (canonical key, exact) and as a name/brand substring otherwise.
 */
export async function listGtinCache(params: {
  q?: string | null;
  limit?: number;
  offset?: number;
  blockedOnly?: boolean;
}): Promise<GtinCachePage> {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const q = params.q?.trim() || '';

  const where: string[] = [];
  const values: unknown[] = [];
  if (q) {
    const norm = normalizeGtin(q);
    if (norm.ok) {
      values.push(norm.canonical);
      where.push(`gtin = $${values.length}`);
    } else if (/^\d+$/.test(q)) {
      // Partial barcode — the operator is still typing or read it off a label.
      values.push(`%${q}%`);
      where.push(`gtin LIKE $${values.length}`);
    } else {
      values.push(`%${q}%`);
      where.push(`(name ILIKE $${values.length} OR brand ILIKE $${values.length})`);
    }
  }
  if (params.blockedOnly) where.push(`blocked_at IS NOT NULL`);
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = await pool.query(
    `SELECT COUNT(*)::int AS c FROM pos_gtin_cache ${clause}`,
    values
  );
  const rows = await pool.query(
    `SELECT * FROM pos_gtin_cache ${clause}
     ORDER BY updated_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );
  return {
    items: rows.rows.map(mapCache),
    total: Number(total.rows[0].c),
    limit,
    offset,
  };
}

export async function isGtinLookupEnabled(storeId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT gtin_lookup_enabled FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  if (r.rows.length === 0) return false;
  return Boolean(r.rows[0].gtin_lookup_enabled);
}
