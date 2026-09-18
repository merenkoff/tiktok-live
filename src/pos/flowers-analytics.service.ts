// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What a florist needs to know that a clothes shop does not
 * (`TechDocs/POS_FLORIST_BENCH.md` §9, phase B7).
 *
 * The core dashboard answers «скільки продали». These three answer the
 * questions that decide whether a flower shop makes money, and none of them
 * can be asked of sale lines alone:
 *
 * 1. **Що в смітнику.** Flowers are the one stock that dies on the shelf. The
 *    number that matters is not how many stems were written off but what they
 *    cost, and against what was bought — «з кожних десяти троянд дві в
 *    смітник» is a buying decision; «списано 40 стебел» is not.
 * 2. **Які стебла справді йдуть.** The core's top-items list counts sale lines,
 *    which for a florist is mostly bouquet cards. The stem that actually left
 *    the fridge is in `pos_sale_item_components` — the per-unit snapshot each
 *    sale wrote — and a rose sold loose and a rose sold inside a bouquet come
 *    off the same shelf and belong in the same total.
 * 3. **Чи заробила робота флориста.** `pos_stores.florist_labour_bps` is what
 *    the shop *charges* for assembling a bouquet. Whether it survived the
 *    discounts is a different question, and this is where it is answered:
 *    revenue against the cost of what actually went in, per the snapshot.
 *
 * Everything here reads the snapshot (`pos_sale_item_components`), never the
 * current recipe — the same rule a refund follows, and for the same reason: an
 * edited bouquet must not rewrite what last week's sale consumed.
 *
 * No migration: every number below comes out of tables that already exist.
 */

import { pool } from '../db.js';
import { eachDate } from './analytics.service.js';

/** Reasons a florist's stock leaves without being sold. */
export type LossReason = 'damaged' | 'gift' | 'lost' | 'other';

export interface FlowerLossRow {
  reason: LossReason;
  quantity: number;
  cost_cents: number;
}

export interface FlowerLossVariant {
  variant_id: number;
  product_name: string;
  label: string;
  unit: string;
  written_off: number;
  cost_cents: number;
  /** How many of this came in over the same window, for the share below. */
  received: number;
  /**
   * Written off as a share of received, in basis points, or null when nothing
   * came in over the window.
   *
   * A proxy for freshness, not a measurement of it: the shop has no lots, so
   * nothing here knows that *these* roses are the ones that arrived on Monday.
   * Over a window wider than a delivery cycle it is the number a florist
   * actually buys on — and over a narrow one it is noise, which is why the
   * screen defaults to a month.
   */
  waste_bps: number | null;
}

export interface FlowerStemRow {
  variant_id: number;
  product_name: string;
  label: string;
  unit: string;
  /** Sold loose, off the shelf. */
  loose: number;
  /** Consumed inside bouquets, from the per-sale snapshot. */
  in_bouquets: number;
  total: number;
}

export interface FlowerMarginRow {
  /** 'bouquet' — every line that carried a composition; 'other' — the rest. */
  kind: 'bouquet' | 'other';
  lines: number;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  /** Realised markup over cost, in basis points. Null when cost is unknown. */
  markup_bps: number | null;
}

export interface FlowerAnalytics {
  from: string;
  to: string;
  loss: {
    total_cost_cents: number;
    by_reason: FlowerLossRow[];
    top_variants: FlowerLossVariant[];
  };
  stems: FlowerStemRow[];
  margin: {
    rows: FlowerMarginRow[];
    total_revenue_cents: number;
    total_cost_cents: number;
    total_margin_cents: number;
    /** What the store charges for assembly, for the comparison that matters. */
    labour_bps: number;
  };
  /** Per-day written-off cost, so the screen can draw the one line worth drawing. */
  daily_loss: Array<{ date: string; cost_cents: number }>;
}

const TOP_LIMIT = 12;

function bps(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 10_000);
}

/**
 * The window, defaulting to the last 30 days in the store's timezone.
 *
 * A month rather than a day because every number here is about a trend: one
 * day's write-off is weather, and the waste share needs to span more than a
 * single delivery to mean anything.
 */
function resolveRange(opts: { from?: string; to?: string; timezone?: string }): {
  from: string;
  to: string;
} {
  const timezone = opts.timezone || 'Europe/Kyiv';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const to = opts.to || today;
  if (opts.from) return { from: opts.from, to };
  const [y, m, d] = to.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to };
}

export async function getFlowerAnalytics(
  storeId: number,
  opts: { from?: string; to?: string; timezone?: string } = {}
): Promise<FlowerAnalytics> {
  const { from, to } = resolveRange(opts);
  // Inclusive of the end day: `to` names a date, and a florist reading «по 18
  // вересня» means the whole of it.
  const params = [storeId, from, `${to} 23:59:59.999`];

  const [byReason, topLoss, stems, margin, dailyLoss, store] = await Promise.all([
    lossByReason(params),
    lossByVariant(params),
    stemsConsumed(params),
    realisedMargin(params),
    lossPerDay(params),
    pool.query(`SELECT florist_labour_bps FROM pos_stores WHERE id = $1`, [storeId]),
  ]);

  const byDate = new Map(dailyLoss.map((row) => [row.date, row.cost_cents]));

  return {
    from,
    to,
    loss: {
      total_cost_cents: byReason.reduce((sum, row) => sum + row.cost_cents, 0),
      by_reason: byReason,
      top_variants: topLoss,
    },
    stems,
    margin: {
      rows: margin,
      total_revenue_cents: margin.reduce((s, r) => s + r.revenue_cents, 0),
      total_cost_cents: margin.reduce((s, r) => s + r.cost_cents, 0),
      total_margin_cents: margin.reduce((s, r) => s + r.margin_cents, 0),
      labour_bps: Number(store.rows[0]?.florist_labour_bps ?? 0),
    },
    daily_loss: eachDate(from, to).map((date) => ({
      date,
      cost_cents: byDate.get(date) ?? 0,
    })),
  };
}

// ── Loss ────────────────────────────────────────────────────────────────────
//
// Taking a write-off back needs BOTH halves of the filter, which is easy to get
// half right. `reverseDocument` marks the original `reversed` — excluded by the
// status — and then posts a **counter-document of the same type** carrying the
// same positive quantities. Filtering on status alone therefore turns an undone
// write-off into a second one.
//
// Cost is the variant's cost card: `addLine` stores `unit_cost_cents` only on a
// receipt, so a write-off line never carries one. The COALESCE keeps the line's
// value first anyway — it is the right precedence the day a write-off screen
// does ask for a price, and it costs nothing today.

const WRITEOFF_SCOPE = `
  FROM pos_stock_documents d
  JOIN pos_stock_document_lines l ON l.document_id = d.id
  JOIN pos_variants v ON v.id = l.variant_id
  JOIN pos_products p ON p.id = v.product_id
  WHERE d.store_id = $1
    AND d.type = 'writeoff'
    AND d.status = 'posted'
    AND d.reversal_of_id IS NULL
    AND d.occurred_at >= $2::date
    AND d.occurred_at <= $3::timestamptz`;

const LINE_COST = `l.quantity * COALESCE(l.unit_cost_cents, v.cost_cents, 0)`;

async function lossByReason(params: unknown[]): Promise<FlowerLossRow[]> {
  const result = await pool.query(
    `SELECT COALESCE(NULLIF(d.reason_code, ''), 'other') AS reason,
            SUM(l.quantity)::int AS quantity,
            SUM(${LINE_COST})::bigint AS cost_cents
     ${WRITEOFF_SCOPE}
     GROUP BY 1
     ORDER BY 3 DESC`,
    params
  );
  return result.rows.map((row) => ({
    reason: (['damaged', 'gift', 'lost'].includes(row.reason) ? row.reason : 'other') as LossReason,
    quantity: Number(row.quantity),
    cost_cents: Number(row.cost_cents),
  }));
}

async function lossByVariant(params: unknown[]): Promise<FlowerLossVariant[]> {
  const result = await pool.query(
    `WITH written AS (
       SELECT l.variant_id,
              MIN(p.name) AS product_name,
              MIN(v.label) AS label,
              MIN(v.unit) AS unit,
              SUM(l.quantity)::int AS written_off,
              SUM(${LINE_COST})::bigint AS cost_cents
       ${WRITEOFF_SCOPE}
       GROUP BY l.variant_id
     ),
     received AS (
       SELECT l.variant_id, SUM(l.quantity)::int AS received
       FROM pos_stock_documents d
       JOIN pos_stock_document_lines l ON l.document_id = d.id
       WHERE d.store_id = $1
         AND d.type = 'receipt'
         AND d.status = 'posted'
         -- Same rule as the write-off scope: a returned delivery is a posted
         -- receipt of the same shape, and counting it would inflate the
         -- denominator the waste share is read against.
         AND d.reversal_of_id IS NULL
         AND d.occurred_at >= $2::date
         AND d.occurred_at <= $3::timestamptz
       GROUP BY l.variant_id
     )
     SELECT w.*, COALESCE(r.received, 0) AS received
     FROM written w
     LEFT JOIN received r ON r.variant_id = w.variant_id
     ORDER BY w.cost_cents DESC
     LIMIT ${TOP_LIMIT}`,
    params
  );
  return result.rows.map((row) => {
    const writtenOff = Number(row.written_off);
    const received = Number(row.received);
    return {
      variant_id: Number(row.variant_id),
      product_name: row.product_name ?? '',
      label: row.label ?? '',
      unit: row.unit ?? '',
      written_off: writtenOff,
      cost_cents: Number(row.cost_cents),
      received,
      waste_bps: bps(writtenOff, received),
    };
  });
}

async function lossPerDay(params: unknown[]): Promise<Array<{ date: string; cost_cents: number }>> {
  const result = await pool.query(
    `SELECT to_char(d.occurred_at, 'YYYY-MM-DD') AS date,
            SUM(${LINE_COST})::bigint AS cost_cents
     ${WRITEOFF_SCOPE}
     GROUP BY 1`,
    params
  );
  return result.rows.map((row) => ({ date: row.date, cost_cents: Number(row.cost_cents) }));
}

// ── Stems ───────────────────────────────────────────────────────────────────

/**
 * What left the fridge, loose and inside bouquets, net of returns.
 *
 * The two halves are different tables and that is the whole point: the loose
 * half is an ordinary sale line, and the bouquet half only exists in the
 * per-unit snapshot. A shop that only counted the first would conclude nobody
 * buys roses.
 *
 * A composite is never counted as a stem in the loose half — selling a bouquet
 * assembled in advance moves its own row, and its stems left with the
 * production document days earlier.
 */
const SOLD_SCOPE = `
  FROM pos_sale_items si
  JOIN pos_sales s ON s.id = si.sale_id
  WHERE s.store_id = $1
    AND s.status <> 'voided'
    AND s.created_at >= $2::date
    AND s.created_at <= $3::timestamptz`;

/** Quantity of a sale line that stayed sold — what was rung, less what came back. */
const NET_QTY = `(si.quantity - COALESCE((
  SELECT SUM(ri.quantity) FROM pos_refund_items ri WHERE ri.sale_item_id = si.id
), 0))`;

async function stemsConsumed(params: unknown[]): Promise<FlowerStemRow[]> {
  const result = await pool.query(
    `WITH sold AS (
       SELECT si.id, si.variant_id, ${NET_QTY} AS net_qty
       ${SOLD_SCOPE}
     ),
     loose AS (
       SELECT so.variant_id, SUM(so.net_qty)::int AS qty
       FROM sold so
       WHERE NOT EXISTS (
         SELECT 1 FROM pos_sale_item_components c WHERE c.sale_item_id = so.id
       )
       -- A composite is never a stem: one assembled in advance moves its own
       -- row, and its components left with the production document.
       AND NOT EXISTS (
         SELECT 1 FROM pos_variants pv JOIN pos_products pp ON pp.id = pv.product_id
         WHERE pv.id = so.variant_id AND pp.kind = 'composite'
       )
       GROUP BY 1
     ),
     bundled AS (
       SELECT c.component_variant_id AS variant_id,
              SUM(c.quantity_per_unit * so.net_qty)::int AS qty
       FROM sold so
       JOIN pos_sale_item_components c ON c.sale_item_id = so.id
       GROUP BY 1
     ),
     merged AS (
       SELECT variant_id, SUM(loose)::int AS loose, SUM(bundled)::int AS bundled FROM (
         SELECT variant_id, qty AS loose, 0 AS bundled FROM loose
         UNION ALL
         SELECT variant_id, 0 AS loose, qty AS bundled FROM bundled
       ) u GROUP BY variant_id
     )
     SELECT m.variant_id, m.loose, m.bundled,
            p.name AS product_name, v.label, v.unit
     FROM merged m
     JOIN pos_variants v ON v.id = m.variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE (m.loose + m.bundled) > 0
     ORDER BY (m.loose + m.bundled) DESC
     LIMIT ${TOP_LIMIT}`,
    params
  );
  return result.rows.map((row) => {
    const loose = Number(row.loose);
    const inBouquets = Number(row.bundled);
    return {
      variant_id: Number(row.variant_id),
      product_name: row.product_name ?? '',
      label: row.label ?? '',
      unit: row.unit ?? '',
      loose,
      in_bouquets: inBouquets,
      total: loose + inBouquets,
    };
  });
}

// ── Margin ──────────────────────────────────────────────────────────────────

/**
 * Revenue against the cost of what actually went in.
 *
 * Cost follows the same fork as the stock movement did: a line with a
 * composition snapshot cost the sum of its components; every other line cost
 * its own variant's `cost_cents`. Anything else would price a bouquet at the
 * cost of a catalogue card nobody ever bought.
 *
 * Bouquets are split out from the rest because that is the comparison the
 * screen exists for: the shop charges `florist_labour_bps` for assembly, and
 * this says what it ended up earning after the discounts.
 */
async function realisedMargin(params: unknown[]): Promise<FlowerMarginRow[]> {
  const result = await pool.query(
    `WITH lines AS (
       SELECT si.id,
              EXISTS (
                SELECT 1 FROM pos_sale_item_components c WHERE c.sale_item_id = si.id
              ) AS is_bouquet,
              ${NET_QTY} AS net_qty,
              -- Revenue per unit, discounts included: line_total_cents is
              -- what the customer paid for the whole line.
              CASE WHEN si.quantity > 0 THEN si.line_total_cents::numeric / si.quantity ELSE 0 END
                AS unit_revenue,
              COALESCE((
                SELECT SUM(c.quantity_per_unit * COALESCE(cv.cost_cents, 0))
                FROM pos_sale_item_components c
                JOIN pos_variants cv ON cv.id = c.component_variant_id
                WHERE c.sale_item_id = si.id
              ), (SELECT COALESCE(v.cost_cents, 0) FROM pos_variants v WHERE v.id = si.variant_id))
                AS unit_cost
       ${SOLD_SCOPE}
     )
     SELECT is_bouquet,
            COUNT(*)::int AS lines,
            SUM(unit_revenue * net_qty)::bigint AS revenue_cents,
            SUM(unit_cost * net_qty)::bigint AS cost_cents
     FROM lines
     WHERE net_qty > 0
     GROUP BY is_bouquet`,
    params
  );
  return result.rows.map((row) => {
    const revenue = Number(row.revenue_cents);
    const cost = Number(row.cost_cents);
    return {
      kind: row.is_bouquet ? ('bouquet' as const) : ('other' as const),
      lines: Number(row.lines),
      revenue_cents: revenue,
      cost_cents: cost,
      margin_cents: revenue - cost,
      markup_bps: bps(revenue - cost, cost),
    };
  });
}
