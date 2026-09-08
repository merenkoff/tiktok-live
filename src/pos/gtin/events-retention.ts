// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/events-retention.ts — keep `pos_gtin_lookup_events` bounded

import { pool } from '../../db.js';
import { logger } from '../../logger.js';

const DEFAULT_RETENTION_DAYS = 90;

/** How many batches one sweep will run before giving up until tomorrow. */
const MAX_BATCHES = 200;
const BATCH_SIZE = 5000;

/**
 * Days of lookup history to keep. `GTIN_EVENTS_RETENTION_DAYS=0` turns the
 * sweep off entirely.
 */
export function eventsRetentionDays(): number {
  const raw = process.env.GTIN_EVENTS_RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RETENTION_DAYS;
  return Math.floor(n);
}

/**
 * Drop lookup history older than the retention window.
 *
 * `pos_gtin_lookup_events` takes a row per source per scan — three Open*Facts
 * calls plus UPCitemdb for one barcode — and the only thing that ever read it
 * was `learnStats`'s 24-hour counter. Left alone it grows for the life of the
 * deployment to answer a question about yesterday.
 *
 * OWNER ACTIONS ARE KEPT. The same table carries the audit trail for corrections
 * and evictions on /admin/gtin (`raw_json->>'action'`), which is the one thing
 * in here anybody would go looking for a year later. Only the automatic lookup
 * noise is swept.
 *
 * Deleting in batches keeps each statement's lock short: the first sweep on a
 * table that has never been pruned would otherwise take out months at once.
 */
export async function pruneGtinLookupEvents(
  opts: { days?: number; batchSize?: number } = {}
): Promise<{ deleted: number; batches: number; skipped: boolean }> {
  const days = opts.days ?? eventsRetentionDays();
  if (days <= 0) return { deleted: 0, batches: 0, skipped: true };

  const batchSize = opts.batchSize ?? BATCH_SIZE;
  let deleted = 0;
  let batches = 0;

  for (; batches < MAX_BATCHES; batches++) {
    const r = await pool.query(
      `DELETE FROM pos_gtin_lookup_events
       WHERE id IN (
         SELECT id FROM pos_gtin_lookup_events
         WHERE fetched_at < NOW() - make_interval(days => $1)
           AND (raw_json IS NULL OR raw_json ->> 'action' IS NULL)
         ORDER BY id
         LIMIT $2
       )`,
      [days, batchSize]
    );
    const n = r.rowCount ?? 0;
    deleted += n;
    if (n < batchSize) {
      batches += 1;
      break;
    }
  }

  return { deleted, batches, skipped: false };
}

/** Cron entry point: same shape as the other daily jobs in `src/index.ts`. */
export async function runGtinEventsRetention(): Promise<void> {
  const days = eventsRetentionDays();
  const { deleted, skipped } = await pruneGtinLookupEvents({ days });
  if (skipped) return;
  if (deleted > 0) {
    logger.info(`🧹 Pruned ${deleted} GTIN lookup events older than ${days} days`);
  }
}
