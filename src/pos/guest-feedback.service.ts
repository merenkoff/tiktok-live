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
/** Dishes one feedback may rate; a bill longer than this is a banquet. */
export const MAX_ITEMS = 30;
/** After paying, how long the table's last bill still counts as «this dinner» (phase F5). */
export const PAID_BILL_GRACE_HOURS = 3;
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

export type DishVerdict = 'up' | 'down';

export interface FeedbackItemInput {
  bill_item_id: number;
  verdict: DishVerdict;
}

export interface FeedbackInput {
  client_uuid: string;
  score: number;
  tags: FeedbackTag[];
  comment: string | null;
  phone: string | null;
  source: FeedbackSource;
  /** The dishes of the bill the guest rated (phase F5); empty when none offered or ticked. */
  items: FeedbackItemInput[];
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
  const rawItems = body.items === undefined ? [] : body.items;
  if (!Array.isArray(rawItems) || rawItems.length > MAX_ITEMS) throw new GuestFeedbackError('Забагато страв');
  const items: FeedbackItemInput[] = [];
  for (const item of rawItems) {
    if (!isPlainObject(item)) throw new GuestFeedbackError('Страва не читається');
    const id = item.bill_item_id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new GuestFeedbackError('Страва не читається');
    if (item.verdict !== 'up' && item.verdict !== 'down') throw new GuestFeedbackError('Оцінка страви — 👍 або 👎');
    // The last word on a dish wins: a changed mind is not two rows.
    const existing = items.find((it) => it.bill_item_id === id);
    if (existing) existing.verdict = item.verdict;
    else items.push({ bill_item_id: id, verdict: item.verdict });
  }
  const bot = typeof body.website === 'string' && body.website.trim() !== '';
  return { client_uuid: uuid, score, tags, comment, phone, source, items, bot };
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
 * The bill this feedback is about: the table's open one, or the one paid in
 * the last PAID_BILL_GRACE_HOURS — a guest rates the dinner after paying for
 * it, and by then the bill is `paid`. Null when the table has neither.
 */
export async function billForFeedback(storeId: number, tableId: number): Promise<number | null> {
  const result = await pool.query(
    `SELECT id FROM pos_bills
      WHERE store_id = $1 AND table_id = $2
        AND (status = 'open' OR (status = 'paid' AND closed_at > NOW() - ($3::int * INTERVAL '1 hour')))
      ORDER BY (status = 'open') DESC, closed_at DESC NULLS FIRST, id DESC
      LIMIT 1`,
    [storeId, tableId, PAID_BILL_GRACE_HOURS]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

/** A dish as the feedback sheet lists it: the name and its size/answers, nothing of the price. */
export interface FeedbackDish {
  bill_item_id: number;
  name: string;
  /** «M · вівсяне», or empty. */
  caption: string;
}

/**
 * The dishes a guest at `table` may rate: the fired lines of the bill this
 * feedback would attach (`billForFeedback`), in the bill's order. Names only
 * — the bill's prices stay behind the owner's bill switch (phase Q5).
 */
export async function listFeedbackDishes(storeId: number, table: MenuTable): Promise<{ bill: boolean; dishes: FeedbackDish[] }> {
  const billId = await billForFeedback(storeId, table.id);
  if (billId === null) return { bill: false, dishes: [] };
  const result = await pool.query(
    `SELECT i.id, i.product_name, i.variant_label
       FROM pos_bill_items i
       JOIN pos_bill_rounds r ON r.id = i.round_id AND r.cancelled_at IS NULL
      WHERE i.bill_id = $1
      ORDER BY i.sort_order ASC, i.id ASC`,
    [billId]
  );
  return {
    bill: true,
    dishes: result.rows.map((row) => ({
      bill_item_id: Number(row.id),
      name: String(row.product_name ?? ''),
      caption: String(row.variant_label ?? ''),
    })),
  };
}

/** The snapshot an item row keeps: «Латте · M». */
function dishText(name: unknown, caption: unknown): string {
  const n = String(name ?? '').trim();
  const c = String(caption ?? '').trim();
  return c ? `${n} · ${c}` : n;
}

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
  const billId = table ? await billForFeedback(storeId, table.id) : null;
  // A dish may be rated only off THIS bill: the page offered the list, so a
  // foreign id is a forged request, not a slip — refused in words, nothing written.
  const dishes = new Map<number, string>();
  if (input.items.length > 0) {
    if (billId === null) throw new GuestFeedbackError('Страви можна оцінити лише з рахунку вашого столу');
    const lines = await pool.query(
      `SELECT i.id, i.product_name, i.variant_label FROM pos_bill_items i
        WHERE i.bill_id = $1 AND i.round_id IS NOT NULL AND i.id = ANY($2::bigint[])`,
      [billId, input.items.map((it) => it.bill_item_id)]
    );
    for (const row of lines.rows) dishes.set(Number(row.id), dishText(row.product_name, row.variant_label));
    if (input.items.some((it) => !dishes.has(it.bill_item_id))) {
      throw new GuestFeedbackError('Страви можна оцінити лише з рахунку вашого столу');
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO pos_guest_feedback (store_id, table_id, bill_id, client_uuid, score, tags, comment, phone, source)
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9)
       ON CONFLICT (store_id, client_uuid) DO NOTHING
       RETURNING id, client_uuid, score, created_at`,
      [storeId, table?.id ?? null, billId, input.client_uuid, input.score, input.tags, input.comment, input.phone, input.source]
    );
    if (!inserted.rows[0]) {
      await client.query('ROLLBACK');
      // Lost a race with the same phone's retry: theirs is the row.
      const again = await pool.query(
        `SELECT client_uuid, score, created_at FROM pos_guest_feedback WHERE store_id = $1 AND client_uuid = $2`,
        [storeId, input.client_uuid]
      );
      return { view: toView(again.rows[0]), created: false };
    }
    const feedbackId = Number(inserted.rows[0].id);
    for (const item of input.items) {
      await client.query(
        `INSERT INTO pos_guest_feedback_items (feedback_id, bill_item_id, product_name, verdict) VALUES ($1, $2, $3, $4)`,
        [feedbackId, item.bill_item_id, dishes.get(item.bill_item_id), item.verdict]
      );
    }
    await client.query('COMMIT');
    commit();
    return { view: toView(inserted.rows[0]), created: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

// ── the waiter (phase F6) ───────────────────────────────────────────

/** How long a low score from a table is worth a waiter's walk: the guest is likely still sitting there. */
export const LOW_SCORE_WINDOW_MINUTES = 30;
export const LOW_SCORE_MAX = 3;

/**
 * A low score from a keyed table, as the hall map shows it beside the calls
 * (Toast's idea: fix it while the guest is still in the room). No phone here —
 * that is the owner's — and no uuid.
 */
export interface LowFeedbackNotice {
  id: number;
  score: number;
  score_word: string;
  tag_labels: string[];
  comment: string | null;
  table_id: number;
  table_name: string;
  hall_name: string;
  created_at: string;
  has_open_bill: boolean;
}

/**
 * Scores of LOW_SCORE_MAX or less from a table, within LOW_SCORE_WINDOW_MINUTES
 * and not yet marked handled — by the owner or by a waiter's «Бачу». Oldest
 * first, like the calls. One table's when `tableId` is given.
 */
export async function listLowFeedback(storeId: number, tableId?: number): Promise<LowFeedbackNotice[]> {
  const result = await pool.query(
    `SELECT f.id, f.score, f.tags, f.comment, f.table_id, f.created_at, t.name AS table_name, h.name AS hall_name,
            EXISTS (SELECT 1 FROM pos_bills b WHERE b.store_id = f.store_id AND b.table_id = f.table_id AND b.status = 'open') AS has_open_bill
       FROM pos_guest_feedback f
       JOIN pos_tables t ON t.id = f.table_id
       JOIN pos_halls h ON h.id = t.hall_id
      WHERE f.store_id = $1 AND f.score <= $2 AND f.handled_at IS NULL
        AND f.created_at > NOW() - ($3::int * INTERVAL '1 minute')
        AND ($4::bigint IS NULL OR f.table_id = $4)
      ORDER BY f.created_at ASC, f.id ASC`,
    [storeId, LOW_SCORE_MAX, LOW_SCORE_WINDOW_MINUTES, tableId ?? null]
  );
  return result.rows.map((row) => {
    const tags = (Array.isArray(row.tags) ? (row.tags as string[]) : []).filter((tag): tag is FeedbackTag => tag in FEEDBACK_TAGS);
    const score = Number(row.score);
    return {
      id: Number(row.id),
      score,
      score_word: FACE_WORDS[score as 1 | 2 | 3 | 4 | 5] ?? '',
      tag_labels: tags.map((tag) => FEEDBACK_TAGS[tag]),
      comment: typeof row.comment === 'string' ? row.comment : null,
      table_id: Number(row.table_id),
      table_name: String(row.table_name),
      hall_name: String(row.hall_name),
      created_at: new Date(row.created_at as string).toISOString(),
      has_open_bill: row.has_open_bill === true,
    };
  });
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
  /** The dishes of the bill the guest rated (F5), in the bill's order. */
  items: Array<{ name: string; verdict: DishVerdict }>;
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
    items: [],
  };
}

/** The rated dishes of these feedbacks, put onto their rows. */
async function attachItems(rows: FeedbackRow[]): Promise<FeedbackRow[]> {
  if (rows.length === 0) return rows;
  const result = await pool.query(
    `SELECT feedback_id, product_name, verdict FROM pos_guest_feedback_items
      WHERE feedback_id = ANY($1::bigint[]) ORDER BY id ASC`,
    [rows.map((row) => row.id)]
  );
  const byFeedback = new Map<number, FeedbackRow['items']>();
  for (const row of result.rows) {
    const id = Number(row.feedback_id);
    byFeedback.set(id, [
      ...(byFeedback.get(id) ?? []),
      { name: String(row.product_name), verdict: row.verdict === 'down' ? 'down' : 'up' },
    ]);
  }
  return rows.map((row) => ({ ...row, items: byFeedback.get(row.id) ?? [] }));
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
  return { rows: await attachItems(result.rows.map(toRow)), total: Number(total.rows[0].n), from, to };
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
  return result.rows[0] ? (await attachItems([toRow(result.rows[0])]))[0]! : null;
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
  /** Dishes rated in the window, the most disliked first (F5); empty when none was rated. */
  dishes: Array<{ name: string; up: number; down: number }>;
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
  const dishes = await pool.query(
    `SELECT it.product_name AS name,
            count(*) FILTER (WHERE it.verdict = 'up')::int AS up,
            count(*) FILTER (WHERE it.verdict = 'down')::int AS down
       FROM pos_guest_feedback_items it
       JOIN pos_guest_feedback f ON f.id = it.feedback_id
      WHERE ${scope}
      GROUP BY it.product_name
      ORDER BY down DESC, up DESC, name ASC
      LIMIT 8`,
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
    dishes: dishes.rows.map((row) => ({ name: String(row.name), up: Number(row.up), down: Number(row.down) })),
  };
}
