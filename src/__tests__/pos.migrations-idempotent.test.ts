// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The whole migration list, applied more than once.
 *
 * This is not a style preference. `Dockerfile` starts the service with
 * `node dist/pos/migrate.js && node dist/index.js`, and `migrate.ts` keeps no
 * tracking table: every file in `POS_MIGRATIONS` is re-applied on **every**
 * container start, and the API comes up only if that exits 0. So a migration
 * that drops a column an earlier one reads does not break the deploy that ships
 * it — it breaks the next restart, with the service simply never coming back.
 *
 * That is exactly what registering `036_pos_drop_variant_size_color.sql` would
 * have done: `035` backfills `attributes` from `pos_variants.size`, `036` drops
 * the column, and the second boot dies on `column "size" does not exist`. `007`
 * had the quieter half of the same bug — `ADD COLUMN IF NOT EXISTS` resurrected
 * the placeholder pair `036` had just dropped, so every boot left two more
 * `attisdropped` entries behind against Postgres's ceiling of 1600 columns per
 * table, and rebuilt an index `035` immediately replaced.
 *
 * Runs against its own scratch database rather than the shared test one: the
 * point is a *fresh* schema built from nothing and then re-applied, and
 * `ALTER TABLE` storms against the database the other suites are using is what
 * `vitest.global-setup.ts` exists to avoid.
 */

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POS_MIGRATIONS, readMigration } from '../pos/migrations.js';
import { hasDb } from './helpers/pos-fixtures.js';

const PROBE_DB = 'pos_migrations_probe';

function poolFor(database: string): Pool {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return new Pool({
      connectionString: parsed.toString(),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 1,
    });
  }
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 1,
  });
}

/** CI runs as the `postgres` superuser, so this is only ever false locally. */
async function canCreateDatabase(): Promise<boolean> {
  const admin = poolFor('postgres');
  try {
    const r = await admin.query(`SELECT rolcreatedb OR rolsuper AS ok FROM pg_roles WHERE rolname = current_user`);
    return Boolean(r.rows[0]?.ok);
  } catch {
    return false;
  } finally {
    await admin.end();
  }
}

const canCreate = hasDb ? await canCreateDatabase() : false;

async function applyAll(probe: Pool): Promise<void> {
  for (const file of POS_MIGRATIONS) {
    try {
      await probe.query(readMigration(file));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }
}

async function liveColumns(probe: Pool, table: string, names: string[]): Promise<string[]> {
  const r = await probe.query(
    `SELECT attname FROM pg_attribute
      WHERE attrelid = $1::regclass AND attname = ANY($2) AND NOT attisdropped`,
    [table, names]
  );
  return r.rows.map((row) => row.attname as string);
}

async function droppedAttributeCount(probe: Pool, table: string): Promise<number> {
  const r = await probe.query(
    `SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid = $1::regclass AND attisdropped`,
    [table]
  );
  return r.rows[0].n as number;
}

describe.skipIf(!hasDb || !canCreate)('POS migrations, applied the way the runner applies them', () => {
  let probe: Pool;

  beforeAll(async () => {
    const admin = poolFor('postgres');
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${PROBE_DB}`);
      await admin.query(`CREATE DATABASE ${PROBE_DB}`);
    } finally {
      await admin.end();
    }
    probe = poolFor(PROBE_DB);
  });

  afterAll(async () => {
    await probe?.end();
    const admin = poolFor('postgres');
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${PROBE_DB}`);
    } finally {
      await admin.end();
    }
  });

  it('builds the schema from nothing', async () => {
    await applyAll(probe);
    const tables = await probe.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'pos\\_%'`
    );
    expect(tables.rows[0].n).toBeGreaterThan(30);
  });

  it('applies the whole list again — this is what every container start does', async () => {
    // The assertion is that this does not throw. Before the guards in 007/035/036
    // it threw `035_pos_variant_attributes.sql: column "size" does not exist`.
    await expect(applyAll(probe)).resolves.toBeUndefined();
  });

  it('has really dropped the clothing-shaped columns', async () => {
    expect(await liveColumns(probe, 'pos_variants', ['size', 'color'])).toEqual([]);
    expect(
      await liveColumns(probe, 'pos_stock_document_lines', ['placeholder_size', 'placeholder_color'])
    ).toEqual([]);
    // What replaced them is there, so this is a drop and not a failed migration.
    expect(await liveColumns(probe, 'pos_variants', ['attributes', 'label', 'unit'])).toHaveLength(3);
  });

  it('does not resurrect them, one dead column pair per boot', async () => {
    // 007 adds the pair, 036 drops it: on a fresh database that happens exactly
    // once. `DROP COLUMN` only marks the entry `attisdropped`, so an unguarded
    // re-add would push this number up by two on every restart.
    const before = await droppedAttributeCount(probe, 'pos_stock_document_lines');
    await applyAll(probe);
    expect(await droppedAttributeCount(probe, 'pos_stock_document_lines')).toBe(before);
    expect(before).toBe(2);
  });

  it('keeps the attribute-keyed placeholder index and not the old one', async () => {
    const idx = await probe.query(
      `SELECT indexname FROM pg_indexes
        WHERE indexname IN ('idx_pos_stock_doc_lines_placeholder_uniq',
                            'idx_pos_stock_doc_lines_placeholder_attr_uniq')`
    );
    expect(idx.rows.map((r) => r.indexname)).toEqual(['idx_pos_stock_doc_lines_placeholder_attr_uniq']);
  });
});
