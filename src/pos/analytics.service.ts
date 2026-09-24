// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/analytics.service.ts

import { pool } from '../db.js';
import { localDateString } from './core/localDate.js';
import type { ModuleRemoteEntry, PaymentMethod, QrPaymentMode } from './types.js';
import type { NavOverrides } from './core/nav.js';
import { publicConfigOf, verticalOrDefault } from './verticals/index.js';

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
    /** The product's picture, for the owner's «Популярні товари» row; null for a placeholder line. */
    image_url: string | null;
  }>;
  payments: Array<{ method: PaymentMethod; amount_cents: number; unconfirmed_cents: number }>;
  daily: Array<{ date: string; gross_cents: number; net_cents: number; sales_count: number }>;
}

function todayDateString(timezone: string): string {
  return localDateString(timezone);
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
       SUM((si.quantity - si.refunded_quantity) * si.unit_price_cents)::int AS revenue_cents,
       MAX(p.image_url) AS image_url
     FROM pos_sale_items si
     JOIN pos_sales s ON s.id = si.sale_id
     -- LEFT: a receipt's placeholder line names no variant, and it still sold.
     LEFT JOIN pos_variants v ON v.id = si.variant_id
     LEFT JOIN pos_products p ON p.id = v.product_id
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

  // A cash payment is stored as what the customer handed over — the receipt
  // prints «ГОТІВКА 500 / РЕШТА 250» from it — so the change has to come off
  // here, or a 250 ₴ sale paid with a 500 ₴ note reads as 500 ₴ of cash takings
  // and the split no longer adds up to «Виторг». Per sale, because an even
  // split may carry several cash rows and the change must leave only once;
  // change is only ever given in cash, and never more than the cash there was.
  const paymentsResult = await pool.query(
    `${BOUNDS_CTE},
     per_sale AS (
       SELECT s.id AS sale_id,
              s.total_cents,
              p.method,
              SUM(p.amount_cents) AS amount_cents,
              SUM(p.amount_cents) FILTER (
                WHERE p.method = 'qr' AND p.confirmed_at IS NULL
              ) AS unconfirmed_cents
       FROM pos_payments p
       JOIN pos_sales s ON s.id = p.sale_id
       CROSS JOIN bounds b
       WHERE s.store_id = $1
         AND s.status <> 'voided'
         AND s.created_at >= b.range_start
         AND s.created_at < b.range_end
       GROUP BY s.id, s.total_cents, p.method
     ),
     change AS (
       SELECT sale_id, GREATEST(0, SUM(amount_cents) - MAX(total_cents)) AS change_cents
       FROM per_sale
       GROUP BY sale_id
     )
     SELECT ps.method,
            COALESCE(SUM(
              ps.amount_cents
              - CASE WHEN ps.method = 'cash' THEN LEAST(ps.amount_cents, c.change_cents) ELSE 0 END
            ), 0)::int AS amount_cents,
            COALESCE(SUM(ps.unconfirmed_cents), 0)::int AS unconfirmed_cents
     FROM per_sale ps
     JOIN change c ON c.sale_id = ps.sale_id
     GROUP BY ps.method`,
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
      image_url: (item.image_url as string | null) ?? null,
    })),
    payments: paymentsResult.rows.map((p) => ({
      method: p.method as PaymentMethod,
      amount_cents: Number(p.amount_cents),
      unconfirmed_cents: Number(p.unconfirmed_cents ?? 0),
    })),
    daily,
  };
}

function mapStore(store: Record<string, unknown>) {
  return {
    id: Number(store.id),
    name: store.name as string,
    slug: store.slug as string,
    currency: store.currency as string,
    timezone: store.timezone as string,
    // Read-only for the owner: only the super admin writes the column, so it is
    // deliberately absent from `STORE_PATCH_COLUMNS` below.
    vertical: publicConfigOf(verticalOrDefault(store.vertical as string | null)),
    qr_payment_enabled: Boolean(store.qr_payment_enabled),
    qr_payment_mode: (store.qr_payment_mode as QrPaymentMode) ?? 'static',
    qr_static_image_url: (store.qr_static_image_url as string | null) ?? null,
    qr_purpose_template: (store.qr_purpose_template as string | null) ?? null,
    qr_iban: (store.qr_iban as string | null) ?? null,
    qr_edrpou: (store.qr_edrpou as string | null) ?? null,
    qr_recipient: (store.qr_recipient as string | null) ?? null,
    gtin_lookup_enabled: Boolean(store.gtin_lookup_enabled),
    auto_print_receipt: Boolean(store.auto_print_receipt),
    florist_labour_bps: Number(store.florist_labour_bps ?? 0),
    enabled_modules: (store.enabled_modules as string[] | null) ?? [],
    module_remotes:
      (store.module_remotes as Record<string, string | ModuleRemoteEntry> | null) ?? {},
    nav_overrides: (store.nav_overrides as NavOverrides | null) ?? {},
    live_tiktok_username: (store.live_tiktok_username as string | null) ?? null,
  };
}

export type StorePatch = {
  name?: string;
  qr_payment_enabled?: boolean;
  qr_payment_mode?: QrPaymentMode;
  qr_static_image_url?: string | null;
  qr_purpose_template?: string | null;
  qr_iban?: string | null;
  qr_edrpou?: string | null;
  qr_recipient?: string | null;
  gtin_lookup_enabled?: boolean;
  auto_print_receipt?: boolean;
  /** Assembly charge on a composite, in basis points. See migration 040. */
  florist_labour_bps?: number;
  enabled_modules?: string[];
  module_remotes?: Record<string, string | ModuleRemoteEntry>;
  /** Per-store menu appearance — see `core/nav.ts`. */
  nav_overrides?: NavOverrides;
  /** TikTok LIVE account this store sells from — see `live.routes.ts`. */
  live_tiktok_username?: string | null;
};

/**
 * Exported for `pos.routes.store.test.ts`: the route copies each field out of
 * the body by hand, and `florist_labour_bps` was once simply missed — the PATCH
 * answered 200 and changed nothing for months. The test walks this list, so a
 * column added here without a line in the route fails in CI instead of in a
 * shop.
 */
export const STORE_PATCH_COLUMNS: Array<keyof StorePatch> = [
  'name',
  'qr_payment_enabled',
  'qr_payment_mode',
  'qr_static_image_url',
  'qr_purpose_template',
  'qr_iban',
  'qr_edrpou',
  'qr_recipient',
  'gtin_lookup_enabled',
  'auto_print_receipt',
  'florist_labour_bps',
  'enabled_modules',
  'module_remotes',
  'nav_overrides',
  'live_tiktok_username',
];

export async function getStore(storeId: number) {
  const result = await pool.query(`SELECT * FROM pos_stores WHERE id = $1`, [storeId]);
  if (result.rows.length === 0) return null;
  return mapStore(result.rows[0]);
}

export async function updateStore(storeId: number, patch: StorePatch) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const col of STORE_PATCH_COLUMNS) {
    if (patch[col] === undefined) continue;
    let value: unknown = patch[col];
    if (col === 'module_remotes' || col === 'nav_overrides') {
      // jsonb column — serialise + cast explicitly (see customers.service.ts).
      values.push(JSON.stringify(value ?? {}));
      sets.push(`${col} = $${values.length}::jsonb`);
      continue;
    }
    if (col === 'florist_labour_bps') {
      // The CHECK would reject a bad value anyway, but as a 500 the owner
      // cannot act on. Refuse it here with something readable.
      const bps = Number(value);
      if (!Number.isInteger(bps) || bps < 0 || bps > 100000) {
        throw new Error('Націнка за роботу має бути від 0 до 1000%');
      }
      value = bps;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      value = col === 'name' ? trimmed : trimmed || null;
    }
    values.push(value);
    sets.push(`${col} = $${values.length}`);
  }
  if (sets.length === 0) {
    const current = await getStore(storeId);
    if (!current) throw new Error('Store not found');
    return current;
  }
  values.push(storeId);
  const result = await pool.query(
    `UPDATE pos_stores
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new Error('Store not found');
  return mapStore(result.rows[0]);
}
