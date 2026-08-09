// src/pos/tags.service.ts

import { pool } from '../db.js';

export interface PosTag {
  id: number;
  store_id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
  children?: PosTag[];
}

function mapTag(row: Record<string, unknown>): PosTag {
  return {
    id: Number(row.id),
    store_id: Number(row.store_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    name: String(row.name),
    sort_order: Number(row.sort_order),
  };
}

export async function listTags(storeId: number): Promise<PosTag[]> {
  const result = await pool.query(
    `SELECT * FROM pos_tags WHERE store_id = $1 ORDER BY sort_order ASC, name ASC`,
    [storeId]
  );
  const tags = result.rows.map(mapTag);
  const roots = tags.filter((t) => t.parent_id == null);
  for (const root of roots) {
    root.children = tags.filter((t) => t.parent_id === root.id);
  }
  return roots;
}

export async function listTagsFlat(storeId: number): Promise<PosTag[]> {
  const result = await pool.query(
    `SELECT * FROM pos_tags WHERE store_id = $1 ORDER BY sort_order ASC, name ASC`,
    [storeId]
  );
  return result.rows.map(mapTag);
}

async function assertMaxDepth(
  storeId: number,
  parentId: number | null
): Promise<void> {
  if (parentId == null) return;
  const parent = await pool.query(
    `SELECT id, parent_id FROM pos_tags WHERE id = $1 AND store_id = $2`,
    [parentId, storeId]
  );
  if (parent.rows.length === 0) throw new Error('Parent tag not found');
  if (parent.rows[0].parent_id != null) {
    throw new Error('Tags support only 2 levels');
  }
}

export async function createTag(
  storeId: number,
  input: { name: string; parent_id?: number | null; sort_order?: number }
): Promise<PosTag> {
  const name = input.name?.trim();
  if (!name) throw new Error('Tag name is required');
  const parentId = input.parent_id ?? null;
  await assertMaxDepth(storeId, parentId);

  const result = await pool.query(
    `INSERT INTO pos_tags (store_id, parent_id, name, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [storeId, parentId, name, input.sort_order ?? 0]
  );
  return mapTag(result.rows[0]);
}

export async function updateTag(
  storeId: number,
  tagId: number,
  input: { name?: string; sort_order?: number }
): Promise<PosTag> {
  const result = await pool.query(
    `UPDATE pos_tags
     SET
       name = COALESCE($1, name),
       sort_order = COALESCE($2, sort_order)
     WHERE id = $3 AND store_id = $4
     RETURNING *`,
    [input.name?.trim() ?? null, input.sort_order ?? null, tagId, storeId]
  );
  if (result.rows.length === 0) throw new Error('Tag not found');
  return mapTag(result.rows[0]);
}

export async function deleteTag(storeId: number, tagId: number): Promise<void> {
  const children = await pool.query(
    `SELECT id FROM pos_tags WHERE parent_id = $1 AND store_id = $2 LIMIT 1`,
    [tagId, storeId]
  );
  if (children.rows.length > 0) {
    throw new Error('Remove child tags first');
  }
  const result = await pool.query(
    `DELETE FROM pos_tags WHERE id = $1 AND store_id = $2 RETURNING id`,
    [tagId, storeId]
  );
  if (result.rows.length === 0) throw new Error('Tag not found');
}

export async function setProductTags(
  storeId: number,
  productId: number,
  tagIds: number[]
): Promise<number[]> {
  const product = await pool.query(
    `SELECT id FROM pos_products WHERE id = $1 AND store_id = $2`,
    [productId, storeId]
  );
  if (product.rows.length === 0) throw new Error('Product not found');

  const unique = [...new Set(tagIds.map(Number).filter((n) => n > 0))];
  if (unique.length > 0) {
    const check = await pool.query(
      `SELECT id FROM pos_tags WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [storeId, unique]
    );
    if (check.rows.length !== unique.length) {
      throw new Error('Some tags not found');
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM pos_product_tags WHERE product_id = $1`, [productId]);
    for (const tagId of unique) {
      await client.query(
        `INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2)`,
        [productId, tagId]
      );
    }
    await client.query('COMMIT');
    return unique;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assignTagToProducts(
  storeId: number,
  tagId: number,
  productIds: number[]
): Promise<{ assigned: number }> {
  const tag = await pool.query(
    `SELECT id FROM pos_tags WHERE id = $1 AND store_id = $2`,
    [tagId, storeId]
  );
  if (tag.rows.length === 0) throw new Error('Tag not found');

  const unique = [...new Set(productIds.map(Number).filter((n) => n > 0))];
  if (unique.length === 0) return { assigned: 0 };

  const products = await pool.query(
    `SELECT id FROM pos_products WHERE store_id = $1 AND id = ANY($2::bigint[])`,
    [storeId, unique]
  );
  if (products.rows.length !== unique.length) {
    throw new Error('Some products not found');
  }

  let assigned = 0;
  for (const productId of unique) {
    const result = await pool.query(
      `INSERT INTO pos_product_tags (product_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING product_id`,
      [productId, tagId]
    );
    if (result.rows.length > 0) assigned += 1;
  }
  return { assigned };
}

export async function getProductTagIds(
  storeId: number,
  productIds: number[]
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (productIds.length === 0) return map;
  const result = await pool.query(
    `SELECT pt.product_id, pt.tag_id
     FROM pos_product_tags pt
     JOIN pos_tags t ON t.id = pt.tag_id
     WHERE t.store_id = $1 AND pt.product_id = ANY($2::bigint[])`,
    [storeId, productIds]
  );
  for (const row of result.rows) {
    const pid = Number(row.product_id);
    const list = map.get(pid) ?? [];
    list.push(Number(row.tag_id));
    map.set(pid, list);
  }
  return map;
}

/** Tag id + all direct children ids (for parent folder browse). */
export async function resolveTagFilterIds(
  storeId: number,
  tagId: number
): Promise<number[]> {
  const tag = await pool.query(
    `SELECT id, parent_id FROM pos_tags WHERE id = $1 AND store_id = $2`,
    [tagId, storeId]
  );
  if (tag.rows.length === 0) throw new Error('Tag not found');

  const children = await pool.query(
    `SELECT id FROM pos_tags WHERE parent_id = $1 AND store_id = $2`,
    [tagId, storeId]
  );
  const ids = [tagId, ...children.rows.map((r) => Number(r.id))];
  return ids;
}

export async function seedDemoTags(storeId: number): Promise<void> {
  const existing = await pool.query(
    `SELECT id FROM pos_tags WHERE store_id = $1 LIMIT 1`,
    [storeId]
  );
  if (existing.rows.length > 0) return;

  const typeRoot = await createTag(storeId, { name: 'Тип одягу', sort_order: 1 });
  const ageRoot = await createTag(storeId, { name: 'Вік', sort_order: 2 });
  const saleRoot = await createTag(storeId, { name: 'Розпродаж', sort_order: 3 });

  const tee = await createTag(storeId, { name: 'Футболки', parent_id: typeRoot.id, sort_order: 1 });
  const jeans = await createTag(storeId, { name: 'Джинси', parent_id: typeRoot.id, sort_order: 2 });
  const hoodie = await createTag(storeId, {
    name: 'Худі',
    parent_id: typeRoot.id,
    sort_order: 3,
  });
  await createTag(storeId, { name: '2–3 р', parent_id: ageRoot.id, sort_order: 1 });
  await createTag(storeId, { name: '4–6 р', parent_id: ageRoot.id, sort_order: 2 });

  const products = await pool.query(
    `SELECT id, name FROM pos_products WHERE store_id = $1`,
    [storeId]
  );
  for (const p of products.rows) {
    const name = String(p.name).toLowerCase();
    const tags: number[] = [];
    if (name.includes('футбол')) tags.push(tee.id);
    if (name.includes('джинс')) tags.push(jeans.id);
    if (name.includes('худі')) tags.push(hoodie.id);
    tags.push(saleRoot.id);
    if (tags.length) await setProductTags(storeId, Number(p.id), tags);
  }
}
