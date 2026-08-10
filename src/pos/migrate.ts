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
  const files = ['002_pos_schema.sql', '003_pos_tags.sql', '004_pos_tag_catalog_bar.sql'];
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
