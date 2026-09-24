// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/seed.ts — demo store for POS MVP
// Usage: npx tsx src/pos/seed.ts

import 'dotenv/config';
import { clothingVertical, normalizeVariant } from './verticals/index.js';
import { copyFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from '../db.js';
import { hashPassword, hashPin } from './core/crypto.js';
import { seedDemoTags } from './tags.service.js';
import { ensureUploadsDir, POS_UPLOADS_DIR } from './uploads.service.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_ASSETS_DIR = path.join(__dirname, 'seed-assets');

/**
 * Registers the `tiktok-live` online-only module on the demo store, pointing at
 * the local `npm run serve:tiktok-live-remote` (:5004).
 *
 * Opt-in via `POS_SEED_TIKTOK_LIVE=1`: an entry whose host isn't running is not
 * harmless noise — on the desktop cashier it shows a greyed "not downloaded"
 * placeholder in the rail — so a plain `npm run pos:seed` leaves it out.
 *
 * The JSON below is exactly what `sanitizeModuleRemotes` accepts and what the
 * client reads back; `icon` / `nav[].icon` must match the module's own manifest
 * so the placeholder and the real module look the same in the nav.
 */
async function seedTiktokLiveModule(storeId: number): Promise<void> {
  const entry = {
    url: process.env.POS_SEED_TIKTOK_LIVE_URL || 'http://localhost:5004/remote-entry.js',
    title: 'Прямий ефір',
    routePath: '/live',
    icon: 'Video',
    nav: [
      { label: 'Ефір', location: 'cashier-primary', order: 85, icon: 'Video', match: '/live' },
    ],
  };
  await pool.query(
    `UPDATE pos_stores
     SET live_tiktok_username = COALESCE(live_tiktok_username, $2),
         module_remotes = COALESCE(module_remotes, '{}'::jsonb)
                          || jsonb_build_object('tiktok-live', $3::jsonb)
     WHERE id = $1`,
    [storeId, process.env.POS_SEED_TIKTOK_LIVE_USERNAME || 'demo_live', JSON.stringify(entry)]
  );
  console.log(`   tiktok-live module registered → ${entry.url}`);
}

/**
 * Point the demo flowers store at a locally served `vertical-flowers` bundle.
 *
 * The store itself — staff, catalogue, bouquets, the two production documents —
 * is migration `039`, so it arrives with a deploy rather than with whoever
 * remembers to run this. What stays here is the one thing that is a *local dev*
 * concern and must never ship in a migration: the module URL. Baking
 * `localhost:5007` into every database would send production tills looking for
 * a bundle on the cashier's own machine.
 *
 * Opt-in (`POS_SEED_VERTICAL_FLOWERS=1`) because an entry whose host is not
 * running leaves a greyed "not downloaded" tile on the desktop till.
 *
 *   npm run build:vertical-flowers-remote && npm run serve:vertical-flowers-remote
 *   POS_SEED_VERTICAL_FLOWERS=1 npm run pos:seed
 *
 * In production the super admin sets the same entry on /super instead.
 */
async function registerFlowersModule(): Promise<void> {
  const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-flowers'`);
  if (store.rows.length === 0) {
    console.log('   demo-flowers store not found — run the migrations first');
    return;
  }
  const entry = {
    url: process.env.POS_SEED_VERTICAL_FLOWERS_URL || 'http://localhost:5007/remote-entry.js',
    title: 'Квіти',
    routePath: '/flowers',
    icon: 'Flower2',
    nav: [
      { label: 'Квіти', location: 'cashier-primary', order: 80, icon: 'Flower2', match: '/flowers' },
    ],
  };
  await pool.query(
    `UPDATE pos_stores
     SET module_remotes = COALESCE(module_remotes, '{}'::jsonb)
                          || jsonb_build_object('vertical-flowers', $2::jsonb)
     WHERE id = $1`,
    [Number(store.rows[0].id), JSON.stringify(entry)]
  );

  console.log('\n✅ Demo flowers store ready');
  console.log('   Store slug: demo-flowers');
  console.log('   Owner: owner@flowers.shop / owner123');
  console.log('   Seller PIN: 1234');
  console.log(`   vertical-flowers module registered → ${entry.url}`);
}

/**
 * Point `demo-cafe` (migration 048) at a `vertical-cafe` bundle. Same shape
 * and the same reasons as the flowers entry above: opt-in, dev URL by
 * default, never written by the migration.
 *
 * The module owns no route of its own in К2 — the sell screen is a slot, not
 * a page — but an object entry must name `routePath` and one nav item (both
 * sanitisers refuse an empty `nav`). They only shape the desktop's `pending`
 * placeholder while the bundle downloads; once it loads, the descriptor's own
 * empty nav wins and the tile goes away.
 *
 *   POS_SEED_VERTICAL_CAFE=1 npm run pos:seed
 */
async function registerCafeModule(): Promise<void> {
  const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-cafe'`);
  if (store.rows.length === 0) {
    console.log('   demo-cafe store not found — run the migrations first');
    return;
  }
  const entry = {
    url: process.env.POS_SEED_VERTICAL_CAFE_URL || 'http://localhost:5008/remote-entry.js',
    title: 'Кафе',
    // The kitchen board (К3c): the desktop's placeholder tile stands in for
    // it until the bundle downloads, so the entry names the module's own
    // route and label.
    routePath: '/kitchen',
    icon: 'Coffee',
    nav: [{ label: 'Кухня', location: 'cashier-primary', order: 80, icon: 'ChefHat', match: '/kitchen' }],
  };
  await pool.query(
    `UPDATE pos_stores
     SET module_remotes = COALESCE(module_remotes, '{}'::jsonb)
                          || jsonb_build_object('vertical-cafe', $2::jsonb)
     WHERE id = $1`,
    [Number(store.rows[0].id), JSON.stringify(entry)]
  );

  console.log('\n✅ Demo café store ready');
  console.log('   Store slug: demo-cafe');
  console.log('   Owner: owner@cafe.shop / owner123');
  console.log('   Seller PIN: 1234');
  console.log(`   vertical-cafe module registered → ${entry.url}`);
}

/**
 * Point the demo café at a locally served `tables` bundle (café phase К4e).
 *
 * Its OWN entry beside `vertical-cafe`, not inside it: a `module_remotes`
 * value carries exactly one `routePath`, the café spent its on `/kitchen`,
 * and tables are not a vertical anyway (TechDocs/POS_TABLES.md §4.11). The
 * presence of this entry is what turns the store into a restaurant — there is
 * no `service_mode` column.
 *
 * Dev only, like the two above: a real store gets its URL from the super
 * admin, and baking `localhost:5009` into a database would send production
 * tills looking for a module on the waiter's laptop.
 */
async function registerTablesModule(): Promise<void> {
  const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-cafe'`);
  if (store.rows.length === 0) {
    console.log('   demo-cafe store not found — run the migrations first');
    return;
  }
  const entry = {
    url: process.env.POS_SEED_TABLES_URL || 'http://localhost:5009/remote-entry.js',
    title: 'Столи',
    routePath: '/tables',
    icon: 'Table',
    nav: [{ label: 'Столи', location: 'cashier-primary', order: 60, icon: 'Table', match: '/tables' }],
  };
  await pool.query(
    `UPDATE pos_stores
     SET module_remotes = COALESCE(module_remotes, '{}'::jsonb)
                          || jsonb_build_object('tables', $2::jsonb)
     WHERE id = $1`,
    [Number(store.rows[0].id), JSON.stringify(entry)]
  );
  console.log(`   tables module registered → ${entry.url}`);
}

/** Copies the committed demo product photos into the (gitignored) uploads dir. */
async function copySeedProductImages(): Promise<void> {
  await ensureUploadsDir();
  const files = [
    'demo-tee-black.png',
    'demo-tee-teal.png',
    'demo-jeans-blue.png',
    'demo-jeans-light.png',
    'demo-hoodie-gray.png',
    'demo-hoodie-olive.png',
  ];
  for (const file of files) {
    await copyFile(path.join(SEED_ASSETS_DIR, file), path.join(POS_UPLOADS_DIR, file));
  }
}

async function seed(): Promise<void> {
  await testConnection();

  const client = await pool.connect();
  let storeId: number;
  try {
    await client.query('BEGIN');

    const existing = await client.query(`SELECT id FROM pos_stores WHERE slug = 'demo'`);
    if (existing.rows.length > 0) {
      storeId = Number(existing.rows[0].id);
      logger.info('Demo store already exists, ensuring tags…');
      await client.query('COMMIT');
    } else {
      const storeResult = await client.query(
        `INSERT INTO pos_stores (name, slug, currency, timezone)
         VALUES ('Demo Boutique', 'demo', 'UAH', 'Europe/Kyiv')
         RETURNING id`
      );
      storeId = Number(storeResult.rows[0].id);

      await copySeedProductImages();

      const ownerHash = await hashPassword('owner123');
      const ownerPin = await hashPin('0000');
      await client.query(
        `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
         VALUES ($1, 'owner', 'Власник', 'owner@demo.shop', $2, $3)`,
        [storeId, ownerHash, ownerPin]
      );

      const sellerPin = await hashPin('1234');
      await client.query(
        `INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
         VALUES ($1, 'seller', 'Продавець Оля', $2)`,
        [storeId, sellerPin]
      );

      const products = [
        {
          name: 'Футболка базова',
          description: 'Бавовна 100%',
          image_url: '/pos-uploads/demo-tee-black.png',
          variants: [
            { size: 'M', color: 'Чорний', sku: 'TEE-M-BLK', barcode: '4820001000001', price: 69000, qty: 5 },
            { size: 'L', color: 'Білий', sku: 'TEE-L-WHT', barcode: '4820001000002', price: 69000, qty: 3 },
          ],
        },
        {
          name: 'Футболка з принтом',
          description: 'Бавовна 100%, графічний принт',
          image_url: '/pos-uploads/demo-tee-teal.png',
          variants: [
            { size: 'S', color: 'Смарагдовий', sku: 'TEE-S-TEA', barcode: '4820001000007', price: 79000, qty: 4 },
            { size: 'M', color: 'Смарагдовий', sku: 'TEE-M-TEA', barcode: '4820001000008', price: 79000, qty: 6 },
          ],
        },
        {
          name: 'Джинси slim',
          description: 'Сині джинси',
          image_url: '/pos-uploads/demo-jeans-blue.png',
          variants: [
            { size: '28', color: 'Синій', sku: 'JNS-28-BLU', barcode: '4820001000003', price: 149000, qty: 2 },
            { size: '30', color: 'Синій', sku: 'JNS-30-BLU', barcode: '4820001000004', price: 149000, qty: 4 },
          ],
        },
        {
          name: 'Джинси mom fit',
          description: 'Світлі джинси вільного крою',
          image_url: '/pos-uploads/demo-jeans-light.png',
          variants: [
            { size: '26', color: 'Блакитний', sku: 'JNS-26-LGT', barcode: '4820001000009', price: 159000, qty: 3 },
            { size: '28', color: 'Блакитний', sku: 'JNS-28-LGT', barcode: '4820001000010', price: 159000, qty: 5 },
          ],
        },
        {
          name: 'Худі oversize',
          description: 'Тепле худі',
          image_url: '/pos-uploads/demo-hoodie-gray.png',
          variants: [
            { size: 'S', color: 'Сірий', sku: 'HDI-S-GRY', barcode: '4820001000005', price: 129000, qty: 6 },
            { size: 'M', color: 'Бежевий', sku: 'HDI-M-BEG', barcode: '4820001000006', price: 129000, qty: 2 },
          ],
        },
        {
          name: 'Худі на блискавці',
          description: 'Худі на замку, флісова підкладка',
          image_url: '/pos-uploads/demo-hoodie-olive.png',
          variants: [
            { size: 'M', color: 'Хакі', sku: 'HDZ-M-KHK', barcode: '4820001000011', price: 139000, qty: 3 },
            { size: 'L', color: 'Хакі', sku: 'HDZ-L-KHK', barcode: '4820001000012', price: 139000, qty: 4 },
          ],
        },
      ];

      for (const product of products) {
        const productResult = await client.query(
          `INSERT INTO pos_products (store_id, name, description, image_url)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [storeId, product.name, product.description, product.image_url]
        );
        const productId = Number(productResult.rows[0].id);

        for (const variant of product.variants) {
          // The demo store is a clothing store, so size/colour go in as that
          // vertical's attributes and the caption is derived, never typed.
          const derived = normalizeVariant(clothingVertical, {
            attributes: { size: variant.size, color: variant.color },
          });
          const variantResult = await client.query(
            `INSERT INTO pos_variants
               (store_id, product_id, attributes, label, unit, sku, barcode, price_cents, cost_cents)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              storeId,
              productId,
              JSON.stringify(derived.attributes),
              derived.label,
              derived.unit,
              variant.sku,
              variant.barcode,
              variant.price,
              Math.round(variant.price * 0.45),
            ]
          );
          const variantId = Number(variantResult.rows[0].id);
          await client.query(
            `INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, $3)`,
            [variantId, storeId, variant.qty]
          );
          await client.query(
            `INSERT INTO pos_stock_movements
               (store_id, variant_id, delta, reason, note)
             VALUES ($1, $2, $3, 'seed', 'Demo seed')`,
            [storeId, variantId, variant.qty]
          );
        }
      }

      await client.query('COMMIT');
      logger.info('POS demo seed complete', {
        storeSlug: 'demo',
        ownerLogin: 'owner@demo.shop',
        ownerPassword: 'owner123',
        sellerPin: '1234',
        ownerPin: '0000',
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await seedDemoTags(storeId);
  if (process.env.POS_SEED_TIKTOK_LIVE === '1') await seedTiktokLiveModule(storeId);
  if (process.env.POS_SEED_VERTICAL_FLOWERS === '1') await registerFlowersModule();
  if (process.env.POS_SEED_VERTICAL_CAFE === '1') await registerCafeModule();
  if (process.env.POS_SEED_TABLES === '1') await registerTablesModule();
  console.log('\n✅ Demo store ready (tags ensured)');
  console.log('   Store slug: demo');
  console.log('   Owner: owner@demo.shop / owner123');
  console.log('   Seller PIN: 1234');
  console.log('   Owner PIN (register): 0000\n');
  await pool.end();
}

seed().catch(async (error) => {
  console.error('Seed failed', error);
  await pool.end();
  process.exit(1);
});
