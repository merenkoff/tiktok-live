// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/cafe-analytics.service.ts — the café's own numbers (phase К6,
// TechDocs/POS_CAFE.md §10).
//
// Shaped after `flowers-analytics.service.ts` and sharing its two hard-won
// scopes verbatim in spirit: a voided sale is not revenue, and a reversed
// write-off is not a loss. What this file adds is the one thing the design doc
// asks for in as many words — «Poster дає звіти, але не дає рішень» — the
// Kasavana–Smith matrix, which does not report a dish, it classifies it.
//
// Three rules everything here rests on:
//
//   1. **Cost is TODAY's purchase price, not the price of that month's
//      batch.** `pos_sale_item_components` snapshots what a line consumed but
//      not what it cost, so every figure below multiplies the snapshot by the
//      variant's current `cost_cents`. The screen says so out loud, exactly as
//      `/admin/tech-cards` does. (A per-line cost snapshot is its own phase.)
//   2. **A dish whose cost we cannot tell is EXCLUDED, never a «dog».** Zero
//      cost would make it the most profitable thing on the menu; zero margin
//      would make it the least. Both are lies that end with an owner changing
//      a menu over a number that was never real, so such a dish leaves the
//      matrix and is listed apart with the reason. Same rule as К5d.
//   3. **A matrix needs a sample.** Four quadrants drawn from three receipts
//      classify noise. Below the floor the answer is «замало даних».

import { pool } from '../db.js';

/** Where a dish lands on the Kasavana–Smith grid. */
export type MenuQuadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog';

/** Why a dish could not be classified — never silently a «dog». */
export type MenuExclusion = 'no_cost' | 'no_price';

export interface MenuMatrixRow {
  variant_id: number;
  product_name: string;
  label: string;
  sold: number;
  /** This dish's share of everything sold in the matrix, in basis points. */
  share_bps: number;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  /** Contribution margin of ONE unit — what the quadrant compares. */
  unit_margin_cents: number;
  quadrant: MenuQuadrant;
}

export interface MenuExcludedRow {
  variant_id: number;
  product_name: string;
  label: string;
  sold: number;
  reason: MenuExclusion;
}

export interface CafeTableStats {
  bills: number;
  guests: number;
  revenue_cents: number;
  avg_bill_cents: number;
  /** null when no bill recorded a guest count above zero. */
  avg_per_guest_cents: number | null;
  /** Closed bills ÷ tables used ÷ days with a bill. */
  turns_per_table_per_day: number;
  /** Opened → closed, averaged. null when nothing closed in the window. */
  avg_minutes: number | null;
}

export interface CafeAnalytics {
  from: string;
  to: string;
  food_cost: {
    revenue_cents: number;
    cost_cents: number;
    /** Share of revenue eaten by products, in basis points. null = nothing to divide. */
    bps: number | null;
    /** Lines whose cost is unknown — the share above is blind to exactly these. */
    unpriced_lines: number;
  };
  sales_count: number;
  average_check_cents: number | null;
  /** Every hour of the store's day, so the screen can draw the shape, not just the peak. */
  peak_hours: Array<{ hour: number; orders: number; revenue_cents: number }>;
  top_modifiers: Array<{ group_name: string; name: string; times: number }>;
  menu: {
    rows: MenuMatrixRow[];
    excluded: MenuExcludedRow[];
    thresholds: {
      /** A dish is popular at or above this share (70 % of a fair 1/N). */
      popularity_share_bps: number;
      /** A dish is profitable at or above this contribution margin per unit. */
      unit_margin_cents: number;
    };
    /** False → the quadrants are noise and the screen must say so instead. */
    enough_data: boolean;
  };
  writeoffs: {
    rows: Array<{ reason: string; quantity: number; cost_cents: number }>;
    total_cost_cents: number;
  };
  /** null for a counter-service café: absent, which is not the same as zero. */
  tables: CafeTableStats | null;
}

const TOP_LIMIT = 12;

/**
 * The floor below which the matrix means nothing.
 *
 * Fewer than three dishes has no "average" worth the name, and fewer than ten
 * units per dish makes a single large order decide a quadrant. Both numbers
 * are judgement, not arithmetic — but a stated floor beats four confident
 * quadrants drawn from a slow Tuesday.
 */
const MIN_DISHES = 3;
const MIN_UNITS_PER_DISH = 10;

/** Kasavana–Smith: popular at 70 % of an equal share of the menu. */
const FAIR_SHARE_FACTOR = 0.7;

function bps(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 10_000);
}

/**
 * The window, defaulting to the last 30 days in the store's timezone — the
 * same default and the same reason as the florist's: every number here is a
 * trend, and one day of it is weather.
 */
function resolveRange(opts: { from?: string; to?: string; timezone?: string }): {
  from: string;
  to: string;
} {
  const timezone = opts.timezone || 'Europe/Kyiv';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const to = opts.to || today;
  if (opts.from) return { from: opts.from, to };
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to };
}

// ── Shared SQL ──────────────────────────────────────────────────────────────

/**
 * Sales in the window. A voided sale never happened; a refunded LINE did, and
 * is netted off per line below rather than dropped — half a returned order is
 * still half an order sold.
 */
const SALE_SCOPE = `
  FROM pos_sale_items si
  JOIN pos_sales s ON s.id = si.sale_id
  -- LEFT is defensive, not load-bearing: si.variant_id is NOT NULL and its FK
  -- is ON DELETE RESTRICT, so today the row is always there. It is written
  -- this way so that if a line ever stops naming a catalogue variant, it
  -- leaves the matrix through COST_IS_KNOWN — named, with a reason — instead
  -- of being silently dropped from the join, which is the one failure mode
  -- this screen must not have.
  LEFT JOIN pos_variants v ON v.id = si.variant_id
  WHERE s.store_id = $1
    AND s.status <> 'voided'
    AND s.created_at >= $2::date
    AND s.created_at <= $3::timestamptz`;

/** What stayed sold: rung less returned. */
const NET_QTY = `(si.quantity - COALESCE((
  SELECT SUM(ri.quantity) FROM pos_refund_items ri WHERE ri.sale_item_id = si.id
), 0))`;

/**
 * What ONE unit of this line cost us, at today's purchase prices.
 *
 * The snapshot first: a line that consumed a recipe carries exactly what it
 * took in `pos_sale_item_components`, already expanded to the rows that moved
 * stock — leaves for a `derived` dish, the dish's own row for an `own` one
 * whose production took the ingredients days earlier. Only a line with no
 * snapshot at all falls back to the variant's own cost card, which is what a
 * simple product is.
 */
const UNIT_COST = `COALESCE((
  SELECT SUM(c.quantity_per_unit * COALESCE(cv.cost_cents, 0))
  FROM pos_sale_item_components c
  JOIN pos_variants cv ON cv.id = c.component_variant_id
  WHERE c.sale_item_id = si.id
), v.cost_cents, 0)`;

/**
 * Whether that number can be trusted. Zero cost is «ми не знаємо», not «free»
 * — rule 2 — and it is true of a snapshot with an unpriced leaf just as much
 * as of a simple product nobody ever costed.
 */
const COST_IS_KNOWN = `(
  CASE WHEN EXISTS (SELECT 1 FROM pos_sale_item_components c WHERE c.sale_item_id = si.id)
       THEN NOT EXISTS (
         SELECT 1 FROM pos_sale_item_components c
         JOIN pos_variants cv ON cv.id = c.component_variant_id
         WHERE c.sale_item_id = si.id AND COALESCE(cv.cost_cents, 0) <= 0
       )
       ELSE COALESCE(v.cost_cents, 0) > 0
  END
)`;

/**
 * Posted write-offs in the window. `reversal_of_id IS NULL` is not optional:
 * reversing a document posts a COUNTER-document of the same type carrying the
 * same positive quantities, so filtering on status alone turns one undone
 * write-off into two. (The florist's file learned this first.)
 */
const WRITEOFF_SCOPE = `
  FROM pos_stock_documents d
  JOIN pos_stock_document_lines l ON l.document_id = d.id
  JOIN pos_variants v ON v.id = l.variant_id
  WHERE d.store_id = $1
    AND d.type = 'writeoff'
    AND d.status = 'posted'
    AND d.reversal_of_id IS NULL
    AND d.occurred_at >= $2::date
    AND d.occurred_at <= $3::timestamptz`;

// ── Pieces ──────────────────────────────────────────────────────────────────

async function foodCost(params: unknown[]): Promise<CafeAnalytics['food_cost']> {
  const result = await pool.query(
    `SELECT
       SUM(CASE WHEN ${COST_IS_KNOWN} THEN
             CASE WHEN si.quantity > 0
                  THEN si.line_total_cents::numeric / si.quantity * ${NET_QTY}
                  ELSE 0 END
           ELSE 0 END)::bigint AS revenue_cents,
       SUM(CASE WHEN ${COST_IS_KNOWN} THEN ${UNIT_COST} * ${NET_QTY} ELSE 0 END)::bigint
         AS cost_cents,
       COUNT(*) FILTER (WHERE NOT ${COST_IS_KNOWN})::int AS unpriced_lines
     ${SALE_SCOPE}`,
    params
  );
  const row = result.rows[0] ?? {};
  const revenue = Number(row.revenue_cents ?? 0);
  const cost = Number(row.cost_cents ?? 0);
  return {
    revenue_cents: revenue,
    cost_cents: cost,
    // Revenue counts only the lines whose cost we know, so the share divides
    // two halves of the same set. Mixing all revenue with known-only cost
    // would flatter the food cost of a menu that is half uncosted.
    bps: bps(cost, revenue),
    unpriced_lines: Number(row.unpriced_lines ?? 0),
  };
}

async function receipts(
  params: unknown[]
): Promise<{ sales_count: number; average_check_cents: number | null }> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(s.total_cents), 0)::bigint AS total
     FROM pos_sales s
     WHERE s.store_id = $1
       AND s.status <> 'voided'
       AND s.created_at >= $2::date
       AND s.created_at <= $3::timestamptz`,
    params
  );
  const n = Number(result.rows[0]?.n ?? 0);
  const total = Number(result.rows[0]?.total ?? 0);
  return { sales_count: n, average_check_cents: n > 0 ? Math.round(total / n) : null };
}

async function peakHours(
  params: unknown[],
  timezone: string
): Promise<CafeAnalytics['peak_hours']> {
  const result = await pool.query(
    `SELECT EXTRACT(HOUR FROM s.created_at AT TIME ZONE $4)::int AS hour,
            COUNT(*)::int AS orders,
            COALESCE(SUM(s.total_cents), 0)::bigint AS revenue_cents
     FROM pos_sales s
     WHERE s.store_id = $1
       AND s.status <> 'voided'
       AND s.created_at >= $2::date
       AND s.created_at <= $3::timestamptz
     GROUP BY 1`,
    [...params, timezone]
  );
  const byHour = new Map(
    result.rows.map((row) => [
      Number(row.hour),
      { orders: Number(row.orders), revenue_cents: Number(row.revenue_cents) },
    ])
  );
  // All 24 rows, always: a gap at 03:00 is information, and a screen that has
  // to invent the missing hours draws a different chart on every dataset.
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: byHour.get(hour)?.orders ?? 0,
    revenue_cents: byHour.get(hour)?.revenue_cents ?? 0,
  }));
}

async function topModifiers(params: unknown[]): Promise<CafeAnalytics['top_modifiers']> {
  const result = await pool.query(
    `SELECT m.group_name, m.name, SUM(${NET_QTY})::int AS times
     FROM pos_sale_item_modifiers m
     JOIN pos_sale_items si ON si.id = m.sale_item_id
     JOIN pos_sales s ON s.id = si.sale_id
     WHERE s.store_id = $1
       AND s.status <> 'voided'
       AND s.created_at >= $2::date
       AND s.created_at <= $3::timestamptz
     GROUP BY 1, 2
     HAVING SUM(${NET_QTY}) > 0
     ORDER BY 3 DESC, 1, 2
     LIMIT ${TOP_LIMIT}`,
    params
  );
  return result.rows.map((row) => ({
    group_name: String(row.group_name),
    name: String(row.name),
    times: Number(row.times),
  }));
}

/**
 * The matrix.
 *
 * Classification is deliberately done here and not in SQL: both thresholds
 * depend on the whole set (a fair share is 1/N, the margin bar is the set's
 * weighted average), and the set is only known once the unpriceable dishes
 * have left it. Doing that in one query would mean computing the averages
 * twice and keeping the two definitions in step by hand.
 */
async function menu(params: unknown[]): Promise<CafeAnalytics['menu']> {
  const result = await pool.query(
    `SELECT si.variant_id,
            MIN(si.product_name) AS product_name,
            -- The CATALOGUE caption, not the sold line's. Since К2 a modifier
            -- composes its answer into si.variant_label («M · вівсяне»), so
            -- MIN(si.variant_label) would label a row that aggregates every L
            -- americano with whichever answer happened to sort first, and the
            -- owner would read a row about all of them as a row about the
            -- sugared ones. A row here is a MENU ITEM; the answers are
            -- reported apart, in top_modifiers. The snapshot stays as the
            -- fallback for the same defensive reason the join is LEFT: today
            -- RESTRICT means the variant is always there, so it never fires.
            MIN(COALESCE(v.label, si.variant_label)) AS label,
            SUM(${NET_QTY})::int AS sold,
            SUM(CASE WHEN si.quantity > 0
                     THEN si.line_total_cents::numeric / si.quantity * ${NET_QTY}
                     ELSE 0 END)::bigint AS revenue_cents,
            SUM(${UNIT_COST} * ${NET_QTY})::bigint AS cost_cents,
            bool_and(${COST_IS_KNOWN}) AS cost_known
     ${SALE_SCOPE}
     GROUP BY si.variant_id
     HAVING SUM(${NET_QTY}) > 0`,
    params
  );

  const excluded: MenuExcludedRow[] = [];
  const priced: Array<Omit<MenuMatrixRow, 'share_bps' | 'quadrant'>> = [];

  for (const row of result.rows) {
    const sold = Number(row.sold);
    const revenue = Number(row.revenue_cents);
    const cost = Number(row.cost_cents);
    const base = {
      variant_id: Number(row.variant_id),
      product_name: String(row.product_name ?? ''),
      label: String(row.label ?? ''),
      sold,
    };
    if (!row.cost_known) {
      excluded.push({ ...base, reason: 'no_cost' });
      continue;
    }
    // Sold for nothing is not a margin question — a staff meal rung at zero
    // would otherwise be the menu's worst performer by definition.
    if (revenue <= 0) {
      excluded.push({ ...base, reason: 'no_price' });
      continue;
    }
    priced.push({
      ...base,
      revenue_cents: revenue,
      cost_cents: cost,
      margin_cents: revenue - cost,
      unit_margin_cents: Math.round((revenue - cost) / sold),
    });
  }

  const soldTotal = priced.reduce((sum, r) => sum + r.sold, 0);
  const marginTotal = priced.reduce((sum, r) => sum + r.margin_cents, 0);
  // The weighted average contribution margin — Kasavana–Smith's own bar, and
  // not the average of the per-dish averages, which would let one rare dish
  // move it.
  const marginBar = soldTotal > 0 ? Math.round(marginTotal / soldTotal) : 0;
  const shareBar =
    priced.length > 0 ? Math.round((FAIR_SHARE_FACTOR / priced.length) * 10_000) : 0;

  const rows: MenuMatrixRow[] = priced
    .map((r) => {
      const share = soldTotal > 0 ? Math.round((r.sold / soldTotal) * 10_000) : 0;
      const popular = share >= shareBar;
      const profitable = r.unit_margin_cents >= marginBar;
      const quadrant: MenuQuadrant = popular
        ? profitable
          ? 'star'
          : 'plowhorse'
        : profitable
          ? 'puzzle'
          : 'dog';
      return { ...r, share_bps: share, quadrant };
    })
    .sort((a, b) => b.margin_cents - a.margin_cents);

  return {
    rows,
    excluded: excluded.sort((a, b) => b.sold - a.sold),
    thresholds: { popularity_share_bps: shareBar, unit_margin_cents: marginBar },
    enough_data: rows.length >= MIN_DISHES && soldTotal >= rows.length * MIN_UNITS_PER_DISH,
  };
}

async function writeoffs(params: unknown[]): Promise<CafeAnalytics['writeoffs']> {
  const result = await pool.query(
    `SELECT COALESCE(NULLIF(d.reason_code, ''), 'other') AS reason,
            SUM(l.quantity)::int AS quantity,
            SUM(l.quantity * COALESCE(l.unit_cost_cents, v.cost_cents, 0))::bigint AS cost_cents
     ${WRITEOFF_SCOPE}
     GROUP BY 1
     ORDER BY 3 DESC`,
    params
  );
  // The reason is passed through rather than mapped to a known set: the
  // vertical owns that vocabulary now (К5e), and a build that learns a new
  // code should report it, not fold it into «Інше».
  const rows = result.rows.map((row) => ({
    reason: String(row.reason),
    quantity: Number(row.quantity),
    cost_cents: Number(row.cost_cents),
  }));
  return { rows, total_cost_cents: rows.reduce((sum, r) => sum + r.cost_cents, 0) };
}

/**
 * The restaurant's own numbers, or null.
 *
 * Null and not zeroes: a counter-service café has no tables, and «оборотність
 * столу: 0» reads as a shop doing badly rather than as a question that does
 * not apply. Presence of closed bills decides it — not the vertical, because
 * both formats share `cafe`, and not the `tables` module, which the backend
 * cannot see.
 */
async function tableStats(params: unknown[]): Promise<CafeTableStats | null> {
  const result = await pool.query(
    `WITH closed AS (
       SELECT b.id, b.table_id, b.guests, b.opened_at, b.closed_at,
              (b.closed_at AT TIME ZONE 'UTC')::date AS day,
              COALESCE((
                SELECT SUM(si.line_total_cents)
                FROM pos_sale_items si
                JOIN pos_sales s ON s.id = si.sale_id
                JOIN pos_bill_items bi ON bi.id = si.bill_item_id
                WHERE bi.bill_id = b.id AND s.status <> 'voided'
              ), 0) AS revenue_cents
       FROM pos_bills b
       WHERE b.store_id = $1
         AND b.status = 'paid'
         AND b.closed_at IS NOT NULL
         AND b.closed_at >= $2::date
         AND b.closed_at <= $3::timestamptz
     )
     SELECT COUNT(*)::int AS bills,
            COALESCE(SUM(guests), 0)::int AS guests,
            COALESCE(SUM(revenue_cents), 0)::bigint AS revenue_cents,
            COUNT(DISTINCT table_id)::int AS tables_used,
            COUNT(DISTINCT day)::int AS days,
            COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60), 0)::float AS avg_minutes
     FROM closed`,
    params
  );
  const row = result.rows[0] ?? {};
  const bills = Number(row.bills ?? 0);
  if (bills === 0) return null;

  const guests = Number(row.guests ?? 0);
  const revenue = Number(row.revenue_cents ?? 0);
  const tablesUsed = Number(row.tables_used ?? 0);
  const days = Number(row.days ?? 0);
  return {
    bills,
    guests,
    revenue_cents: revenue,
    avg_bill_cents: Math.round(revenue / bills),
    avg_per_guest_cents: guests > 0 ? Math.round(revenue / guests) : null,
    // Per table AND per day, so a fortnight of data does not read as fourteen
    // times busier than a day of it.
    turns_per_table_per_day:
      tablesUsed > 0 && days > 0 ? Math.round((bills / tablesUsed / days) * 100) / 100 : 0,
    avg_minutes: Math.round(Number(row.avg_minutes ?? 0)),
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function getCafeAnalytics(
  storeId: number,
  opts: { from?: string; to?: string; timezone?: string } = {}
): Promise<CafeAnalytics> {
  const { from, to } = resolveRange(opts);
  const timezone = opts.timezone || 'Europe/Kyiv';
  // `to` is a date; the window must include everything that happened ON it.
  const params = [storeId, from, `${to}T23:59:59.999Z`];

  const [cost, check, hours, mods, matrix, losses, tables] = await Promise.all([
    foodCost(params),
    receipts(params),
    peakHours(params, timezone),
    topModifiers(params),
    menu(params),
    writeoffs(params),
    tableStats(params),
  ]);

  return {
    from,
    to,
    food_cost: cost,
    sales_count: check.sales_count,
    average_check_cents: check.average_check_cents,
    peak_hours: hours,
    top_modifiers: mods,
    menu: matrix,
    writeoffs: losses,
    tables,
  };
}
