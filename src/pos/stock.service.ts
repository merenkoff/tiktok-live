// src/pos/stock.service.ts

import { pool } from '../db.js';
import type { StockReason } from './types.js';

export async function adjustStock(params: {
  storeId: number;
  variantId: number;
  delta: number;
  staffId: number;
  note?: string;
}): Promise<{ variant_id: number; quantity: number }> {
  if (params.delta === 0) throw new Error('Delta cannot be zero');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const next = await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: params.variantId,
      delta: params.delta,
      reason: 'adjust',
      staffId: params.staffId,
      note: params.note,
    });
    await client.query('COMMIT');
    return { variant_id: params.variantId, quantity: next };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyStockDelta(
  client: { query: typeof pool.query },
  params: {
    storeId: number;
    variantId: number;
    delta: number;
    reason: StockReason;
    staffId: number;
    referenceType?: string;
    referenceId?: number;
    note?: string;
    unitCostCents?: number | null;
    occurredAt?: Date | string;
  }
): Promise<number> {
  const stockResult = await client.query(
    `SELECT quantity FROM pos_stock
     WHERE variant_id = $1 AND store_id = $2
     FOR UPDATE`,
    [params.variantId, params.storeId]
  );

  if (stockResult.rows.length === 0) {
    throw new Error(`Stock not found for variant ${params.variantId}`);
  }

  const current = Number(stockResult.rows[0].quantity);
  const next = current + params.delta;
  if (next < 0) {
    throw new Error(`Insufficient stock for variant ${params.variantId}`);
  }

  await client.query(
    `UPDATE pos_stock
     SET quantity = $1, updated_at = NOW()
     WHERE variant_id = $2 AND store_id = $3`,
    [next, params.variantId, params.storeId]
  );

  await client.query(
    `INSERT INTO pos_stock_movements
       (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id,
        unit_cost_cents, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))`,
    [
      params.storeId,
      params.variantId,
      params.delta,
      params.reason,
      params.referenceType ?? null,
      params.referenceId ?? null,
      params.note ?? null,
      params.staffId,
      params.unitCostCents ?? null,
      params.occurredAt ?? null,
    ]
  );

  return next;
}

export async function listLowStock(storeId: number, threshold = 3) {
  const result = await pool.query(
    `SELECT v.id AS variant_id, p.name AS product_name, v.size, v.color, s.quantity
     FROM pos_stock s
     JOIN pos_variants v ON v.id = s.variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE s.store_id = $1 AND s.quantity <= $2 AND v.is_active = TRUE
     ORDER BY s.quantity ASC, p.name ASC`,
    [storeId, threshold]
  );
  return result.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    product_name: row.product_name,
    size: row.size,
    color: row.color,
    quantity: Number(row.quantity),
  }));
}

export async function getVariantStock(storeId: number, variantId: number): Promise<number> {
  const result = await pool.query(
    `SELECT quantity FROM pos_stock WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  if (result.rows.length === 0) throw new Error('Stock row not found');
  return Number(result.rows[0].quantity);
}
