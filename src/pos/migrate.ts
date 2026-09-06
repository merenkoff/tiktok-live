// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/migrate.ts — apply POS schema migration
// Usage: npx tsx src/pos/migrate.ts

import 'dotenv/config';
import path from 'path';
import { pool, testConnection } from '../db.js';
import { MIGRATIONS_DIR, POS_MIGRATIONS, readMigration } from './migrations.js';

async function migrate(): Promise<void> {
  await testConnection();
  for (const file of POS_MIGRATIONS) {
    await pool.query(readMigration(file));
    console.log('✅ POS migration applied:', path.join(MIGRATIONS_DIR, file));
  }
  await pool.end();
}

migrate().catch(async (error) => {
  console.error('Migration failed', error);
  await pool.end();
  process.exit(1);
});
