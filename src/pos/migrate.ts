// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/migrate.ts — apply POS schema migration
// Usage: npx tsx src/pos/migrate.ts

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate(): Promise<void> {
  await testConnection();
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const files = [
    '002_pos_schema.sql',
    '003_pos_tags.sql',
    '004_pos_tag_catalog_bar.sql',
    '005_pos_discounts_customers.sql',
    '006_pos_stock_documents.sql',
    '007_pos_receipt_placeholders.sql',
    '008_pos_gtin_cache.sql',
    '009_pos_gtin_learn_jobs.sql',
    '010_pos_offline_sync.sql',
  ];
  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    await pool.query(sql);
    console.log('✅ POS migration applied:', migrationPath);
  }
  await pool.end();
}

migrate().catch(async (error) => {
  console.error('Migration failed', error);
  await pool.end();
  process.exit(1);
});
