// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.variant-barcode-migration.test.ts
//
// Migration 022 moves internal article numbers out of `pos_variants.barcode`
// into `sku`, on the rule "a value that is not a valid GTIN was never a
// barcode". Two things need pinning.
//
// The rule itself lives twice — `pos_gtin_is_valid` in SQL and `normalizeGtin`
// in TypeScript — because `src/pos/migrate.ts` has no ledger and no hook for
// running TS after the DDL, so the repair has to be callable from the migration
// file alone. The parity suite is what keeps the two from drifting: divergence
// becomes a red test rather than silently relocated data.
//
// And the refusals. `migrate.ts` re-runs every migration on every deploy, so
// this function is a standing policy, not a one-off. It must be impossible for
// it to lose a value it cannot rehome.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, createTestStore, dropTestStore, hasDb } from './helpers/pos-fixtures.js';
import { computeCheckDigit, normalizeGtin } from '../pos/gtin/normalize.js';

type Counts = {
  moved: number;
  cleared: number;
  skipped_sku_present: number;
  skipped_sku_taken: number;
};

function ean13(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

describe.skipIf(!hasDb)('pos_gtin_is_valid ↔ normalizeGtin parity', () => {
  beforeAll(async () => {
    await applyPosMigrations();
  }, 120000);

  // Valid cases are built with computeCheckDigit so the fixtures cannot
  // themselves be wrong; the rest are shapes the rule has to reject.
  const ean8 = `4012345${computeCheckDigit('4012345')}`;
  const upcA = '049000006346';
  const gtin13 = ean13('482000000001');
  const gtin14 = `0${gtin13}`;
  const corpus: string[] = [
    ean8,
    upcA,
    gtin13,
    gtin14,
    ` ${gtin13} `,
    `4-820-000-000-017`,
    // Real article numbers off the clothing tags this migration exists for.
    '068-130',
    '14783',
    '675-222-16',
    'HFIPDY-BLA-08A',
    'TEE-M-BLK',
    // Shapes at and past the edges.
    '',
    '   ',
    '1',
    '1234567',
    '123456789',
    '12345678901',
    '123456789012345',
    'не-код',
    'BC-void_1788451141963',
    // Check digit off by one, at every accepted length.
    `4012345${(Number(computeCheckDigit('4012345')) + 1) % 10}`,
    `482000000001${(Number(computeCheckDigit('482000000001')) + 1) % 10}`,
    `0482000000001${(Number(computeCheckDigit('0482000000001')) + 1) % 10}`,
  ];

  it.each(corpus)('agrees on %j', async (value) => {
    const sql = await pool.query(`SELECT pos_gtin_is_valid($1) AS ok`, [value]);
    expect(sql.rows[0].ok).toBe(normalizeGtin(value).ok);
  });

  it('is NULL-safe (STRICT) rather than throwing', async () => {
    const r = await pool.query(`SELECT pos_gtin_is_valid(NULL) AS ok`);
    expect(r.rows[0].ok).toBeNull();
  });
});

describe.skipIf(!hasDb)('pos_backfill_variant_barcodes', () => {
  let storeId = 0;
  let productId = 0;

  async function addVariant(v: {
    size: string;
    sku: string | null;
    barcode: string | null;
    active?: boolean;
  }): Promise<number> {
    const r = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, sku, barcode, price_cents, is_active)
       VALUES ($1, $2, $3, '', $4, $5, 1000, $6) RETURNING id`,
      [storeId, productId, v.size, v.sku, v.barcode, v.active ?? true]
    );
    return Number(r.rows[0].id);
  }

  async function read(id: number): Promise<{ sku: string | null; barcode: string | null }> {
    const r = await pool.query(`SELECT sku, barcode FROM pos_variants WHERE id = $1`, [id]);
    return r.rows[0];
  }

  // Scoped to this store: the function is global by default and this suite
  // shares a database with every other one.
  async function run(): Promise<Counts> {
    const r = await pool.query(`SELECT * FROM pos_backfill_variant_barcodes($1)`, [storeId]);
    const row = r.rows[0];
    return {
      moved: Number(row.moved),
      cleared: Number(row.cleared),
      skipped_sku_present: Number(row.skipped_sku_present),
      skipped_sku_taken: Number(row.skipped_sku_taken),
    };
  }

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await createTestStore('bcfix');
    storeId = store.storeId;
    const p = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Товар') RETURNING id`,
      [storeId]
    );
    productId = Number(p.rows[0].id);
  }, 120000);

  afterAll(async () => {
    await dropTestStore(storeId);
    await pool.end();
  });

  it('applies the decision table, and refuses rather than losing a value', async () => {
    // 1. Article number, sku free → moves.
    const moves = await addVariant({ size: '1', sku: null, barcode: '068-130' });
    // 2. Both fields hold the same value → only the barcode is cleared.
    const dup = await addVariant({ size: '2', sku: '14783', barcode: '14783' });
    // 3. sku already holds something else → untouched.
    const present = await addVariant({ size: '3', sku: 'HFIPDY-BLA', barcode: '675-222-16' });
    // 4. The target sku is taken — by an ARCHIVED variant, which is invisible in
    //    the products UI, so the refusal has to name it or it looks inexplicable.
    const blocker = await addVariant({ size: '4a', sku: 'DECO-56', barcode: null, active: false });
    const taken = await addVariant({ size: '4b', sku: null, barcode: 'DECO-56' });
    // 5. A real EAN-13 is a real barcode → untouched.
    const real = ean13('482000000055');
    const genuine = await addVariant({ size: '5', sku: null, barcode: real });
    // 6. An empty barcode has nothing to move.
    const empty = await addVariant({ size: '6', sku: null, barcode: '' });

    expect(await run()).toEqual({
      moved: 1,
      cleared: 1,
      skipped_sku_present: 1,
      skipped_sku_taken: 1,
    });

    expect(await read(moves)).toEqual({ sku: '068-130', barcode: null });
    expect(await read(dup)).toEqual({ sku: '14783', barcode: null });
    // The two refusals leave the barcode exactly where it was.
    expect(await read(present)).toEqual({ sku: 'HFIPDY-BLA', barcode: '675-222-16' });
    expect(await read(taken)).toEqual({ sku: null, barcode: 'DECO-56' });
    expect(await read(genuine)).toEqual({ sku: null, barcode: real });
    expect(await read(empty)).toEqual({ sku: null, barcode: '' });

    const ledger = await pool.query(
      `SELECT variant_id, old_barcode, action, conflict_variant_id, conflict_is_active, existing_sku
       FROM pos_variant_barcode_fixes WHERE store_id = $1 ORDER BY variant_id`,
      [storeId]
    );
    const byId = new Map(ledger.rows.map((r) => [Number(r.variant_id), r]));
    expect(byId.get(moves)?.action).toBe('moved');
    expect(byId.get(dup)?.action).toBe('cleared_duplicate');
    expect(byId.get(present)).toMatchObject({
      action: 'skipped_sku_present',
      existing_sku: 'HFIPDY-BLA',
    });
    // The blocker is named, and flagged as archived.
    expect(byId.get(taken)).toMatchObject({
      action: 'skipped_sku_taken',
      conflict_variant_id: String(blocker),
      conflict_is_active: false,
    });
    expect(byId.has(genuine)).toBe(false);
    expect(byId.has(empty)).toBe(false);
  });

  it('is a no-op on a second run — but keeps reporting the refusals', async () => {
    const before = await pool.query(
      `SELECT id, sku, barcode FROM pos_variants WHERE store_id = $1 ORDER BY id`,
      [storeId]
    );

    const again = await run();
    expect(again.moved).toBe(0);
    expect(again.cleared).toBe(0);
    // Not zero: those rows are still candidates, and must stay eligible in case
    // the blocker is cleared. Asserting "all counts zero" would look right and
    // pin the wrong invariant.
    expect(again.skipped_sku_present).toBe(1);
    expect(again.skipped_sku_taken).toBe(1);

    const after = await pool.query(
      `SELECT id, sku, barcode FROM pos_variants WHERE store_id = $1 ORDER BY id`,
      [storeId]
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('respects a value the owner puts back after it was moved', async () => {
    // Re-entering by hand is a deliberate act; the ledger is what stops the
    // next deploy from silently fighting it.
    const id = await addVariant({ size: '7', sku: null, barcode: '070-140' });
    expect((await run()).moved).toBe(1);
    expect(await read(id)).toEqual({ sku: '070-140', barcode: null });

    await pool.query(`UPDATE pos_variants SET barcode = '070-140' WHERE id = $1`, [id]);
    expect((await run()).moved).toBe(0);
    expect((await read(id)).barcode).toBe('070-140');
  });

  it('clears a blocked row once the blocker is gone', async () => {
    await pool.query(`UPDATE pos_variants SET sku = 'DECO-56-OLD' WHERE sku = 'DECO-56'`);
    const out = await run();
    expect(out.moved).toBe(1);
    expect(out.skipped_sku_taken).toBe(0);
  });
});
