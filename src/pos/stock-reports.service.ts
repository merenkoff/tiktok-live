// src/pos/stock-reports.service.ts

import { pool } from '../db.js';
import type { StockReason } from './types.js';

export interface OnHandRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  size: string;
  color: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  cost_cents: number;
  price_cents: number;
}

export interface MovementRow {
  id: number;
  variant_id: number;
  product_name: string;
  size: string;
  color: string;
  delta: number;
  reason: StockReason;
  reference_type: string | null;
  reference_id: number | null;
  note: string | null;
  staff_id: number | null;
  staff_name: string | null;
  unit_cost_cents: number | null;
  occurred_at: Date;
  created_at: Date;
}

export interface MovementSummaryRow {
  variant_id: number;
  product_name: string;
  size: string;
  color: string;
  opening: number;
  receipt: number;
  sale: number;
  writeoff: number;
  adjust: number;
  inventory: number;
  refund: number;
  void: number;
  closing: number;
}

export async function listOnHand(storeId: number): Promise<OnHandRow[]> {
  const result = await pool.query(
    `SELECT v.id AS variant_id, v.product_id, p.name AS product_name, v.size, v.color,
            v.sku, v.barcode, s.quantity, v.cost_cents, v.price_cents
     FROM pos_stock s
     JOIN pos_variants v ON v.id = s.variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE s.store_id = $1 AND v.is_active = TRUE AND p.is_active = TRUE
     ORDER BY p.name ASC, v.size ASC, v.color ASC`,
    [storeId]
  );
  return result.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    product_id: Number(row.product_id),
    product_name: row.product_name,
    size: row.size,
    color: row.color,
    sku: row.sku,
    barcode: row.barcode,
    quantity: Number(row.quantity),
    cost_cents: Number(row.cost_cents),
    price_cents: Number(row.price_cents),
  }));
}

export async function listMovements(
  storeId: number,
  filters: {
    from?: string;
    to?: string;
    variantId?: number;
    reason?: StockReason;
    limit?: number;
  } = {}
): Promise<MovementRow[]> {
  const clauses = ['m.store_id = $1'];
  const params: unknown[] = [storeId];
  let i = 2;
  if (filters.from) {
    clauses.push(`m.occurred_at >= $${i++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push(`m.occurred_at <= $${i++}`);
    params.push(filters.to);
  }
  if (filters.variantId) {
    clauses.push(`m.variant_id = $${i++}`);
    params.push(filters.variantId);
  }
  if (filters.reason) {
    clauses.push(`m.reason = $${i++}`);
    params.push(filters.reason);
  }
  const limit = Math.min(filters.limit ?? 200, 1000);
  params.push(limit);

  const result = await pool.query(
    `SELECT m.*, p.name AS product_name, v.size, v.color, st.display_name AS staff_name
     FROM pos_stock_movements m
     JOIN pos_variants v ON v.id = m.variant_id
     JOIN pos_products p ON p.id = v.product_id
     LEFT JOIN pos_staff st ON st.id = m.staff_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY m.occurred_at DESC, m.id DESC
     LIMIT $${i}`,
    params
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    product_name: row.product_name,
    size: row.size,
    color: row.color,
    delta: Number(row.delta),
    reason: row.reason as StockReason,
    reference_type: row.reference_type,
    reference_id: row.reference_id == null ? null : Number(row.reference_id),
    note: row.note,
    staff_id: row.staff_id == null ? null : Number(row.staff_id),
    staff_name: row.staff_name ?? null,
    unit_cost_cents: row.unit_cost_cents == null ? null : Number(row.unit_cost_cents),
    occurred_at: row.occurred_at,
    created_at: row.created_at,
  }));
}

export async function documentSummary(
  storeId: number,
  filters: { from?: string; to?: string } = {}
): Promise<{ type: string; status: string; count: number }[]> {
  const clauses = ['store_id = $1'];
  const params: unknown[] = [storeId];
  let i = 2;
  if (filters.from) {
    clauses.push(`occurred_at >= $${i++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push(`occurred_at <= $${i++}`);
    params.push(filters.to);
  }
  const result = await pool.query(
    `SELECT type, status, COUNT(*)::int AS count
     FROM pos_stock_documents
     WHERE ${clauses.join(' AND ')}
     GROUP BY type, status
     ORDER BY type, status`,
    params
  );
  return result.rows.map((row) => ({
    type: String(row.type),
    status: String(row.status),
    count: Number(row.count),
  }));
}

/** Qty movement report for period; opening = stock before from, closing = opening + period deltas */
export async function movementReport(
  storeId: number,
  from: string,
  to: string
): Promise<MovementSummaryRow[]> {
  const result = await pool.query(
    `WITH variants AS (
       SELECT v.id AS variant_id, p.name AS product_name, v.size, v.color
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND v.is_active = TRUE
     ),
     opening AS (
       SELECT variant_id, COALESCE(SUM(delta), 0) AS qty
       FROM pos_stock_movements
       WHERE store_id = $1 AND occurred_at < $2::timestamptz
       GROUP BY variant_id
     ),
     period AS (
       SELECT variant_id,
              COALESCE(SUM(delta) FILTER (WHERE reason = 'receipt'), 0) AS receipt,
              COALESCE(SUM(delta) FILTER (WHERE reason = 'sale'), 0) AS sale,
              COALESCE(SUM(delta) FILTER (WHERE reason = 'writeoff'), 0) AS writeoff,
              COALESCE(SUM(delta) FILTER (WHERE reason IN ('adjust', 'seed')), 0) AS adjust,
              COALESCE(SUM(delta) FILTER (WHERE reason = 'inventory'), 0) AS inventory,
              COALESCE(SUM(delta) FILTER (WHERE reason = 'refund'), 0) AS refund,
              COALESCE(SUM(delta) FILTER (WHERE reason = 'void'), 0) AS void,
              COALESCE(SUM(delta), 0) AS total
       FROM pos_stock_movements
       WHERE store_id = $1
         AND occurred_at >= $2::timestamptz
         AND occurred_at <= $3::timestamptz
       GROUP BY variant_id
     )
     SELECT v.variant_id, v.product_name, v.size, v.color,
            COALESCE(o.qty, 0) AS opening,
            COALESCE(p.receipt, 0) AS receipt,
            COALESCE(p.sale, 0) AS sale,
            COALESCE(p.writeoff, 0) AS writeoff,
            COALESCE(p.adjust, 0) AS adjust,
            COALESCE(p.inventory, 0) AS inventory,
            COALESCE(p.refund, 0) AS refund,
            COALESCE(p.void, 0) AS void,
            COALESCE(o.qty, 0) + COALESCE(p.total, 0) AS closing
     FROM variants v
     LEFT JOIN opening o ON o.variant_id = v.variant_id
     LEFT JOIN period p ON p.variant_id = v.variant_id
     WHERE COALESCE(o.qty, 0) <> 0 OR COALESCE(p.total, 0) <> 0
     ORDER BY v.product_name, v.size, v.color`,
    [storeId, from, to]
  );

  return result.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    product_name: row.product_name,
    size: row.size,
    color: row.color,
    opening: Number(row.opening),
    receipt: Number(row.receipt),
    sale: Number(row.sale),
    writeoff: Number(row.writeoff),
    adjust: Number(row.adjust),
    inventory: Number(row.inventory),
    refund: Number(row.refund),
    void: Number(row.void),
    closing: Number(row.closing),
  }));
}
