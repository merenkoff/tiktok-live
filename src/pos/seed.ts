// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/seed.ts — demo store for POS MVP
// Usage: npx tsx src/pos/seed.ts

import 'dotenv/config';
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
          const variantResult = await client.query(
            `INSERT INTO pos_variants
               (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              storeId,
              productId,
              variant.size,
              variant.color,
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
