// src/pos/gtin/gtin-cache.service.ts

import { pool } from '../../db.js';
import { normalizeGtin } from './normalize.js';
import { sourceScore, type GtinHint, type GtinLookupResult, type GtinSource } from './types.js';

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
  const result = await pool.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [norm.gtin]);
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

/** Merge lookup results into canonical cache. Returns updated hint (or null if nothing useful). */
export async function ingestGtinResults(params: {
  code: string;
  results: GtinLookupResult[];
  storeId?: number;
  staffId?: number;
}): Promise<GtinHint | null> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);

  await recordLookupEvents(norm.gtin, params.results, {
    storeId: params.storeId,
    staffId: params.staffId,
  });

  const existing = await pool.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [norm.gtin]);
  let current = existing.rows[0]
    ? {
        name: existing.rows[0].name as string | null,
        brand: existing.rows[0].brand as string | null,
        image_url: existing.rows[0].image_url as string | null,
        best_source: existing.rows[0].best_source as string | null,
      }
    : { name: null as string | null, brand: null, image_url: null, best_source: null };

  let changed = false;
  for (const r of params.results) {
    if (!r.found) continue;
    const name = trimName(r.name);
    if (!name) continue;
    const brand = trimName(r.brand);
    const image = r.image_url ?? null;
    if (
      isBetterCandidate(
        { source: r.source, name },
        { best_source: current.best_source, name: current.name }
      )
    ) {
      current = {
        name,
        brand: brand ?? current.brand,
        image_url: image ?? current.image_url,
        best_source: r.source,
      };
      changed = true;
    } else if (current.name) {
      // fill missing brand/image without changing best_source
      if (!current.brand && brand) {
        current.brand = brand;
        changed = true;
      }
      if (!current.image_url && image) {
        current.image_url = image;
        changed = true;
      }
    }
  }

  if (!current.name && existing.rows.length === 0) {
    // Still create nothing if no name — but events already stored
    return null;
  }

  if (existing.rows.length === 0 && current.name) {
    const inserted = await pool.query(
      `INSERT INTO pos_gtin_cache (gtin, name, brand, image_url, best_source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [norm.gtin, current.name, current.brand, current.image_url, current.best_source]
    );
    return mapCache(inserted.rows[0]);
  }

  if (changed && existing.rows.length > 0) {
    const updated = await pool.query(
      `UPDATE pos_gtin_cache
       SET name = $2, brand = $3, image_url = $4, best_source = $5, updated_at = NOW()
       WHERE gtin = $1
       RETURNING *`,
      [norm.gtin, current.name, current.brand, current.image_url, current.best_source]
    );
    return mapCache(updated.rows[0]);
  }

  if (existing.rows.length > 0) return mapCache(existing.rows[0]);
  return null;
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
    code: norm.gtin,
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
