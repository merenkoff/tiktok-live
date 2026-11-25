// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Every migration that rebuilds a demo catalogue deletes its variants — and a
// variant held by a row that RESTRICTs it cannot be deleted. Such a rebuild
// fails the migration, and a failed migration keeps the API from starting
// (`Dockerfile`: `migrate.js && index.js`). It fails only on the boot after
// somebody bumps that demo's version, months after the table that holds the
// variant was added — which is why this is checked for EVERY such file at
// once rather than by each demo's own test.
//
// The rule: before its `DELETE FROM pos_variants`, the file deletes every
// table that RESTRICTs a variant — itself, or a parent it cascades from (a
// bill's lines go with the bill). A table from a later migration is deleted
// behind a `to_regclass` guard and an EXECUTE (see 039, 048). The remote
// kitchen's components (117) were missed by the generated Sun City demo (067),
// and tables, modifiers, parked carts and pre-orders by the older demos; this
// is what found them.

import { beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { POS_MIGRATIONS, readMigration } from '../pos/migrations.js';

/** Parents whose deletion is not something a rebuild does before the variants. */
const NOT_A_ROUTE = new Set(['pos_stores', 'pos_variants', 'pos_products']);

describe.skipIf(!hasDb)('demo rebuilds clear every row that holds a variant', () => {
  let holders: string[] = [];
  /** child table → the parents it is deleted with (ON DELETE CASCADE). */
  const cascadeParents = new Map<string, string[]>();

  beforeAll(async () => {
    await applyPosMigrations();
    const restrict = await pool.query(
      `SELECT DISTINCT conrelid::regclass::text AS tbl
         FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'pos_variants'::regclass
          AND confdeltype IN ('a', 'r')
        ORDER BY 1`
    );
    holders = restrict.rows.map((r) => String(r.tbl));
    const cascades = await pool.query(
      `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
         FROM pg_constraint
        WHERE contype = 'f' AND confdeltype = 'c'`
    );
    for (const row of cascades.rows) {
      const parent = String(row.parent);
      if (NOT_A_ROUTE.has(parent)) continue;
      const list = cascadeParents.get(String(row.child)) ?? [];
      list.push(parent);
      cascadeParents.set(String(row.child), list);
    }
  });

  /** Where `DELETE FROM <table>` first appears in the text, or -1. */
  function deletedAt(sql: string, table: string): number {
    const match = new RegExp(`DELETE FROM ${table}\\b`).exec(sql);
    return match ? match.index : -1;
  }

  /** Is `table` emptied before `limit` — directly or through a parent it cascades from? */
  function clearedBefore(sql: string, table: string, limit: number, seen = new Set<string>()): boolean {
    if (seen.has(table)) return false;
    seen.add(table);
    const at = deletedAt(sql, table);
    if (at >= 0 && at < limit) return true;
    return (cascadeParents.get(table) ?? []).some((parent) => clearedBefore(sql, parent, limit, seen));
  }

  const rebuilders = POS_MIGRATIONS.filter((file) => /DELETE FROM pos_variants\b/.test(readMigration(file)));

  it('finds the demo migrations it is about', () => {
    // The flowers, café, restaurant, clothing, Sun City and grocery demos.
    expect(rebuilders.length).toBeGreaterThanOrEqual(6);
    expect(holders.length).toBeGreaterThan(5);
    expect(holders).toContain('pos_remote_order_item_components');
  });

  it.each(rebuilders)('%s deletes every holder of a variant before the variants', (file) => {
    const sql = readMigration(file);
    const variantsAt = deletedAt(sql, 'pos_variants');
    const missing = holders.filter((table) => !clearedBefore(sql, table, variantsAt));
    expect(missing, `${file} leaves rows that RESTRICT its variants`).toEqual([]);
  });
});
