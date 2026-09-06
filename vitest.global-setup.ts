// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// vitest.global-setup.ts — bring the schema up once per run.
//
// Every DB-backed test file used to apply the migrations itself in `beforeAll`.
// With enough files running in parallel that means a dozen workers issuing
// `ALTER TABLE` against the same tables at once, each taking an ACCESS
// EXCLUSIVE lock — which showed up as intermittent deadlocks in unrelated
// tests. Doing it once, before any worker starts, removes that contention.

import 'dotenv/config';

export async function setup(): Promise<void> {
  if (!process.env.DB_HOST && !process.env.DATABASE_URL) return;

  const { pool } = await import('./src/db.js');
  const { POS_MIGRATIONS, readMigration } = await import('./src/pos/migrations.js');
  try {
    for (const file of POS_MIGRATIONS) {
      await pool.query(readMigration(file));
    }
  } finally {
    await pool.end();
  }
}
