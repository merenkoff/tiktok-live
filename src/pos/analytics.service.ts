// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/analytics.service.ts

import { pool } from '../db.js';

export interface SalesSummary {
  from: string;
  to: string;
  sales_count: number;
  gross_cents: number;
  refunded_cents: number;
  net_cents: number;
  avg_check_cents: number;
  top_items: Array<{
    product_name: string;
    variant_label: string;
    qty_sold: number;
    revenue_cents: number;
  }>;
  payments: Array<{ method: 'cash' | 'card'; amount_cents: number }>;
  daily: Array<{ date: string; gross_cents: number; net_cents: number; sales_count: number }>;
}

function todayDateString(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export function eachDate(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let cursor = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  const out: string[] = [];
  while (cursor <= end) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return out;
}

export async function getSalesSummary(
  storeId: number,
  opts: { from?: string; to?: string; timezone?: string } = {}
): Promise<SalesSummary> {
  const timezone = opts.timezone ?? 'Europe/Kyiv';
  const from = opts.from ?? todayDateString(timezone);
  const to = opts.to ?? from;

  const BOUNDS_CTE = `
    WITH bounds AS (
      SELECT
        ($2::date)::timestamp AT TIME ZONE $4 AS range_start,
        (($3::date + INTERVAL '1 day'))::timestamp AT TIME ZONE $4 AS range_end
    )`;
  const params = [storeId, from, to, timezone];

  const result = await pool.query(
    `${BOUNDS_CTE}
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
       AND s.created_at >= b.range_start
       AND s.created_at < b.range_end`,
    params
  );

  const row = result.rows[0];
  const salesCount = Number(row.sales_count);
  const netCents = Number(row.net_cents);
  const avgCents = salesCount > 0 ? Math.round(netCents / salesCount) : 0;

  const topResult = await pool.query(
    `${BOUNDS_CTE}
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
       AND s.created_at >= b.range_start
       AND s.created_at < b.range_end
     GROUP BY si.product_name, si.variant_label
     HAVING SUM(si.quantity - si.refunded_quantity) > 0
     ORDER BY qty_sold DESC, revenue_cents DESC
     LIMIT 5`,
    params
  );

  const paymentsResult = await pool.query(
    `${BOUNDS_CTE}
     SELECT p.method, COALESCE(SUM(p.amount_cents), 0)::int AS amount_cents
     FROM pos_payments p
     JOIN pos_sales s ON s.id = p.sale_id
     CROSS JOIN bounds b
     WHERE s.store_id = $1
       AND s.status <> 'voided'
       AND s.created_at >= b.range_start
       AND s.created_at < b.range_end
     GROUP BY p.method`,
    params
  );

  const dailyResult = await pool.query(
    `${BOUNDS_CTE}
     SELECT
       to_char(date_trunc('day', s.created_at AT TIME ZONE $4), 'YYYY-MM-DD') AS day,
       COUNT(*) FILTER (WHERE s.status <> 'voided')::int AS sales_count,
       COALESCE(SUM(s.total_cents) FILTER (WHERE s.status <> 'voided'), 0)::int AS gross_cents,
       COALESCE(
         SUM(s.total_cents - s.refunded_cents) FILTER (WHERE s.status <> 'voided'),
         0
       )::int AS net_cents
     FROM pos_sales s, bounds b
     WHERE s.store_id = $1
       AND s.created_at >= b.range_start
       AND s.created_at < b.range_end
     GROUP BY 1
     ORDER BY 1`,
    params
  );

  const byDay = new Map(dailyResult.rows.map((r) => [String(r.day), r]));
  const daily = eachDate(from, to).map((date) => {
    const r = byDay.get(date);
    return {
      date,
      sales_count: r ? Number(r.sales_count) : 0,
      gross_cents: r ? Number(r.gross_cents) : 0,
      net_cents: r ? Number(r.net_cents) : 0,
    };
  });

  return {
    from,
    to,
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
    daily,
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
