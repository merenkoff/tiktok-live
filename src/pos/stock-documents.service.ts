// src/pos/stock-documents.service.ts

import { pool } from '../db.js';
import { createProductInTx } from './products.service.js';
import { applyStockDelta } from './stock.service.js';
import type { StockDocumentStatus, StockDocumentType, StockReason } from './types.js';

export interface StockDocumentLine {
  id: number;
  document_id: number;
  store_id: number;
  variant_id: number | null;
  quantity: number;
  unit_cost_cents: number | null;
  system_qty: number | null;
  counted_qty: number | null;
  line_note: string | null;
  is_placeholder: boolean;
  placeholder_name: string | null;
  placeholder_size: string;
  placeholder_color: string;
  placeholder_barcode: string | null;
  placeholder_price_cents: number | null;
  product_name?: string;
  size?: string;
  color?: string;
  product_id?: number;
}

export interface StockDocument {
  id: number;
  store_id: number;
  type: StockDocumentType;
  status: StockDocumentStatus;
  doc_number: string;
  occurred_at: Date;
  supplier_id: number | null;
  reason_code: string | null;
  note: string | null;
  created_by: number;
  posted_by: number | null;
  posted_at: Date | null;
  reversed_at: Date | null;
  reversal_of_id: number | null;
  created_at: Date;
  updated_at: Date;
  lines?: StockDocumentLine[];
}

const DOC_PREFIX: Record<StockDocumentType, string> = {
  receipt: 'ПР',
  writeoff: 'СП',
  adjustment: 'КР',
  inventory: 'ІН',
};

const TYPE_TO_REASON: Record<Exclude<StockDocumentType, 'adjustment'>, StockReason> = {
  receipt: 'receipt',
  writeoff: 'writeoff',
  inventory: 'inventory',
};

type DbClient = { query: typeof pool.query };

function mapDoc(row: Record<string, unknown>): StockDocument {
  return {
    id: Number(row.id),
    store_id: Number(row.store_id),
    type: row.type as StockDocumentType,
    status: row.status as StockDocumentStatus,
    doc_number: String(row.doc_number),
    occurred_at: row.occurred_at as Date,
    supplier_id: row.supplier_id == null ? null : Number(row.supplier_id),
    reason_code: row.reason_code == null ? null : String(row.reason_code),
    note: row.note == null ? null : String(row.note),
    created_by: Number(row.created_by),
    posted_by: row.posted_by == null ? null : Number(row.posted_by),
    posted_at: (row.posted_at as Date | null) ?? null,
    reversed_at: (row.reversed_at as Date | null) ?? null,
    reversal_of_id: row.reversal_of_id == null ? null : Number(row.reversal_of_id),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function mapLine(row: Record<string, unknown>): StockDocumentLine {
  return {
    id: Number(row.id),
    document_id: Number(row.document_id),
    store_id: Number(row.store_id),
    variant_id: row.variant_id == null ? null : Number(row.variant_id),
    quantity: Number(row.quantity),
    unit_cost_cents: row.unit_cost_cents == null ? null : Number(row.unit_cost_cents),
    system_qty: row.system_qty == null ? null : Number(row.system_qty),
    counted_qty: row.counted_qty == null ? null : Number(row.counted_qty),
    line_note: row.line_note == null ? null : String(row.line_note),
    is_placeholder: Boolean(row.is_placeholder),
    placeholder_name: row.placeholder_name == null ? null : String(row.placeholder_name),
    placeholder_size: row.placeholder_size == null ? '' : String(row.placeholder_size),
    placeholder_color: row.placeholder_color == null ? '' : String(row.placeholder_color),
    placeholder_barcode: row.placeholder_barcode == null ? null : String(row.placeholder_barcode),
    placeholder_price_cents:
      row.placeholder_price_cents == null ? null : Number(row.placeholder_price_cents),
    product_name: row.product_name == null ? undefined : String(row.product_name),
    size: row.size == null ? undefined : String(row.size),
    color: row.color == null ? undefined : String(row.color),
    product_id: row.product_id == null ? undefined : Number(row.product_id),
  };
}

async function nextDocNumber(
  client: DbClient,
  storeId: number,
  type: StockDocumentType
): Promise<string> {
  const year = new Date().getFullYear();
  const counterKey = `${type}_${year}`;
  await client.query(
    `INSERT INTO pos_store_counters (store_id, counter_key, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (store_id, counter_key) DO NOTHING`,
    [storeId, counterKey]
  );
  const result = await client.query(
    `UPDATE pos_store_counters
     SET next_value = next_value + 1
     WHERE store_id = $1 AND counter_key = $2
     RETURNING next_value - 1 AS seq`,
    [storeId, counterKey]
  );
  const seq = Number(result.rows[0].seq);
  return `${DOC_PREFIX[type]}-${year}-${String(seq).padStart(5, '0')}`;
}

async function assertVariantInStore(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<void> {
  const result = await client.query(
    `SELECT id FROM pos_variants WHERE id = $1 AND store_id = $2 AND is_active = TRUE`,
    [variantId, storeId]
  );
  if (result.rows.length === 0) throw new Error(`Variant ${variantId} not found`);
}

async function loadLines(client: DbClient, documentId: number): Promise<StockDocumentLine[]> {
  const result = await client.query(
    `SELECT l.*,
            COALESCE(p.name, l.placeholder_name) AS product_name,
            COALESCE(v.size, l.placeholder_size) AS size,
            COALESCE(v.color, l.placeholder_color) AS color,
            p.id AS product_id
     FROM pos_stock_document_lines l
     LEFT JOIN pos_variants v ON v.id = l.variant_id
     LEFT JOIN pos_products p ON p.id = v.product_id
     WHERE l.document_id = $1
     ORDER BY l.id ASC`,
    [documentId]
  );
  return result.rows.map(mapLine);
}

export async function getDocument(
  storeId: number,
  documentId: number
): Promise<StockDocument | null> {
  const result = await pool.query(
    `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2`,
    [documentId, storeId]
  );
  if (result.rows.length === 0) return null;
  const doc = mapDoc(result.rows[0]);
  doc.lines = await loadLines(pool, documentId);
  return doc;
}

export async function listDocuments(
  storeId: number,
  filters: {
    type?: StockDocumentType;
    status?: StockDocumentStatus;
    from?: string;
    to?: string;
    limit?: number;
  } = {}
): Promise<StockDocument[]> {
  const clauses = ['store_id = $1'];
  const params: unknown[] = [storeId];
  let i = 2;
  if (filters.type) {
    clauses.push(`type = $${i++}`);
    params.push(filters.type);
  }
  if (filters.status) {
    clauses.push(`status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.from) {
    clauses.push(`occurred_at >= $${i++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push(`occurred_at <= $${i++}`);
    params.push(filters.to);
  }
  const limit = Math.min(filters.limit ?? 100, 500);
  params.push(limit);
  const result = await pool.query(
    `SELECT * FROM pos_stock_documents
     WHERE ${clauses.join(' AND ')}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${i}`,
    params
  );
  return result.rows.map(mapDoc);
}

export async function createDocument(params: {
  storeId: number;
  staffId: number;
  type: StockDocumentType;
  occurredAt?: string | Date;
  supplierId?: number | null;
  reasonCode?: string | null;
  note?: string | null;
}): Promise<StockDocument> {
  if (params.type === 'writeoff' || params.type === 'adjustment') {
    if (!params.reasonCode) throw new Error('reason_code required');
    if (params.reasonCode === 'other' && !params.note?.trim()) {
      throw new Error('note required when reason_code is other');
    }
  }
  if (params.type !== 'receipt' && params.supplierId) {
    throw new Error('supplier_id only allowed on receipt');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const docNumber = await nextDocNumber(client, params.storeId, params.type);
    const result = await client.query(
      `INSERT INTO pos_stock_documents
         (store_id, type, status, doc_number, occurred_at, supplier_id, reason_code, note, created_by)
       VALUES ($1, $2, 'draft', $3, COALESCE($4::timestamptz, NOW()), $5, $6, $7, $8)
       RETURNING *`,
      [
        params.storeId,
        params.type,
        docNumber,
        params.occurredAt ?? null,
        params.supplierId ?? null,
        params.reasonCode ?? null,
        params.note ?? null,
        params.staffId,
      ]
    );
    await client.query('COMMIT');
    const doc = mapDoc(result.rows[0]);
    doc.lines = [];
    return doc;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateDocumentMeta(
  storeId: number,
  documentId: number,
  input: {
    occurredAt?: string | Date;
    supplierId?: number | null;
    reasonCode?: string | null;
    note?: string | null;
  }
): Promise<StockDocument> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [documentId, storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    const doc = locked.rows[0];
    if (doc.status !== 'draft') throw new Error('Only draft documents can be edited');

    await client.query(
      `UPDATE pos_stock_documents
       SET supplier_id = $1,
           reason_code = $2,
           note = $3,
           occurred_at = COALESCE($4::timestamptz, occurred_at),
           updated_at = NOW()
       WHERE id = $5`,
      [
        input.supplierId !== undefined ? input.supplierId : doc.supplier_id,
        input.reasonCode !== undefined ? input.reasonCode : doc.reason_code,
        input.note !== undefined ? input.note : doc.note,
        input.occurredAt ?? null,
        documentId,
      ]
    );
    await client.query('COMMIT');
    const updated = await getDocument(storeId, documentId);
    if (!updated) throw new Error('Document not found');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addLine(params: {
  storeId: number;
  documentId: number;
  variantId: number;
  quantity?: number;
  unitCostCents?: number | null;
  countedQty?: number | null;
  lineNote?: string | null;
}): Promise<StockDocumentLine> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.documentId, params.storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    const doc = locked.rows[0] as { type: StockDocumentType; status: string };
    if (doc.status !== 'draft') throw new Error('Only draft documents can be edited');
    await assertVariantInStore(client, params.storeId, params.variantId);

    let quantity = params.quantity ?? 0;
    let systemQty: number | null = null;
    let countedQty: number | null = params.countedQty ?? null;
    let unitCost: number | null = params.unitCostCents ?? null;

    if (doc.type === 'receipt' || doc.type === 'writeoff') {
      if (!params.quantity || params.quantity <= 0) {
        throw new Error('quantity must be positive');
      }
      quantity = params.quantity;
    } else if (doc.type === 'adjustment') {
      if (typeof params.quantity !== 'number' || params.quantity === 0) {
        throw new Error('adjustment quantity (delta) cannot be zero');
      }
      quantity = params.quantity;
    } else if (doc.type === 'inventory') {
      if (params.countedQty == null || params.countedQty < 0) {
        throw new Error('counted_qty required for inventory');
      }
      countedQty = params.countedQty;
      const stock = await client.query(
        `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
        [params.variantId, params.storeId]
      );
      if (stock.rows.length === 0) throw new Error('Stock row not found');
      systemQty = Number(stock.rows[0].quantity);
      quantity = 0;
      unitCost = null;
    }

    const result = await client.query(
      `INSERT INTO pos_stock_document_lines
         (document_id, store_id, variant_id, quantity, unit_cost_cents, system_qty, counted_qty, line_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.documentId,
        params.storeId,
        params.variantId,
        quantity,
        doc.type === 'receipt' ? unitCost : null,
        systemQty,
        countedQty,
        params.lineNote ?? null,
      ]
    );
    await client.query(
      `UPDATE pos_stock_documents SET updated_at = NOW() WHERE id = $1`,
      [params.documentId]
    );
    await client.query('COMMIT');
    return mapLine(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addPlaceholderLine(params: {
  storeId: number;
  documentId: number;
  name: string;
  quantity: number;
  priceCents: number;
  unitCostCents?: number | null;
  size?: string;
  color?: string;
  barcode?: string | null;
  lineNote?: string | null;
}): Promise<StockDocumentLine> {
  const name = params.name.trim();
  if (!name) throw new Error('placeholder name required');
  if (!params.quantity || params.quantity <= 0) throw new Error('quantity must be positive');
  if (params.priceCents == null || params.priceCents < 0) {
    throw new Error('price_cents must be >= 0');
  }

  const size = (params.size ?? '').trim();
  const color = (params.color ?? '').trim();
  const barcode = params.barcode?.trim() || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.documentId, params.storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    const doc = locked.rows[0];
    if (doc.status !== 'draft') throw new Error('Only draft documents can be edited');
    if (doc.type !== 'receipt') throw new Error('Placeholders only allowed on receipt documents');

    const dup = await client.query(
      `SELECT id FROM pos_stock_document_lines
       WHERE document_id = $1 AND is_placeholder = TRUE
         AND lower(placeholder_name) = lower($2)
         AND placeholder_size = $3 AND placeholder_color = $4`,
      [params.documentId, name, size, color]
    );
    if (dup.rows.length > 0) {
      throw new Error('Duplicate placeholder in this document');
    }

    const result = await client.query(
      `INSERT INTO pos_stock_document_lines
         (document_id, store_id, variant_id, quantity, unit_cost_cents, line_note,
          is_placeholder, placeholder_name, placeholder_size, placeholder_color,
          placeholder_barcode, placeholder_price_cents)
       VALUES ($1, $2, NULL, $3, $4, $5, TRUE, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        params.documentId,
        params.storeId,
        params.quantity,
        params.unitCostCents ?? null,
        params.lineNote ?? null,
        name,
        size,
        color,
        barcode,
        params.priceCents,
      ]
    );
    await client.query(`UPDATE pos_stock_documents SET updated_at = NOW() WHERE id = $1`, [
      params.documentId,
    ]);
    await client.query('COMMIT');
    const row = result.rows[0];
    return mapLine({
      ...row,
      product_name: row.placeholder_name,
      size: row.placeholder_size,
      color: row.placeholder_color,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Soft suggestions: existing products with similar name (does not block). */
export async function suggestSimilarProducts(
  storeId: number,
  name: string,
  limit = 5
): Promise<{ id: number; name: string }[]> {
  const needle = name.trim();
  if (!needle) return [];
  const result = await pool.query(
    `SELECT id, name FROM pos_products
     WHERE store_id = $1 AND is_active = TRUE
       AND lower(name) LIKE lower($2)
     ORDER BY name ASC
     LIMIT $3`,
    [storeId, `%${needle}%`, limit]
  );
  return result.rows.map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

/** Set adjustment line so resulting stock becomes targetQty */
export async function addAdjustmentToTarget(params: {
  storeId: number;
  documentId: number;
  variantId: number;
  targetQty: number;
  lineNote?: string | null;
}): Promise<StockDocumentLine> {
  if (params.targetQty < 0) throw new Error('targetQty cannot be negative');
  const stock = await pool.query(
    `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
    [params.variantId, params.storeId]
  );
  if (stock.rows.length === 0) throw new Error('Stock row not found');
  const current = Number(stock.rows[0].quantity);
  const delta = params.targetQty - current;
  if (delta === 0) throw new Error('Target quantity equals current stock');
  return addLine({
    storeId: params.storeId,
    documentId: params.documentId,
    variantId: params.variantId,
    quantity: delta,
    lineNote: params.lineNote,
  });
}

export async function updateLine(params: {
  storeId: number;
  documentId: number;
  lineId: number;
  quantity?: number;
  unitCostCents?: number | null;
  countedQty?: number | null;
  lineNote?: string | null;
  placeholderName?: string;
  placeholderSize?: string;
  placeholderColor?: string;
  placeholderBarcode?: string | null;
  placeholderPriceCents?: number;
}): Promise<StockDocumentLine> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT d.type, d.status, l.*
       FROM pos_stock_documents d
       JOIN pos_stock_document_lines l ON l.document_id = d.id
       WHERE d.id = $1 AND d.store_id = $2 AND l.id = $3
       FOR UPDATE OF d, l`,
      [params.documentId, params.storeId, params.lineId]
    );
    if (locked.rows.length === 0) throw new Error('Line not found');
    const row = locked.rows[0];
    if (row.status !== 'draft') throw new Error('Only draft documents can be edited');

    let quantity = Number(row.quantity);
    let unitCost = row.unit_cost_cents == null ? null : Number(row.unit_cost_cents);
    let systemQty = row.system_qty == null ? null : Number(row.system_qty);
    let countedQty = row.counted_qty == null ? null : Number(row.counted_qty);
    let placeholderName = row.placeholder_name == null ? null : String(row.placeholder_name);
    let placeholderSize = row.placeholder_size == null ? '' : String(row.placeholder_size);
    let placeholderColor = row.placeholder_color == null ? '' : String(row.placeholder_color);
    let placeholderBarcode =
      row.placeholder_barcode == null ? null : String(row.placeholder_barcode);
    let placeholderPrice =
      row.placeholder_price_cents == null ? null : Number(row.placeholder_price_cents);

    if (row.is_placeholder) {
      if (params.quantity !== undefined) {
        if (params.quantity <= 0) throw new Error('quantity must be positive');
        quantity = params.quantity;
      }
      if (params.unitCostCents !== undefined) unitCost = params.unitCostCents;
      if (params.placeholderName !== undefined) {
        const n = params.placeholderName.trim();
        if (!n) throw new Error('placeholder name required');
        placeholderName = n;
      }
      if (params.placeholderSize !== undefined) placeholderSize = params.placeholderSize.trim();
      if (params.placeholderColor !== undefined) placeholderColor = params.placeholderColor.trim();
      if (params.placeholderBarcode !== undefined) {
        placeholderBarcode = params.placeholderBarcode?.trim() || null;
      }
      if (params.placeholderPriceCents !== undefined) {
        if (params.placeholderPriceCents < 0) throw new Error('price_cents must be >= 0');
        placeholderPrice = params.placeholderPriceCents;
      }
    } else if (row.type === 'receipt' || row.type === 'writeoff') {
      if (params.quantity !== undefined) {
        if (params.quantity <= 0) throw new Error('quantity must be positive');
        quantity = params.quantity;
      }
      if (row.type === 'receipt' && params.unitCostCents !== undefined) {
        unitCost = params.unitCostCents;
      }
    } else if (row.type === 'adjustment') {
      if (params.quantity !== undefined) {
        if (params.quantity === 0) throw new Error('adjustment quantity cannot be zero');
        quantity = params.quantity;
      }
    } else if (row.type === 'inventory') {
      if (params.countedQty !== undefined && params.countedQty !== null) {
        if (params.countedQty < 0) throw new Error('counted_qty cannot be negative');
        countedQty = params.countedQty;
      }
      const stock = await client.query(
        `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
        [row.variant_id, params.storeId]
      );
      systemQty = Number(stock.rows[0].quantity);
    }

    await client.query(
      `UPDATE pos_stock_document_lines
       SET quantity = $1,
           unit_cost_cents = $2,
           system_qty = $3,
           counted_qty = $4,
           line_note = COALESCE($5, line_note),
           placeholder_name = $6,
           placeholder_size = $7,
           placeholder_color = $8,
           placeholder_barcode = $9,
           placeholder_price_cents = $10
       WHERE id = $11`,
      [
        quantity,
        unitCost,
        systemQty,
        countedQty,
        params.lineNote === undefined ? null : params.lineNote,
        placeholderName,
        placeholderSize,
        placeholderColor,
        placeholderBarcode,
        placeholderPrice,
        params.lineId,
      ]
    );
    if (params.lineNote !== undefined) {
      await client.query(`UPDATE pos_stock_document_lines SET line_note = $1 WHERE id = $2`, [
        params.lineNote,
        params.lineId,
      ]);
    }
    await client.query('COMMIT');
    const lines = await loadLines(pool, params.documentId);
    const updated = lines.find((l) => l.id === params.lineId);
    if (!updated) throw new Error('Line not found');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeLine(
  storeId: number,
  documentId: number,
  lineId: number
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT status FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [documentId, storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    if (locked.rows[0].status !== 'draft') throw new Error('Only draft documents can be edited');
    const del = await client.query(
      `DELETE FROM pos_stock_document_lines WHERE id = $1 AND document_id = $2 AND store_id = $3`,
      [lineId, documentId, storeId]
    );
    if (del.rowCount === 0) throw new Error('Line not found');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addBulkInventoryLines(params: {
  storeId: number;
  documentId: number;
  tagIds?: number[];
  productIds?: number[];
  variantIds?: number[];
}): Promise<StockDocumentLine[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.documentId, params.storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    if (locked.rows[0].type !== 'inventory') throw new Error('bulk lines only for inventory');
    if (locked.rows[0].status !== 'draft') throw new Error('Only draft documents can be edited');

    let sql = `
      SELECT v.id AS variant_id, s.quantity
      FROM pos_variants v
      JOIN pos_stock s ON s.variant_id = v.id
      WHERE v.store_id = $1 AND v.is_active = TRUE AND s.store_id = $1`;
    const qparams: unknown[] = [params.storeId];
    let i = 2;

    if (params.variantIds?.length) {
      sql += ` AND v.id = ANY($${i++})`;
      qparams.push(params.variantIds);
    } else if (params.productIds?.length) {
      sql += ` AND v.product_id = ANY($${i++})`;
      qparams.push(params.productIds);
    } else if (params.tagIds?.length) {
      sql += ` AND v.product_id IN (
        SELECT product_id FROM pos_product_tags WHERE tag_id = ANY($${i++})
      )`;
      qparams.push(params.tagIds);
    }

    sql += ` ORDER BY v.id ASC`;
    const variants = await client.query(sql, qparams);
    const lines: StockDocumentLine[] = [];

    for (const row of variants.rows) {
      const inserted = await client.query(
        `INSERT INTO pos_stock_document_lines
           (document_id, store_id, variant_id, quantity, system_qty, counted_qty)
         VALUES ($1, $2, $3, 0, $4, $4)
         ON CONFLICT (document_id, variant_id) DO UPDATE
           SET system_qty = EXCLUDED.system_qty
         RETURNING *`,
        [params.documentId, params.storeId, row.variant_id, Number(row.quantity)]
      );
      lines.push(mapLine(inserted.rows[0]));
    }

    await client.query('COMMIT');
    return lines;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function refreshSystemQty(
  storeId: number,
  documentId: number
): Promise<StockDocumentLine[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [documentId, storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    if (locked.rows[0].type !== 'inventory') throw new Error('refresh only for inventory');
    if (locked.rows[0].status !== 'draft') throw new Error('Only draft documents can be edited');

    await client.query(
      `UPDATE pos_stock_document_lines l
       SET system_qty = s.quantity
       FROM pos_stock s
       WHERE l.document_id = $1 AND l.store_id = $2
         AND s.variant_id = l.variant_id AND s.store_id = $2`,
      [documentId, storeId]
    );
    await client.query('COMMIT');
    return loadLines(pool, documentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function computeDelta(
  type: StockDocumentType,
  line: { quantity: number; counted_qty: number | null },
  currentQty: number
): number {
  if (type === 'receipt') return line.quantity;
  if (type === 'writeoff') return -line.quantity;
  if (type === 'adjustment') return line.quantity;
  // inventory: from actual stock at post time
  if (line.counted_qty == null) throw new Error('counted_qty required');
  return line.counted_qty - currentQty;
}

function reasonForType(type: StockDocumentType): StockReason {
  if (type === 'adjustment') return 'adjust';
  return TYPE_TO_REASON[type];
}

export async function postDocument(params: {
  storeId: number;
  documentId: number;
  staffId: number;
  idempotencyKey?: string;
}): Promise<StockDocument> {
  if (params.idempotencyKey) {
    const existing = await pool.query(
      `SELECT response_json FROM pos_idempotency_keys WHERE store_id = $1 AND key = $2`,
      [params.storeId, params.idempotencyKey]
    );
    if (existing.rows.length > 0) {
      const cachedId = Number((existing.rows[0].response_json as { id: number }).id);
      const doc = await getDocument(params.storeId, cachedId);
      if (doc) return doc;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.documentId, params.storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    const docRow = locked.rows[0];
    if (docRow.status === 'posted') {
      await client.query('COMMIT');
      const already = await getDocument(params.storeId, params.documentId);
      if (!already) throw new Error('Document not found');
      return already;
    }
    if (docRow.status !== 'draft') throw new Error('Only draft documents can be posted');

    const linesResult = await client.query(
      `SELECT * FROM pos_stock_document_lines
       WHERE document_id = $1
       ORDER BY id ASC
       FOR UPDATE`,
      [params.documentId]
    );
    if (linesResult.rows.length === 0) throw new Error('Document has no lines');

    const type = docRow.type as StockDocumentType;
    const occurredAt = docRow.occurred_at as Date;
    const docNumber = String(docRow.doc_number);

    for (const line of linesResult.rows) {
      let variantId = line.variant_id == null ? null : Number(line.variant_id);

      if (line.is_placeholder) {
        if (type !== 'receipt') {
          throw new Error('Placeholders only allowed on receipt documents');
        }
        const name = String(line.placeholder_name ?? '').trim();
        const priceCents =
          line.placeholder_price_cents == null ? null : Number(line.placeholder_price_cents);
        if (!name) throw new Error('Placeholder line missing name');
        if (priceCents == null || priceCents < 0) {
          throw new Error('Placeholder line missing price_cents');
        }

        const barcode = line.placeholder_barcode
          ? String(line.placeholder_barcode).trim()
          : null;
        if (barcode) {
          const collision = await client.query(
            `SELECT id FROM pos_variants
             WHERE store_id = $1 AND barcode = $2
             LIMIT 1`,
            [params.storeId, barcode]
          );
          if (collision.rows.length > 0) {
            throw new Error(`Штрихкод ${barcode} вже існує в каталозі`);
          }
        }

        const unitCost =
          line.unit_cost_cents == null ? 0 : Number(line.unit_cost_cents);
        let created;
        try {
          created = await createProductInTx(client, params.storeId, {
            name,
            description: `Створено з приходу ${docNumber}`,
            needs_review: true,
            created_from_document_id: params.documentId,
            variants: [
              {
                size: String(line.placeholder_size ?? ''),
                color: String(line.placeholder_color ?? ''),
                barcode,
                price_cents: priceCents,
                cost_cents: unitCost,
                quantity: 0,
              },
            ],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/unique|duplicate|idx_pos_variants_store_barcode/i.test(msg)) {
            throw new Error(
              barcode
                ? `Штрихкод ${barcode} вже існує в каталозі`
                : 'Не вдалося створити товар (дублікат штрихкоду/SKU)'
            );
          }
          throw err;
        }

        variantId = created.variantIds[0];
        await client.query(
          `UPDATE pos_stock_document_lines
           SET variant_id = $1, is_placeholder = FALSE
           WHERE id = $2`,
          [variantId, line.id]
        );
      }

      if (variantId == null) throw new Error('Line missing variant_id');

      const stock = await client.query(
        `SELECT quantity FROM pos_stock
         WHERE variant_id = $1 AND store_id = $2
         FOR UPDATE`,
        [variantId, params.storeId]
      );
      if (stock.rows.length === 0) throw new Error(`Stock not found for variant ${variantId}`);
      const currentQty = Number(stock.rows[0].quantity);
      const countedQty = line.counted_qty == null ? null : Number(line.counted_qty);
      const delta = computeDelta(
        type,
        { quantity: Number(line.quantity), counted_qty: countedQty },
        currentQty
      );

      if (type === 'inventory') {
        await client.query(
          `UPDATE pos_stock_document_lines
           SET system_qty = $1, quantity = $2
           WHERE id = $3`,
          [currentQty, delta, line.id]
        );
      }

      if (delta === 0) continue;

      await applyStockDelta(client, {
        storeId: params.storeId,
        variantId,
        delta,
        reason: reasonForType(type),
        staffId: params.staffId,
        referenceType: 'stock_document',
        referenceId: params.documentId,
        note: docRow.note ?? line.line_note ?? null,
        unitCostCents: line.unit_cost_cents == null ? null : Number(line.unit_cost_cents),
        occurredAt,
      });

      if (type === 'receipt' && line.unit_cost_cents != null) {
        await client.query(
          `UPDATE pos_variants SET cost_cents = $1, updated_at = NOW()
           WHERE id = $2 AND store_id = $3`,
          [Number(line.unit_cost_cents), variantId, params.storeId]
        );
      }
    }

    await client.query(
      `UPDATE pos_stock_documents
       SET status = 'posted', posted_at = NOW(), posted_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [params.staffId, params.documentId]
    );

    if (params.idempotencyKey) {
      await client.query(
        `INSERT INTO pos_idempotency_keys (store_id, key, response_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (store_id, key) DO NOTHING`,
        [params.storeId, params.idempotencyKey, JSON.stringify({ id: params.documentId })]
      );
    }

    await client.query('COMMIT');
    const posted = await getDocument(params.storeId, params.documentId);
    if (!posted) throw new Error('Document not found after post');
    return posted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reverseDocument(params: {
  storeId: number;
  documentId: number;
  staffId: number;
  note?: string;
}): Promise<StockDocument> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM pos_stock_documents WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.documentId, params.storeId]
    );
    if (locked.rows.length === 0) throw new Error('Document not found');
    const original = locked.rows[0];
    if (original.status !== 'posted') throw new Error('Only posted documents can be reversed');
    if (original.type === 'inventory') {
      throw new Error('Inventory cannot be reversed; create a new inventory count');
    }

    const lines = await client.query(
      `SELECT * FROM pos_stock_document_lines WHERE document_id = $1 ORDER BY variant_id ASC`,
      [params.documentId]
    );

    const reverseType = original.type as StockDocumentType;
    const docNumber = await nextDocNumber(client, params.storeId, reverseType);
    const reverseDoc = await client.query(
      `INSERT INTO pos_stock_documents
         (store_id, type, status, doc_number, occurred_at, reason_code, note, created_by,
          posted_by, posted_at, reversal_of_id)
       VALUES ($1, $2, 'posted', $3, NOW(), $4, $5, $6, $6, NOW(), $7)
       RETURNING *`,
      [
        params.storeId,
        reverseType,
        docNumber,
        original.reason_code,
        params.note ?? `Скасування ${original.doc_number}`,
        params.staffId,
        params.documentId,
      ]
    );
    const reverseId = Number(reverseDoc.rows[0].id);

    for (const line of lines.rows) {
      let delta: number;
      if (original.type === 'receipt') delta = -Number(line.quantity);
      else if (original.type === 'writeoff') delta = Number(line.quantity);
      else delta = -Number(line.quantity); // adjustment

      await client.query(
        `INSERT INTO pos_stock_document_lines
           (document_id, store_id, variant_id, quantity, unit_cost_cents, line_note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reverseId,
          params.storeId,
          line.variant_id,
          original.type === 'adjustment' ? -Number(line.quantity) : Number(line.quantity),
          line.unit_cost_cents,
          line.line_note,
        ]
      );

      if (delta !== 0) {
        await applyStockDelta(client, {
          storeId: params.storeId,
          variantId: Number(line.variant_id),
          delta,
          reason: reasonForType(reverseType),
          staffId: params.staffId,
          referenceType: 'stock_document',
          referenceId: reverseId,
          note: `Reverse of ${original.doc_number}`,
        });
      }
    }

    await client.query(
      `UPDATE pos_stock_documents
       SET status = 'reversed', reversed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [params.documentId]
    );

    await client.query('COMMIT');
    const result = await getDocument(params.storeId, reverseId);
    if (!result) throw new Error('Reverse document not found');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function voidDraft(storeId: number, documentId: number): Promise<void> {
  const result = await pool.query(
    `UPDATE pos_stock_documents
     SET status = 'voided', updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND status = 'draft'`,
    [documentId, storeId]
  );
  if (result.rowCount === 0) throw new Error('Draft document not found');
}

export async function sumMovements(storeId: number, variantId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(delta), 0) AS total
     FROM pos_stock_movements
     WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  return Number(result.rows[0].total);
}
