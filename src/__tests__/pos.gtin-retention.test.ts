// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.gtin-retention.test.ts
//
// `pos_gtin_lookup_events` gets a row per source per scan — three Open*Facts
// calls plus UPCitemdb for one barcode — and the only thing that ever read it
// was a 24-hour counter. The sweep keeps it bounded.
//
// The property worth pinning is the exception: the owner's corrections and
// evictions on /admin/gtin are audited into this same table, and they are the
// one thing somebody would come looking for a year later. Everything else here
// is disposable.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import {
  eventsRetentionDays,
  pruneGtinLookupEvents,
} from '../pos/gtin/events-retention.js';

// Own block — see the table in pos.gtin-learn.test.ts.
const GTIN = '00486000000001';

type Seed = { ageDays: number; source: string; found: boolean; raw?: unknown };

async function seed(rows: Seed[]): Promise<void> {
  for (const r of rows) {
    await pool.query(
      `INSERT INTO pos_gtin_lookup_events (gtin, source, found, raw_json, fetched_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW() - make_interval(days => $5))`,
      [GTIN, r.source, r.found, r.raw == null ? null : JSON.stringify(r.raw), r.ageDays]
    );
  }
}

async function remaining(): Promise<Array<{ source: string; action: string | null; age: number }>> {
  const r = await pool.query(
    `SELECT source, raw_json ->> 'action' AS action,
            round(EXTRACT(EPOCH FROM NOW() - fetched_at) / 86400)::int AS age
     FROM pos_gtin_lookup_events WHERE gtin = $1 ORDER BY age`,
    [GTIN]
  );
  return r.rows;
}

describe.skipIf(!hasDb)('GTIN lookup-event retention', () => {
  beforeAll(async () => {
    await applyPosMigrations();
  }, 120000);

  afterEach(async () => {
    await pool.query(`DELETE FROM pos_gtin_lookup_events WHERE gtin = $1`, [GTIN]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('eventsRetentionDays', () => {
    const original = process.env.GTIN_EVENTS_RETENTION_DAYS;
    afterEach(() => {
      if (original === undefined) delete process.env.GTIN_EVENTS_RETENTION_DAYS;
      else process.env.GTIN_EVENTS_RETENTION_DAYS = original;
    });

    it('defaults to 90 days', () => {
      delete process.env.GTIN_EVENTS_RETENTION_DAYS;
      expect(eventsRetentionDays()).toBe(90);
    });

    it('takes an override, and reads 0 as "never sweep"', () => {
      process.env.GTIN_EVENTS_RETENTION_DAYS = '30';
      expect(eventsRetentionDays()).toBe(30);
      process.env.GTIN_EVENTS_RETENTION_DAYS = '0';
      expect(eventsRetentionDays()).toBe(0);
    });

    it('falls back to the default on nonsense rather than sweeping everything', () => {
      process.env.GTIN_EVENTS_RETENTION_DAYS = 'сорок';
      expect(eventsRetentionDays()).toBe(90);
      process.env.GTIN_EVENTS_RETENTION_DAYS = '-5';
      expect(eventsRetentionDays()).toBe(90);
    });
  });

  it('drops lookups past the window and keeps the recent ones', async () => {
    await seed([
      { ageDays: 200, source: 'open_food_facts', found: false },
      { ageDays: 91, source: 'upcitemdb', found: true },
      { ageDays: 89, source: 'open_products_facts', found: true },
      { ageDays: 1, source: 'open_food_facts', found: true },
    ]);

    const out = await pruneGtinLookupEvents({ days: 90 });
    expect(out.deleted).toBe(2);
    expect(out.skipped).toBe(false);

    const left = await remaining();
    expect(left.map((r) => r.age)).toEqual([1, 89]);
  });

  it('never sweeps an owner correction or eviction, however old', async () => {
    await seed([
      { ageDays: 400, source: 'manual', found: true, raw: { action: 'manual_edit' } },
      { ageDays: 400, source: 'manual', found: false, raw: { action: 'evict' } },
      { ageDays: 400, source: 'open_food_facts', found: true, raw: { status: 1 } },
    ]);

    const out = await pruneGtinLookupEvents({ days: 90 });
    expect(out.deleted).toBe(1);

    const left = await remaining();
    expect(left.map((r) => r.action).sort()).toEqual(['evict', 'manual_edit']);
  });

  it('does nothing when retention is switched off', async () => {
    await seed([{ ageDays: 999, source: 'open_food_facts', found: true }]);
    const out = await pruneGtinLookupEvents({ days: 0 });
    expect(out).toEqual({ deleted: 0, batches: 0, skipped: true });
    expect(await remaining()).toHaveLength(1);
  });

  it('works through more rows than one batch holds', async () => {
    await seed(Array.from({ length: 7 }, () => ({ ageDays: 120, source: 'upcitemdb', found: false })));
    const out = await pruneGtinLookupEvents({ days: 90, batchSize: 2 });
    expect(out.deleted).toBe(7);
    expect(out.batches).toBeGreaterThan(1);
    expect(await remaining()).toHaveLength(0);
  });

  it('is a no-op on a second run', async () => {
    await seed([{ ageDays: 120, source: 'upcitemdb', found: true }]);
    expect((await pruneGtinLookupEvents({ days: 90 })).deleted).toBe(1);
    expect((await pruneGtinLookupEvents({ days: 90 })).deleted).toBe(0);
  });
});
