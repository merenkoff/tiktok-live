// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/menu-opens.service.ts — how often the guest QR menu is opened
// (track W, TechDocs/POS_MENU_WALL.md).
//
// Three things live here:
//
//  1. `recordMenuOpen` — one row in `pos_menu_opens` per opening of the HTML
//     menu or dish page, written «in the tail» of the response: never awaited
//     by the route, never a reason for the page to fail. Page opens, not
//     people (Д1); messenger previews and crawlers are left out by their
//     User-Agent (Д2), and the row keeps neither the IP nor the agent (Д5).
//  2. `menuWallSnapshot` — what the office television reads every 30 s: today
//     in one Kyiv day (Д3) for every place and every table, the hour bars,
//     yesterday at this time, the best day of the last 90, and the new opens
//     after a cursor so the screen can celebrate each one.
//  3. `menuScansSummary` — the super admin's tab: today / 7 days / 30 days /
//     all time per place.
//
// Everything is counted by SQL over `opened_at AT TIME ZONE 'Europe/Kyiv'`;
// only today's rows are read one by one (there are hundreds, not millions).

import { pool } from '../db.js';
import { logger } from '../logger.js';
import { localDateString } from './core/localDate.js';
import { verticalOrDefault } from './verticals/index.js';

/** The one day the television counts in — the office is in Kyiv (Д3). */
export const WALL_ZONE = 'Europe/Kyiv';

const EVENTS_LIMIT = 20;
const BEST_DAY_WINDOW = 90;
const HOUR_MS = 60 * 60 * 1000;

// ---- recording --------------------------------------------------------------

/**
 * A fetch that is not a guest: the preview a messenger makes of a pasted link
 * (F11/F15 gave the page Open Graph tags for exactly that), a search or AI
 * crawler, a headless browser, a command-line client. Deliberately NOT Viber
 * or any in-app browser — guests open the menu from those. An empty agent
 * counts: a phone always sends one.
 */
const PREVIEW_AGENT_RE =
  /\bbot\b|bot\/|[a-z]bot\b|crawler|spider|preview|facebookexternalhit|facebookcatalog|twitterbot|telegrambot|whatsapp|slackbot|discordbot|linkedinbot|pinterestbot|skypeuripreview|google-pagerenderer|headlesschrome|lighthouse|gtmetrix|pagespeed|\bcurl\/|\bwget\/|python-requests|python-urllib|go-http-client|java\/|libwww|httpclient|node-fetch|undici|axios\//i;

export function isPreviewAgent(userAgent: unknown): boolean {
  return typeof userAgent === 'string' && PREVIEW_AGENT_RE.test(userAgent);
}

/** A label from the link (`utm_campaign` or `c`), kept only when it is a plain word (Д6). */
export function cleanTag(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

export interface MenuOpenInput {
  storeId: number;
  /** The table the QR named, when it is a live table of this store (`findMenuTable`). */
  tableId: number | null;
  /** The table's own key (`?k=`) was checked and matched (Q5). */
  keyed: boolean;
  /** The key in the address — the token or the slug; the INSERT decides which. */
  key: string;
  page: 'menu' | 'dish';
  /** `request.query` as it came — `utm_campaign` / `c` are read from it. */
  query: unknown;
  userAgent: unknown;
}

const pending = new Set<Promise<void>>();

/**
 * Write one open, without waiting for it. The route calls this after the page
 * is built and sends the HTML; a failed insert is a warning in the log and
 * nothing else.
 *
 * `via` is decided by the INSERT itself — the address equals the store's
 * token, or it was the slug — so the write costs one statement.
 */
export function recordMenuOpen(input: MenuOpenInput): void {
  if (isPreviewAgent(input.userAgent)) return;
  const q = (input.query ?? {}) as Record<string, unknown>;
  const tag = cleanTag(q.utm_campaign) ?? cleanTag(q.c);
  const task = pool
    .query(
      `INSERT INTO pos_menu_opens (store_id, table_id, keyed, via, page, tag)
       SELECT s.id, $2::bigint, $3, CASE WHEN s.public_menu_token = $4 THEN 'token' ELSE 'slug' END, $5, $6
       FROM pos_stores s
       WHERE s.id = $1`,
      [input.storeId, input.tableId, input.keyed, input.key, input.page, tag]
    )
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.warn('Menu open not recorded', {
        storeId: input.storeId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  pending.add(task);
  void task.finally(() => pending.delete(task));
}

/** Test seam: wait for every open that is still being written. */
export async function settleMenuOpens(): Promise<void> {
  await Promise.all([...pending]);
}

// ---- the television's snapshot -----------------------------------------------

export interface MenuWallTable {
  id: number;
  name: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  shape: 'rect' | 'round';
  /** Opens of this table's QR today. */
  today: number;
  lastAt: string | null;
}

export interface MenuWallHall {
  id: number;
  name: string;
  tables: MenuWallTable[];
}

export interface MenuWallStore {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  today: number;
  lastHour: number;
  last3h: number;
  lastAt: string | null;
  /** Today by hour of the Kyiv day (0–23). */
  hourly: number[];
  /** Opens that named a table today. */
  tableToday: number;
  /** How many different tables were opened today. */
  tablesScanned: number;
  /** Live tables in live halls — what «столів 9 з 24» divides by. */
  tablesTotal: number;
  /** The floor plan, only for a place whose tables were scanned today (Д7). */
  halls: MenuWallHall[] | null;
}

export interface MenuWallEvent {
  id: number;
  storeId: number;
  tableId: number | null;
  tableName: string | null;
  hallName: string | null;
  openedAt: string;
}

export interface MenuWallSnapshot {
  now: string;
  /** The Kyiv day of the snapshot (`YYYY-MM-DD`) — the screen starts over when it changes. */
  day: string;
  total: number;
  /** Yesterday up to the same hour and minute. */
  yesterdaySameTime: number;
  hourly: number[];
  /** Today's opens that named a table, over every place. */
  tableToday: number;
  /** The best day of the 90 before today — for «Рекорд дня!». */
  bestDay: { day: string; count: number } | null;
  /** Every place with a published menu, plus any that was opened today; popular first. */
  stores: MenuWallStore[];
  /** Today's opens with id > `after`, oldest first, at most EVENTS_LIMIT. */
  events: MenuWallEvent[];
  /** The newest id among today's opens — the cursor for the next read. */
  lastId: number;
}

const zeros = () => Array.from({ length: 24 }, () => 0);

/** `day_start` of the Kyiv day `$1` as a timestamptz expression. */
const DAY_START = `(($1::date)::timestamp AT TIME ZONE '${WALL_ZONE}')`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export async function menuWallSnapshot(opts: { now?: Date; after?: number } = {}): Promise<MenuWallSnapshot> {
  const now = opts.now ?? new Date();
  const after = Number.isFinite(opts.after) && (opts.after as number) > 0 ? Math.floor(opts.after as number) : 0;
  const day = localDateString(WALL_ZONE, now);

  const [todayRows, yesterdayRow, bestRow] = await Promise.all([
    pool.query(
      `SELECT o.id, o.store_id, o.table_id, o.opened_at,
              EXTRACT(HOUR FROM o.opened_at AT TIME ZONE '${WALL_ZONE}')::int AS hour,
              t.name AS table_name, h.name AS hall_name
       FROM pos_menu_opens o
       LEFT JOIN pos_tables t ON t.id = o.table_id
       LEFT JOIN pos_halls h ON h.id = t.hall_id
       WHERE o.opened_at >= ${DAY_START}
       ORDER BY o.id ASC`,
      [day]
    ),
    pool.query(
      `SELECT count(*)::int AS n
       FROM pos_menu_opens
       WHERE opened_at >= ${DAY_START} - INTERVAL '1 day'
         AND opened_at <  ${DAY_START} - INTERVAL '1 day' + ($2::timestamptz - ${DAY_START})`,
      [day, now]
    ),
    pool.query(
      `SELECT (opened_at AT TIME ZONE '${WALL_ZONE}')::date AS d, count(*)::int AS n
       FROM pos_menu_opens
       WHERE opened_at >= ${DAY_START} - ($2::int * INTERVAL '1 day')
         AND opened_at <  ${DAY_START}
       GROUP BY d
       ORDER BY n DESC, d DESC
       LIMIT 1`,
      [day, BEST_DAY_WINDOW]
    ),
  ]);

  const hourly = zeros();
  const byStore = new Map<number, MenuWallStore>();
  const tablesByStore = new Map<number, Map<number, { today: number; lastAt: string }>>();
  const events: MenuWallEvent[] = [];
  let total = 0;
  let tableToday = 0;
  let lastId = after;

  const storeAcc = (id: number): MenuWallStore => {
    let s = byStore.get(id);
    if (!s) {
      s = {
        id,
        name: '',
        slug: '',
        logoUrl: null,
        today: 0,
        lastHour: 0,
        last3h: 0,
        lastAt: null,
        hourly: zeros(),
        tableToday: 0,
        tablesScanned: 0,
        tablesTotal: 0,
        halls: null,
      };
      byStore.set(id, s);
    }
    return s;
  };

  for (const r of todayRows.rows) {
    const id = Number(r.id);
    const storeId = Number(r.store_id);
    const tableId = r.table_id == null ? null : Number(r.table_id);
    const at = iso(r.opened_at);
    const hour = Number(r.hour) % 24;
    const age = now.getTime() - new Date(at).getTime();

    total += 1;
    hourly[hour] += 1;
    const s = storeAcc(storeId);
    s.today += 1;
    s.hourly[hour] += 1;
    if (age <= HOUR_MS) s.lastHour += 1;
    if (age <= 3 * HOUR_MS) s.last3h += 1;
    if (!s.lastAt || at > s.lastAt) s.lastAt = at;
    if (tableId != null) {
      tableToday += 1;
      s.tableToday += 1;
      let tables = tablesByStore.get(storeId);
      if (!tables) {
        tables = new Map();
        tablesByStore.set(storeId, tables);
      }
      const t = tables.get(tableId) ?? { today: 0, lastAt: at };
      t.today += 1;
      if (at > t.lastAt) t.lastAt = at;
      tables.set(tableId, t);
    }
    if (id > lastId) lastId = id;
    if (id > after && events.length < EVENTS_LIMIT) {
      events.push({
        id,
        storeId,
        tableId,
        tableName: typeof r.table_name === 'string' ? r.table_name : null,
        hallName: typeof r.hall_name === 'string' ? r.hall_name : null,
        openedAt: at,
      });
    }
  }

  // Every place with a published menu — the places with nothing today sit at
  // the bottom of the ranking, dimmed, so the team sees who is not scanned
  // yet (Д7) — plus any place that was opened today whatever its switch says.
  const storeRows = await pool.query(
    `SELECT s.id, s.name, s.slug, s.vertical, s.public_menu_enabled, s.public_logo_url,
            (SELECT count(*)::int FROM pos_tables t JOIN pos_halls h ON h.id = t.hall_id
              WHERE t.store_id = s.id AND t.is_active AND h.is_active) AS tables_total
     FROM pos_stores s
     WHERE s.public_menu_enabled = TRUE OR s.id = ANY($1::bigint[])
     ORDER BY s.id ASC`,
    [[...byStore.keys()]]
  );
  for (const row of storeRows.rows) {
    const id = Number(row.id);
    const published = row.public_menu_enabled === true && verticalOrDefault(row.vertical as string | undefined).kitchen;
    if (!published && !byStore.has(id)) continue;
    const s = storeAcc(id);
    s.name = String(row.name);
    s.slug = String(row.slug);
    s.logoUrl = typeof row.public_logo_url === 'string' ? row.public_logo_url : null;
    s.tablesTotal = Number(row.tables_total ?? 0);
  }

  // The floor plans — only of the places whose tables were scanned today.
  const withTables = [...byStore.values()].filter((s) => s.tableToday > 0).map((s) => s.id);
  if (withTables.length) {
    const hallRows = await pool.query(
      `SELECT h.id AS hall_id, h.name AS hall_name, h.store_id,
              t.id, t.name, t.pos_x, t.pos_y, t.width, t.height, t.shape
       FROM pos_halls h
       LEFT JOIN pos_tables t ON t.hall_id = h.id AND t.is_active
       WHERE h.store_id = ANY($1::bigint[]) AND h.is_active
       ORDER BY h.store_id ASC, h.sort_order ASC, h.id ASC, t.id ASC`,
      [withTables]
    );
    const hallsByStore = new Map<number, Map<number, MenuWallHall>>();
    for (const row of hallRows.rows) {
      const storeId = Number(row.store_id);
      const hallId = Number(row.hall_id);
      let halls = hallsByStore.get(storeId);
      if (!halls) {
        halls = new Map();
        hallsByStore.set(storeId, halls);
      }
      let hall = halls.get(hallId);
      if (!hall) {
        hall = { id: hallId, name: String(row.hall_name), tables: [] };
        halls.set(hallId, hall);
      }
      if (row.id == null) continue;
      const tableId = Number(row.id);
      const counted = tablesByStore.get(storeId)?.get(tableId);
      hall.tables.push({
        id: tableId,
        name: String(row.name),
        pos_x: Number(row.pos_x),
        pos_y: Number(row.pos_y),
        width: Number(row.width),
        height: Number(row.height),
        shape: row.shape === 'round' ? 'round' : 'rect',
        today: counted?.today ?? 0,
        lastAt: counted?.lastAt ?? null,
      });
    }
    for (const storeId of withTables) {
      const s = byStore.get(storeId)!;
      s.halls = [...(hallsByStore.get(storeId)?.values() ?? [])];
      s.tablesScanned = tablesByStore.get(storeId)?.size ?? 0;
    }
  }

  const stores = [...byStore.values()].sort(
    (a, b) =>
      b.today - a.today ||
      (b.lastAt ?? '').localeCompare(a.lastAt ?? '') ||
      a.name.localeCompare(b.name, 'uk') ||
      a.id - b.id
  );

  const best = bestRow.rows[0];
  const bestDay =
    best && Number(best.n) > 0
      ? { day: best.d instanceof Date ? localDateString('UTC', best.d) : String(best.d), count: Number(best.n) }
      : null;

  return {
    now: now.toISOString(),
    day,
    total,
    yesterdaySameTime: Number(yesterdayRow.rows[0]?.n ?? 0),
    hourly,
    tableToday,
    bestDay,
    stores,
    events,
    lastId,
  };
}

// ---- the super admin's tab ------------------------------------------------------

export interface MenuScansStoreRow {
  id: number;
  name: string;
  slug: string;
  menu_enabled: boolean;
  today: number;
  last7d: number;
  last30d: number;
  total: number;
  table_today: number;
  tables_total: number;
  last_at: string | null;
}

export interface MenuScansSummary {
  day: string;
  today: number;
  last7d: number;
  last30d: number;
  total: number;
  table_today: number;
  stores: MenuScansStoreRow[];
}

/** Today / 7 days / 30 days / all time per place, Kyiv days; «7 days» is today and the six before it. */
export async function menuScansSummary(now: Date = new Date()): Promise<MenuScansSummary> {
  const day = localDateString(WALL_ZONE, now);
  const result = await pool.query(
    `SELECT s.id, s.name, s.slug, s.vertical, s.public_menu_enabled,
            count(o.id) FILTER (WHERE o.opened_at >= ${DAY_START})::int AS today,
            count(o.id) FILTER (WHERE o.opened_at >= ${DAY_START} - INTERVAL '6 days')::int AS last7d,
            count(o.id) FILTER (WHERE o.opened_at >= ${DAY_START} - INTERVAL '29 days')::int AS last30d,
            count(o.id)::int AS total,
            count(o.id) FILTER (WHERE o.opened_at >= ${DAY_START} AND o.table_id IS NOT NULL)::int AS table_today,
            max(o.opened_at) AS last_at,
            (SELECT count(*)::int FROM pos_tables t JOIN pos_halls h ON h.id = t.hall_id
              WHERE t.store_id = s.id AND t.is_active AND h.is_active) AS tables_total
     FROM pos_stores s
     LEFT JOIN pos_menu_opens o ON o.store_id = s.id
     WHERE s.public_menu_enabled = TRUE OR EXISTS (SELECT 1 FROM pos_menu_opens x WHERE x.store_id = s.id)
     GROUP BY s.id
     ORDER BY today DESC, total DESC, s.id ASC`,
    [day]
  );
  const stores: MenuScansStoreRow[] = [];
  const sum = { today: 0, last7d: 0, last30d: 0, total: 0, table_today: 0 };
  for (const row of result.rows) {
    const published =
      row.public_menu_enabled === true && verticalOrDefault(row.vertical as string | undefined).kitchen;
    const total = Number(row.total);
    if (!published && total === 0) continue;
    const r: MenuScansStoreRow = {
      id: Number(row.id),
      name: String(row.name),
      slug: String(row.slug),
      menu_enabled: published,
      today: Number(row.today),
      last7d: Number(row.last7d),
      last30d: Number(row.last30d),
      total,
      table_today: Number(row.table_today),
      tables_total: Number(row.tables_total ?? 0),
      last_at: row.last_at ? iso(row.last_at) : null,
    };
    stores.push(r);
    sum.today += r.today;
    sum.last7d += r.last7d;
    sum.last30d += r.last30d;
    sum.total += r.total;
    sum.table_today += r.table_today;
  }
  return { day, ...sum, stores };
}
