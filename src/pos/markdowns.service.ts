// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/markdowns.service.ts
//
// Mass markdown (clothing, TechDocs/POS_CLOTHING.md D2): «−30 % на все літнє до
// 15 жовтня». One campaign over many variants, applied in one transaction and
// ended — by hand or by its date — by putting the prices back.
//
// Three rules that are easy to get backwards:
//
//   * The percentage comes off the ORIGINAL price — `compare_at_cents` when
//     the variant was already marked down, else `price_cents`. So re-running
//     «−30 %» on the same rail is not «−30 % off −30 %», and the tag keeps
//     showing the real old price.
//   * A variant that is already in a LIVE markdown is refused (named, so the
//     owner knows which one to end first). Two live campaigns over one variant
//     would make «put it back» mean two different things.
//   * Ending a markdown restores a variant ONLY while it still carries the
//     campaign's price and old price; one the owner retyped meanwhile is left
//     as it is and reported as skipped. The snapshot in `pos_markdown_items` is
//     what makes that exact, and what makes the end step idempotent.

import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { isLocalDateString, localDateString } from './core/localDate.js';
import { invalidatePublicMenu } from './public-menu/menu.service.js';

export type MarkdownRounding = 1 | 100 | 1000;
export const MARKDOWN_ROUNDINGS: readonly MarkdownRounding[] = [1, 100, 1000];
/** Enough for a whole season's rail in one go, small enough for one transaction. */
export const MARKDOWN_MAX_PRODUCTS = 500;

export interface MarkdownInput {
  product_ids: number[];
  /** Whole percent, 1..99. */
  percent: number;
  /** Cents to round the new price to: 1 (копійки), 100 (гривня, default), 1000 (10 гривень). */
  rounding?: MarkdownRounding;
  /** Store-local `YYYY-MM-DD`, live through that day; null/absent = until ended by hand. */
  ends_on?: string | null;
  name?: string;
}

export interface MarkdownView {
  id: number;
  name: string;
  percent: number;
  rounding: MarkdownRounding;
  ends_on: string | null;
  created_at: string;
  ended_at: string | null;
  ended_reason: 'manual' | 'expired' | null;
  /** Variants in the campaign, and the products they belong to. */
  items: number;
  products: number;
  /** Filled once ended: how many variants went back, how many were left as retyped. */
  restored: number | null;
  skipped: number | null;
}

export type MarkdownSkipReason = 'in_markdown' | 'derived' | 'too_cheap';

export interface MarkdownSkipped {
  variant_id: number;
  product_name: string;
  label: string;
  reason: MarkdownSkipReason;
  /** For `in_markdown`: the live campaign's caption. */
  markdown_name?: string;
}

export interface MarkdownPlannedItem {
  variant_id: number;
  product_id: number;
  product_name: string;
  label: string;
  price_before: number;
  compare_at_before: number | null;
  price_after: number;
  compare_at_after: number;
}

export interface MarkdownPreview {
  items: MarkdownPlannedItem[];
  skipped: MarkdownSkipped[];
  /** Distinct products among `items`. */
  products: number;
}

/** The new price: `percent` off `baseCents`, rounded to the nearest `rounding`. */
export function markdownPrice(baseCents: number, percent: number, rounding: MarkdownRounding): number {
  const raw = (baseCents * (100 - percent)) / 100;
  return Math.round(raw / rounding) * rounding;
}

interface NormalizedInput {
  productIds: number[];
  percent: number;
  rounding: MarkdownRounding;
  endsOn: string | null;
  name: string;
}

/** Validates in the owner's words; `today` is the store's local date. */
export function normalizeMarkdownInput(input: MarkdownInput, today: string): NormalizedInput {
  const ids = Array.isArray(input.product_ids)
    ? [...new Set(input.product_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length === 0) throw new Error('Оберіть товари для уцінки');
  if (ids.length > MARKDOWN_MAX_PRODUCTS) {
    throw new Error(`Забагато товарів за раз: до ${MARKDOWN_MAX_PRODUCTS}`);
  }
  const percent = Number(input.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
    throw new Error('Відсоток знижки — ціле число від 1 до 99');
  }
  const rounding = (input.rounding == null ? 100 : Number(input.rounding)) as MarkdownRounding;
  if (!MARKDOWN_ROUNDINGS.includes(rounding)) {
    throw new Error('Округлення: до копійки (1), до гривні (100) або до 10 гривень (1000)');
  }
  let endsOn: string | null = null;
  if (input.ends_on != null && input.ends_on !== '') {
    const s = String(input.ends_on);
    if (!isLocalDateString(s)) throw new Error('Дата завершення — у форматі РРРР-ММ-ДД');
    if (s < today) throw new Error('Дата завершення вже минула');
    endsOn = s;
  }
  const name = String(input.name ?? '').trim();
  if (name.length > 80) throw new Error('Назва уцінки — до 80 символів');
  return { productIds: ids, percent, rounding, endsOn, name };
}

async function storeToday(storeId: number): Promise<string> {
  const r = await pool.query(`SELECT timezone FROM pos_stores WHERE id = $1`, [storeId]);
  if (r.rows.length === 0) throw new Error('Store not found');
  return localDateString(String(r.rows[0].timezone || 'Europe/Kyiv'));
}

interface CandidateRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  label: string;
  price_cents: number;
  compare_at_cents: number | null;
  derived: boolean;
  live_id: number | null;
  live_name: string | null;
  live_percent: number | null;
}

/**
 * Every active variant of the chosen products, with what stands in its way:
 * a live markdown it is already in, or a price that is not the card's at all
 * (a derived composite is priced from its components at the till).
 */
async function loadCandidates(
  client: PoolClient | typeof pool,
  storeId: number,
  productIds: number[],
  lock: boolean
): Promise<CandidateRow[]> {
  const r = await client.query(
    `SELECT v.id AS variant_id,
            v.product_id,
            p.name AS product_name,
            v.label,
            v.price_cents,
            v.compare_at_cents,
            (p.kind = 'composite' AND p.stock_mode = 'derived') AS derived,
            live.id AS live_id,
            live.name AS live_name,
            live.percent AS live_percent
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     LEFT JOIN LATERAL (
       SELECT m.id, m.name, m.percent
       FROM pos_markdown_items mi
       JOIN pos_markdowns m ON m.id = mi.markdown_id
       WHERE mi.variant_id = v.id AND m.ended_at IS NULL
       LIMIT 1
     ) live ON TRUE
     WHERE p.store_id = $1
       AND p.id = ANY($2::bigint[])
       AND p.is_active
       AND v.is_active
     ORDER BY p.name, p.id, v.label, v.id
     ${lock ? 'FOR UPDATE OF v' : ''}`,
    [storeId, productIds]
  );
  return r.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    product_id: Number(row.product_id),
    product_name: String(row.product_name),
    label: String(row.label ?? ''),
    price_cents: Number(row.price_cents),
    compare_at_cents: row.compare_at_cents == null ? null : Number(row.compare_at_cents),
    derived: Boolean(row.derived),
    live_id: row.live_id == null ? null : Number(row.live_id),
    live_name: row.live_name == null ? null : String(row.live_name),
    live_percent: row.live_percent == null ? null : Number(row.live_percent),
  }));
}

/** What a markdown is called in a list and in a refusal. */
export function markdownCaption(name: string, percent: number): string {
  return name.trim() || `Уцінка −${percent} %`;
}

function plan(rows: CandidateRow[], percent: number, rounding: MarkdownRounding): MarkdownPreview {
  const items: MarkdownPlannedItem[] = [];
  const skipped: MarkdownSkipped[] = [];
  for (const row of rows) {
    const common = { variant_id: row.variant_id, product_name: row.product_name, label: row.label };
    if (row.derived) {
      skipped.push({ ...common, reason: 'derived' });
      continue;
    }
    if (row.live_id != null) {
      skipped.push({
        ...common,
        reason: 'in_markdown',
        markdown_name: markdownCaption(row.live_name ?? '', row.live_percent ?? 0),
      });
      continue;
    }
    // Off the original price, never off a markdown already applied.
    const base = row.compare_at_cents ?? row.price_cents;
    const after = markdownPrice(base, percent, rounding);
    if (after <= 0 || after >= base) {
      skipped.push({ ...common, reason: 'too_cheap' });
      continue;
    }
    items.push({
      variant_id: row.variant_id,
      product_id: row.product_id,
      product_name: row.product_name,
      label: row.label,
      price_before: row.price_cents,
      compare_at_before: row.compare_at_cents,
      price_after: after,
      compare_at_after: base,
    });
  }
  return { items, skipped, products: new Set(items.map((i) => i.product_id)).size };
}

/** What `createMarkdown` would do, without doing it — for the dialog's preview. */
export async function previewMarkdown(storeId: number, input: MarkdownInput): Promise<MarkdownPreview> {
  const n = normalizeMarkdownInput(input, await storeToday(storeId));
  const rows = await loadCandidates(pool, storeId, n.productIds, false);
  return plan(rows, n.percent, n.rounding);
}

function mapView(row: Record<string, unknown>): MarkdownView {
  const ended = row.ended_at != null;
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    percent: Number(row.percent),
    rounding: Number(row.rounding) as MarkdownRounding,
    ends_on: row.ends_on == null ? null : String(row.ends_on),
    created_at: new Date(row.created_at as string).toISOString(),
    ended_at: ended ? new Date(row.ended_at as string).toISOString() : null,
    ended_reason: (row.ended_reason as MarkdownView['ended_reason']) ?? null,
    items: Number(row.items ?? 0),
    products: Number(row.products ?? 0),
    restored: ended ? Number(row.restored ?? 0) : null,
    skipped: ended ? Number(row.skipped ?? 0) : null,
  };
}

const VIEW_SQL = `
  SELECT m.id, m.name, m.percent, m.rounding, m.ends_on::text AS ends_on,
         m.created_at, m.ended_at, m.ended_reason,
         COUNT(mi.id)::int AS items,
         COUNT(DISTINCT v.product_id)::int AS products,
         COUNT(mi.id) FILTER (WHERE mi.restored = 'restored')::int AS restored,
         COUNT(mi.id) FILTER (WHERE mi.restored = 'skipped')::int AS skipped
  FROM pos_markdowns m
  LEFT JOIN pos_markdown_items mi ON mi.markdown_id = m.id
  LEFT JOIN pos_variants v ON v.id = mi.variant_id
  WHERE m.store_id = $1`;

/** Live campaigns first, newest first within each half. */
export async function listMarkdowns(storeId: number): Promise<MarkdownView[]> {
  const r = await pool.query(
    `${VIEW_SQL}
     GROUP BY m.id
     ORDER BY (m.ended_at IS NULL) DESC, m.created_at DESC, m.id DESC`,
    [storeId]
  );
  return r.rows.map(mapView);
}

export async function getMarkdown(storeId: number, id: number): Promise<MarkdownView | null> {
  const r = await pool.query(`${VIEW_SQL} AND m.id = $2 GROUP BY m.id`, [storeId, id]);
  return r.rows.length === 0 ? null : mapView(r.rows[0]);
}

export interface MarkdownCreated {
  markdown: MarkdownView;
  applied: number;
  skipped: MarkdownSkipped[];
}

/** Applies the markdown in one transaction; refuses when nothing would change. */
export async function createMarkdown(
  storeId: number,
  staffId: number,
  input: MarkdownInput
): Promise<MarkdownCreated> {
  const n = normalizeMarkdownInput(input, await storeToday(storeId));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await loadCandidates(client, storeId, n.productIds, true);
    const planned = plan(rows, n.percent, n.rounding);
    if (planned.items.length === 0) {
      throw new Error(
        planned.skipped.some((s) => s.reason === 'in_markdown')
          ? 'Немає що уцінювати: обрані товари вже в уцінці — завершіть її спочатку'
          : 'Немає що уцінювати'
      );
    }
    const created = await client.query(
      `INSERT INTO pos_markdowns (store_id, name, percent, rounding, ends_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [storeId, n.name, n.percent, n.rounding, n.endsOn, staffId]
    );
    const markdownId = Number(created.rows[0].id);
    for (const item of planned.items) {
      await client.query(
        `UPDATE pos_variants
         SET price_cents = $1, compare_at_cents = $2, updated_at = NOW()
         WHERE id = $3 AND store_id = $4`,
        [item.price_after, item.compare_at_after, item.variant_id, storeId]
      );
      await client.query(
        `INSERT INTO pos_markdown_items
           (markdown_id, store_id, variant_id, price_before, compare_at_before, price_after, compare_at_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          markdownId,
          storeId,
          item.variant_id,
          item.price_before,
          item.compare_at_before,
          item.price_after,
          item.compare_at_after,
        ]
      );
    }
    await client.query('COMMIT');
    // Prices are on the guest's menu too. No import cycle here: menu.service
    // never reaches back into this file.
    invalidatePublicMenu(storeId);
    const markdown = (await getMarkdown(storeId, markdownId))!;
    return { markdown, applied: planned.items.length, skipped: planned.skipped };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface MarkdownEnded {
  restored: number;
  skipped: number;
  /** True when it had already been ended; nothing was touched. */
  already: boolean;
}

export class MarkdownNotFound extends Error {
  constructor() {
    super('Уцінку не знайдено');
    this.name = 'MarkdownNotFound';
  }
}

/**
 * Puts the prices back — every variant that still carries the campaign's price
 * and old price. One the owner changed since is left as it is and counted as
 * skipped. Idempotent: a second call reports the first one's counts.
 */
export async function endMarkdown(
  storeId: number,
  id: number,
  endedBy: number | null,
  reason: 'manual' | 'expired'
): Promise<MarkdownEnded> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const head = await client.query(
      `SELECT id, ended_at FROM pos_markdowns WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [id, storeId]
    );
    if (head.rows.length === 0) throw new MarkdownNotFound();
    if (head.rows[0].ended_at != null) {
      const counts = await client.query(
        `SELECT COUNT(*) FILTER (WHERE restored = 'restored')::int AS restored,
                COUNT(*) FILTER (WHERE restored = 'skipped')::int AS skipped
         FROM pos_markdown_items WHERE markdown_id = $1`,
        [id]
      );
      await client.query('COMMIT');
      return { restored: Number(counts.rows[0].restored), skipped: Number(counts.rows[0].skipped), already: true };
    }
    const items = await client.query(
      `SELECT id, variant_id, price_before, compare_at_before, price_after, compare_at_after
       FROM pos_markdown_items WHERE markdown_id = $1 ORDER BY id`,
      [id]
    );
    let restored = 0;
    let skipped = 0;
    for (const item of items.rows) {
      const put = await client.query(
        `UPDATE pos_variants
         SET price_cents = $1, compare_at_cents = $2, updated_at = NOW()
         WHERE id = $3 AND store_id = $4 AND is_active
           AND price_cents = $5
           AND compare_at_cents IS NOT DISTINCT FROM $6`,
        [
          item.price_before,
          item.compare_at_before,
          item.variant_id,
          storeId,
          item.price_after,
          item.compare_at_after,
        ]
      );
      const outcome = put.rowCount === 1 ? 'restored' : 'skipped';
      if (outcome === 'restored') restored += 1;
      else skipped += 1;
      await client.query(`UPDATE pos_markdown_items SET restored = $1 WHERE id = $2`, [outcome, item.id]);
    }
    await client.query(
      `UPDATE pos_markdowns SET ended_at = NOW(), ended_by = $1, ended_reason = $2 WHERE id = $3`,
      [endedBy, reason, id]
    );
    await client.query('COMMIT');
    invalidatePublicMenu(storeId);
    return { restored, skipped, already: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The hourly cron: every live markdown whose `ends_on` is before the STORE's
 * current day is ended as `expired`. Compared as store-local dates, like the
 * stop-list and the receipt day — a shop in Lviv does not end its sale on UTC
 * midnight. Returns how many were ended.
 */
export async function endExpiredMarkdowns(now: Date = new Date()): Promise<number> {
  const live = await pool.query(
    `SELECT m.id, m.store_id, m.ends_on::text AS ends_on, s.timezone
     FROM pos_markdowns m
     JOIN pos_stores s ON s.id = m.store_id
     WHERE m.ended_at IS NULL AND m.ends_on IS NOT NULL`
  );
  let ended = 0;
  for (const row of live.rows) {
    const today = localDateString(String(row.timezone || 'Europe/Kyiv'), now);
    if (String(row.ends_on) >= today) continue;
    await endMarkdown(Number(row.store_id), Number(row.id), null, 'expired');
    ended += 1;
  }
  return ended;
}
