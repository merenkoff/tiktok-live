// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword, hashPin } from '../pos/core/crypto.js';
import { completeSale } from '../pos/sales.service.js';
import {
  addAdjustmentToTarget,
  addBulkInventoryLines,
  addLine,
  createDocument,
  getDocument,
  postDocument,
  refreshSystemQty,
  reverseDocument,
  sumMovements,
  updateLine,
} from '../pos/stock-documents.service.js';
import { movementReport } from '../pos/stock-reports.service.js';

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
  ]) {
    const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
    await pool.query(sql);
  }
}

describe.skipIf(!hasDb)('POS stock documents ledger', () => {
  let storeId = 0;
  let staffId = 0;
  let variantId = 0;
  let variantId2 = 0;

  beforeAll(async () => {
    await applyMigrations();

    const slug = `stockdoc_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Stock Doc Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);

    const ownerHash = await hashPassword('x');
    const pinHash = await hashPin('1234');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
       VALUES ($1, 'owner', 'Owner', $2, $3, $4) RETURNING id`,
      [storeId, `${slug}@test.local`, ownerHash, pinHash]
    );
    staffId = Number(staff.rows[0].id);

    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Doc Tee') RETURNING id`,
      [storeId]
    );
    const productId = Number(product.rows[0].id);
    const v1 = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents)
       VALUES ($1, $2, 'M', 'Black', $3, $4, 10000, 4000) RETURNING id`,
      [storeId, productId, `SKU-${slug}-1`, `BC-${slug}-1`]
    );
    variantId = Number(v1.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 10)`, [
      variantId,
      storeId,
    ]);
    await pool.query(
      `INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, staff_id)
       VALUES ($1, $2, 10, 'seed', $3)`,
      [storeId, variantId, staffId]
    );

    const v2 = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents)
       VALUES ($1, $2, 'L', 'Black', $3, $4, 10000, 4000) RETURNING id`,
      [storeId, productId, `SKU-${slug}-2`, `BC-${slug}-2`]
    );
    variantId2 = Number(v2.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 7)`, [
      variantId2,
      storeId,
    ]);
    await pool.query(
      `INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, staff_id)
       VALUES ($1, $2, 7, 'seed', $3)`,
      [storeId, variantId2, staffId]
    );
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.end();
  });

  async function stockQty(variant: number): Promise<number> {
    const r = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variant]);
    return Number(r.rows[0].quantity);
  }

  it('draft receipt does not change stock; post increases and writes movement', async () => {
    const before = await stockQty(variantId);
    const doc = await createDocument({
      storeId,
      staffId,
      type: 'receipt',
      note: 'Поставка',
    });
    await addLine({
      storeId,
      documentId: doc.id,
      variantId,
      quantity: 5,
      unitCostCents: 4500,
    });
    expect(await stockQty(variantId)).toBe(before);

    const posted = await postDocument({ storeId, documentId: doc.id, staffId });
    expect(posted.status).toBe('posted');
    expect(await stockQty(variantId)).toBe(before + 5);

    const mov = await pool.query(
      `SELECT * FROM pos_stock_movements
       WHERE store_id = $1 AND variant_id = $2 AND reason = 'receipt'
       ORDER BY id DESC LIMIT 1`,
      [storeId, variantId]
    );
    expect(mov.rows[0].delta).toBe(5);
    expect(mov.rows[0].reference_type).toBe('stock_document');
    expect(Number(mov.rows[0].reference_id)).toBe(doc.id);
    expect(Number(mov.rows[0].unit_cost_cents)).toBe(4500);

    const cost = await pool.query(`SELECT cost_cents FROM pos_variants WHERE id = $1`, [variantId]);
    expect(Number(cost.rows[0].cost_cents)).toBe(4500);
  });

  it('writeoff posts ok and rolls back fully on insufficient stock', async () => {
    const before = await stockQty(variantId);
    const ok = await createDocument({
      storeId,
      staffId,
      type: 'writeoff',
      reasonCode: 'damaged',
    });
    await addLine({ storeId, documentId: ok.id, variantId, quantity: 2 });
    await postDocument({ storeId, documentId: ok.id, staffId });
    expect(await stockQty(variantId)).toBe(before - 2);

    const bad = await createDocument({
      storeId,
      staffId,
      type: 'writeoff',
      reasonCode: 'lost',
    });
    const huge = (await stockQty(variantId)) + 100;
    await addLine({ storeId, documentId: bad.id, variantId, quantity: huge });
    await expect(postDocument({ storeId, documentId: bad.id, staffId })).rejects.toThrow(
      /Insufficient stock/
    );
    const still = await getDocument(storeId, bad.id);
    expect(still?.status).toBe('draft');
    expect(await stockQty(variantId)).toBe(before - 2);
  });

  it('adjustment to target computes signed delta', async () => {
    const current = await stockQty(variantId);
    const target = current + 3;
    const doc = await createDocument({
      storeId,
      staffId,
      type: 'adjustment',
      reasonCode: 'found',
    });
    await addAdjustmentToTarget({
      storeId,
      documentId: doc.id,
      variantId,
      targetQty: target,
    });
    await postDocument({ storeId, documentId: doc.id, staffId });
    expect(await stockQty(variantId)).toBe(target);
  });

  it('inventory uses actual stock at post time (not stale snapshot)', async () => {
    // Reset variant2 to known qty via adjustment
    const cur = await stockQty(variantId2);
    if (cur !== 7) {
      const adj = await createDocument({
        storeId,
        staffId,
        type: 'adjustment',
        reasonCode: 'data_fix',
      });
      await addAdjustmentToTarget({
        storeId,
        documentId: adj.id,
        variantId: variantId2,
        targetQty: 7,
      });
      await postDocument({ storeId, documentId: adj.id, staffId });
    }

    const inv = await createDocument({ storeId, staffId, type: 'inventory' });
    await addLine({
      storeId,
      documentId: inv.id,
      variantId: variantId2,
      countedQty: 5,
    });
    const draft = await getDocument(storeId, inv.id);
    expect(draft?.lines?.[0].system_qty).toBe(7);
    expect(draft?.lines?.[0].counted_qty).toBe(5);

    // Sale between draft and post
    await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId2, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 10000 }],
    });
    expect(await stockQty(variantId2)).toBe(6);

    const posted = await postDocument({ storeId, documentId: inv.id, staffId });
    // counted 5, actual at post 6 → delta -1 → stock 5
    expect(await stockQty(variantId2)).toBe(5);
    const line = posted.lines?.find((l) => l.variant_id === variantId2);
    expect(line?.system_qty).toBe(6);
    expect(line?.quantity).toBe(-1);

    const mov = await pool.query(
      `SELECT delta, reason FROM pos_stock_movements
       WHERE reference_type = 'stock_document' AND reference_id = $1 AND variant_id = $2`,
      [inv.id, variantId2]
    );
    expect(mov.rows[0].reason).toBe('inventory');
    expect(Number(mov.rows[0].delta)).toBe(-1);
  });

  it('idempotency key and double post are safe', async () => {
    const before = await stockQty(variantId);
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addLine({ storeId, documentId: doc.id, variantId, quantity: 1 });
    const key = `idem-${doc.id}`;
    const a = await postDocument({
      storeId,
      documentId: doc.id,
      staffId,
      idempotencyKey: key,
    });
    const b = await postDocument({
      storeId,
      documentId: doc.id,
      staffId,
      idempotencyKey: key,
    });
    expect(a.id).toBe(b.id);
    expect(await stockQty(variantId)).toBe(before + 1);

    const c = await postDocument({ storeId, documentId: doc.id, staffId });
    expect(c.status).toBe('posted');
    expect(await stockQty(variantId)).toBe(before + 1);
  });

  it('reverse receipt restores quantity', async () => {
    const before = await stockQty(variantId);
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addLine({ storeId, documentId: doc.id, variantId, quantity: 4 });
    await postDocument({ storeId, documentId: doc.id, staffId });
    expect(await stockQty(variantId)).toBe(before + 4);

    const reverse = await reverseDocument({ storeId, documentId: doc.id, staffId });
    expect(reverse.reversal_of_id).toBe(doc.id);
    expect(reverse.status).toBe('posted');
    expect(await stockQty(variantId)).toBe(before);

    const original = await getDocument(storeId, doc.id);
    expect(original?.status).toBe('reversed');
  });

  it('SUM(delta) equals pos_stock after series of ops', async () => {
    const total = await sumMovements(storeId, variantId);
    expect(total).toBe(await stockQty(variantId));
    const total2 = await sumMovements(storeId, variantId2);
    expect(total2).toBe(await stockQty(variantId2));
  });

  it('bulk inventory lines + refresh system qty', async () => {
    const inv = await createDocument({ storeId, staffId, type: 'inventory' });
    const lines = await addBulkInventoryLines({
      storeId,
      documentId: inv.id,
      variantIds: [variantId, variantId2],
    });
    expect(lines.length).toBe(2);

    // bump stock then refresh
    await pool.query(`UPDATE pos_stock SET quantity = quantity + 1 WHERE variant_id = $1`, [
      variantId,
    ]);
    await pool.query(
      `INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, staff_id)
       VALUES ($1, $2, 1, 'adjust', $3)`,
      [storeId, variantId, staffId]
    );
    const refreshed = await refreshSystemQty(storeId, inv.id);
    const line = refreshed.find((l) => l.variant_id === variantId);
    expect(line?.system_qty).toBe(await stockQty(variantId));

    await updateLine({
      storeId,
      documentId: inv.id,
      lineId: line!.id,
      countedQty: line!.system_qty!,
    });
    // leave draft — no need to post for this test
  });

  it('movement report closing matches stock for period', async () => {
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();
    const rows = await movementReport(storeId, from, to);
    const row = rows.find((r) => r.variant_id === variantId);
    expect(row).toBeTruthy();
    expect(row!.closing).toBe(await stockQty(variantId));
  });
});
