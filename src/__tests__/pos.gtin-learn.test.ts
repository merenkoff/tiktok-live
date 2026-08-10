import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { hashPassword, hashPin } from '../pos/core/crypto.js';
import { getGtinCache } from '../pos/gtin/gtin-cache.service.js';
import {
  parseDumpJsonlLine,
  parseDumpTsvLine,
  seedFromDumpFile,
} from '../pos/gtin/dump-seeder.js';
import { learnBatch, learnStats } from '../pos/gtin/learn.service.js';
import {
  createLearnJob,
  getLearnJob,
  runLearnJob,
} from '../pos/gtin/learn-jobs.service.js';
import { computeCheckDigit } from '../pos/gtin/normalize.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);
const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/gtin');

async function applyMigrations(): Promise<void> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const file of [
    '002_pos_schema.sql',
    '003_pos_tags.sql',
    '004_pos_tag_catalog_bar.sql',
    '005_pos_discounts_customers.sql',
    '006_pos_stock_documents.sql',
    '007_pos_receipt_placeholders.sql',
    '008_pos_gtin_cache.sql',
    '009_pos_gtin_learn_jobs.sql',
  ]) {
    const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
    await pool.query(sql);
  }
}

function ean(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

describe('dump parser (no db)', () => {
  it('parses TSV and JSONL fixtures', () => {
    const header = ['code', 'product_name', 'brands', 'image_url'];
    const ok = parseDumpTsvLine(
      '4820000000017\tKids Bodysuit Brown\tAcme Kids\thttp://example.com/body.jpg',
      header,
      'open_products_facts'
    );
    expect('skip' in ok).toBe(false);
    if (!('skip' in ok)) {
      expect(ok.name).toBe('Kids Bodysuit Brown');
      expect(ok.brand).toBe('Acme Kids');
    }
    expect(
      parseDumpTsvLine('not-a-barcode\tX\tY\t', header, 'open_products_facts')
    ).toHaveProperty('skip');

    const j = parseDumpJsonlLine(
      '{"code":"4820000000017","product_name":"JSONL Bodysuit","brands":"BrandJ"}',
      'open_products_facts'
    );
    expect('skip' in j).toBe(false);
    if (!('skip' in j)) expect(j.name).toBe('JSONL Bodysuit');
  });
});

describe.skipIf(!hasDb)('POS GTIN learning API', () => {
  let storeId = 0;
  let staffId = 0;
  const gtin1 = ean('482000000011');
  const gtin2 = ean('482000000012');

  beforeAll(async () => {
    await applyMigrations();
    const slug = `learn_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Learn Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);
    const pw = await hashPassword('x');
    const pin = await hashPin('1234');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
       VALUES ($1, 'owner', 'Owner', $2, $3, $4) RETURNING id`,
      [storeId, `${slug}@t.local`, pw, pin]
    );
    staffId = Number(staff.rows[0].id);
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin LIKE '48200000001%'`);
  });

  it('learnBatch upserts and skips bad rows', async () => {
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin IN ($1, $2)`, [gtin1, gtin2]);
    const out = await learnBatch({
      storeId,
      staffId,
      items: [
        { gtin: gtin1, name: 'Batch Tee', brand: 'B', source: 'manual' },
        { gtin: 'abc', name: 'Nope' },
        { gtin: gtin2, name: '' },
        { gtin: gtin2, name: 'Batch Two', source: 'open_products_facts' },
      ],
    });
    expect(out.accepted).toBe(2);
    expect(out.upserted).toBeGreaterThanOrEqual(2);
    expect(out.skipped.some((s) => s.reason.startsWith('bad_gtin'))).toBe(true);
    expect(out.skipped.some((s) => s.reason === 'empty_name')).toBe(true);

    const hint = await getGtinCache(gtin1);
    expect(hint?.name).toBe('Batch Tee');
    expect(hint?.best_source).toBe('manual');
  });

  it('learnStats returns cache totals', async () => {
    const stats = await learnStats();
    expect(stats.cache_total).toBeGreaterThanOrEqual(1);
    expect(typeof stats.events_24h).toBe('number');
  });

  it('seedFromDumpFile applies fixture TSV', async () => {
    const file = path.join(fixturesDir, 'products.tsv');
    process.env.GTIN_DUMP_DIR = fixturesDir;
    const progress = await seedFromDumpFile(file, 'products', {
      onBatch: async (rows) => {
        let inserted = 0;
        let updated = 0;
        for (const row of rows) {
          const before = await getGtinCache(row.gtin);
          const { ingestGtinResults } = await import('../pos/gtin/gtin-cache.service.js');
          await ingestGtinResults({
            code: row.gtin,
            results: [
              {
                source: row.source,
                found: true,
                name: row.name,
                brand: row.brand,
                image_url: row.image_url,
              },
            ],
          });
          const after = await getGtinCache(row.gtin);
          if (!before && after) inserted += 1;
          else if (before && after && before.name !== after.name) updated += 1;
        }
        return { inserted, updated };
      },
    });
    expect(progress.processed).toBeGreaterThanOrEqual(2);
    expect(progress.skipped).toBeGreaterThanOrEqual(1);
    const hint = await getGtinCache('4820000000017');
    // products_facts may lose to manual if same gtin was trained — use unique from fixture
    expect(hint?.name).toBeTruthy();
  });

  it('learn job lifecycle with fixture dump dir', async () => {
    process.env.GTIN_DUMP_DIR = fixturesDir;
    // copy products.tsv as expected name for resolveDumpPath
    const dest = path.join(fixturesDir, 'products.tsv');
    expect(fs.existsSync(dest)).toBe(true);

    const job = await createLearnJob({
      datasets: ['products'],
      limit: 10,
      createdBy: staffId,
      runInline: false,
    });
    expect(job.status).toBe('queued');
    const done = await runLearnJob(job.id);
    expect(['done', 'failed']).toContain(done.status);
    if (done.status === 'failed') {
      // should succeed with fixture present
      expect(done.error).toBeNull();
    }
    expect(done.status).toBe('done');
    expect(done.processed).toBeGreaterThan(0);
    const again = await getLearnJob(job.id);
    expect(again?.status).toBe('done');
  });

  it('e2e: batch then getGtinCache hit', async () => {
    const code = ean('482000000019');
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1`, [code]);
    await learnBatch({
      storeId,
      items: [{ gtin: code, name: 'E2E Learned', source: 'manual' }],
    });
    const hint = await getGtinCache(code);
    expect(hint?.name).toBe('E2E Learned');
  });
});
