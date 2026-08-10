import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword, hashPin } from '../pos/core/crypto.js';
import {
  addLine,
  addPlaceholderLine,
  createDocument,
  getDocument,
  postDocument,
  reverseDocument,
  sumMovements,
  voidDraft,
} from '../pos/stock-documents.service.js';

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
  ]) {
    const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
    await pool.query(sql);
  }
}

describe.skipIf(!hasDb)('POS receipt placeholder products', () => {
  let storeId = 0;
  let staffId = 0;
  let variantId = 0;
  let existingBarcode = '';

  beforeAll(async () => {
    await applyMigrations();

    const slug = `ph_${Date.now()}`;
    existingBarcode = `BC-EXIST-${slug}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Placeholder Store', $1) RETURNING id`,
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
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Existing Tee') RETURNING id`,
      [storeId]
    );
    const productId = Number(product.rows[0].id);
    const v1 = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents)
       VALUES ($1, $2, 'M', 'Black', $3, $4, 10000, 4000) RETURNING id`,
      [storeId, productId, `SKU-${slug}`, existingBarcode]
    );
    variantId = Number(v1.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 5)`, [
      variantId,
      storeId,
    ]);
    await pool.query(
      `INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, staff_id)
       VALUES ($1, $2, 5, 'seed', $3)`,
      [storeId, variantId, staffId]
    );
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.end();
  });

  async function productCountByName(name: string): Promise<number> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM pos_products WHERE store_id = $1 AND name = $2`,
      [storeId, name]
    );
    return Number(r.rows[0].c);
  }

  async function stockQty(variant: number): Promise<number> {
    const r = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variant]);
    return Number(r.rows[0].quantity);
  }

  it('addPlaceholderLine on draft receipt keeps variant null and does not touch catalog/stock', async () => {
    const beforeStock = await stockQty(variantId);
    const beforeProducts = await productCountByName('Бодик коричневий');
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    const line = await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name: 'Бодик коричневий',
      quantity: 3,
      priceCents: 45000,
      unitCostCents: 20000,
      size: '86',
      color: 'brown',
    });
    expect(line.variant_id).toBeNull();
    expect(line.is_placeholder).toBe(true);
    expect(line.placeholder_name).toBe('Бодик коричневий');
    expect(line.placeholder_price_cents).toBe(45000);
    expect(await stockQty(variantId)).toBe(beforeStock);
    expect(await productCountByName('Бодик коричневий')).toBe(beforeProducts);
  });

  it('rejects placeholder on writeoff', async () => {
    const doc = await createDocument({ storeId, staffId, type: 'writeoff', reasonCode: 'damage' });
    await expect(
      addPlaceholderLine({
        storeId,
        documentId: doc.id,
        name: 'Should Fail',
        quantity: 1,
        priceCents: 100,
      })
    ).rejects.toThrow(/receipt/i);
  });

  it('save draft + reload keeps stub line', async () => {
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name: 'Stub Reload',
      quantity: 2,
      priceCents: 9900,
    });
    const reloaded = await getDocument(storeId, doc.id);
    expect(reloaded?.status).toBe('draft');
    expect(reloaded?.lines?.length).toBe(1);
    expect(reloaded?.lines?.[0].is_placeholder).toBe(true);
    expect(reloaded?.lines?.[0].placeholder_name).toBe('Stub Reload');
    expect(reloaded?.lines?.[0].variant_id).toBeNull();
  });

  it('postDocument materializes mix of existing + stub with needs_review and receipt movement', async () => {
    const name = `Mix Stub ${Date.now()}`;
    const beforeExisting = await stockQty(variantId);
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addLine({
      storeId,
      documentId: doc.id,
      variantId,
      quantity: 2,
      unitCostCents: 4100,
    });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name,
      quantity: 4,
      priceCents: 12000,
      unitCostCents: 5000,
      size: 'S',
      color: 'red',
    });

    const posted = await postDocument({ storeId, documentId: doc.id, staffId });
    expect(posted.status).toBe('posted');

    const stubLine = posted.lines?.find((l) => l.placeholder_name === name);
    expect(stubLine).toBeTruthy();
    expect(stubLine?.is_placeholder).toBe(false);
    expect(stubLine?.variant_id).not.toBeNull();

    const product = await pool.query(
      `SELECT id, needs_review, created_from_document_id, description
       FROM pos_products WHERE store_id = $1 AND name = $2`,
      [storeId, name]
    );
    expect(product.rows.length).toBe(1);
    expect(product.rows[0].needs_review).toBe(true);
    expect(Number(product.rows[0].created_from_document_id)).toBe(doc.id);
    expect(String(product.rows[0].description)).toContain(posted.doc_number);

    const newVariantId = Number(stubLine!.variant_id);
    expect(await stockQty(newVariantId)).toBe(4);
    expect(await stockQty(variantId)).toBe(beforeExisting + 2);

    const mov = await pool.query(
      `SELECT delta, reason FROM pos_stock_movements
       WHERE store_id = $1 AND variant_id = $2 AND reason = 'receipt'
       ORDER BY id DESC LIMIT 1`,
      [storeId, newVariantId]
    );
    expect(Number(mov.rows[0].delta)).toBe(4);
    expect(mov.rows[0].reason).toBe('receipt');

    const seed = await pool.query(
      `SELECT COUNT(*)::int AS c FROM pos_stock_movements
       WHERE variant_id = $1 AND reason = 'seed'`,
      [newVariantId]
    );
    expect(Number(seed.rows[0].c)).toBe(0);

    const sum = await sumMovements(storeId, newVariantId);
    expect(sum).toBe(await stockQty(newVariantId));
  });

  it('post with colliding barcode rolls back and leaves draft without orphan product', async () => {
    const name = `Barcode Collision ${Date.now()}`;
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name,
      quantity: 1,
      priceCents: 1000,
      barcode: existingBarcode,
    });

    await expect(postDocument({ storeId, documentId: doc.id, staffId })).rejects.toThrow(
      /штрихкод|barcode/i
    );

    const reloaded = await getDocument(storeId, doc.id);
    expect(reloaded?.status).toBe('draft');
    expect(reloaded?.lines?.[0].is_placeholder).toBe(true);
    expect(await productCountByName(name)).toBe(0);
  });

  it('void draft with stubs leaves no products', async () => {
    const name = `Void Stub ${Date.now()}`;
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name,
      quantity: 1,
      priceCents: 500,
    });
    await voidDraft(storeId, doc.id);
    expect(await productCountByName(name)).toBe(0);
    const voided = await getDocument(storeId, doc.id);
    expect(voided?.status).toBe('voided');
  });

  it('double post / Idempotency-Key creates one product and one stock effect', async () => {
    const name = `Idem Stub ${Date.now()}`;
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name,
      quantity: 5,
      priceCents: 8000,
      unitCostCents: 3000,
    });
    const key = `idem-ph-${doc.id}`;
    const first = await postDocument({
      storeId,
      documentId: doc.id,
      staffId,
      idempotencyKey: key,
    });
    const second = await postDocument({
      storeId,
      documentId: doc.id,
      staffId,
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
    expect(await productCountByName(name)).toBe(1);

    const variantIdNew = Number(first.lines?.[0].variant_id);
    expect(await stockQty(variantIdNew)).toBe(5);
    const receiptMoves = await pool.query(
      `SELECT COUNT(*)::int AS c FROM pos_stock_movements
       WHERE variant_id = $1 AND reason = 'receipt'`,
      [variantIdNew]
    );
    expect(Number(receiptMoves.rows[0].c)).toBe(1);
  });

  it('reverse posted receipt restores stock but keeps product', async () => {
    const name = `Reverse Keep ${Date.now()}`;
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name,
      quantity: 6,
      priceCents: 7000,
      unitCostCents: 2500,
    });
    const posted = await postDocument({ storeId, documentId: doc.id, staffId });
    const vid = Number(posted.lines?.[0].variant_id);
    expect(await stockQty(vid)).toBe(6);

    await reverseDocument({ storeId, documentId: doc.id, staffId });
    expect(await stockQty(vid)).toBe(0);
    expect(await productCountByName(name)).toBe(1);
  });

  it('rejects duplicate placeholder same name/size/color in one doc', async () => {
    const doc = await createDocument({ storeId, staffId, type: 'receipt' });
    await addPlaceholderLine({
      storeId,
      documentId: doc.id,
      name: 'Dup Name',
      quantity: 1,
      priceCents: 100,
      size: 'M',
      color: 'blue',
    });
    await expect(
      addPlaceholderLine({
        storeId,
        documentId: doc.id,
        name: 'Dup Name',
        quantity: 2,
        priceCents: 200,
        size: 'M',
        color: 'blue',
      })
    ).rejects.toThrow(/duplicate/i);
  });
});
