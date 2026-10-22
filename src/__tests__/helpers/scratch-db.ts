// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A database of a test file's own, for suites that must see the migrations
 * exactly as a boot leaves them. The shared test database is not that: other
 * files rebuild the demo stores in it with their own migration alone (039,
 * 048, 055), so for a moment a demo has no expanded recipes or kitchen
 * stations, and a suite comparing against it races them.
 */

import { Pool } from 'pg';
import { POS_MIGRATIONS, readMigration } from '../../pos/migrations.js';

export function poolFor(database: string): Pool {
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
export async function canCreateDatabase(): Promise<boolean> {
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

/** Drops and creates `name`, and returns a pool on it. */
export async function createScratchDatabase(name: string): Promise<Pool> {
  const admin = poolFor('postgres');
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  return poolFor(name);
}

export async function dropScratchDatabase(name: string, pool: Pool | undefined): Promise<void> {
  await pool?.end();
  const admin = poolFor('postgres');
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  } finally {
    await admin.end();
  }
}

/** One boot: every file in `POS_MIGRATIONS`, in order, as `migrate.ts` runs them. */
export async function applyAllMigrations(db: Pool): Promise<void> {
  for (const file of POS_MIGRATIONS) {
    try {
      await db.query(readMigration(file));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }
}
