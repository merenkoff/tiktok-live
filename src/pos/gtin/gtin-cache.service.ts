// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/gtin-cache.service.ts

import { pool } from '../../db.js';
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
  // Manual from user always wins when provided as upgrade path
  if (incoming.source === 'manual' && current.best_source !== 'manual') return true;
  const inScore = sourceScore(incoming.source);
  const curScore = sourceScore(current.best_source ?? '');
  if (inScore > curScore) return true;
  if (inScore < curScore) return false;
  // Same source rank: prefer longer human title
  return incoming.name.length > (current.name?.length ?? 0);
}

export async function getGtinCache(code: string): Promise<GtinHint | null> {
  const norm = normalizeGtin(code);
  if (!norm.ok) return null;
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
  OR ($5 = 'manual' AND pos_gtin_cache.best_source IS DISTINCT FROM 'manual')
  OR $6::int > ${STORED_SCORE}
  OR ($6::int = ${STORED_SCORE} AND length($2) > length(pos_gtin_cache.name))
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
 */
export async function ingestGtinResults(params: {
  code: string;
  results: GtinLookupResult[];
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);

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

export async function isGtinLookupEnabled(storeId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT gtin_lookup_enabled FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  if (r.rows.length === 0) return false;
  return Boolean(r.rows[0].gtin_lookup_enabled);
}

export interface StoreGtinConfig {
  /** upc.dev key set in POS admin; null → fall back to UPC_DEV_API_KEY env. */
  upcDevApiKey: string | null;
  /** upc.dev daily cap set in POS admin; null → fall back to env / default. */
  upcDevDailyLimit: number | null;
}

export async function getStoreGtinConfig(storeId?: number): Promise<StoreGtinConfig> {
  if (!storeId) return { upcDevApiKey: null, upcDevDailyLimit: null };
  const r = await pool.query(
    `SELECT gtin_api_key, gtin_daily_limit FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  const row = r.rows[0] ?? {};
  return {
    upcDevApiKey: (row.gtin_api_key as string | null) ?? null,
    upcDevDailyLimit: row.gtin_daily_limit == null ? null : Number(row.gtin_daily_limit),
  };
}
