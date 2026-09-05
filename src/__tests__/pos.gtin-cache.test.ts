// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword, hashPin } from '../pos/core/crypto.js';
import {
  getGtinCache,
  ingestGtinResults,
  learnFromManual,
} from '../pos/gtin/gtin-cache.service.js';
import { mapOpenFactsResponse } from '../pos/gtin/open-facts.js';
import { computeCheckDigit } from '../pos/gtin/normalize.js';
import { getUsedCount, tryConsumeBudget } from '../pos/gtin/provider-budget.js';
import { mapUpcDevResponse } from '../pos/gtin/upc-dev.provider.js';
import { mapUpcitemdbResponse } from '../pos/gtin/upcitemdb.provider.js';
import { addPlaceholderLine, createDocument } from '../pos/stock-documents.service.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

async function applyMigrations(): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
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
    '015_pos_store_modules.sql',
    '016_pos_store_module_remotes.sql',
  ]) {
    const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
    await pool.query(sql);
  }
}

function validEan13(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

describe.skipIf(!hasDb)('POS GTIN cache and providers', () => {
  let storeId = 0;
  let staffId = 0;
  const gtinA = validEan13('482000000001');
  const gtinB = validEan13('482000000002');
  const gtinC = validEan13('482000000003');

  beforeAll(async () => {
    await applyMigrations();
    const slug = `gtin_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Gtin Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);
    const ownerHash = await hashPassword('x');
    const pinHash = await hashPin('1234');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
       VALUES ($1, 'owner', 'Owner', $2, $3, $4) RETURNING id`,
      [storeId, `${slug}@t.local`, ownerHash, pinHash]
    );
    staffId = Number(staff.rows[0].id);
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin IN ($1, $2, $3)`, [gtinA, gtinB, gtinC]);
    await pool.query(`DELETE FROM pos_gtin_lookup_events WHERE gtin IN ($1, $2, $3)`, [
      gtinA,
      gtinB,
      gtinC,
    ]);
  });

  it('ingest merge: products_facts beats food; worse does not overwrite', async () => {
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1`, [gtinA]);
    await ingestGtinResults({
      code: gtinA,
      storeId,
      results: [
        {
          source: 'open_food_facts',
          found: true,
          name: 'Food Name',
          brand: 'BrandF',
        },
      ],
    });
    let hint = await getGtinCache(gtinA);
    expect(hint?.name).toBe('Food Name');
    expect(hint?.best_source).toBe('open_food_facts');

    await ingestGtinResults({
      code: gtinA,
      storeId,
      results: [
        {
          source: 'open_products_facts',
          found: true,
          name: 'Kids Bodysuit',
          brand: 'BrandP',
        },
      ],
    });
    hint = await getGtinCache(gtinA);
    expect(hint?.name).toBe('Kids Bodysuit');
    expect(hint?.best_source).toBe('open_products_facts');

    await ingestGtinResults({
      code: gtinA,
      storeId,
      results: [{ source: 'open_food_facts', found: true, name: 'Should Not Win' }],
    });
    hint = await getGtinCache(gtinA);
    expect(hint?.name).toBe('Kids Bodysuit');
  });

  it('upc_dev ranks above upcitemdb', async () => {
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1`, [gtinB]);
    await ingestGtinResults({
      code: gtinB,
      results: [{ source: 'upcitemdb', found: true, name: 'From Itemdb' }],
    });
    await ingestGtinResults({
      code: gtinB,
      results: [{ source: 'upc_dev', found: true, name: 'From UpcDev' }],
    });
    const hint = await getGtinCache(gtinB);
    expect(hint?.best_source).toBe('upc_dev');
    expect(hint?.name).toBe('From UpcDev');
  });

  it('manual learn from placeholder barcode', async () => {
    const code = gtinC;
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1`, [code]);
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name: 'Бодик з приходу',
      quantity: 1,
      priceCents: 10000,
      barcode: code,
    });
    const hint = await getGtinCache(code);
    expect(hint?.name).toBe('Бодик з приходу');
    expect(hint?.best_source).toBe('manual');
  });

  it('provider budget stops at limit', async () => {
    const provider = 'upcitemdb' as const;
    const day = new Date().toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO pos_gtin_provider_budget (provider, day_utc, used_count)
       VALUES ($1, $2::date, 99)
       ON CONFLICT (provider, day_utc) DO UPDATE SET used_count = 99`,
      [`test_${provider}_${Date.now()}`, day]
    );
    // use real provider with high used_count
    await pool.query(
      `INSERT INTO pos_gtin_provider_budget (provider, day_utc, used_count)
       VALUES ('upcitemdb', $1::date, 100)
       ON CONFLICT (provider, day_utc) DO UPDATE SET used_count = 100`,
      [day]
    );
    const ok = await tryConsumeBudget('upcitemdb');
    expect(ok).toBe(false);
    expect(await getUsedCount('upcitemdb')).toBe(100);
    // reset for other tests
    await pool.query(
      `UPDATE pos_gtin_provider_budget SET used_count = 0
       WHERE provider = 'upcitemdb' AND day_utc = $1::date`,
      [day]
    );
  });

  it('learnFromManual upgrades over food', async () => {
    const code = validEan13('482000000009');
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1`, [code]);
    await ingestGtinResults({
      code,
      results: [{ source: 'open_food_facts', found: true, name: 'Auto Food' }],
    });
    await learnFromManual({ code, name: 'Ручна назва', storeId });
    const hint = await getGtinCache(code);
    expect(hint?.name).toBe('Ручна назва');
    expect(hint?.best_source).toBe('manual');
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin = $1`, [code]);
  });
});

describe('GTIN response mappers (no network)', () => {
  it('maps Open Products / Food / Beauty', () => {
    const products = mapOpenFactsResponse('products', {
      status: 1,
      product: { product_name: 'Tee', brands: 'Acme, Other', image_url: 'http://x' },
    });
    expect(products).toMatchObject({
      source: 'open_products_facts',
      found: true,
      name: 'Tee',
      brand: 'Acme',
    });

    const foodMiss = mapOpenFactsResponse('food', { status: 0 });
    expect(foodMiss.found).toBe(false);

    const beauty = mapOpenFactsResponse('beauty', {
      status: 1,
      product: { product_name: 'Cream', brands: 'SkinCo' },
    });
    expect(beauty.source).toBe('open_beauty_facts');
    expect(beauty.name).toBe('Cream');
  });

  it('maps upcitemdb and upc.dev', () => {
    expect(
      mapUpcitemdbResponse({
        items: [{ title: 'Item', brand: 'B', images: ['http://i'] }],
      }).name
    ).toBe('Item');
    expect(mapUpcitemdbResponse({ items: [] }).found).toBe(false);

    expect(
      mapUpcDevResponse({
        ok: true,
        data: { name: 'Coke', brand: 'Coca-Cola', image_url: 'http://c' },
      }).name
    ).toBe('Coke');
  });
});
