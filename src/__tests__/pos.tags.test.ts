// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword } from '../pos/core/crypto.js';
import {
  assignTagToProducts,
  createTag,
  resolveTagFilterIds,
  setProductTags,
} from '../pos/tags.service.js';
import { archiveProduct, getCatalog } from '../pos/products.service.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POS tags + archive', () => {
  let storeId = 0;
  let productId = 0;
  let variantId = 0;
  let rootTagId = 0;
  let childTagId = 0;
  let grandchildTagId = 0;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const file of [
      '002_pos_schema.sql',
      '003_pos_tags.sql',
      '004_pos_tag_catalog_bar.sql',
      '005_pos_discounts_customers.sql',
    ]) {
      const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
      await pool.query(sql);
    }

    const slug = `tags_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Tag Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);

    const pw = await hashPassword('x');
    await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash)
       VALUES ($1, 'owner', 'Owner', $2, $3)`,
      [storeId, `${slug}@t.local`, pw]
    );

    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Tagged Tee') RETURNING id`,
      [storeId]
    );
    productId = Number(product.rows[0].id);
    const variant = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, price_cents)
       VALUES ($1, $2, 'M', 'Red', 1000) RETURNING id`,
      [storeId, productId]
    );
    variantId = Number(variant.rows[0].id);
    await pool.query(
      `INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 5)`,
      [variantId, storeId]
    );

    const root = await createTag(storeId, { name: 'Type' });
    rootTagId = root.id;
    const child = await createTag(storeId, { name: 'Tees', parent_id: rootTagId });
    childTagId = child.id;
    const grandchild = await createTag(storeId, {
      name: 'Short sleeve',
      parent_id: childTagId,
    });
    grandchildTagId = grandchild.id;
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.end();
  });

  it('assigns M2M tags and filters catalog by parent including nested descendants', async () => {
    await setProductTags(storeId, productId, [grandchildTagId]);
    const bulk = await assignTagToProducts(storeId, rootTagId, [productId]);
    expect(bulk.assigned).toBe(1);

    const ids = await resolveTagFilterIds(storeId, rootTagId);
    expect(ids).toContain(rootTagId);
    expect(ids).toContain(childTagId);
    expect(ids).toContain(grandchildTagId);

    // Browsing the root must surface a product tagged only 3 levels deep.
    await setProductTags(storeId, productId, [grandchildTagId]);
    const catalog = await getCatalog(storeId, { tag_id: rootTagId });
    expect(catalog.some((c) => c.product_id === productId)).toBe(true);
  });

  it('allows 3 levels of nesting but rejects a 4th', async () => {
    await expect(
      createTag(storeId, { name: 'Too deep', parent_id: grandchildTagId })
    ).rejects.toThrow(/3 levels/);
  });

  it('hides archived products from catalog', async () => {
    await archiveProduct(storeId, productId);
    const catalog = await getCatalog(storeId, {});
    expect(catalog.some((c) => c.product_id === productId)).toBe(false);
  });
});
