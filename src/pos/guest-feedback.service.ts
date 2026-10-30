// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/guest-feedback.service.ts — a guest's feedback from the QR menu
// (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F3; migration 084).
//
// One tap on a face is already feedback. What went well or wrong (chips from
// a fixed dictionary), a few words and a phone are optional. It acts on
// nothing — no bill, no stock, no kitchen — so unlike the bill, the orders
// and the calls it needs NO table key: a guest at the counter may leave one
// from the venue's QR. A table (and its open bill) is attached only when the
// QR proved them, and that is what later lets the owner see «стіл 5 оцінив
// на 2» while the guest is still sitting there.
//
// Rules that are easy to get wrong:
//
// - The guest side is unauthenticated and a QR is a photograph, so the body
//   is capped (the route), every chip is checked against the dictionary, the
//   comment is cut to COMMENT_MAX, and the volume is bounded in memory per
//   table and per store (the API runs one replica, POS_SINGLE_INSTANCE.md;
//   there is no usable IP behind Railway's proxy).
// - Idempotent on `client_uuid`: a retried POST answers with the same row and
//   never writes a second feedback.
// - A honeypot field (`website`) that a person never sees: filled in, the
//   request is answered as if accepted and nothing is written.
// - The phone is personal data offered for a call-back; `wipeGuestFeedbackPhones`
//   clears it after PHONE_RETENTION_DAYS and keeps the feedback.

import { pool } from '../db.js';
import type { MenuTable } from './public-menu/menu.service.js';
import { multiLine, normalizePhone, ProfileError } from './public-menu/profile.js';

export class GuestFeedbackError extends Error {}
/** 429: too much from one table or one store in the window. */
export class GuestFeedbackTooMany extends GuestFeedbackError {}
/** 404: no such feedback of this store. */
export class GuestFeedbackNotFound extends GuestFeedbackError {}

// ── the dictionary ──────────────────────────────────────────────────

/** Every chip a guest may tick, by code — the page prints these words, the row keeps the codes. */
export const FEEDBACK_TAGS = {
  food: 'Страви',
  service: 'Обслуговування',
  speed: 'Швидкість',
  atmosphere: 'Атмосфера',
  prices: 'Ціни',
  wait: 'Довго чекали',
  food_wrong: 'Страва холодна або не та',
  clean: 'Чистота',
  noise: 'Шум',
  other: 'Інше',
} as const;
export type FeedbackTag = keyof typeof FEEDBACK_TAGS;

/** What the page offers after a 4 or 5 («Що сподобалось?»)… */
export const GOOD_TAGS: readonly FeedbackTag[] = ['food', 'service', 'speed', 'atmosphere', 'prices'];
/** …and after a 1, 2 or 3 («Що пішло не так?») — the cause, not just the score. */
export const BAD_TAGS: readonly FeedbackTag[] = ['wait', 'food_wrong', 'service', 'clean', 'noise', 'prices', 'other'];

export type FeedbackSource = 'menu' | 'bill';

// ── limits ──────────────────────────────────────────────────────────

export const COMMENT_MAX = 600;
export const MAX_TAGS = 8;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const PHONE_RETENTION_DAYS = 90;

const limits = { perTable: 3, perStore: 60 };
/** Test seam: smaller windows than sixty real requests. */
export function setGuestFeedbackLimitsForTests(next: Partial<typeof limits>): void {
  Object.assign(limits, next);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recent = new Map<string, number[]>();

/** Test seam: forget who wrote how often, and the default limits. */
export function resetGuestFeedbackLimits(): void {
  recent.clear();
  limits.perTable = 3;
  limits.perStore = 60;
}

function fresh(key: string, now: number): number[] {
  const list = (recent.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  recent.set(key, list);
  return list;
}

/**
 * Count one new feedback against the table's and the store's hour; throws
 * when either is full. The venue's QR (no table) counts against the store
 * only. Checked BEFORE the uuid lookup, so a retry of the same feedback does
 * not spend a slot either way: the slot is taken only once the row is new.
 */
function takeRateSlots(storeId: number, tableId: number | null, now = Date.now()): () => void {
  const storeKey = `s:${storeId}`;
  const tableKey = tableId == null ? null : `t:${storeId}:${tableId}`;
  if (tableKey && fresh(tableKey, now).length >= limits.perTable) {
    throw new GuestFeedbackTooMany('З цього столу вже є кілька відгуків за останню годину — дякуємо, нам досить');
  }
  if (fresh(storeKey, now).length >= limits.perStore) {
    throw new GuestFeedbackTooMany('Зараз надходить забагато відгуків — спробуйте трохи пізніше');
  }
  return () => {
    fresh(storeKey, now).push(now);
    if (tableKey) fresh(tableKey, now).push(now);
  };
}

// ── shapes ──────────────────────────────────────────────────────────

export interface FeedbackInput {
  client_uuid: string;
  score: number;
  tags: FeedbackTag[];
  comment: string | null;
  phone: string | null;
  source: FeedbackSource;
  /** The honeypot was filled in: answer yes, write nothing. */
  bot: boolean;
}

/** What the guest's phone is told about its own feedback. Nothing of anyone else's. */
export interface GuestFeedbackView {
  uuid: string;
  score: number;
  created_at: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The body as the page sends it, checked field by field; one bad field refuses the whole thing. */
export function normalizeFeedback(body: unknown): FeedbackInput {
  if (!isPlainObject(body)) throw new GuestFeedbackError('Очікується відгук');
  const uuid = typeof body.client_uuid === 'string' ? body.client_uuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(uuid)) throw new GuestFeedbackError('client_uuid має бути UUID');
  const score = body.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
    throw new GuestFeedbackError('Оцінка — від 1 до 5');
  }
  const rawTags = body.tags === undefined ? [] : body.tags;
  if (!Array.isArray(rawTags) || rawTags.length > MAX_TAGS) throw new GuestFeedbackError('Забагато позначок');
  const tags: FeedbackTag[] = [];
  for (const tag of rawTags) {
    if (typeof tag !== 'string' || !(tag in FEEDBACK_TAGS)) throw new GuestFeedbackError('Невідома позначка');
    if (!tags.includes(tag as FeedbackTag)) tags.push(tag as FeedbackTag);
  }
  let comment: string | null = null;
  if (body.comment != null) {
    if (typeof body.comment !== 'string') throw new GuestFeedbackError('Коментар має бути текстом');
    const text = multiLine(body.comment);
    if (text.length > COMMENT_MAX) throw new GuestFeedbackError(`Коментар задовгий: не більше ${COMMENT_MAX} символів`);
    comment = text || null;
  }
  let phone: string | null = null;
  if (body.phone != null) {
    try {
      phone = normalizePhone(body.phone);
    } catch (error) {
      throw new GuestFeedbackError(error instanceof ProfileError ? error.message : 'Телефон не читається');
    }
  }
  const source: FeedbackSource = body.source === 'bill' ? 'bill' : 'menu';
  const bot = typeof body.website === 'string' && body.website.trim() !== '';
  return { client_uuid: uuid, score, tags, comment, phone, source, bot };
}

function toView(row: Record<string, unknown>): GuestFeedbackView {
  return {
    uuid: String(row.client_uuid),
    score: Number(row.score),
    created_at: new Date(row.created_at as string).toISOString(),
  };
}

// ── the guest ───────────────────────────────────────────────────────

/**
 * Write the feedback, or hand back the one this uuid already wrote. The
 * table's open bill is attached when there is one, so phase F5 can rate its
 * dishes and the owner can see which dinner this was about.
 */
export async function createFeedback(
  storeId: number,
  table: MenuTable | null,
  body: unknown
): Promise<{ view: GuestFeedbackView; created: boolean }> {
  const input = normalizeFeedback(body);
  if (input.bot) {
    // A form field no person sees was filled in: say yes — exactly as to a
    // new feedback, so a script learns nothing — and write nothing.
    return { view: { uuid: input.client_uuid, score: input.score, created_at: new Date().toISOString() }, created: true };
  }
  const existing = await pool.query(
    `SELECT client_uuid, score, created_at FROM pos_guest_feedback WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, input.client_uuid]
  );
  if (existing.rows[0]) return { view: toView(existing.rows[0]), created: false };
  const commit = takeRateSlots(storeId, table?.id ?? null);
  let billId: number | null = null;
  if (table) {
    const bill = await pool.query(
      `SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2 AND status = 'open' ORDER BY id DESC LIMIT 1`,
      [storeId, table.id]
    );
    billId = bill.rows[0] ? Number(bill.rows[0].id) : null;
  }
  const inserted = await pool.query(
    `INSERT INTO pos_guest_feedback (store_id, table_id, bill_id, client_uuid, score, tags, comment, phone, source)
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9)
     ON CONFLICT (store_id, client_uuid) DO NOTHING
     RETURNING client_uuid, score, created_at`,
    [storeId, table?.id ?? null, billId, input.client_uuid, input.score, input.tags, input.comment, input.phone, input.source]
  );
  if (!inserted.rows[0]) {
    // Lost a race with the same phone's retry: theirs is the row.
    const again = await pool.query(
      `SELECT client_uuid, score, created_at FROM pos_guest_feedback WHERE store_id = $1 AND client_uuid = $2`,
      [storeId, input.client_uuid]
    );
    return { view: toView(again.rows[0]), created: false };
  }
  commit();
  return { view: toView(inserted.rows[0]), created: true };
}

/** The guest's own feedback, by the uuid their phone kept — or null. */
export async function getOwnFeedback(storeId: number, uuid: unknown): Promise<GuestFeedbackView | null> {
  if (typeof uuid !== 'string' || !UUID_RE.test(uuid)) return null;
  const result = await pool.query(
    `SELECT client_uuid, score, created_at FROM pos_guest_feedback WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, uuid.toLowerCase()]
  );
  return result.rows[0] ? toView(result.rows[0]) : null;
}

// ── housekeeping ────────────────────────────────────────────────────

/** Clear the phones guests left more than `days` ago; the feedback stays. Returns how many rows changed. */
export async function wipeGuestFeedbackPhones(days = PHONE_RETENTION_DAYS): Promise<number> {
  const result = await pool.query(
    `UPDATE pos_guest_feedback SET phone = NULL
      WHERE phone IS NOT NULL AND created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );
  return result.rowCount ?? 0;
}

// ── the owner (phase F4) ────────────────────────────────────────────

export const FACE_WORDS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Погано',
  2: 'Так собі',
  3: 'Нормально',
  4: 'Добре',
  5: 'Чудово',
};

/** One feedback as the owner's screen reads it: the guest's words, the table, the bill, who handled it. */
export interface FeedbackRow {
  id: number;
  score: number;
  tags: FeedbackTag[];
  tag_labels: string[];
  comment: string | null;
  /** The guest's call-back phone, owner-only; null once wiped (PHONE_RETENTION_DAYS). */
  phone: string | null;
  source: FeedbackSource;
  created_at: string;
  table: { id: number; name: string; hall: string } | null;
  bill_no: number | null;
  handled_at: string | null;
  handled_by: string | null;
}

export interface FeedbackListQuery {
  /** Store-local days, inclusive; default the last 30 days up to today. */
  from?: string;
  to?: string;
  score?: number;
  /** true = handled only, false = waiting only, undefined = all. */
  handled?: boolean;
  limit?: number;
  offset?: number;
}

export const LIST_LIMIT_DEFAULT = 30;
export const LIST_LIMIT_MAX = 100;
export const SUMMARY_DAYS_DEFAULT = 30;

function toRow(row: Record<string, unknown>): FeedbackRow {
  const tags = (Array.isArray(row.tags) ? (row.tags as string[]) : []).filter(
    (tag): tag is FeedbackTag => tag in FEEDBACK_TAGS
  );
  return {
    id: Number(row.id),
    score: Number(row.score),
    tags,
    tag_labels: tags.map((tag) => FEEDBACK_TAGS[tag]),
    comment: typeof row.comment === 'string' ? row.comment : null,
    phone: typeof row.phone === 'string' ? row.phone : null,
    source: row.source === 'bill' ? 'bill' : 'menu',
    created_at: new Date(row.created_at as string).toISOString(),
    table:
      row.table_id == null
        ? null
        : { id: Number(row.table_id), name: String(row.table_name ?? ''), hall: String(row.hall_name ?? '') },
    bill_no: row.bill_no == null ? null : Number(row.bill_no),
    handled_at: row.handled_at == null ? null : new Date(row.handled_at as string).toISOString(),
    handled_by: typeof row.handled_by_name === 'string' ? row.handled_by_name : null,
  };
}

const ROW_SELECT = `
  SELECT f.id, f.score, f.tags, f.comment, f.phone, f.source, f.created_at, f.handled_at,
         f.table_id, t.name AS table_name, h.name AS hall_name,
         b.bill_no, s.display_name AS handled_by_name
    FROM pos_guest_feedback f
    LEFT JOIN pos_tables t ON t.id = f.table_id
    LEFT JOIN pos_halls h ON h.id = t.hall_id
    LEFT JOIN pos_bills b ON b.id = f.bill_id
    LEFT JOIN pos_staff s ON s.id = f.handled_by`;

/** The store's calendar, so «last 30 days» ends on the owner's today, not the server's. */
async function storeZone(storeId: number): Promise<string> {
  const result = await pool.query(`SELECT timezone FROM pos_stores WHERE id = $1`, [storeId]);
  return typeof result.rows[0]?.timezone === 'string' ? result.rows[0].timezone : 'Europe/Kyiv';
}

/**
 * The window in the store's days: explicit bounds, or the last SUMMARY_DAYS_DEFAULT
 * days up to today. Computed in Postgres with the store's zone, the way the
 * analytics windows are.
 */
async function windowOf(storeId: number, from?: string, to?: string): Promise<{ from: string; to: string; zone: string }> {
  const zone = await storeZone(storeId);
  const result = await pool.query(
    `SELECT COALESCE($2::date, COALESCE($3::date, (NOW() AT TIME ZONE $1)::date) - ($4::int - 1))::text AS from_day,
            COALESCE($3::date, (NOW() AT TIME ZONE $1)::date)::text AS to_day`,
    [zone, from ?? null, to ?? null, SUMMARY_DAYS_DEFAULT]
  );
  return { from: String(result.rows[0].from_day), to: String(result.rows[0].to_day), zone };
}

/** The owner's list, newest first, with the total behind it for «Показати ще». */
export async function listFeedback(
  storeId: number,
  query: FeedbackListQuery = {}
): Promise<{ rows: FeedbackRow[]; total: number; from: string; to: string }> {
  const { from, to, zone } = await windowOf(storeId, query.from, query.to);
  const limit = Math.min(Math.max(1, Math.trunc(query.limit ?? LIST_LIMIT_DEFAULT)), LIST_LIMIT_MAX);
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const where = [`f.store_id = $1`, `(f.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`];
  const values: unknown[] = [storeId, zone, from, to];
  if (query.score !== undefined) {
    values.push(query.score);
    where.push(`f.score = $${values.length}`);
  }
  if (query.handled === true) where.push(`f.handled_at IS NOT NULL`);
  if (query.handled === false) where.push(`f.handled_at IS NULL`);
  const total = await pool.query(`SELECT count(*)::int AS n FROM pos_guest_feedback f WHERE ${where.join(' AND ')}`, values);
  values.push(limit, offset);
  const result = await pool.query(
    `${ROW_SELECT} WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC, f.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return { rows: result.rows.map(toRow), total: Number(total.rows[0].n), from, to };
}

/** «Опрацьовано» — or back to waiting. Null for a feedback that is not this store's. */
export async function setFeedbackHandled(
  storeId: number,
  id: number,
  staffId: number,
  handled: boolean
): Promise<FeedbackRow | null> {
  const updated = await pool.query(
    `UPDATE pos_guest_feedback
        SET handled_at = CASE WHEN $3 THEN COALESCE(handled_at, NOW()) ELSE NULL END,
            handled_by = CASE WHEN $3 THEN COALESCE(handled_by, $4::bigint) ELSE NULL END
      WHERE store_id = $1 AND id = $2
      RETURNING id`,
    [storeId, id, handled, staffId]
  );
  if (!updated.rows[0]) return null;
  const result = await pool.query(`${ROW_SELECT} WHERE f.store_id = $1 AND f.id = $2`, [storeId, id]);
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export interface FeedbackSummary {
  from: string;
  to: string;
  count: number;
  /** Mean score with one decimal, or null with no feedback. */
  average: number | null;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** The chips ticked most, with their counts, most first. */
  tags: Array<{ code: FeedbackTag; label: string; count: number }>;
  /** Low scores (1–3) nobody has marked handled yet — the ones to act on. */
  unhandled_low: number;
  /** The newest few with words, for the dashboard tile. */
  latest: Array<{ id: number; score: number; comment: string | null; created_at: string }>;
}

/** The figures the dashboard tile and the page's head read. Arithmetic, not a recommendation. */
export async function feedbackSummary(
  storeId: number,
  query: { from?: string; to?: string } = {}
): Promise<FeedbackSummary> {
  const { from, to, zone } = await windowOf(storeId, query.from, query.to);
  const scope = `f.store_id = $1 AND (f.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`;
  const values = [storeId, zone, from, to];
  const totals = await pool.query(
    `SELECT count(*)::int AS n,
            ROUND(AVG(f.score)::numeric, 1)::float AS average,
            count(*) FILTER (WHERE f.score = 1)::int AS s1,
            count(*) FILTER (WHERE f.score = 2)::int AS s2,
            count(*) FILTER (WHERE f.score = 3)::int AS s3,
            count(*) FILTER (WHERE f.score = 4)::int AS s4,
            count(*) FILTER (WHERE f.score = 5)::int AS s5,
            count(*) FILTER (WHERE f.score <= 3 AND f.handled_at IS NULL)::int AS unhandled_low
       FROM pos_guest_feedback f WHERE ${scope}`,
    values
  );
  const t = totals.rows[0];
  const tags = await pool.query(
    `SELECT tag, count(*)::int AS n
       FROM pos_guest_feedback f, unnest(f.tags) AS tag
      WHERE ${scope}
      GROUP BY tag ORDER BY n DESC, tag LIMIT 6`,
    values
  );
  const latest = await pool.query(
    `SELECT f.id, f.score, f.comment, f.created_at FROM pos_guest_feedback f
      WHERE ${scope} AND f.comment IS NOT NULL
      ORDER BY f.created_at DESC, f.id DESC LIMIT 3`,
    values
  );
  return {
    from,
    to,
    count: Number(t.n),
    average: t.average == null ? null : Number(t.average),
    distribution: { '1': Number(t.s1), '2': Number(t.s2), '3': Number(t.s3), '4': Number(t.s4), '5': Number(t.s5) },
    tags: tags.rows
      .filter((row) => row.tag in FEEDBACK_TAGS)
      .map((row) => ({ code: row.tag as FeedbackTag, label: FEEDBACK_TAGS[row.tag as FeedbackTag], count: Number(row.n) })),
    unhandled_low: Number(t.unhandled_low),
    latest: latest.rows.map((row) => ({
      id: Number(row.id),
      score: Number(row.score),
      comment: typeof row.comment === 'string' ? row.comment : null,
      created_at: new Date(row.created_at as string).toISOString(),
    })),
  };
}
