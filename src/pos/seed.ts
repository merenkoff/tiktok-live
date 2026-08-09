// src/pos/seed.ts — demo store for POS MVP
// Usage: npx tsx src/pos/seed.ts

import 'dotenv/config';
import { pool, testConnection } from '../db.js';
import { hashPassword, hashPin } from './core/crypto.js';
import { seedDemoTags } from './tags.service.js';
import { logger } from '../logger.js';

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
          variants: [
            { size: 'M', color: 'Чорний', sku: 'TEE-M-BLK', barcode: '4820001000001', price: 69000, qty: 5 },
            { size: 'L', color: 'Білий', sku: 'TEE-L-WHT', barcode: '4820001000002', price: 69000, qty: 3 },
          ],
        },
        {
          name: 'Джинси slim',
          description: 'Сині джинси',
          variants: [
            { size: '28', color: 'Синій', sku: 'JNS-28-BLU', barcode: '4820001000003', price: 149000, qty: 2 },
            { size: '30', color: 'Синій', sku: 'JNS-30-BLU', barcode: '4820001000004', price: 149000, qty: 4 },
          ],
        },
        {
          name: 'Худі oversize',
          description: 'Тепле худі',
          variants: [
            { size: 'S', color: 'Сірий', sku: 'HDI-S-GRY', barcode: '4820001000005', price: 129000, qty: 6 },
            { size: 'M', color: 'Бежевий', sku: 'HDI-M-BEG', barcode: '4820001000006', price: 129000, qty: 2 },
          ],
        },
      ];

      for (const product of products) {
        const productResult = await client.query(
          `INSERT INTO pos_products (store_id, name, description)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [storeId, product.name, product.description]
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
