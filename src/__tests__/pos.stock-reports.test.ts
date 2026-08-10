import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword } from '../pos/core/crypto.js';
import {
  addLine,
  createDocument,
  postDocument,
} from '../pos/stock-documents.service.js';
import {
  documentSummary,
  listMovements,
  listOnHand,
  movementReport,
} from '../pos/stock-reports.service.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POS stock reports', () => {
  let storeId = 0;
  let staffId = 0;
  let variantId = 0;

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
      '006_pos_stock_documents.sql',
    ]) {
      await pool.query(fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8'));
    }

    const slug = `reports_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Report Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);
    const pw = await hashPassword('x');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash)
       VALUES ($1, 'owner', 'Owner', $2, $3) RETURNING id`,
      [storeId, `${slug}@t.local`, pw]
    );
    staffId = Number(staff.rows[0].id);
    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Report Tee') RETURNING id`,
      [storeId]
    );
    const variant = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, price_cents, cost_cents)
       VALUES ($1, $2, 'S', 'Blue', 5000, 2000) RETURNING id`,
      [storeId, product.rows[0].id]
    );
    variantId = Number(variant.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 0)`, [
      variantId,
      storeId,
    ]);

    const receipt = await createDocument({ storeId, staffId, type: 'receipt' });
    await addLine({
      storeId,
      documentId: receipt.id,
      variantId,
      quantity: 20,
      unitCostCents: 2100,
    });
    await postDocument({ storeId, documentId: receipt.id, staffId });

    const writeoff = await createDocument({
      storeId,
      staffId,
      type: 'writeoff',
      reasonCode: 'damaged',
    });
    await addLine({ storeId, documentId: writeoff.id, variantId, quantity: 3 });
    await postDocument({ storeId, documentId: writeoff.id, staffId });
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.end();
  });

  it('lists on-hand with current quantity', async () => {
    const rows = await listOnHand(storeId);
    const row = rows.find((r) => r.variant_id === variantId);
    expect(row?.quantity).toBe(17);
    expect(row?.cost_cents).toBe(2100);
  });

  it('lists movements filtered by reason', async () => {
    const receipts = await listMovements(storeId, { reason: 'receipt' });
    expect(receipts.some((m) => m.variant_id === variantId && m.delta === 20)).toBe(true);
    const writeoffs = await listMovements(storeId, { reason: 'writeoff' });
    expect(writeoffs.some((m) => m.variant_id === variantId && m.delta === -3)).toBe(true);
  });

  it('document summary counts posted docs', async () => {
    const summary = await documentSummary(storeId);
    const receiptPosted = summary.find((s) => s.type === 'receipt' && s.status === 'posted');
    const writeoffPosted = summary.find((s) => s.type === 'writeoff' && s.status === 'posted');
    expect(receiptPosted?.count).toBeGreaterThanOrEqual(1);
    expect(writeoffPosted?.count).toBeGreaterThanOrEqual(1);
  });

  it('movement report opening+period = closing and matches stock', async () => {
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();
    const rows = await movementReport(storeId, from, to);
    const row = rows.find((r) => r.variant_id === variantId);
    expect(row).toBeTruthy();
    expect(row!.receipt).toBe(20);
    expect(row!.writeoff).toBe(-3);
    expect(row!.closing).toBe(17);
    expect(row!.opening + row!.receipt + row!.writeoff + row!.adjust + row!.inventory + row!.sale + row!.refund + row!.void).toBe(
      row!.closing
    );
  });
});
