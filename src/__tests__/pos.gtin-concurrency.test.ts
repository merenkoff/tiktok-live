// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.gtin-concurrency.test.ts
//
// `pos_gtin_cache` is shared by every store on purpose, so two writers hitting
// one barcode at the same time is ordinary traffic, not an edge case. The cache
// write used to be a read-merge-write with nothing guarding the gap between the
// read and the write.
//
// A plain `Promise.all` of many ingests does NOT prove anything here: the pg
// pool tends to hand the same connection back before a second one finishes
// connecting, so the calls serialise and pass even against the broken code.
// These tests take dedicated connections and force the interleaving instead.
//
// Uses gtins in the 482000002xxx block — see the block table in
// pos.gtin-learn.test.ts.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import { blockGtin, getGtinCache, ingestGtinResults } from '../pos/gtin/gtin-cache.service.js';
import { computeCheckDigit, normalizeGtin } from '../pos/gtin/normalize.js';
import { applyPosMigrations, clearGtinCache, hasDb } from './helpers/pos-fixtures.js';

function ean(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

/** The stored key for a barcode: canonical GTIN-14, not the scanned form. */
function key(gtin: string): string {
  const norm = normalizeGtin(gtin);
  if (!norm.ok) throw new Error(`bad fixture gtin ${gtin}`);
  return norm.canonical;
}

const GTIN_INSERT = ean('482000002001');
const GTIN_UPDATE = ean('482000002002');
const GTIN_DEMOTE = ean('482000002003');
const ALL = [GTIN_INSERT, GTIN_UPDATE, GTIN_DEMOTE];

/**
 * Run two ingests so that both observe the cache row before either writes —
 * the interleaving the old read-merge-write allowed.
 */
async function bothReadBeforeEitherWrites(
  gtin: string,
  first: Parameters<typeof ingestGtinResults>[0]['results'],
  second: Parameters<typeof ingestGtinResults>[0]['results']
) {
  // Holding two clients keeps the pool from serialising the pair.
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    await Promise.all([
      a.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [gtin]),
      b.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [gtin]),
    ]);
    return await Promise.allSettled([
      ingestGtinResults({ code: gtin, results: first }),
      ingestGtinResults({ code: gtin, results: second }),
    ]);
  } finally {
    a.release();
    b.release();
  }
}

function rejections(settled: PromiseSettledResult<unknown>[]): string[] {
  return settled
    .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
    .map((s) => (s.reason instanceof Error ? s.reason.message : String(s.reason)));
}

describe.skipIf(!hasDb)('GTIN cache under concurrent writers', () => {
  beforeAll(async () => {
    await applyPosMigrations();
  }, 120000);

  afterEach(async () => {
    // Via the helper: the stored key is the canonical GTIN-14, not the form
    // these fixtures are written in.
    await clearGtinCache(...ALL);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('two writers caching the same new barcode both succeed', async () => {
    const settled = await bothReadBeforeEitherWrites(
      GTIN_INSERT,
      [{ source: 'open_products_facts', found: true, name: 'Bodysuit A' }],
      [{ source: 'open_products_facts', found: true, name: 'Bodysuit A' }]
    );

    // The old code raised: duplicate key value violates unique constraint
    // "pos_gtin_cache_pkey".
    expect(rejections(settled)).toEqual([]);

    const hint = await getGtinCache(GTIN_INSERT);
    expect(hint?.name).toBe('Bodysuit A');
  });

  it('keeps exactly one row for a barcode two writers raced on', async () => {
    await bothReadBeforeEitherWrites(
      GTIN_INSERT,
      [{ source: 'open_food_facts', found: true, name: 'From food' }],
      [{ source: 'open_products_facts', found: true, name: 'From products' }]
    );

    const rows = await pool.query(`SELECT COUNT(*)::int AS c FROM pos_gtin_cache WHERE gtin = $1`, [
      key(GTIN_INSERT),
    ]);
    expect(rows.rows[0].c).toBe(1);
  });

  it('the better source wins a race regardless of who lands first', async () => {
    // open_products_facts outranks open_food_facts in the default priority.
    const settled = await bothReadBeforeEitherWrites(
      GTIN_UPDATE,
      [{ source: 'open_products_facts', found: true, name: 'Good title' }],
      [{ source: 'open_food_facts', found: true, name: 'Worse title' }]
    );

    expect(rejections(settled)).toEqual([]);
    const hint = await getGtinCache(GTIN_UPDATE);
    expect(hint?.best_source).toBe('open_products_facts');
    expect(hint?.name).toBe('Good title');
  });

  it('a weaker source cannot demote a row it read before the better one landed', async () => {
    await ingestGtinResults({
      code: GTIN_DEMOTE,
      results: [{ source: 'open_products_facts', found: true, name: 'Established' }],
    });

    // A writer that read the row earlier now tries to write a worse source.
    // Read-merge-write would clobber it; the upsert must refuse.
    await ingestGtinResults({
      code: GTIN_DEMOTE,
      results: [{ source: 'open_food_facts', found: true, name: 'Stale worse' }],
    });

    const hint = await getGtinCache(GTIN_DEMOTE);
    expect(hint?.name).toBe('Established');
    expect(hint?.best_source).toBe('open_products_facts');
  });

  it('keeps a brand the losing writer found, whoever lands first', async () => {
    // The better source carries no brand, the weaker one does. Either arrival
    // order must end with the better title AND the brand.
    const settled = await bothReadBeforeEitherWrites(
      GTIN_UPDATE,
      [{ source: 'open_products_facts', found: true, name: 'Good title' }],
      [{ source: 'open_food_facts', found: true, name: 'Worse title', brand: 'Acme' }]
    );

    expect(rejections(settled)).toEqual([]);
    const hint = await getGtinCache(GTIN_UPDATE);
    expect(hint?.name).toBe('Good title');
    expect(hint?.best_source).toBe('open_products_facts');
    expect(hint?.brand).toBe('Acme');
  });

  it('manual overrides an automatic title', async () => {
    await ingestGtinResults({
      code: GTIN_UPDATE,
      results: [{ source: 'open_products_facts', found: true, name: 'Auto title', brand: 'Acme' }],
    });
    await ingestGtinResults({
      code: GTIN_UPDATE,
      results: [{ source: 'manual', found: true, name: 'Cashier title' }],
    });

    const hint = await getGtinCache(GTIN_UPDATE);
    expect(hint?.name).toBe('Cashier title');
    expect(hint?.best_source).toBe('manual');
    // manual carried no brand — the one the automatic source found must remain.
    expect(hint?.brand).toBe('Acme');
  });

  it('a later automatic lookup cannot take back a manual title', async () => {
    // The asymmetry this test used to pin — `manual` scoring lowest, so a
    // cashier's correction survived only until the next scan — is gone: stage 2
    // moved `manual` to the front of the priority list.
    await ingestGtinResults({
      code: GTIN_DEMOTE,
      results: [{ source: 'manual', found: true, name: 'Cashier title' }],
    });
    await ingestGtinResults({
      code: GTIN_DEMOTE,
      results: [{ source: 'open_products_facts', found: true, name: 'Auto title' }],
    });

    const hint = await getGtinCache(GTIN_DEMOTE);
    expect(hint?.name).toBe('Cashier title');
    expect(hint?.best_source).toBe('manual');
  });

  it('keeps the manual title when a manual and an automatic write race', async () => {
    const settled = await bothReadBeforeEitherWrites(
      GTIN_DEMOTE,
      [{ source: 'manual', found: true, name: 'Cashier title' }],
      [{ source: 'open_products_facts', found: true, name: 'Auto title' }]
    );
    expect(rejections(settled)).toEqual([]);

    const hint = await getGtinCache(GTIN_DEMOTE);
    expect(hint?.name).toBe('Cashier title');
    expect(hint?.best_source).toBe('manual');
  });

  it('a newer manual edit replaces an older one, even when shorter', async () => {
    await ingestGtinResults({
      code: GTIN_UPDATE,
      results: [{ source: 'manual', found: true, name: 'Молоко 3.2% пастеризоване' }],
    });
    await ingestGtinResults({
      code: GTIN_UPDATE,
      results: [{ source: 'manual', found: true, name: 'Молоко' }],
    });
    expect((await getGtinCache(GTIN_UPDATE))?.name).toBe('Молоко');
  });

  it('a cleared entry survives writers racing to refill it', async () => {
    await ingestGtinResults({
      code: GTIN_DEMOTE,
      results: [{ source: 'open_products_facts', found: true, name: 'Wrong name' }],
    });
    await blockGtin({ code: GTIN_DEMOTE });

    const settled = await bothReadBeforeEitherWrites(
      GTIN_DEMOTE,
      [{ source: 'open_products_facts', found: true, name: 'Wrong name' }],
      [{ source: 'manual', found: true, name: 'Anything at all' }]
    );
    expect(rejections(settled)).toEqual([]);

    const hint = await getGtinCache(GTIN_DEMOTE);
    expect(hint?.name).toBeNull();
    expect(hint?.blocked).toBe(true);
  });

  it('records lookup events for both writers even though one row results', async () => {
    await bothReadBeforeEitherWrites(
      GTIN_INSERT,
      [{ source: 'open_products_facts', found: true, name: 'One' }],
      [{ source: 'open_food_facts', found: true, name: 'Two' }]
    );

    const events = await pool.query(
      `SELECT COUNT(*)::int AS c FROM pos_gtin_lookup_events WHERE gtin = $1`,
      [key(GTIN_INSERT)]
    );
    expect(events.rows[0].c).toBe(2);
  });

  it('a miss creates no row and does not disturb a cached one', async () => {
    expect(
      await ingestGtinResults({
        code: GTIN_INSERT,
        results: [{ source: 'upcitemdb', found: false }],
      })
    ).toBeNull();
    expect(await getGtinCache(GTIN_INSERT)).toBeNull();

    await ingestGtinResults({
      code: GTIN_INSERT,
      results: [{ source: 'open_products_facts', found: true, name: 'Real name' }],
    });
    const after = await ingestGtinResults({
      code: GTIN_INSERT,
      results: [{ source: 'upcitemdb', found: false }],
    });
    expect(after?.name).toBe('Real name');
  });
});
