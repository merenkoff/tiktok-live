// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Migration 018: the GTIN cache key is canonicalized to GTIN-14 and the rows
// that were split across two representations of one trade item are merged.
//
// The migration puts the work in `pos_gtin_canonicalize()` precisely so this
// test can drive it without re-applying a migration file — concurrent
// `ALTER TABLE` from several workers is what `vitest.global-setup.ts` exists to
// avoid. The function is idempotent, so running it here is a no-op for every
// row another suite owns (they are already canonical).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { computeCheckDigit } from '../pos/gtin/normalize.js';

// Owns the 485000000xxx block — see the table in pos.gtin-learn.test.ts.

function validEan13(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

type CanonRow = { merged: number; moved: number };

async function canonicalize(): Promise<CanonRow> {
  const r = await pool.query(`SELECT * FROM pos_gtin_canonicalize()`);
  return { merged: Number(r.rows[0].merged), moved: Number(r.rows[0].moved) };
}

describe.skipIf(!hasDb)('GTIN cache canonicalization (migration 018)', () => {
  const ean13 = validEan13('485000000001');
  const gtin14 = `0${ean13}`;
  // Same digits behind a real indicator digit: a case of the item, not the item.
  const caseBody = `1${ean13.slice(0, 12)}`;
  const caseGtin14 = `${caseBody}${computeCheckDigit(caseBody)}`;

  const cleanup = async () => {
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin IN ($1, $2, $3)`, [
      ean13,
      gtin14,
      caseGtin14,
    ]);
    await pool.query(`DELETE FROM pos_gtin_lookup_events WHERE gtin IN ($1, $2, $3)`, [
      ean13,
      gtin14,
      caseGtin14,
    ]);
  };

  beforeAll(async () => {
    await applyPosMigrations();
    await cleanup();
  }, 120000);

  afterAll(cleanup);

  it('merges the two representations into one canonical row, manual winning', async () => {
    await pool.query(
      `INSERT INTO pos_gtin_cache (gtin, name, brand, image_url, best_source, updated_at)
       VALUES ($1, 'Автоматична назва', NULL, 'https://img/auto.jpg', 'open_food_facts',
               NOW() - INTERVAL '1 day')`,
      [ean13]
    );
    await pool.query(
      `INSERT INTO pos_gtin_cache (gtin, name, brand, image_url, best_source)
       VALUES ($1, 'Ручна назва', 'Бренд', NULL, 'manual')`,
      [gtin14]
    );
    // An untouched code that only differs by the indicator digit.
    await pool.query(
      `INSERT INTO pos_gtin_cache (gtin, name, best_source) VALUES ($1, 'Ящик', 'manual')`,
      [caseGtin14]
    );
    await pool.query(
      `INSERT INTO pos_gtin_lookup_events (gtin, source, found, name)
       VALUES ($1, 'open_food_facts', TRUE, 'Автоматична назва')`,
      [ean13]
    );

    const { merged } = await canonicalize();
    expect(merged).toBeGreaterThanOrEqual(1);

    const rows = await pool.query(
      `SELECT * FROM pos_gtin_cache WHERE gtin IN ($1, $2)`,
      [ean13, gtin14]
    );
    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0];
    expect(row.gtin).toBe(gtin14);
    expect(row.gtin).toHaveLength(14);
    // Manual outranks the automatic source regardless of which arrived later…
    expect(row.name).toBe('Ручна назва');
    expect(row.best_source).toBe('manual');
    expect(row.brand).toBe('Бренд');
    // …and the loser still donates the fields the winner was missing.
    expect(row.image_url).toBe('https://img/auto.jpg');

    // The indicator-digit code is a different trade item and is left alone.
    const other = await pool.query(`SELECT name FROM pos_gtin_cache WHERE gtin = $1`, [caseGtin14]);
    expect(other.rows[0].name).toBe('Ящик');

    // History stays joinable to the cache.
    const events = await pool.query(
      `SELECT gtin FROM pos_gtin_lookup_events WHERE gtin IN ($1, $2)`,
      [ean13, gtin14]
    );
    expect(events.rows.every((e: { gtin: string }) => e.gtin === gtin14)).toBe(true);
  });

  it('is a no-op on a second run', async () => {
    const before = await pool.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [gtin14]);
    const { merged, moved } = await canonicalize();
    expect(merged).toBe(0);
    expect(moved).toBe(0);
    const after = await pool.query(`SELECT * FROM pos_gtin_cache WHERE gtin = $1`, [gtin14]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
