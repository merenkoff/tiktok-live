// src/pos/analytics.service.ts

import { pool } from '../db.js';

export async function getTodayAnalytics(storeId: number, timezone = 'Europe/Kyiv') {
  const result = await pool.query(
    `WITH bounds AS (
       SELECT
         (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS day_start,
         ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS day_end
     )
     SELECT
       COUNT(*) FILTER (WHERE s.status <> 'voided')::int AS sales_count,
       COALESCE(SUM(s.total_cents) FILTER (WHERE s.status <> 'voided'), 0)::int AS gross_cents,
       COALESCE(SUM(s.refunded_cents) FILTER (WHERE s.status <> 'voided'), 0)::int AS refunded_cents,
       COALESCE(
         SUM(s.total_cents - s.refunded_cents) FILTER (WHERE s.status <> 'voided'),
         0
       )::int AS net_cents
     FROM pos_sales s, bounds b
     WHERE s.store_id = $1
       AND s.created_at >= b.day_start
       AND s.created_at < b.day_end`,
    [storeId, timezone]
  );

  const row = result.rows[0];
  const salesCount = Number(row.sales_count);
  const netCents = Number(row.net_cents);
  const avgCents = salesCount > 0 ? Math.round(netCents / salesCount) : 0;

  const topResult = await pool.query(
    `WITH bounds AS (
       SELECT
         (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS day_start,
         ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS day_end
     )
     SELECT
       si.product_name,
       si.variant_label,
       SUM(si.quantity - si.refunded_quantity)::int AS qty_sold,
       SUM((si.quantity - si.refunded_quantity) * si.unit_price_cents)::int AS revenue_cents
     FROM pos_sale_items si
     JOIN pos_sales s ON s.id = si.sale_id
     CROSS JOIN bounds b
     WHERE s.store_id = $1
       AND s.status <> 'voided'
       AND s.created_at >= b.day_start
       AND s.created_at < b.day_end
     GROUP BY si.product_name, si.variant_label
     HAVING SUM(si.quantity - si.refunded_quantity) > 0
     ORDER BY qty_sold DESC, revenue_cents DESC
     LIMIT 5`,
    [storeId, timezone]
  );

  const paymentsResult = await pool.query(
    `WITH bounds AS (
       SELECT
         (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS day_start,
         ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS day_end
     )
     SELECT p.method, COALESCE(SUM(p.amount_cents), 0)::int AS amount_cents
     FROM pos_payments p
     JOIN pos_sales s ON s.id = p.sale_id
     CROSS JOIN bounds b
     WHERE s.store_id = $1
       AND s.status <> 'voided'
       AND s.created_at >= b.day_start
       AND s.created_at < b.day_end
     GROUP BY p.method`,
    [storeId, timezone]
  );

  return {
    sales_count: salesCount,
    gross_cents: Number(row.gross_cents),
    refunded_cents: Number(row.refunded_cents),
    net_cents: netCents,
    avg_check_cents: avgCents,
    top_items: topResult.rows.map((item) => ({
      product_name: item.product_name,
      variant_label: item.variant_label,
      qty_sold: Number(item.qty_sold),
      revenue_cents: Number(item.revenue_cents),
    })),
    payments: paymentsResult.rows.map((p) => ({
      method: p.method as 'cash' | 'card',
      amount_cents: Number(p.amount_cents),
    })),
  };
}

export async function getStore(storeId: number) {
  const result = await pool.query(`SELECT * FROM pos_stores WHERE id = $1`, [storeId]);
  if (result.rows.length === 0) return null;
  const store = result.rows[0];
  return {
    id: Number(store.id),
    name: store.name,
    slug: store.slug,
    currency: store.currency,
    timezone: store.timezone,
  };
}

export async function updateStore(storeId: number, name: string) {
  const result = await pool.query(
    `UPDATE pos_stores
     SET name = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [name.trim(), storeId]
  );
  if (result.rows.length === 0) throw new Error('Store not found');
  const store = result.rows[0];
  return {
    id: Number(store.id),
    name: store.name,
    slug: store.slug,
    currency: store.currency,
    timezone: store.timezone,
  };
}
