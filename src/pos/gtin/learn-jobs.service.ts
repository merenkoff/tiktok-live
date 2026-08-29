// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/learn-jobs.service.ts — seed jobs from Open*Facts dumps

import { pool } from '../../db.js';
import {
  dumpRowToLookupResult,
  resolveDumpPath,
  seedFromDumpFile,
  type DumpDataset,
  type DumpRow,
} from './dump-seeder.js';
import { getGtinCache, ingestGtinResults } from './gtin-cache.service.js';

export type LearnJob = {
  id: number;
  status: string;
  datasets: DumpDataset[];
  mode: string;
  limit_rows: number | null;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  error: string | null;
  cancel_requested: boolean;
  started_at: Date | null;
  finished_at: Date | null;
  created_by: number | null;
  created_at: Date;
};

function mapJob(row: Record<string, unknown>): LearnJob {
  return {
    id: Number(row.id),
    status: String(row.status),
    datasets: Array.isArray(row.datasets)
      ? (row.datasets as DumpDataset[])
      : (JSON.parse(String(row.datasets || '[]')) as DumpDataset[]),
    mode: String(row.mode),
    limit_rows: row.limit_rows == null ? null : Number(row.limit_rows),
    processed: Number(row.processed),
    inserted: Number(row.inserted),
    updated: Number(row.updated),
    skipped: Number(row.skipped),
    error: row.error == null ? null : String(row.error),
    cancel_requested: Boolean(row.cancel_requested),
    started_at: (row.started_at as Date | null) ?? null,
    finished_at: (row.finished_at as Date | null) ?? null,
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: row.created_at as Date,
  };
}

export async function getLearnJob(id: number): Promise<LearnJob | null> {
  const r = await pool.query(`SELECT * FROM pos_gtin_learn_jobs WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  return mapJob(r.rows[0]);
}

export async function cancelLearnJob(id: number): Promise<LearnJob | null> {
  const r = await pool.query(
    `UPDATE pos_gtin_learn_jobs
     SET cancel_requested = TRUE,
         status = CASE WHEN status IN ('queued', 'running') THEN 'cancelled' ELSE status END,
         finished_at = CASE
           WHEN status IN ('queued', 'running') THEN COALESCE(finished_at, NOW())
           ELSE finished_at
         END
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return mapJob(r.rows[0]);
}

async function applyDumpBatch(rows: DumpRow[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const before = await getGtinCache(row.gtin);
    await ingestGtinResults({
      code: row.gtin,
      results: [dumpRowToLookupResult(row)],
    });
    const after = await getGtinCache(row.gtin);
    if (!before && after) inserted += 1;
    else if (
      before &&
      after &&
      (before.name !== after.name ||
        before.brand !== after.brand ||
        before.best_source !== after.best_source)
    ) {
      updated += 1;
    }
  }
  return { inserted, updated };
}

/** Run seeder for one job (in-process). */
export async function runLearnJob(jobId: number): Promise<LearnJob> {
  const locked = await pool.query(
    `UPDATE pos_gtin_learn_jobs
     SET status = 'running', started_at = COALESCE(started_at, NOW()), error = NULL
     WHERE id = $1 AND status IN ('queued', 'running')
     RETURNING *`,
    [jobId]
  );
  if (locked.rows.length === 0) {
    const existing = await getLearnJob(jobId);
    if (!existing) throw new Error('job not found');
    return existing;
  }

  const job = mapJob(locked.rows[0]);
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const dataset of job.datasets) {
      const path = resolveDumpPath(dataset);
      if (!path) {
        throw new Error(`dump file not found for dataset=${dataset} (GTIN_DUMP_DIR)`);
      }

      const progress = await seedFromDumpFile(path, dataset, {
        limit: job.limit_rows ?? undefined,
        onBatch: applyDumpBatch,
        shouldCancel: async () => {
          const j = await pool.query(
            `SELECT cancel_requested FROM pos_gtin_learn_jobs WHERE id = $1`,
            [jobId]
          );
          return Boolean(j.rows[0]?.cancel_requested);
        },
        onProgress: async (p) => {
          processed = p.processed;
          inserted = p.inserted;
          updated = p.updated;
          skipped = p.skipped;
          await pool.query(
            `UPDATE pos_gtin_learn_jobs
             SET processed = $2, inserted = $3, updated = $4, skipped = $5
             WHERE id = $1`,
            [jobId, processed, inserted, updated, skipped]
          );
        },
      });
      processed = progress.processed;
      inserted = progress.inserted;
      updated = progress.updated;
      skipped = progress.skipped;
    }

    const cancelled = await pool.query(
      `SELECT cancel_requested FROM pos_gtin_learn_jobs WHERE id = $1`,
      [jobId]
    );
    const status = cancelled.rows[0]?.cancel_requested ? 'cancelled' : 'done';
    const done = await pool.query(
      `UPDATE pos_gtin_learn_jobs
       SET status = $2, processed = $3, inserted = $4, updated = $5, skipped = $6,
           finished_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId, status, processed, inserted, updated, skipped]
    );
    return mapJob(done.rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const failed = await pool.query(
      `UPDATE pos_gtin_learn_jobs
       SET status = 'failed', error = $2, processed = $3, inserted = $4, updated = $5,
           skipped = $6, finished_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId, msg, processed, inserted, updated, skipped]
    );
    return mapJob(failed.rows[0]);
  }
}

export async function createLearnJob(params: {
  datasets: DumpDataset[];
  mode?: string;
  limit?: number;
  createdBy?: number;
  runInline?: boolean;
}): Promise<LearnJob> {
  const datasets = params.datasets?.length ? params.datasets : (['products'] as DumpDataset[]);
  for (const d of datasets) {
    if (!['products', 'food', 'beauty'].includes(d)) {
      throw new Error(`invalid dataset: ${d}`);
    }
  }

  const inserted = await pool.query(
    `INSERT INTO pos_gtin_learn_jobs (status, datasets, mode, limit_rows, created_by)
     VALUES ('queued', $1::jsonb, $2, $3, $4)
     RETURNING *`,
    [
      JSON.stringify(datasets),
      params.mode ?? 'upsert',
      params.limit ?? null,
      params.createdBy ?? null,
    ]
  );
  const job = mapJob(inserted.rows[0]);

  // Default: run inline for limited jobs; always schedule async microtask so HTTP returns 201 first
  const runInline = params.runInline !== false;
  if (runInline) {
    setImmediate(() => {
      void runLearnJob(job.id).catch(() => undefined);
    });
  }

  return job;
}
