// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/products.service.ts

import { pool } from '../db.js';
import type { CatalogItem } from './types.js';
import { getProductTagIds, resolveTagFilterIds } from './tags.service.js';

export interface VariantInput {
  size?: string;
  color?: string;
  sku?: string | null;
  barcode?: string | null;
  price_cents: number;
  cost_cents?: number;
  quantity?: number;
  compare_at_cents?: number | null;
}

export interface CreateProductInput {
  name: string;
  description?: string | null;
  image_url?: string | null;
  variants: VariantInput[];
  needs_review?: boolean;
  created_from_document_id?: number | null;
}

type DbClient = { query: typeof pool.query };

function emptyToNull(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeCompareAt(
  priceCents: number,
  compareAt: number | null | undefined
): number | null {
  if (compareAt == null) return null;
  if (compareAt < 0) throw new Error('compare_at_cents must be >= 0');
  if (compareAt <= priceCents) {
    throw new Error('compare_at_cents must be greater than price_cents');
  }
  return compareAt;
}

export async function listProducts(storeId: number) {
  const products = await pool.query(
    `SELECT * FROM pos_products
     WHERE store_id = $1
     ORDER BY name ASC`,
    [storeId]
  );

  const variants = await pool.query(
    `SELECT v.*, COALESCE(s.quantity, 0) AS quantity
     FROM pos_variants v
     LEFT JOIN pos_stock s ON s.variant_id = v.id
     WHERE v.store_id = $1
     ORDER BY v.product_id, v.size, v.color`,
    [storeId]
  );

  const byProduct = new Map<number, unknown[]>();
  for (const row of variants.rows) {
    const productId = Number(row.product_id);
    const list = byProduct.get(productId) ?? [];
    list.push({
      id: Number(row.id),
      product_id: productId,
      size: row.size,
      color: row.color,
      sku: row.sku,
      barcode: row.barcode,
      price_cents: Number(row.price_cents),
      cost_cents: Number(row.cost_cents),
      compare_at_cents:
        row.compare_at_cents == null ? null : Number(row.compare_at_cents),
      is_active: row.is_active,
      quantity: Number(row.quantity),
    });
    byProduct.set(productId, list);
  }

  const productIds = products.rows.map((p) => Number(p.id));
  const tagMap = await getProductTagIds(storeId, productIds);

  return products.rows.map((p) => ({
    id: Number(p.id),
    name: p.name,
    description: p.description,
    image_url: p.image_url,
    is_active: p.is_active,
    needs_review: Boolean(p.needs_review),
    created_from_document_id:
      p.created_from_document_id == null ? null : Number(p.created_from_document_id),
    created_at: p.created_at,
    updated_at: p.updated_at,
    tag_ids: tagMap.get(Number(p.id)) ?? [],
    variants: byProduct.get(Number(p.id)) ?? [],
  }));
}

export async function getProduct(storeId: number, productId: number) {
  const products = await listProducts(storeId);
  return products.find((p) => p.id === productId) ?? null;
}

/** Insert product+variants+stock inside an open transaction. qty>0 writes seed movement. */
export async function createProductInTx(
  client: DbClient,
  storeId: number,
  input: CreateProductInput
): Promise<{ productId: number; variantIds: number[] }> {
  if (!input.name?.trim()) throw new Error('Product name is required');
  if (!input.variants?.length) throw new Error('At least one variant is required');

  const productResult = await client.query(
    `INSERT INTO pos_products
       (store_id, name, description, image_url, needs_review, created_from_document_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      storeId,
      input.name.trim(),
      emptyToNull(input.description),
      emptyToNull(input.image_url),
      input.needs_review ?? false,
      input.created_from_document_id ?? null,
    ]
  );
  const productId = Number(productResult.rows[0].id);
  const variantIds: number[] = [];

  for (const variant of input.variants) {
    if (variant.price_cents == null || variant.price_cents < 0) {
      throw new Error('Variant price must be >= 0');
    }
    const quantity = variant.quantity ?? 0;
    if (quantity < 0) throw new Error('Quantity must be >= 0');

    const compareAt = normalizeCompareAt(variant.price_cents, variant.compare_at_cents);
    const variantResult = await client.query(
      `INSERT INTO pos_variants
         (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents, compare_at_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        storeId,
        productId,
        (variant.size ?? '').trim(),
        (variant.color ?? '').trim(),
        emptyToNull(variant.sku),
        emptyToNull(variant.barcode),
        variant.price_cents,
        variant.cost_cents ?? 0,
        compareAt,
      ]
    );
    const variantId = Number(variantResult.rows[0].id);
    variantIds.push(variantId);

    await client.query(
      `INSERT INTO pos_stock (variant_id, store_id, quantity)
       VALUES ($1, $2, $3)`,
      [variantId, storeId, quantity]
    );

    if (quantity > 0) {
      await client.query(
        `INSERT INTO pos_stock_movements
           (store_id, variant_id, delta, reason, note)
         VALUES ($1, $2, $3, 'seed', 'Initial stock')`,
        [storeId, variantId, quantity]
      );
    }
  }

  return { productId, variantIds };
}

export async function createProduct(storeId: number, input: CreateProductInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { productId } = await createProductInTx(client, storeId, input);
    await client.query('COMMIT');
    return getProduct(storeId, productId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProduct(
  storeId: number,
  productId: number,
  input: Partial<Pick<CreateProductInput, 'name' | 'description' | 'image_url'>> & {
    is_active?: boolean;
    needs_review?: boolean;
  }
) {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let i = 1;

  if (input.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(input.name.trim());
  }
  if (input.description !== undefined) {
    sets.push(`description = $${i++}`);
    values.push(emptyToNull(input.description));
  }
  if (input.image_url !== undefined) {
    sets.push(`image_url = $${i++}`);
    values.push(emptyToNull(input.image_url));
  }
  if (input.is_active !== undefined) {
    sets.push(`is_active = $${i++}`);
    values.push(input.is_active);
  }
  if (input.needs_review !== undefined) {
    sets.push(`needs_review = $${i++}`);
    values.push(input.needs_review);
  } else if (
    input.name !== undefined ||
    input.description !== undefined ||
    input.image_url !== undefined
  ) {
    // First meaningful edit clears review flag
    sets.push(`needs_review = FALSE`);
  }

  values.push(productId, storeId);
  const result = await pool.query(
    `UPDATE pos_products
     SET ${sets.join(', ')}
     WHERE id = $${i++} AND store_id = $${i}
     RETURNING id`,
    values
  );
  if (result.rows.length === 0) throw new Error('Product not found');
  return getProduct(storeId, productId);
}

export async function addVariant(storeId: number, productId: number, variant: VariantInput) {
  const product = await pool.query(
    `SELECT id FROM pos_products WHERE id = $1 AND store_id = $2`,
    [productId, storeId]
  );
  if (product.rows.length === 0) throw new Error('Product not found');
  if (variant.price_cents == null || variant.price_cents < 0) {
    throw new Error('Variant price must be >= 0');
  }

  const quantity = variant.quantity ?? 0;
  const compareAt = normalizeCompareAt(variant.price_cents, variant.compare_at_cents);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const variantResult = await client.query(
      `INSERT INTO pos_variants
         (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents, compare_at_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        storeId,
        productId,
        (variant.size ?? '').trim(),
        (variant.color ?? '').trim(),
        emptyToNull(variant.sku),
        emptyToNull(variant.barcode),
        variant.price_cents,
        variant.cost_cents ?? 0,
        compareAt,
      ]
    );
    const variantId = Number(variantResult.rows[0].id);
    await client.query(
      `INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, $3)`,
      [variantId, storeId, quantity]
    );
    if (quantity > 0) {
      await client.query(
        `INSERT INTO pos_stock_movements
           (store_id, variant_id, delta, reason, note)
         VALUES ($1, $2, $3, 'seed', 'Initial stock')`,
        [storeId, variantId, quantity]
      );
    }
    await client.query('COMMIT');
    return getProduct(storeId, productId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateVariant(
  storeId: number,
  variantId: number,
  input: Partial<VariantInput> & { is_active?: boolean }
) {
  const current = await pool.query(
    `SELECT * FROM pos_variants WHERE id = $1 AND store_id = $2`,
    [variantId, storeId]
  );
  if (current.rows.length === 0) throw new Error('Variant not found');
  const row = current.rows[0];

  const price =
    input.price_cents !== undefined ? input.price_cents : Number(row.price_cents);
  if (price < 0) throw new Error('Variant price must be >= 0');

  let compareAt: number | null =
    row.compare_at_cents == null ? null : Number(row.compare_at_cents);
  if (input.compare_at_cents !== undefined) {
    compareAt = normalizeCompareAt(price, input.compare_at_cents);
  } else if (compareAt != null && compareAt <= price) {
    throw new Error('compare_at_cents must be greater than price_cents');
  }

  // Resolve every column against the row we already read, then write them all.
  // The previous COALESCE form could not express "clear this field": an empty
  // sku/barcode became NULL, which COALESCE then read as "keep the old value",
  // so a SKU could be set but never removed.
  const result = await pool.query(
    `UPDATE pos_variants
     SET
       size = $1,
       color = $2,
       sku = $3,
       barcode = $4,
       price_cents = $5,
       cost_cents = $6,
       is_active = $7,
       compare_at_cents = $8,
       updated_at = NOW()
     WHERE id = $9 AND store_id = $10
     RETURNING product_id`,
    [
      input.size === undefined ? row.size : input.size.trim(),
      input.color === undefined ? row.color : input.color.trim(),
      input.sku === undefined ? (row.sku ?? null) : emptyToNull(input.sku),
      input.barcode === undefined ? (row.barcode ?? null) : emptyToNull(input.barcode),
      price,
      input.cost_cents === undefined ? Number(row.cost_cents) : input.cost_cents,
      input.is_active === undefined ? row.is_active : input.is_active,
      compareAt,
      variantId,
      storeId,
    ]
  );
  return getProduct(storeId, Number(result.rows[0].product_id));
}

export async function archiveProduct(storeId: number, productId: number) {
  const result = await pool.query(
    `UPDATE pos_products
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND store_id = $2
     RETURNING id`,
    [productId, storeId]
  );
  if (result.rows.length === 0) throw new Error('Product not found');
  await pool.query(
    `UPDATE pos_variants SET is_active = FALSE, updated_at = NOW()
     WHERE product_id = $1 AND store_id = $2`,
    [productId, storeId]
  );
  return getProduct(storeId, productId);
}

export async function archiveVariant(storeId: number, variantId: number) {
  const result = await pool.query(
    `UPDATE pos_variants
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND store_id = $2
     RETURNING product_id`,
    [variantId, storeId]
  );
  if (result.rows.length === 0) throw new Error('Variant not found');
  return getProduct(storeId, Number(result.rows[0].product_id));
}

export async function getCatalog(
  storeId: number,
  opts: { q?: string; barcode?: string; tag_id?: number; snapshot?: boolean } = {}
): Promise<CatalogItem[]> {
  const params: unknown[] = [storeId];
  const conditions = [
    'p.store_id = $1',
    'p.is_active = TRUE',
    'v.is_active = TRUE',
  ];

  const snapshot = Boolean(opts.snapshot);

  if (!snapshot && opts.tag_id) {
    const tagIds = await resolveTagFilterIds(storeId, opts.tag_id);
    params.push(tagIds);
    conditions.push(
      `EXISTS (
         SELECT 1 FROM pos_product_tags pt
         WHERE pt.product_id = p.id AND pt.tag_id = ANY($${params.length}::bigint[])
       )`
    );
  }

  if (!snapshot && opts.barcode?.trim()) {
    params.push(opts.barcode.trim());
    conditions.push(`v.barcode = $${params.length}`);
  } else if (!snapshot && opts.q?.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(
      `(lower(p.name) LIKE $${idx}
        OR lower(COALESCE(v.sku, '')) LIKE $${idx}
        OR lower(COALESCE(v.barcode, '')) LIKE $${idx}
        OR lower(v.size) LIKE $${idx}
        OR lower(v.color) LIKE $${idx})`
    );
  }

  const limit = snapshot ? 10000 : 200;

  const result = await pool.query(
    `SELECT
       v.id AS variant_id,
       p.id AS product_id,
       p.name AS product_name,
       v.size,
       v.color,
       v.sku,
       v.barcode,
       v.price_cents,
       v.compare_at_cents,
       COALESCE(s.quantity, 0) AS quantity,
       p.image_url,
       COALESCE(
         (SELECT array_agg(pt.tag_id) FROM pos_product_tags pt WHERE pt.product_id = p.id),
         '{}'::bigint[]
       ) AS tag_ids
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     LEFT JOIN pos_stock s ON s.variant_id = v.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.name ASC, v.size ASC, v.color ASC
     LIMIT ${limit}`,
    params
  );

  return result.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    product_id: Number(row.product_id),
    product_name: row.product_name,
    size: row.size,
    color: row.color,
    sku: row.sku,
    barcode: row.barcode,
    price_cents: Number(row.price_cents),
    compare_at_cents:
      row.compare_at_cents == null ? null : Number(row.compare_at_cents),
    quantity: Number(row.quantity),
    image_url: row.image_url,
    tag_ids: Array.isArray(row.tag_ids) ? row.tag_ids.map((id: string | number) => Number(id)) : [],
  }));
}
