// src/pos/gtin/learn.service.ts — batch learning + stats

import { pool } from '../../db.js';
import { getGtinCache, ingestGtinResults, isGtinLookupEnabled } from './gtin-cache.service.js';
import { normalizeGtin } from './normalize.js';
import type { GtinSource } from './types.js';

const BATCH_MAX = 500;

const ALLOWED_SOURCES = new Set<string>([
  'manual',
  'open_products_facts',
  'open_food_facts',
  'open_beauty_facts',
  'upcitemdb',
  'upc_dev',
]);

export type LearnBatchItem = {
  gtin: string;
  name?: string | null;
  brand?: string | null;
  image_url?: string | null;
  source?: string;
};

export type LearnSkip = { gtin: string; reason: string };

export async function learnBatch(params: {
  items: LearnBatchItem[];
  storeId: number;
  staffId?: number;
}): Promise<{ accepted: number; upserted: number; skipped: LearnSkip[] }> {
  if (!(await isGtinLookupEnabled(params.storeId))) {
    throw new Error('gtin lookup disabled');
  }
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new Error('items required');
  }
  if (params.items.length > BATCH_MAX) {
    throw new Error(`max ${BATCH_MAX} items per request`);
  }

  const skipped: LearnSkip[] = [];
  let upserted = 0;
  let accepted = 0;

  for (const item of params.items) {
    const rawGtin = String(item.gtin ?? '').trim();
    const norm = normalizeGtin(rawGtin);
    if (!norm.ok) {
      skipped.push({ gtin: rawGtin || '(empty)', reason: `bad_gtin:${norm.reason}` });
      continue;
    }
    const name = item.name?.trim() || null;
    if (!name) {
      skipped.push({ gtin: norm.gtin, reason: 'empty_name' });
      continue;
    }
    const source = (item.source?.trim() || 'manual') as GtinSource;
    if (!ALLOWED_SOURCES.has(source)) {
      skipped.push({ gtin: norm.gtin, reason: 'bad_source' });
      continue;
    }

    accepted += 1;
    const before = await getGtinCache(norm.gtin);
    const hint = await ingestGtinResults({
      code: norm.gtin,
      storeId: params.storeId,
      staffId: params.staffId,
      results: [
        {
          source,
          found: true,
          name,
          brand: item.brand ?? null,
          image_url: item.image_url ?? null,
        },
      ],
    });
    if (hint?.name) {
      const changed =
        !before ||
        before.name !== hint.name ||
        before.brand !== hint.brand ||
        before.best_source !== hint.best_source;
      if (changed) upserted += 1;
    }
  }

  return { accepted, upserted, skipped };
}

export async function learnStats(): Promise<{
  cache_total: number;
  by_source: Record<string, number>;
  events_24h: number;
  recent_jobs: Array<Record<string, unknown>>;
}> {
  const total = await pool.query(`SELECT COUNT(*)::int AS c FROM pos_gtin_cache`);
  const bySrc = await pool.query(
    `SELECT COALESCE(best_source, '(null)') AS source, COUNT(*)::int AS c
     FROM pos_gtin_cache
     GROUP BY 1
     ORDER BY c DESC`
  );
  const events = await pool.query(
    `SELECT COUNT(*)::int AS c FROM pos_gtin_lookup_events
     WHERE fetched_at > NOW() - INTERVAL '24 hours'`
  );

  let recent_jobs: Array<Record<string, unknown>> = [];
  try {
    const jobs = await pool.query(
      `SELECT id, status, datasets, processed, inserted, updated, skipped, error,
              started_at, finished_at, created_at
       FROM pos_gtin_learn_jobs
       ORDER BY id DESC
       LIMIT 10`
    );
    recent_jobs = jobs.rows.map((r) => ({
      id: Number(r.id),
      status: r.status,
      datasets: r.datasets,
      processed: Number(r.processed),
      inserted: Number(r.inserted),
      updated: Number(r.updated),
      skipped: Number(r.skipped),
      error: r.error,
      started_at: r.started_at,
      finished_at: r.finished_at,
      created_at: r.created_at,
    }));
  } catch {
    // table may not exist yet during partial migrate
  }

  const by_source: Record<string, number> = {};
  for (const row of bySrc.rows) {
    by_source[String(row.source)] = Number(row.c);
  }

  return {
    cache_total: Number(total.rows[0].c),
    by_source,
    events_24h: Number(events.rows[0].c),
    recent_jobs,
  };
}
