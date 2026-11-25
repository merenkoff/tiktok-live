// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/remote-kitchen.service.ts — «Віддалена кухня» (migration 117,
// TechDocs/POS_REMOTE_KITCHEN.md, phase РК1).
//
// A cafe till asks another store's kitchen how long dishes will take. The
// kitchen names a time, or the link's own rule does (auto-confirm, §7.2), or
// the cashier writes down what the kitchen said on the phone (§8). The guest
// agrees or does not; when they agree the cafe sells as usual and tells this
// file which sale paid, and only then does the kitchen's stock move and the
// order get its number. Then: ready → dispatched → arrived → handed over.
//
// Two stores look at one row, so every function takes the CALLER's store and
// checks which side of the order that store is on. An order the caller is on
// neither side of does not exist for them (404), the same as a wrong id.
//
// Rules the owner fixed (§14):
//   П1 one ФОП: no transfer document between the stores, only an internal report.
//   П2 payment right after the guest agrees: `markPaid` is the gate to cooking.
//   П3 silence for `answer_seconds` (60 by default, set in the admin): the till
//      offers the kitchen's phone and «Записати час з телефону»; there is no
//      sale on an estimate.
//   П4 auto-confirm up to `auto_confirm_max_min` (40 by default).
//   П6 transit is fixed per link.
//
// Expiry is read-time, as everywhere here: a named time that nobody used
// becomes `expired` the next time anyone reads the order.

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { consumeStockForLine, returnStockForLine } from './composites.service.js';
import { createProductInTx } from './products.service.js';
import { applyStockDelta } from './stock.service.js';
import { dailyCounterKey, nextCounterValue } from './core/counters.js';
import { storeClock } from './core/storeClock.js';
import { sqlMilliToCents } from './cost.js';
import { verticalOrDefault } from './verticals/index.js';
import type { LineModifierSnapshot } from './modifiers.service.js';
import { queueRemoteCancelTx, queueRemoteFireTx } from './remote-kitchen-print.service.js';

type DbClient = { query: typeof pool.query };

export class RemoteKitchenError extends Error {}
export class RemoteKitchenNotFound extends RemoteKitchenError {}
/** 409: the order (or the link) is no longer in a state that allows this. */
export class RemoteKitchenConflict extends RemoteKitchenError {}
/** 409 on one line: the cashier can ask again without it. */
export class RemoteKitchenLineProblem extends RemoteKitchenConflict {
  constructor(
    message: string,
    readonly cafeVariantId: number,
    readonly problem: 'stop' | 'unavailable' | 'not_linked'
  ) {
    super(message);
  }
}
/** 409: the kitchen is on pause. Carries the phone so the till can offer it (§8). */
export class RemoteKitchenPaused extends RemoteKitchenConflict {
  constructor(
    message: string,
    readonly kitchenPhone: string | null
  ) {
    super(message);
  }
}

// ── limits ──────────────────────────────────────────────────────────

export const MAX_ITEMS = 30;
export const MAX_QUANTITY = 50;
/** Longest time anyone may name, kitchen or phone. */
export const MAX_MINUTES = 240;
export const MAX_DELAY_MINUTES = 120;
/**
 * How far past its promise an order may be before the cafe may say it came
 * although the kitchen never tapped «Готово» or «Видано» (РК5): a kitchen
 * that forgets must not leave the order over every cafe screen for good, and
 * before this a mistaken tap would take the card off the board while the
 * pizza is still in the oven. The till holds the same figure.
 */
export const LATE_ARRIVAL_MINUTES = 20;
/** How many orders one screen reads at most. */
export const ORDER_LIST_LIMIT = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Statuses in which the order is still going somewhere. */
export const LIVE_STATUSES = ['requested', 'quoted', 'paid', 'cooking', 'ready', 'dispatched', 'arrived'] as const;
/** Before payment: the cashier may still change the cart or let the guest go. */
const PRE_PAY = ['requested', 'quoted', 'expired', 'declined'] as const;

export type RemoteOrderStatus =
  | 'requested'
  | 'quoted'
  | 'declined'
  | 'expired'
  | 'guest_declined'
  | 'paid'
  | 'cooking'
  | 'ready'
  | 'dispatched'
  | 'arrived'
  | 'handed_over'
  | 'cancelled';

// ── shapes ──────────────────────────────────────────────────────────

export interface KitchenLink {
  id: number;
  cafe_store_id: number;
  kitchen_store_id: number;
  status: 'active' | 'paused' | 'revoked';
  kitchen_title: string;
  kitchen_phone: string | null;
  transit_minutes: number;
  answer_seconds: number;
  quote_ttl_seconds: number;
  auto_confirm_max_min: number | null;
}

export interface KitchenStatusView {
  accepting: boolean;
  paused_until: string | null;
  load_minutes: number;
}

export interface RemoteOrderItemView {
  id: number;
  cafe_variant_id: number;
  kitchen_variant_id: number;
  quantity: number;
  product_name: string;
  variant_label: string;
  modifiers: unknown[];
  note: string;
  problem: 'stop' | 'unavailable' | null;
}

export interface RemoteOrderView {
  id: number;
  link_id: number;
  cafe_store_id: number;
  kitchen_store_id: number;
  /** Which side the caller is on. */
  side: 'cafe' | 'kitchen';
  /** The other side's name, as each screen titles the order. */
  kitchen_title: string;
  cafe_name: string;
  client_uuid: string;
  revision: number;
  status: RemoteOrderStatus;
  quote_source: 'kitchen' | 'auto' | 'phone' | null;
  prep_minutes: number | null;
  load_minutes: number | null;
  transit_minutes: number | null;
  suggested_minutes: number | null;
  quoted_minutes: number | null;
  promised_at: string | null;
  answer_deadline_at: string | null;
  /** True once the kitchen is past its time to answer: the till offers the phone. */
  answer_overdue: boolean;
  quote_expires_at: string | null;
  decline_reason: string | null;
  order_no: number | null;
  guest_label: string | null;
  note: string | null;
  cafe_sale_id: number | null;
  /**
   * The number of the cafe's receipt that paid the order — only to the cafe
   * (the kitchen has no business with another store's receipts): its tracker
   * names the receipt a kitchen's cancel is to be refunded from (РК5).
   */
  cafe_receipt_number: string | null;
  fulfilment: 'to_store' | 'delivery';
  kitchen_phone: string | null;
  requested_at: string;
  quoted_at: string | null;
  paid_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  arrived_at: string | null;
  handed_at: string | null;
  closed_at: string | null;
  /** Which side cancelled a paid order (migration 118); null for anything else. */
  cancelled_by: 'cafe' | 'kitchen' | null;
  /** When the cafe's till said the guest got the money back for a kitchen's cancel. */
  cancel_seen_at: string | null;
  /** Every «+N хв» the kitchen gave, summed: the cafe says the pizza is late by this much. */
  delayed_minutes: number;
  items: RemoteOrderItemView[];
}

export interface RemoteLineInput {
  variant_id?: unknown;
  quantity?: unknown;
  modifiers?: unknown;
  note?: unknown;
}

export interface CreateRemoteOrderInput {
  client_uuid?: unknown;
  items?: unknown;
  guest_label?: unknown;
  note?: unknown;
}

export interface Actor {
  storeId: number;
  staffId: number;
}

// ── small helpers ───────────────────────────────────────────────────

function isoOrNull(value: unknown): string | null {
  return value == null ? null : new Date(value as string).toISOString();
}

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

/** Every promised time is rounded UP to five minutes: «буде о 19:40», never 19:37. */
export function roundUpToFive(minutes: number): number {
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new RemoteKitchenError('Некоректний текст');
  const text = raw.trim().slice(0, max);
  return text === '' ? null : text;
}

function minutesOf(raw: unknown, label: string, max = MAX_MINUTES): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RemoteKitchenError(`${label}: ціле число хвилин від 1 до ${max}`);
  }
  return value;
}

function linkOf(row: Record<string, unknown>): KitchenLink {
  return {
    id: Number(row.id),
    cafe_store_id: Number(row.cafe_store_id),
    kitchen_store_id: Number(row.kitchen_store_id),
    status: row.status as KitchenLink['status'],
    kitchen_title: String(row.kitchen_title),
    kitchen_phone: row.kitchen_phone == null ? null : String(row.kitchen_phone),
    transit_minutes: Number(row.transit_minutes),
    answer_seconds: Number(row.answer_seconds),
    quote_ttl_seconds: Number(row.quote_ttl_seconds),
    auto_confirm_max_min: numOrNull(row.auto_confirm_max_min),
  };
}

async function logEvent(
  client: DbClient,
  orderId: number,
  actor: { storeId: number | null; staffId: number | null },
  kind: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const sides = await client.query(
    `WITH e AS (
       INSERT INTO pos_remote_order_events (remote_order_id, actor_store_id, actor_staff_id, kind, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
     )
     SELECT cafe_store_id, kitchen_store_id FROM pos_remote_orders WHERE id = $1`,
    [orderId, actor.storeId, actor.staffId, kind, JSON.stringify(payload)]
  );
  const row = sides.rows[0];
  if (row) nudge([Number(row.cafe_store_id), Number(row.kitchen_store_id)]);
}

// ── long-poll (§8, РК4) ─────────────────────────────────────────────
//
// Every event wakes the screens of both stores that wait on a change. The
// wake is only a hint — it may come before the change commits, from another
// transaction than ours (the cafe's receipt), or not at all on another
// instance — so a waiting screen re-reads `kitchenCursor` on each wake and
// once a second anyway, and returns as soon as it differs.

const changeWaiters = new Map<number, Set<() => void>>();

function nudge(storeIds: number[]): void {
  for (const id of storeIds) {
    const set = changeWaiters.get(id);
    if (!set) continue;
    changeWaiters.delete(id);
    for (const wake of set) wake();
  }
}

/** The longest a kitchen's screen is held: under the till's 15 s request timeout. */
export const LONG_POLL_MAX_S = 12;
const LONG_POLL_RECHECK_MS = 1000;

/**
 * What the kitchen's list is made of right now, as one string: how many
 * events its orders have and the newest. Any committed change moves it — a
 * count, not only a maximum, so an older transaction committing late counts.
 */
export async function kitchenCursor(kitchenStoreId: number): Promise<string> {
  const row = await pool.query(
    `SELECT COUNT(e.id)::bigint AS n, COALESCE(MAX(e.id), 0)::bigint AS top
       FROM pos_remote_orders o
       JOIN pos_remote_order_events e ON e.remote_order_id = o.id
      WHERE o.kitchen_store_id = $1
        AND (o.status = ANY($2::text[]) OR o.updated_at > NOW() - INTERVAL '3 hours')`,
    [kitchenStoreId, LIVE_STATUSES as unknown as string[]]
  );
  return `${row.rows[0]?.n ?? 0}.${row.rows[0]?.top ?? 0}`;
}

/**
 * Hold a kitchen's read until its list changes from `since`, `seconds` pass,
 * or the screen hangs up. Holds no database connection while it waits.
 */
export async function waitForKitchenChange(
  kitchenStoreId: number,
  since: string,
  seconds: number,
  gone: () => boolean = () => false
): Promise<void> {
  const deadline = Date.now() + Math.min(Math.max(seconds, 0), LONG_POLL_MAX_S) * 1000;
  while (Date.now() < deadline && !gone()) {
    if ((await kitchenCursor(kitchenStoreId)) !== since) return;
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        changeWaiters.get(kitchenStoreId)?.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, Math.min(LONG_POLL_RECHECK_MS, Math.max(0, deadline - Date.now())));
      const set = changeWaiters.get(kitchenStoreId) ?? new Set<() => void>();
      set.add(wake);
      changeWaiters.set(kitchenStoreId, set);
    });
  }
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── links ───────────────────────────────────────────────────────────

/** The cafe's link to its kitchen, if there is one that is not revoked. One kitchen per cafe for now. */
export async function findLinkForCafe(cafeStoreId: number, client: DbClient = pool): Promise<KitchenLink | null> {
  const row = await client.query(
    `SELECT * FROM pos_kitchen_links
      WHERE cafe_store_id = $1 AND status <> 'revoked'
      ORDER BY id ASC LIMIT 1`,
    [cafeStoreId]
  );
  return row.rows[0] ? linkOf(row.rows[0]) : null;
}

/** Links where this store is the kitchen. */
export async function listLinksForKitchen(kitchenStoreId: number): Promise<KitchenLink[]> {
  const rows = await pool.query(
    `SELECT * FROM pos_kitchen_links WHERE kitchen_store_id = $1 AND status <> 'revoked' ORDER BY id`,
    [kitchenStoreId]
  );
  return rows.rows.map(linkOf);
}

export interface StoreLinkView extends KitchenLink {
  cafe_name: string;
  kitchen_name: string;
}

/**
 * Every link this store is either end of, revoked ones included — the
 * super-admin's «Віддалена кухня» block, where a revoked pair is revived by
 * creating it again.
 */
export async function listLinksForStore(storeId: number): Promise<StoreLinkView[]> {
  const rows = await pool.query(
    `SELECT l.*, cs.name AS cafe_name, ks.name AS kitchen_name
       FROM pos_kitchen_links l
       JOIN pos_stores cs ON cs.id = l.cafe_store_id
       JOIN pos_stores ks ON ks.id = l.kitchen_store_id
      WHERE l.cafe_store_id = $1 OR l.kitchen_store_id = $1
      ORDER BY l.id`,
    [storeId]
  );
  return rows.rows.map((row) => ({
    ...linkOf(row),
    cafe_name: String(row.cafe_name),
    kitchen_name: String(row.kitchen_name),
  }));
}

export interface KitchenCafeView {
  link_id: number;
  cafe_name: string;
  status: KitchenLink['status'];
  transit_minutes: number;
  /** The kitchen's own dishes this cafe sells — never the cafe's prices or names. */
  dishes: Array<{
    variant_id: number;
    name: string;
    label: string;
    prep_minutes: number | null;
    /** The median over 14 days (§7.1), once five orders carried the dish; the suggestion uses it. */
    measured_minutes: number | null;
    measured_orders: number;
  }>;
}

/** The kitchen's «Точки»: who may ask it, and which of its dishes each one sells. */
export async function listCafesForKitchen(kitchenStoreId: number): Promise<KitchenCafeView[]> {
  const links = await pool.query(
    `SELECT l.id, l.status, l.transit_minutes, cs.name AS cafe_name
       FROM pos_kitchen_links l JOIN pos_stores cs ON cs.id = l.cafe_store_id
      WHERE l.kitchen_store_id = $1 AND l.status <> 'revoked'
      ORDER BY l.id`,
    [kitchenStoreId]
  );
  if (links.rows.length === 0) return [];
  const dishes = await pool.query(
    `SELECT DISTINCT li.link_id, kv.id AS variant_id, kp.name, kv.label, kp.prep_minutes
       FROM pos_kitchen_link_items li
       JOIN pos_variants kv ON kv.id = li.kitchen_variant_id
       JOIN pos_products kp ON kp.id = kv.product_id
      WHERE li.link_id = ANY($1::bigint[])
      ORDER BY kp.name, kv.label`,
    [links.rows.map((r) => Number(r.id))]
  );
  const measured = await measuredPrep(
    pool,
    kitchenStoreId,
    dishes.rows.map((d) => Number(d.variant_id))
  );
  return links.rows.map((link) => ({
    link_id: Number(link.id),
    cafe_name: String(link.cafe_name),
    status: link.status as KitchenLink['status'],
    transit_minutes: Number(link.transit_minutes),
    dishes: dishes.rows
      .filter((d) => Number(d.link_id) === Number(link.id))
      .map((d) => ({
        variant_id: Number(d.variant_id),
        name: String(d.name),
        label: String(d.label ?? ''),
        prep_minutes: numOrNull(d.prep_minutes),
        measured_minutes: measured.get(Number(d.variant_id))?.minutes ?? null,
        measured_orders: measured.get(Number(d.variant_id))?.orders ?? 0,
      })),
  }));
}

export interface CreateLinkInput {
  cafe_store_id?: unknown;
  kitchen_store_id?: unknown;
  kitchen_title?: unknown;
  kitchen_phone?: unknown;
  transit_minutes?: unknown;
}

/** Super-admin only (the route checks): a cafe may now ask this kitchen. */
export async function createLink(input: CreateLinkInput): Promise<KitchenLink> {
  const cafe = Number(input.cafe_store_id);
  const kitchen = Number(input.kitchen_store_id);
  if (!Number.isInteger(cafe) || cafe < 1 || !Number.isInteger(kitchen) || kitchen < 1) {
    throw new RemoteKitchenError('Вкажіть кафе і кухню');
  }
  if (cafe === kitchen) throw new RemoteKitchenError('Кафе і кухня мають бути різними магазинами');
  const title = cleanText(input.kitchen_title, 80);
  if (!title) throw new RemoteKitchenError('Вкажіть назву кухні, як її бачитиме касир');
  const phone = cleanText(input.kitchen_phone, 32);
  const transit = input.transit_minutes == null ? 10 : Number(input.transit_minutes);
  if (!Number.isInteger(transit) || transit < 0 || transit > 240) {
    throw new RemoteKitchenError('Дорога: від 0 до 240 хвилин');
  }
  const stores = await pool.query(`SELECT id, vertical FROM pos_stores WHERE id = ANY($1::bigint[])`, [[cafe, kitchen]]);
  if (stores.rowCount !== 2) throw new RemoteKitchenNotFound('Магазин не знайдено');
  // Both ends cook: the kitchen needs a board and tech cards, the cafe a
  // café till with modifiers. A boutique linked by a mistyped id would
  // otherwise accept orders it has no screen to answer.
  for (const row of stores.rows) {
    if (!verticalOrDefault(row.vertical as string | undefined).kitchen) {
      throw new RemoteKitchenError(
        Number(row.id) === kitchen
          ? 'Кухнею може бути лише заклад із кухнею (кафе, ресторан)'
          : 'Просити кухню може лише заклад із кухнею (кафе, ресторан)'
      );
    }
  }
  const existing = await findLinkForCafe(cafe);
  if (existing && existing.kitchen_store_id !== kitchen) {
    throw new RemoteKitchenConflict('У цього кафе вже є кухня');
  }
  // Re-creating a revoked pair revives it rather than failing on the unique pair.
  const row = await pool.query(
    `INSERT INTO pos_kitchen_links (cafe_store_id, kitchen_store_id, kitchen_title, kitchen_phone, transit_minutes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cafe_store_id, kitchen_store_id) DO UPDATE
       SET status = 'active', kitchen_title = EXCLUDED.kitchen_title,
           kitchen_phone = EXCLUDED.kitchen_phone, transit_minutes = EXCLUDED.transit_minutes,
           updated_at = NOW()
     RETURNING *`,
    [cafe, kitchen, title, phone, transit]
  );
  return linkOf(row.rows[0]);
}

export interface LinkSettingsInput {
  status?: unknown;
  kitchen_title?: unknown;
  kitchen_phone?: unknown;
  transit_minutes?: unknown;
  answer_seconds?: unknown;
  quote_ttl_seconds?: unknown;
  auto_confirm_max_min?: unknown;
}

/**
 * The cafe owner's settings for their link (§11 «Налаштування зв'язки»), or
 * the super-admin's. `revoked` is only the super-admin's (`allowRevoke`).
 */
export async function updateLink(
  linkId: number,
  input: LinkSettingsInput,
  opts: { cafeStoreId?: number; allowRevoke?: boolean } = {}
): Promise<KitchenLink> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  const intIn = (raw: unknown, min: number, max: number, label: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RemoteKitchenError(`${label}: від ${min} до ${max}`);
    }
    return value;
  };

  if (input.status !== undefined) {
    const allowed = opts.allowRevoke ? ['active', 'paused', 'revoked'] : ['active', 'paused'];
    if (typeof input.status !== 'string' || !allowed.includes(input.status)) {
      throw new RemoteKitchenError('Некоректний стан зв’язки');
    }
    set('status', input.status);
  }
  if (input.kitchen_title !== undefined) {
    const title = cleanText(input.kitchen_title, 80);
    if (!title) throw new RemoteKitchenError('Назва кухні не може бути порожньою');
    set('kitchen_title', title);
  }
  if (input.kitchen_phone !== undefined) set('kitchen_phone', cleanText(input.kitchen_phone, 32));
  if (input.transit_minutes !== undefined) set('transit_minutes', intIn(input.transit_minutes, 0, 240, 'Дорога, хв'));
  if (input.answer_seconds !== undefined) {
    set('answer_seconds', intIn(input.answer_seconds, 15, 600, 'Чекати відповіді, с'));
  }
  if (input.quote_ttl_seconds !== undefined) {
    set('quote_ttl_seconds', intIn(input.quote_ttl_seconds, 30, 1800, 'Час діє, с'));
  }
  if (input.auto_confirm_max_min !== undefined) {
    set(
      'auto_confirm_max_min',
      input.auto_confirm_max_min === null ? null : intIn(input.auto_confirm_max_min, 5, 240, 'Автопідтвердження до, хв')
    );
  }
  if (sets.length === 0) throw new RemoteKitchenError('Нічого змінювати');

  values.push(linkId);
  let where = `id = $${values.length}`;
  if (opts.cafeStoreId != null) {
    values.push(opts.cafeStoreId);
    where += ` AND cafe_store_id = $${values.length} AND status <> 'revoked'`;
  }
  const row = await pool.query(
    `UPDATE pos_kitchen_links SET ${sets.join(', ')}, updated_at = NOW() WHERE ${where} RETURNING *`,
    values
  );
  if (!row.rows[0]) throw new RemoteKitchenNotFound('Зв’язку з кухнею не знайдено');
  return linkOf(row.rows[0]);
}

export interface LinkItemView {
  cafe_variant_id: number;
  kitchen_variant_id: number;
  cafe_name: string;
  cafe_label: string;
  kitchen_name: string;
  kitchen_label: string;
  prep_minutes: number | null;
  /**
   * Whether the kitchen would cook it today: its dish is live and not on the
   * kitchen's stop list for the KITCHEN's day — the same test `resolveLines`
   * refuses a request by. The cafe's tile says «немає на кухні» otherwise (РК5).
   */
  available: boolean;
}

export async function listLinkItems(linkId: number): Promise<LinkItemView[]> {
  const rows = await pool.query(
    `SELECT li.cafe_variant_id, li.kitchen_variant_id,
            cp.name AS cafe_name, cv.label AS cafe_label,
            kp.name AS kitchen_name, kv.label AS kitchen_label, kp.prep_minutes,
            kp.stop_listed_on::text AS stop_listed_on, kp.is_active AS kp_active, kv.is_active AS kv_active,
            l.kitchen_store_id
       FROM pos_kitchen_link_items li
       JOIN pos_kitchen_links l ON l.id = li.link_id
       JOIN pos_variants cv ON cv.id = li.cafe_variant_id
       JOIN pos_products cp ON cp.id = cv.product_id
       JOIN pos_variants kv ON kv.id = li.kitchen_variant_id
       JOIN pos_products kp ON kp.id = kv.product_id
      WHERE li.link_id = $1
      ORDER BY cp.name, cv.label`,
    [linkId]
  );
  const kitchenToday =
    rows.rows.length > 0 ? (await storeClock(pool, Number(rows.rows[0].kitchen_store_id))).today : null;
  return rows.rows.map((row) => ({
    cafe_variant_id: Number(row.cafe_variant_id),
    kitchen_variant_id: Number(row.kitchen_variant_id),
    cafe_name: String(row.cafe_name),
    cafe_label: String(row.cafe_label ?? ''),
    kitchen_name: String(row.kitchen_name),
    kitchen_label: String(row.kitchen_label ?? ''),
    prep_minutes: numOrNull(row.prep_minutes),
    available:
      row.kp_active === true &&
      row.kv_active === true &&
      !(row.stop_listed_on != null && row.stop_listed_on === kitchenToday),
  }));
}

/**
 * This cafe's dishes the remote kitchen cooks, among `variantIds` — under any
 * link that is not revoked (a paused one included: the kitchen is only off for
 * now). By variant id, with the dish's name for the refusal.
 */
export async function linkedCafeVariantsTx(
  client: DbClient,
  cafeStoreId: number,
  variantIds: readonly number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (variantIds.length === 0) return out;
  const rows = await client.query(
    `SELECT DISTINCT li.cafe_variant_id, p.name
       FROM pos_kitchen_link_items li
       JOIN pos_kitchen_links l ON l.id = li.link_id
       JOIN pos_variants v ON v.id = li.cafe_variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE l.cafe_store_id = $1 AND l.status <> 'revoked'
        AND li.cafe_variant_id = ANY($2::bigint[])`,
    [cafeStoreId, [...new Set(variantIds)]]
  );
  for (const row of rows.rows) out.set(Number(row.cafe_variant_id), String(row.name));
  return out;
}

export interface KitchenDishView {
  variant_id: number;
  name: string;
  label: string;
  prep_minutes: number | null;
}

/**
 * A kitchen card a cafe may sell: active, on the kitchen's own menu
 * (`sellable` — an ingredient or a semi-finished good is not), and not one the
 * kitchen keeps off its guest menu (the cork fee and the like).
 */
const KITCHEN_DISH_SQL = `v.is_active AND p.is_active AND p.sellable AND NOT COALESCE(p.menu_hidden, false)`;

/**
 * What the cafe owner may pick from when marking a dish «готується на кухні»:
 * the kitchen's active dishes, names and times only — never its prices,
 * costs or stock.
 */
export async function listKitchenDishes(link: KitchenLink): Promise<KitchenDishView[]> {
  const rows = await pool.query(
    `SELECT v.id, p.name, v.label, p.prep_minutes
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND ${KITCHEN_DISH_SQL}
      ORDER BY p.name, v.label, v.id
      LIMIT 2000`,
    [link.kitchen_store_id]
  );
  return rows.rows.map((row) => ({
    variant_id: Number(row.id),
    name: String(row.name),
    label: String(row.label ?? ''),
    prep_minutes: numOrNull(row.prep_minutes),
  }));
}

/** Mark (or re-point) a cafe dish as cooked in the kitchen. */
export async function setLinkItem(
  link: KitchenLink,
  cafeVariantId: number,
  kitchenVariantId: number,
  client: DbClient = pool
): Promise<void> {
  const cafe = await client.query(`SELECT 1 FROM pos_variants WHERE id = $1 AND store_id = $2`, [
    cafeVariantId,
    link.cafe_store_id,
  ]);
  if (!cafe.rows[0]) throw new RemoteKitchenNotFound('Страву кафе не знайдено');
  const kitchen = await client.query(`SELECT 1 FROM pos_variants WHERE id = $1 AND store_id = $2`, [
    kitchenVariantId,
    link.kitchen_store_id,
  ]);
  if (!kitchen.rows[0]) throw new RemoteKitchenNotFound('Страву кухні не знайдено');
  await client.query(
    `INSERT INTO pos_kitchen_link_items (link_id, cafe_variant_id, kitchen_variant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (link_id, cafe_variant_id) DO UPDATE SET kitchen_variant_id = EXCLUDED.kitchen_variant_id`,
    [link.id, cafeVariantId, kitchenVariantId]
  );
}

/** Stock the till never greys: a kitchen dish takes nothing off the cafe's shelf (§5.1). */
export const KITCHEN_DISH_STOCK = 100000;
const MAX_IMPORT = 200;

export interface ImportDishInput {
  kitchen_variant_id?: unknown;
  price_cents?: unknown;
}

/** A cafe card reused by name whose own price stayed: the owner is told, nothing is overwritten. */
export interface KeptPrice {
  name: string;
  price_cents: number;
}

/**
 * «Імпорт меню кухні»: each picked kitchen dish becomes a card in the cafe's
 * catalogue and is marked «готується на кухні» at once. The cafe sets its own
 * price (§5.1: the price in the park may differ from the delivery one), so the
 * owner sends one per dish and the kitchen's never leaves the kitchen. The
 * card is named after the dish («Маргарита» or «Маргарита (32 см)»); a cafe
 * dish card of that name (sellable, simple) is reused rather than doubled —
 * its stock topped up so the till does not grey it, its own price kept and
 * reported back — and a dish already marked is skipped: running the import
 * twice changes nothing. All of it in one transaction: a refusal leaves the
 * catalogue as it was.
 */
export async function importKitchenDishes(
  link: KitchenLink,
  raw: unknown
): Promise<{ created: number; linked: number; skipped: number; kept_prices: KeptPrice[] }> {
  if (!Array.isArray(raw) || raw.length === 0) throw new RemoteKitchenError('Оберіть страви кухні');
  if (raw.length > MAX_IMPORT) throw new RemoteKitchenError(`За раз — не більше ${MAX_IMPORT} страв`);
  const wanted: Array<{ kitchenVariantId: number; priceCents: number }> = [];
  for (const entry of raw as ImportDishInput[]) {
    const kitchenVariantId = Number(entry?.kitchen_variant_id);
    const priceCents = Number(entry?.price_cents);
    if (!Number.isInteger(kitchenVariantId) || kitchenVariantId < 1) throw new RemoteKitchenError('Некоректна страва кухні');
    if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 100_000_000) {
      throw new RemoteKitchenError('Вкажіть ціну кафе для кожної страви');
    }
    if (!wanted.some((w) => w.kitchenVariantId === kitchenVariantId)) wanted.push({ kitchenVariantId, priceCents });
  }
  const dishes = await pool.query(
    `SELECT v.id, p.name, v.label, (${KITCHEN_DISH_SQL}) AS is_dish
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND v.id = ANY($2::bigint[])`,
    [link.kitchen_store_id, wanted.map((w) => w.kitchenVariantId)]
  );
  if (dishes.rows.length !== wanted.length) throw new RemoteKitchenNotFound('Страву кухні не знайдено');
  const notDish = dishes.rows.find((d) => !d.is_dish);
  if (notDish) {
    throw new RemoteKitchenError(
      `«${String(notDish.name)}» — не страва меню кухні (інгредієнт, заготовка, прихований або знятий товар)`
    );
  }

  return inTransaction(async (client) => {
    const marked = await client.query(
      `SELECT kitchen_variant_id FROM pos_kitchen_link_items WHERE link_id = $1`,
      [link.id]
    );
    const alreadyMarked = new Set(marked.rows.map((r) => Number(r.kitchen_variant_id)));
    let created = 0;
    let linked = 0;
    let skipped = 0;
    const keptPrices: KeptPrice[] = [];
    for (const want of wanted) {
      if (alreadyMarked.has(want.kitchenVariantId)) {
        skipped += 1;
        continue;
      }
      const dish = dishes.rows.find((d) => Number(d.id) === want.kitchenVariantId)!;
      const label = String(dish.label ?? '').trim();
      const name = (label ? `${String(dish.name)} (${label})` : String(dish.name)).slice(0, 200);
      // Only a card the till sells as it is: never an ingredient or a recipe.
      const existing = await client.query(
        `SELECT v.id, v.price_cents, COALESCE(s.quantity, 0) AS quantity
           FROM pos_variants v
           JOIN pos_products p ON p.id = v.product_id
           LEFT JOIN pos_stock s ON s.variant_id = v.id AND s.store_id = v.store_id
          WHERE p.store_id = $1 AND p.name = $2 AND v.is_active AND p.is_active
            AND p.sellable AND p.kind = 'simple'
            AND NOT EXISTS (SELECT 1 FROM pos_kitchen_link_items li WHERE li.link_id = $3 AND li.cafe_variant_id = v.id)
          ORDER BY v.id LIMIT 1`,
        [link.cafe_store_id, name, link.id]
      );
      let cafeVariantId: number;
      if (existing.rows[0]) {
        const row = existing.rows[0];
        cafeVariantId = Number(row.id);
        // A kitchen dish takes nothing off the cafe's shelf, but the till
        // greys a tile with nothing on it (§5.1).
        const short = KITCHEN_DISH_STOCK - Number(row.quantity);
        if (short > 0) {
          await applyStockDelta(client, {
            storeId: link.cafe_store_id,
            variantId: cafeVariantId,
            delta: short,
            reason: 'adjust',
            staffId: null,
            referenceType: 'remote_kitchen_import',
            referenceId: link.id,
          });
        }
        if (Number(row.price_cents) !== want.priceCents) {
          keptPrices.push({ name, price_cents: Number(row.price_cents) });
        }
      } else {
        let made: { variantIds: number[] };
        try {
          made = await createProductInTx(client, link.cafe_store_id, {
            name,
            variants: [{ price_cents: want.priceCents, unit: 'шт', quantity: KITCHEN_DISH_STOCK }],
          });
        } catch (error) {
          // A validation of the card itself: the owner's words, not a 500.
          throw new RemoteKitchenError(`«${name}»: ${error instanceof Error ? error.message : String(error)}`);
        }
        cafeVariantId = made.variantIds[0];
        created += 1;
      }
      await setLinkItem(link, cafeVariantId, want.kitchenVariantId, client);
      linked += 1;
    }
    return { created, linked, skipped, kept_prices: keptPrices };
  });
}

export async function removeLinkItem(link: KitchenLink, cafeVariantId: number): Promise<void> {
  await pool.query(`DELETE FROM pos_kitchen_link_items WHERE link_id = $1 AND cafe_variant_id = $2`, [
    link.id,
    cafeVariantId,
  ]);
}

// ── the kitchen's state ─────────────────────────────────────────────

/** A pause past its end has lifted itself: read-time, no cron. */
export async function getKitchenStatus(kitchenStoreId: number, client: DbClient = pool): Promise<KitchenStatusView> {
  const row = await client.query(`SELECT * FROM pos_kitchen_status WHERE kitchen_store_id = $1`, [kitchenStoreId]);
  const r = row.rows[0];
  if (!r) return { accepting: true, paused_until: null, load_minutes: 0 };
  const pausedUntil = r.paused_until == null ? null : new Date(r.paused_until as string);
  const pauseOver = !r.accepting && pausedUntil != null && pausedUntil.getTime() <= Date.now();
  return {
    accepting: Boolean(r.accepting) || pauseOver,
    paused_until: pauseOver ? null : isoOrNull(r.paused_until),
    load_minutes: Number(r.load_minutes),
  };
}

export interface KitchenStatusInput {
  accepting?: unknown;
  /** With `accepting: false`: lift the pause by itself after this many minutes. */
  pause_minutes?: unknown;
  load_minutes?: unknown;
}

export async function setKitchenStatus(actor: Actor, input: KitchenStatusInput): Promise<KitchenStatusView> {
  const current = await getKitchenStatus(actor.storeId);
  let accepting = current.accepting;
  let pausedUntil: string | null = current.paused_until;
  let load = current.load_minutes;
  if (input.accepting !== undefined) {
    if (typeof input.accepting !== 'boolean') throw new RemoteKitchenError('Некоректний стан прийому');
    accepting = input.accepting;
    pausedUntil = null;
    if (!accepting && input.pause_minutes != null) {
      const minutes = minutesOf(input.pause_minutes, 'Пауза', 480);
      pausedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    }
  }
  if (input.load_minutes !== undefined) {
    const value = Number(input.load_minutes);
    if (!Number.isInteger(value) || value < 0 || value > 180) {
      throw new RemoteKitchenError('Черга: від 0 до 180 хвилин');
    }
    load = value;
  }
  await pool.query(
    `INSERT INTO pos_kitchen_status (kitchen_store_id, accepting, paused_until, load_minutes, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (kitchen_store_id) DO UPDATE
       SET accepting = EXCLUDED.accepting, paused_until = EXCLUDED.paused_until,
           load_minutes = EXCLUDED.load_minutes, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [actor.storeId, accepting, pausedUntil, load, actor.staffId]
  );
  return getKitchenStatus(actor.storeId);
}

// ── reading orders ──────────────────────────────────────────────────

/** Named times nobody used become `expired`. Called wherever orders are read. */
export async function expireStaleQuotes(storeId: number, client: DbClient = pool): Promise<void> {
  await client.query(
    `UPDATE pos_remote_orders
        SET status = 'expired', updated_at = NOW()
      WHERE (cafe_store_id = $1 OR kitchen_store_id = $1)
        AND status = 'quoted' AND quote_expires_at < NOW()`,
    [storeId]
  );
}

const ORDER_SELECT = `
  SELECT o.*, l.kitchen_title, l.kitchen_phone, cs.name AS cafe_name,
         paid_by.receipt_number AS cafe_receipt_number,
         (SELECT COALESCE(SUM((e.payload->>'minutes')::int), 0)
            FROM pos_remote_order_events e
           WHERE e.remote_order_id = o.id AND e.kind = 'delayed') AS delayed_minutes
    FROM pos_remote_orders o
    JOIN pos_kitchen_links l ON l.id = o.link_id
    JOIN pos_stores cs ON cs.id = o.cafe_store_id
    LEFT JOIN pos_sales paid_by ON paid_by.id = o.cafe_sale_id AND paid_by.store_id = o.cafe_store_id`;

async function loadItems(client: DbClient, orderIds: number[]): Promise<Map<number, RemoteOrderItemView[]>> {
  const out = new Map<number, RemoteOrderItemView[]>();
  if (orderIds.length === 0) return out;
  const rows = await client.query(
    `SELECT * FROM pos_remote_order_items WHERE remote_order_id = ANY($1::bigint[]) ORDER BY sort_order, id`,
    [orderIds]
  );
  for (const row of rows.rows) {
    const orderId = Number(row.remote_order_id);
    const list = out.get(orderId) ?? [];
    list.push({
      id: Number(row.id),
      cafe_variant_id: Number(row.cafe_variant_id),
      kitchen_variant_id: Number(row.kitchen_variant_id),
      quantity: Number(row.quantity),
      product_name: String(row.product_name),
      variant_label: String(row.variant_label ?? ''),
      modifiers: Array.isArray(row.modifiers) ? (row.modifiers as unknown[]) : [],
      note: String(row.note ?? ''),
      problem: (row.problem as RemoteOrderItemView['problem']) ?? null,
    });
    out.set(orderId, list);
  }
  return out;
}

async function viewsOf(
  client: DbClient,
  rows: Array<Record<string, unknown>>,
  storeId: number
): Promise<RemoteOrderView[]> {
  const items = await loadItems(
    client,
    rows.map((row) => Number(row.id))
  );
  const now = Date.now();
  return rows.map((row) => {
    const id = Number(row.id);
    const deadline = row.answer_deadline_at == null ? null : new Date(row.answer_deadline_at as string);
    return {
      id,
      link_id: Number(row.link_id),
      cafe_store_id: Number(row.cafe_store_id),
      kitchen_store_id: Number(row.kitchen_store_id),
      side: Number(row.kitchen_store_id) === storeId ? 'kitchen' : 'cafe',
      kitchen_title: String(row.kitchen_title ?? ''),
      cafe_name: String(row.cafe_name ?? ''),
      client_uuid: String(row.client_uuid),
      revision: Number(row.revision),
      status: row.status as RemoteOrderStatus,
      quote_source: (row.quote_source as RemoteOrderView['quote_source']) ?? null,
      prep_minutes: numOrNull(row.prep_minutes),
      load_minutes: numOrNull(row.load_minutes),
      transit_minutes: numOrNull(row.transit_minutes),
      suggested_minutes: numOrNull(row.suggested_minutes),
      quoted_minutes: numOrNull(row.quoted_minutes),
      promised_at: isoOrNull(row.promised_at),
      answer_deadline_at: isoOrNull(row.answer_deadline_at),
      answer_overdue: row.status === 'requested' && deadline != null && deadline.getTime() <= now,
      quote_expires_at: isoOrNull(row.quote_expires_at),
      decline_reason: row.decline_reason == null ? null : String(row.decline_reason),
      order_no: numOrNull(row.order_no),
      guest_label: row.guest_label == null ? null : String(row.guest_label),
      note: row.note == null ? null : String(row.note),
      cafe_sale_id: numOrNull(row.cafe_sale_id),
      cafe_receipt_number:
        Number(row.cafe_store_id) === storeId && row.cafe_receipt_number != null
          ? String(row.cafe_receipt_number)
          : null,
      fulfilment: row.fulfilment as RemoteOrderView['fulfilment'],
      kitchen_phone: row.kitchen_phone == null ? null : String(row.kitchen_phone),
      requested_at: isoOrNull(row.requested_at) as string,
      quoted_at: isoOrNull(row.quoted_at),
      paid_at: isoOrNull(row.paid_at),
      ready_at: isoOrNull(row.ready_at),
      dispatched_at: isoOrNull(row.dispatched_at),
      arrived_at: isoOrNull(row.arrived_at),
      handed_at: isoOrNull(row.handed_at),
      closed_at: isoOrNull(row.closed_at),
      cancelled_by: (row.cancelled_by as RemoteOrderView['cancelled_by']) ?? null,
      cancel_seen_at: isoOrNull(row.cancel_seen_at),
      delayed_minutes: Number(row.delayed_minutes ?? 0),
      items: items.get(id) ?? [],
    };
  });
}

/** One order as the caller's store sees it; 404 if the store is on neither side. */
export async function getOrder(storeId: number, orderId: number): Promise<RemoteOrderView> {
  await expireStaleQuotes(storeId);
  const row = await pool.query(`${ORDER_SELECT} WHERE o.id = $1 AND (o.cafe_store_id = $2 OR o.kitchen_store_id = $2)`, [
    orderId,
    storeId,
  ]);
  if (!row.rows[0]) throw new RemoteKitchenNotFound('Замовлення кухні не знайдено');
  return (await viewsOf(pool, row.rows, storeId))[0]!;
}

/** How long a kitchen's cancel stays on the cafe's till unanswered. */
export const UNSEEN_CANCEL_HOURS = 24;

/** An order the cafe still has to act on although it finished: the kitchen cancelled it, unanswered. */
const UNSEEN_KITCHEN_CANCEL_SQL = `o.status = 'cancelled' AND o.cancelled_by = 'kitchen' AND o.cancel_seen_at IS NULL`;

/**
 * The orders a screen shows: everything still going, plus what finished in the
 * last `recentHours` (so a «Видано» does not vanish the very second it is tapped).
 * The cafe also gets every order the KITCHEN cancelled that no cashier has
 * answered yet, up to a day back: the guest paid, and someone must give the
 * money back (РК5).
 *
 * At most `limit` rows, and when there are more, what is still going and the
 * unanswered cancels are kept and the oldest finished ones dropped — never the
 * newest paid order. The answer stays oldest first.
 */
export async function listOrders(
  storeId: number,
  side: 'cafe' | 'kitchen',
  opts: { recentHours?: number; limit?: number } = {}
): Promise<RemoteOrderView[]> {
  await expireStaleQuotes(storeId);
  const column = side === 'cafe' ? 'o.cafe_store_id' : 'o.kitchen_store_id';
  const recent = opts.recentHours ?? 3;
  const limit = opts.limit ?? ORDER_LIST_LIMIT;
  const unseen = `($4::boolean AND ${UNSEEN_KITCHEN_CANCEL_SQL})`;
  const rows = await pool.query(
    `SELECT * FROM (
       ${ORDER_SELECT}
        WHERE ${column} = $1
          AND (o.status = ANY($2::text[])
               OR o.updated_at > NOW() - make_interval(hours => $3)
               OR (${unseen} AND o.updated_at > NOW() - make_interval(hours => $5)))
        ORDER BY (o.status = ANY($2::text[]) OR ${unseen}) DESC, o.requested_at DESC, o.id DESC
        LIMIT $6
     ) shown
     ORDER BY shown.requested_at ASC, shown.id ASC`,
    [storeId, LIVE_STATUSES as unknown as string[], recent, side === 'cafe', UNSEEN_CANCEL_HOURS, limit]
  );
  return viewsOf(pool, rows.rows, storeId);
}

/**
 * Whether this store has orders as a cafe its till must still follow — paid
 * and not handed over, or a kitchen's cancel no cashier answered. The setup
 * read says so even when the link is gone (revoked at the end of a season),
 * so the cafe's tracker keeps showing what is on its way and what is owed.
 */
export async function hasCafeOrdersToFollow(storeId: number): Promise<boolean> {
  const row = await pool.query(
    `SELECT 1 FROM pos_remote_orders o
      WHERE o.cafe_store_id = $1
        AND (o.status IN ('paid', 'cooking', 'ready', 'dispatched', 'arrived')
             OR (${UNSEEN_KITCHEN_CANCEL_SQL} AND o.updated_at > NOW() - make_interval(hours => $2)))
      LIMIT 1`,
    [storeId, UNSEEN_CANCEL_HOURS]
  );
  return row.rows.length > 0;
}

/** Lock an order for a change; checks the caller is on the expected side. */
async function lockOrder(
  client: DbClient,
  storeId: number,
  orderId: number,
  side: 'cafe' | 'kitchen' | 'either'
): Promise<Record<string, unknown>> {
  const row = await client.query(`SELECT * FROM pos_remote_orders WHERE id = $1 FOR UPDATE`, [orderId]);
  const order = row.rows[0];
  const isCafe = order && Number(order.cafe_store_id) === storeId;
  const isKitchen = order && Number(order.kitchen_store_id) === storeId;
  if (!order || (!isCafe && !isKitchen)) throw new RemoteKitchenNotFound('Замовлення кухні не знайдено');
  if (side === 'cafe' && !isCafe) throw new RemoteKitchenConflict('Це робить кафе, не кухня');
  if (side === 'kitchen' && !isKitchen) throw new RemoteKitchenConflict('Це робить кухня, не кафе');
  // Read-time expiry inside the lock, so a stale `quoted` cannot be paid.
  if (order.status === 'quoted' && order.quote_expires_at && new Date(order.quote_expires_at).getTime() < Date.now()) {
    await client.query(`UPDATE pos_remote_orders SET status = 'expired', updated_at = NOW() WHERE id = $1`, [orderId]);
    order.status = 'expired';
  }
  return order;
}

async function reread(client: DbClient, storeId: number, orderId: number): Promise<RemoteOrderView> {
  const row = await client.query(`${ORDER_SELECT} WHERE o.id = $1`, [orderId]);
  return (await viewsOf(client, row.rows, storeId))[0]!;
}

function statusIs(order: Record<string, unknown>, allowed: readonly string[], message: string): void {
  if (!allowed.includes(String(order.status))) throw new RemoteKitchenConflict(message);
}

// ── the cafe asks ───────────────────────────────────────────────────

interface ParsedLine {
  cafeVariantId: number;
  quantity: number;
  modifiers: unknown[];
  note: string;
}

function parseLines(raw: unknown): ParsedLine[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new RemoteKitchenError('Додайте хоча б одну страву кухні');
  if (raw.length > MAX_ITEMS) throw new RemoteKitchenError(`Забагато позицій: не більше ${MAX_ITEMS}`);
  return raw.map((entry) => {
    const line = (entry ?? {}) as RemoteLineInput;
    const cafeVariantId = Number(line.variant_id);
    const quantity = Number(line.quantity ?? 1);
    if (!Number.isInteger(cafeVariantId) || cafeVariantId < 1) throw new RemoteKitchenError('Некоректна страва');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new RemoteKitchenError(`Кількість: від 1 до ${MAX_QUANTITY}`);
    }
    // The answers come already resolved by the till (the same snapshot a
    // bill line keeps); they are carried to the kitchen as they are.
    const modifiers = Array.isArray(line.modifiers) ? line.modifiers.slice(0, 20) : [];
    const note = typeof line.note === 'string' ? line.note.trim().slice(0, 120) : '';
    return { cafeVariantId, quantity, modifiers, note };
  });
}

interface ResolvedLine extends ParsedLine {
  kitchenVariantId: number;
  productName: string;
  variantLabel: string;
  prepMinutes: number | null;
}

/**
 * Map each cafe dish to the kitchen's, and refuse a dish the kitchen cannot
 * cook today (stop list on the KITCHEN's own day, or retired), naming it so
 * the cashier can ask again without it.
 */
async function resolveLines(client: DbClient, link: KitchenLink, lines: ParsedLine[]): Promise<ResolvedLine[]> {
  const ids = lines.map((line) => line.cafeVariantId);
  const rows = await client.query(
    `SELECT li.cafe_variant_id, li.kitchen_variant_id,
            cp.name AS cafe_name, cv.label AS cafe_label,
            kp.prep_minutes, kp.stop_listed_on::text AS stop_listed_on, kp.is_active AS kp_active, kv.is_active AS kv_active
       FROM pos_kitchen_link_items li
       JOIN pos_variants cv ON cv.id = li.cafe_variant_id
       JOIN pos_products cp ON cp.id = cv.product_id
       JOIN pos_variants kv ON kv.id = li.kitchen_variant_id
       JOIN pos_products kp ON kp.id = kv.product_id
      WHERE li.link_id = $1 AND li.cafe_variant_id = ANY($2::bigint[])`,
    [link.id, ids]
  );
  const byCafe = new Map<number, Record<string, unknown>>();
  for (const row of rows.rows) byCafe.set(Number(row.cafe_variant_id), row);
  const kitchenToday = (await storeClock(client, link.kitchen_store_id)).today;
  const measured = await measuredPrep(
    client,
    link.kitchen_store_id,
    rows.rows.map((row) => Number(row.kitchen_variant_id))
  );

  return lines.map((line) => {
    const row = byCafe.get(line.cafeVariantId);
    if (!row) {
      throw new RemoteKitchenLineProblem('Ця страва не готується на кухні', line.cafeVariantId, 'not_linked');
    }
    const name = String(row.cafe_name);
    if (!row.kp_active || !row.kv_active) {
      throw new RemoteKitchenLineProblem(`«${name}» кухня більше не готує`, line.cafeVariantId, 'unavailable');
    }
    if (row.stop_listed_on != null && row.stop_listed_on === kitchenToday) {
      throw new RemoteKitchenLineProblem(`«${name}» сьогодні на стопі на кухні`, line.cafeVariantId, 'stop');
    }
    return {
      ...line,
      kitchenVariantId: Number(row.kitchen_variant_id),
      productName: name,
      variantLabel: String(row.cafe_label ?? ''),
      // The measured time once there is one (§7.1, РК4); the set time until then.
      prepMinutes: measured.get(Number(row.kitchen_variant_id))?.minutes ?? numOrNull(row.prep_minutes),
    };
  });
}

/** A dish's time is measured over this many days … */
export const MEASURE_DAYS = 14;
/** … once at least this many paid orders carried it; until then the set time stands. */
export const MEASURE_MIN_ORDERS = 5;
/** An order «ready» later than this after payment was forgotten, not cooked: left out. */
const MEASURE_MAX_MINUTES = 180;

export interface MeasuredPrep {
  minutes: number;
  orders: number;
}

/**
 * What the kitchen actually takes (§7.1, РК4): per kitchen dish, the median of
 * «оплачено → Готово» over the cafe orders of the last 14 days that carried
 * it, rounded up to a minute. An order's time is its longest dish's plus the
 * queue it met, so this is the dish as the cafe will see it, not as a recipe
 * says. Fewer than five orders measure nothing.
 */
export async function measuredPrep(
  client: Pick<DbClient, 'query'>,
  kitchenStoreId: number,
  kitchenVariantIds: number[]
): Promise<Map<number, MeasuredPrep>> {
  const out = new Map<number, MeasuredPrep>();
  if (kitchenVariantIds.length === 0) return out;
  const rows = await client.query(
    `SELECT t.variant_id,
            CEIL(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes))::int AS minutes,
            COUNT(*)::int AS orders
       FROM (SELECT DISTINCT o.id, i.kitchen_variant_id AS variant_id,
                    EXTRACT(EPOCH FROM (o.ready_at - o.paid_at)) / 60.0 AS minutes
               FROM pos_remote_orders o
               JOIN pos_remote_order_items i ON i.remote_order_id = o.id
              WHERE o.kitchen_store_id = $1
                AND i.kitchen_variant_id = ANY($2::bigint[])
                AND o.paid_at > NOW() - make_interval(days => $3)
                AND o.ready_at > o.paid_at + INTERVAL '1 minute'
                AND o.ready_at < o.paid_at + make_interval(mins => $4)) t
      GROUP BY t.variant_id
     HAVING COUNT(*) >= $5`,
    [kitchenStoreId, kitchenVariantIds, MEASURE_DAYS, MEASURE_MAX_MINUTES, MEASURE_MIN_ORDERS]
  );
  for (const row of rows.rows) {
    out.set(Number(row.variant_id), { minutes: Math.max(1, Number(row.minutes)), orders: Number(row.orders) });
  }
  return out;
}

interface Estimate {
  prep: number | null;
  load: number;
  transit: number;
  /** prep + load + transit rounded up to five; null when a dish has no time set. */
  total: number | null;
}

/**
 * What the kitchen's own numbers suggest (§7.1): the longest dish, because
 * dishes cook in parallel, plus the queue, plus the road. A dish with no time
 * set leaves the suggestion empty — the kitchen has to name it, and the order
 * is never auto-confirmed.
 */
export function estimate(lines: Array<{ prepMinutes: number | null }>, load: number, transit: number): Estimate {
  let prep: number | null = 0;
  for (const line of lines) {
    if (line.prepMinutes == null) {
      prep = null;
      break;
    }
    prep = Math.max(prep, line.prepMinutes);
  }
  return { prep, load, transit, total: prep == null ? null : roundUpToFive(prep + load + transit) };
}

async function activeLinkForCafe(client: DbClient, cafeStoreId: number): Promise<KitchenLink> {
  const link = await findLinkForCafe(cafeStoreId, client);
  if (!link) throw new RemoteKitchenNotFound('У цього магазину немає віддаленої кухні');
  if (link.status !== 'active') {
    throw new RemoteKitchenPaused('Зв’язок із кухнею призупинено', link.kitchen_phone);
  }
  return link;
}

async function writeItems(client: DbClient, orderId: number, lines: ResolvedLine[]): Promise<void> {
  await client.query(`DELETE FROM pos_remote_order_items WHERE remote_order_id = $1`, [orderId]);
  let sort = 0;
  for (const line of lines) {
    await client.query(
      `INSERT INTO pos_remote_order_items
         (remote_order_id, cafe_variant_id, kitchen_variant_id, quantity, product_name, variant_label,
          modifiers, note, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        orderId,
        line.cafeVariantId,
        line.kitchenVariantId,
        line.quantity,
        line.productName,
        line.variantLabel,
        JSON.stringify(line.modifiers),
        line.note,
        sort,
      ]
    );
    sort += 1;
  }
}

/**
 * Put the estimate on the order and decide its state: auto-confirmed (§7.2)
 * when the link allows it and the suggestion is within the threshold, else
 * waiting for the kitchen with a deadline.
 */
async function applyEstimate(
  client: DbClient,
  orderId: number,
  link: KitchenLink,
  est: Estimate,
  actor: Actor,
  kind: 'requested' | 'revised'
): Promise<void> {
  const auto = link.auto_confirm_max_min != null && est.total != null && est.total <= link.auto_confirm_max_min;
  if (auto) {
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'quoted', quote_source = 'auto',
              prep_minutes = $2, load_minutes = $3, transit_minutes = $4,
              suggested_minutes = $5, quoted_minutes = $5,
              quoted_at = NOW(), quoted_by = NULL, answer_deadline_at = NULL,
              quote_expires_at = NOW() + make_interval(secs => $6),
              decline_reason = NULL, updated_at = NOW()
        WHERE id = $1`,
      [orderId, est.prep, est.load, est.transit, est.total, link.quote_ttl_seconds]
    );
  } else {
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'requested', quote_source = NULL,
              prep_minutes = $2, load_minutes = $3, transit_minutes = $4,
              suggested_minutes = $5, quoted_minutes = NULL, quoted_at = NULL, quoted_by = NULL,
              answer_deadline_at = NOW() + make_interval(secs => $6),
              quote_expires_at = NULL, decline_reason = NULL, updated_at = NOW()
        WHERE id = $1`,
      [orderId, est.prep, est.load, est.transit, est.total, link.answer_seconds]
    );
  }
  await logEvent(client, orderId, actor, kind, {
    suggested_minutes: est.total,
    auto,
  });
  if (auto) await logEvent(client, orderId, { storeId: null, staffId: null }, 'auto_quoted', { minutes: est.total });
}

/**
 * The till asks. Idempotent by `client_uuid`: a retried request reads the
 * first one back, whatever its state now.
 */
export async function createOrder(
  actor: Actor,
  input: CreateRemoteOrderInput
): Promise<{ order: RemoteOrderView; created: boolean }> {
  const uuid = typeof input.client_uuid === 'string' ? input.client_uuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(uuid)) throw new RemoteKitchenError('Некоректний ідентифікатор запиту');

  const existing = await pool.query(`SELECT id FROM pos_remote_orders WHERE cafe_store_id = $1 AND client_uuid = $2`, [
    actor.storeId,
    uuid,
  ]);
  if (existing.rows[0]) return { order: await getOrder(actor.storeId, Number(existing.rows[0].id)), created: false };

  const lines = parseLines(input.items);
  const guestLabel = cleanText(input.guest_label, 80);
  const note = cleanText(input.note, 200);

  try {
    return await inTransaction(async (client) => {
      const link = await activeLinkForCafe(client, actor.storeId);
      const status = await getKitchenStatus(link.kitchen_store_id, client);
      if (!status.accepting) {
        throw new RemoteKitchenPaused('Кухня зараз не приймає замовлень', link.kitchen_phone);
      }
      const resolved = await resolveLines(client, link, lines);
      const inserted = await client.query(
        `INSERT INTO pos_remote_orders
           (link_id, cafe_store_id, kitchen_store_id, client_uuid, guest_label, note, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [link.id, actor.storeId, link.kitchen_store_id, uuid, guestLabel, note, actor.staffId]
      );
      const orderId = Number(inserted.rows[0].id);
      await writeItems(client, orderId, resolved);
      const est = estimate(resolved, status.load_minutes, link.transit_minutes);
      await applyEstimate(client, orderId, link, est, actor, 'requested');
      return { order: await reread(client, actor.storeId, orderId), created: true };
    });
  } catch (error) {
    // Two taps racing on the same uuid: the loser reads the winner's row.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      const won = await pool.query(`SELECT id FROM pos_remote_orders WHERE cafe_store_id = $1 AND client_uuid = $2`, [
        actor.storeId,
        uuid,
      ]);
      if (won.rows[0]) return { order: await getOrder(actor.storeId, Number(won.rows[0].id)), created: false };
    }
    throw error;
  }
}

/**
 * The cashier changed the cart before payment: a new revision, and whatever
 * time was named for the old one is void (§6). `revision` is what the till
 * last saw, so two tills cannot silently overwrite each other.
 */
export async function reviseOrder(
  actor: Actor,
  orderId: number,
  input: { revision?: unknown; items?: unknown }
): Promise<RemoteOrderView> {
  const lines = parseLines(input.items);
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
    statusIs(order, PRE_PAY, 'Замовлення вже оплачено або закрито — кошик не змінити');
    if (Number(input.revision) !== Number(order.revision)) {
      throw new RemoteKitchenConflict('Замовлення вже змінили з іншої каси — оновіть екран');
    }
    const link = await activeLinkForCafe(client, actor.storeId);
    const status = await getKitchenStatus(link.kitchen_store_id, client);
    if (!status.accepting) throw new RemoteKitchenPaused('Кухня зараз не приймає замовлень', link.kitchen_phone);
    const resolved = await resolveLines(client, link, lines);
    await client.query(`UPDATE pos_remote_orders SET revision = revision + 1 WHERE id = $1`, [orderId]);
    await writeItems(client, orderId, resolved);
    await applyEstimate(
      client,
      orderId,
      link,
      estimate(resolved, status.load_minutes, link.transit_minutes),
      actor,
      'revised'
    );
    return reread(client, actor.storeId, orderId);
  });
}

/**
 * «Записати час з телефону» (П3, §8): the kitchen did not answer in time, the
 * cashier phoned and writes down what they said. Allowed only once the
 * kitchen's time to answer has run out — before that, the kitchen is the one
 * who answers.
 */
export async function recordPhoneQuote(
  actor: Actor,
  orderId: number,
  input: { minutes?: unknown; revision?: unknown }
): Promise<RemoteOrderView> {
  const minutes = minutesOf(input.minutes, 'Час від кухні');
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
    statusIs(order, ['requested', 'expired'], 'Час уже названо або замовлення закрито');
    if (input.revision !== undefined && Number(input.revision) !== Number(order.revision)) {
      throw new RemoteKitchenConflict('Кошик змінився — спершу надішліть його кухні знову');
    }
    const deadline = order.answer_deadline_at == null ? null : new Date(order.answer_deadline_at as string);
    if (order.status === 'requested' && deadline != null && deadline.getTime() > Date.now()) {
      throw new RemoteKitchenConflict('Кухня ще може відповісти — зачекайте');
    }
    const link = linkOf((await client.query(`SELECT * FROM pos_kitchen_links WHERE id = $1`, [order.link_id])).rows[0]);
    const quoted = roundUpToFive(minutes);
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'quoted', quote_source = 'phone', quoted_minutes = $2,
              quoted_at = NOW(), quoted_by = NULL,
              quote_expires_at = NOW() + make_interval(secs => $3), updated_at = NOW()
        WHERE id = $1`,
      [orderId, quoted, link.quote_ttl_seconds]
    );
    await logEvent(client, orderId, actor, 'phone_quoted', { minutes: quoted });
    return reread(client, actor.storeId, orderId);
  });
}

/** The guest said no (or left) before paying. */
export async function guestDeclined(actor: Actor, orderId: number): Promise<RemoteOrderView> {
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
    if (order.status === 'guest_declined') return reread(client, actor.storeId, orderId);
    statusIs(order, PRE_PAY, 'Замовлення вже оплачено — скасуйте його як оплачене');
    await client.query(
      `UPDATE pos_remote_orders SET status = 'guest_declined', closed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    await logEvent(client, orderId, actor, 'guest_declined');
    return reread(client, actor.storeId, orderId);
  });
}

/**
 * The cafe sold it (П2). The till rings the sale as usual and tells us which
 * sale paid; this is the gate to cooking. Checks that the sale is the cafe's,
 * not voided, and was made while the named time still held — then gives the
 * order its kitchen number, takes the dishes off the KITCHEN's shelf and
 * starts the clock. Idempotent for the same sale.
 */
export async function markPaid(actor: Actor, orderId: number, input: { sale_id?: unknown }): Promise<RemoteOrderView> {
  const saleId = Number(input.sale_id);
  if (!Number.isInteger(saleId) || saleId < 1) throw new RemoteKitchenError('Вкажіть чек, яким оплачено');
  return inTransaction((client) => markPaidTx(client, actor, orderId, saleId));
}

/**
 * Everything `markPaid` does, inside a transaction the caller owns — also
 * checkout's own, when the till rings the sale with `remote_order_id` and the
 * receipt and the kitchen order must commit together.
 */
export async function markPaidTx(
  client: DbClient,
  actor: Actor,
  orderId: number,
  saleId: number
): Promise<RemoteOrderView> {
  const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
  if (order.cafe_sale_id != null) {
    if (Number(order.cafe_sale_id) === saleId) return reread(client, actor.storeId, orderId);
    throw new RemoteKitchenConflict('Замовлення вже оплачено іншим чеком');
  }
  const sale = await client.query(
    `SELECT id, status, created_at FROM pos_sales WHERE id = $1 AND store_id = $2`,
    [saleId, actor.storeId]
  );
  const saleRow = sale.rows[0];
  if (!saleRow) throw new RemoteKitchenNotFound('Чек не знайдено');
  if (saleRow.status === 'voided') throw new RemoteKitchenConflict('Чек анульовано');

  // A sale made while the time still held pays it, even if the till only
  // reports a moment later and the read-time expiry has run in between.
  const soldAt = new Date(saleRow.created_at as string).getTime();
  const expiresAt = order.quote_expires_at == null ? null : new Date(order.quote_expires_at as string).getTime();
  const quotedWhenSold =
    order.status === 'quoted' ||
    (order.status === 'expired' && order.quote_source != null && expiresAt != null && soldAt <= expiresAt);
  if (!quotedWhenSold) {
    throw new RemoteKitchenConflict('Час від кухні не діє — спитайте кухню знову');
  }
  const quoted = Number(order.quoted_minutes);
  const kitchenStoreId = Number(order.kitchen_store_id);
  const clock = await storeClock(client, kitchenStoreId);
  const orderNo = await nextCounterValue(client, kitchenStoreId, dailyCounterKey('remote', clock.today));

  await client.query(
    `UPDATE pos_remote_orders
        SET status = 'cooking', cafe_sale_id = $2, order_no = $3,
            paid_at = NOW(), promised_at = NOW() + make_interval(mins => $4), updated_at = NOW()
      WHERE id = $1`,
    [orderId, saleId, orderNo, quoted]
  );
  // The kitchen's paper: its desktop prints the ticket (РК3).
  await queueRemoteFireTx(client, kitchenStoreId, orderId);
  // The kitchen's stock moves now — as a sale, with the order as reference.
  // No kitchen staff did it, so no staff id; the event log says who in the cafe.
  const items = await client.query(
    `SELECT id, kitchen_variant_id, quantity FROM pos_remote_order_items WHERE remote_order_id = $1 ORDER BY sort_order, id`,
    [orderId]
  );
  for (const item of items.rows) {
    await consumeStockForLine(client, {
      storeId: kitchenStoreId,
      target: 'remote',
      lineId: Number(item.id),
      referenceType: 'remote_order',
      referenceId: orderId,
      variantId: Number(item.kitchen_variant_id),
      quantity: Number(item.quantity),
      staffId: null,
    });
  }
  await logEvent(client, orderId, actor, 'paid', { sale_id: saleId, order_no: orderNo, minutes: quoted });
  return reread(client, actor.storeId, orderId);
}

/**
 * Checkout's half (РК2): a sale rung with `remote_order_id` pays the order in
 * the same transaction. This locks the order, checks it can be paid now and
 * hands back its lines, so checkout can match its own lines to them and skip
 * the CAFE's stock for those — the dishes come off the kitchen's shelf instead.
 */
export interface RemoteSaleLine {
  id: number;
  cafeVariantId: number;
  quantity: number;
  /** The answers the kitchen was asked to cook, as sorted modifier ids. */
  modifierIds: number[];
}

/** Sorted modifier ids of a stored answer list — the till's `{ id }` or a sale snapshot's `{ modifier_id }`. */
export function modifierIdsOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  for (const entry of raw) {
    const row = (entry ?? {}) as { id?: unknown; modifier_id?: unknown };
    const id = Number(row.modifier_id ?? row.id);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids.sort((a, b) => a - b);
}

/** Whether a receipt line is the very dish the kitchen was asked for: dish, count and answers. */
export function sameRemoteDish(
  remote: RemoteSaleLine,
  line: { variantId: number; quantity: number; modifierIds: readonly number[] }
): boolean {
  return (
    remote.cafeVariantId === line.variantId &&
    remote.quantity === line.quantity &&
    remote.modifierIds.length === line.modifierIds.length &&
    remote.modifierIds.every((id, i) => id === line.modifierIds[i])
  );
}

export async function remoteLinesForSaleTx(
  client: DbClient,
  cafeStoreId: number,
  orderId: number,
  /** The time the guest agreed to, as the till showed it; null checks nothing (an older till). */
  agreedMinutes: number | null = null
): Promise<RemoteSaleLine[]> {
  const order = await lockOrder(client, cafeStoreId, orderId, 'cafe');
  if (order.status !== 'quoted') {
    throw new RemoteKitchenConflict(
      order.status === 'expired'
        ? 'Час від кухні вже не діє — спитайте кухню знову'
        : 'Замовлення кухні не чекає на оплату'
    );
  }
  // The kitchen may correct a time the server gave by itself (РК4): the guest
  // agreed to the old one, and the till hears of the new one only on its next
  // read. A receipt rung in between pays nothing until the guest is asked again.
  if (agreedMinutes !== null && Number(order.quoted_minutes) !== agreedMinutes) {
    throw new RemoteKitchenConflict(
      `Кухня змінила час: тепер ${Number(order.quoted_minutes)} хв — спитайте гостя ще раз`
    );
  }
  const rows = await client.query(
    `SELECT id, cafe_variant_id, quantity, modifiers
       FROM pos_remote_order_items WHERE remote_order_id = $1 ORDER BY sort_order, id`,
    [orderId]
  );
  return rows.rows.map((row) => ({
    id: Number(row.id),
    cafeVariantId: Number(row.cafe_variant_id),
    quantity: Number(row.quantity),
    modifierIds: modifierIdsOf(row.modifiers),
  }));
}

/**
 * The receipt line that pays a kitchen dish (РК2): the line points at the
 * kitchen's line, and the kitchen's line takes the RECEIPT's answers — names
 * the server resolved and the cafe was paid for, not the text the till sent
 * with its request.
 */
export async function claimRemoteLineTx(
  client: DbClient,
  saleItemId: number,
  remoteItemId: number,
  modifiers: readonly LineModifierSnapshot[]
): Promise<void> {
  await client.query(`UPDATE pos_sale_items SET remote_order_item_id = $1 WHERE id = $2`, [remoteItemId, saleItemId]);
  await client.query(`UPDATE pos_remote_order_items SET modifiers = $2::jsonb WHERE id = $1`, [
    remoteItemId,
    JSON.stringify(modifiers),
  ]);
}

// ── a sale agreed by phone, offline (РК5, §8) ───────────────────────

/** What the till sends with a receipt it rang offline after calling the kitchen. */
export interface PhoneAgreement {
  /** The whole promise the kitchen named on the phone, road included. */
  minutes: number;
  /** When the cashier wrote it down, by the till's clock; the promise counts from here. */
  agreedAt: Date | null;
}

/**
 * `remote_phone` of `POST /sales/complete`: `{ minutes, agreed_at? }`. Null for
 * anything else — the caller decides whether that is a 400 (a live request) or
 * simply no kitchen part (a replay, which must never fail for it).
 */
export function parsePhoneAgreement(raw: unknown): PhoneAgreement | null {
  if (raw == null || typeof raw !== 'object') return null;
  const value = raw as { minutes?: unknown; agreed_at?: unknown };
  const minutes = Number(value.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) return null;
  let agreedAt: Date | null = null;
  if (typeof value.agreed_at === 'string' && value.agreed_at.trim()) {
    const at = new Date(value.agreed_at);
    if (Number.isFinite(at.getTime())) agreedAt = at;
  }
  return { minutes, agreedAt };
}

/** A plain receipt line, as checkout hands it over before writing it. */
export interface PhoneSaleLine {
  variantId: number;
  quantity: number;
  modifiers: readonly LineModifierSnapshot[];
  note: string | null | undefined;
}

/** A till clock is believed within a day back and never ahead of the server. */
const PHONE_CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;

function phoneAgreedAt(agreement: PhoneAgreement, now: number): Date {
  const at = agreement.agreedAt?.getTime();
  if (at == null || !Number.isFinite(at)) return new Date(now);
  return new Date(Math.min(now, Math.max(now - PHONE_CLOCK_SLACK_MS, at)));
}

/**
 * Checkout's half of a sale the cashier agreed with the kitchen by phone
 * while the till had no network (§8): the receipt's lines the kitchen cooks
 * become an order of this cafe, already named a time «по телефону», and their
 * lines come back for checkout to match exactly as a paid order's do — they
 * skip the cafe's shelf. Null when nothing on the receipt is the kitchen's
 * (or the cafe has no kitchen any more): then it is an ordinary sale.
 *
 * Nothing is asked of the kitchen and nothing is refused: the kitchen said yes
 * on the phone, and the receipt is already in the guest's hand. A stop-listed
 * or paused dish still goes; only a dish no longer linked stays the cafe's.
 * Its own savepoint, so whatever goes wrong here costs the kitchen's record,
 * never the receipt.
 */
export async function phoneOrderForSaleTx(
  client: DbClient,
  actor: Actor,
  agreement: PhoneAgreement,
  lines: readonly PhoneSaleLine[]
): Promise<{ orderId: number; lines: RemoteSaleLine[] } | null> {
  if (lines.length === 0) return null;
  await client.query('SAVEPOINT remote_phone');
  try {
    const result = await phoneOrderInside(client, actor, agreement, lines);
    await client.query('RELEASE SAVEPOINT remote_phone');
    return result;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT remote_phone');
    logger.warn('Phone-agreed remote-kitchen order not recorded', {
      storeId: actor.storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function phoneOrderInside(
  client: DbClient,
  actor: Actor,
  agreement: PhoneAgreement,
  lines: readonly PhoneSaleLine[]
): Promise<{ orderId: number; lines: RemoteSaleLine[] } | null> {
  const link = await findLinkForCafe(actor.storeId, client);
  if (!link) return null;
  const rows = await client.query(
    `SELECT li.cafe_variant_id, li.kitchen_variant_id, cp.name AS cafe_name, cv.label AS cafe_label
       FROM pos_kitchen_link_items li
       JOIN pos_variants cv ON cv.id = li.cafe_variant_id
       JOIN pos_products cp ON cp.id = cv.product_id
      WHERE li.link_id = $1 AND li.cafe_variant_id = ANY($2::bigint[])`,
    [link.id, lines.map((line) => line.variantId)]
  );
  const byCafe = new Map<number, Record<string, unknown>>();
  for (const row of rows.rows) byCafe.set(Number(row.cafe_variant_id), row);
  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    const row = byCafe.get(line.variantId);
    if (!row) continue;
    resolved.push({
      cafeVariantId: line.variantId,
      quantity: line.quantity,
      modifiers: [...line.modifiers],
      note: (line.note ?? '').trim().slice(0, 120),
      kitchenVariantId: Number(row.kitchen_variant_id),
      productName: String(row.cafe_name),
      variantLabel: String(row.cafe_label ?? ''),
      prepMinutes: null,
    });
  }
  if (resolved.length === 0) return null;

  const quoted = roundUpToFive(agreement.minutes);
  const agreedAt = phoneAgreedAt(agreement, Date.now());
  const inserted = await client.query(
    `INSERT INTO pos_remote_orders
       (link_id, cafe_store_id, kitchen_store_id, client_uuid, requested_by,
        status, quote_source, quoted_minutes, quoted_at, transit_minutes)
     VALUES ($1, $2, $3, $4, $5, 'quoted', 'phone', $6, $7, $8)
     RETURNING id`,
    [link.id, actor.storeId, link.kitchen_store_id, randomUUID(), actor.staffId, quoted, agreedAt, link.transit_minutes]
  );
  const orderId = Number(inserted.rows[0].id);
  await writeItems(client, orderId, resolved);
  await logEvent(client, orderId, actor, 'phone_quoted', { minutes: quoted, offline: true });
  const items = await client.query(
    `SELECT id, cafe_variant_id, quantity, modifiers
       FROM pos_remote_order_items WHERE remote_order_id = $1 ORDER BY sort_order, id`,
    [orderId]
  );
  return {
    orderId,
    lines: items.rows.map((row) => ({
      id: Number(row.id),
      cafeVariantId: Number(row.cafe_variant_id),
      quantity: Number(row.quantity),
      modifierIds: modifierIdsOf(row.modifiers),
    })),
  };
}

/**
 * The phone order's state when it is filed: still `cooking` while its promise
 * may be ahead, and closed straight away once it is `LATE_ARRIVAL_MINUTES`
 * past it — an outage longer than the promise ends with the pizza long eaten,
 * and a «cooking» card on the kitchen's board would be a second dinner.
 */
export function phoneFiledStatus(agreedAt: Date, quotedMinutes: number, now: number): 'cooking' | 'handed_over' {
  const settledAt = agreedAt.getTime() + (quotedMinutes + LATE_ARRIVAL_MINUTES) * 60_000;
  return settledAt <= now ? 'handed_over' : 'cooking';
}

/**
 * The receipt is written: the phone order is paid by it and goes straight to
 * `cooking` — the kitchen has been cooking since the call — or, filed after
 * its promise and the cafe's 20 minutes, straight to `handed_over` with no
 * times of its own (`phoneFiledStatus`; the report counts it as reached but
 * not as on time or late: nobody measured it). Its number and the kitchen's
 * stock as `markPaidTx`; no ticket is queued for the kitchen's printer (it
 * wrote the order down on the phone, and a second paper would be a second
 * dinner), and the promise counts from the call, not from the sync.
 *
 * Its own savepoint, like the order's: whatever goes wrong here costs the
 * kitchen's record, never the receipt in the guest's hand. Then the order is
 * still marked paid by the receipt — unnumbered, nothing written off — so the
 * kitchen sees it and the cafe can void it.
 */
export async function markPhonePaidTx(
  client: DbClient,
  actor: Actor,
  orderId: number,
  saleId: number,
  agreement: PhoneAgreement
): Promise<void> {
  const agreedAt = phoneAgreedAt(agreement, Date.now());
  await client.query('SAVEPOINT remote_phone_paid');
  try {
    await phonePaidInside(client, actor, orderId, saleId, agreedAt);
    await client.query('RELEASE SAVEPOINT remote_phone_paid');
    return;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT remote_phone_paid');
    logger.warn('Phone-agreed remote-kitchen order not numbered or written off', {
      storeId: actor.storeId,
      orderId,
      saleId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await client.query('SAVEPOINT remote_phone_paid_bare');
  try {
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'cooking', cafe_sale_id = $2, paid_at = NOW(),
              promised_at = $3::timestamptz + make_interval(mins => quoted_minutes), updated_at = NOW()
        WHERE id = $1`,
      [orderId, saleId, agreedAt]
    );
    await client.query('RELEASE SAVEPOINT remote_phone_paid_bare');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT remote_phone_paid_bare');
    logger.warn('Phone-agreed remote-kitchen order left unpaid', {
      storeId: actor.storeId,
      orderId,
      saleId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function phonePaidInside(
  client: DbClient,
  actor: Actor,
  orderId: number,
  saleId: number,
  agreedAt: Date
): Promise<void> {
  const order = (
    await client.query(`SELECT kitchen_store_id, quoted_minutes FROM pos_remote_orders WHERE id = $1`, [orderId])
  ).rows[0];
  if (!order) return;
  const quoted = Number(order.quoted_minutes);
  const kitchenStoreId = Number(order.kitchen_store_id);
  const status = phoneFiledStatus(agreedAt, quoted, Date.now());
  const clock = await storeClock(client, kitchenStoreId);
  const orderNo = await nextCounterValue(client, kitchenStoreId, dailyCounterKey('remote', clock.today));
  await client.query(
    `UPDATE pos_remote_orders
        SET status = $6::text, cafe_sale_id = $2, order_no = $3,
            paid_at = NOW(), promised_at = $4::timestamptz + make_interval(mins => $5),
            closed_at = CASE WHEN $6::text = 'handed_over' THEN NOW() ELSE NULL END, updated_at = NOW()
      WHERE id = $1`,
    [orderId, saleId, orderNo, agreedAt, quoted, status]
  );
  const items = await client.query(
    `SELECT id, kitchen_variant_id, quantity FROM pos_remote_order_items WHERE remote_order_id = $1 ORDER BY sort_order, id`,
    [orderId]
  );
  for (const item of items.rows) {
    await consumeStockForLine(client, {
      storeId: kitchenStoreId,
      target: 'remote',
      lineId: Number(item.id),
      referenceType: 'remote_order',
      referenceId: orderId,
      variantId: Number(item.kitchen_variant_id),
      quantity: Number(item.quantity),
      staffId: null,
    });
  }
  await logEvent(client, orderId, actor, 'paid', {
    sale_id: saleId,
    order_no: orderNo,
    minutes: quoted,
    phone: true,
    ...(status === 'handed_over' ? { filed_late: true } : {}),
  });
}

/**
 * The cafe's two taps at the end: the courier came, the guest got it.
 *
 * «Привезли» answers an order the kitchen marked «Готово» or «Видано». One
 * the kitchen never moved is taken too, but only once it is
 * `LATE_ARRIVAL_MINUTES` past its promise — the pizza is here and the cook
 * forgot to tap; earlier, a mistaken tap would take the card off the
 * kitchen's board while it is still in the oven. Nothing the kitchen did not
 * say is written for it: `ready_at` and `dispatched_at` stay empty, and the
 * journal says the kitchen left it unmarked.
 */
export async function markArrived(actor: Actor, orderId: number): Promise<RemoteOrderView> {
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
    if (order.status === 'arrived') return reread(client, actor.storeId, orderId);
    const status = String(order.status);
    let unmarked = false;
    if (status === 'paid' || status === 'cooking') {
      const promised = order.promised_at == null ? NaN : new Date(order.promised_at as string).getTime();
      if (!(promised <= Date.now() - LATE_ARRIVAL_MINUTES * 60_000)) {
        throw new RemoteKitchenConflict(
          `Кухня ще готує. «Привезли» без відмітки кухні — через ${LATE_ARRIVAL_MINUTES} хв після обіцяного часу`
        );
      }
      unmarked = true;
    } else {
      statusIs(order, ['dispatched', 'ready'], 'Ще не відправлено');
    }
    await client.query(`UPDATE pos_remote_orders SET status = 'arrived', arrived_at = NOW(), updated_at = NOW() WHERE id = $1`, [
      orderId,
    ]);
    await logEvent(client, orderId, actor, 'arrived', unmarked ? { kitchen_unmarked: true } : {});
    return reread(client, actor.storeId, orderId);
  });
}

export async function markHandedOver(actor: Actor, orderId: number): Promise<RemoteOrderView> {
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
    if (order.status === 'handed_over') return reread(client, actor.storeId, orderId);
    statusIs(order, ['arrived', 'dispatched', 'ready'], 'Замовлення ще не приїхало');
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'handed_over', handed_at = NOW(), closed_at = NOW(),
              arrived_at = COALESCE(arrived_at, NOW()), updated_at = NOW()
        WHERE id = $1`,
      [orderId]
    );
    await logEvent(client, orderId, actor, 'handed_over');
    return reread(client, actor.storeId, orderId);
  });
}

/**
 * «Гостю повернули»: the cafe answered a kitchen's cancel, and its till stops
 * showing the red line. Only for an order the kitchen cancelled; a second tap
 * is the same answer.
 */
export async function markCancelSeen(actor: Actor, orderId: number): Promise<RemoteOrderView> {
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
    if (order.status !== 'cancelled' || order.cancelled_by !== 'kitchen') {
      throw new RemoteKitchenConflict('Кухня це замовлення не скасовувала');
    }
    if (order.cancel_seen_at != null) return reread(client, actor.storeId, orderId);
    await client.query(`UPDATE pos_remote_orders SET cancel_seen_at = NOW(), updated_at = NOW() WHERE id = $1`, [
      orderId,
    ]);
    await logEvent(client, orderId, actor, 'cancel_seen');
    return reread(client, actor.storeId, orderId);
  });
}

// ── the kitchen answers ─────────────────────────────────────────────

/**
 * The kitchen names its time: how long until it leaves the kitchen. The road
 * is added from the link and the total is rounded up to five. `revision` must
 * be the one the kitchen saw — a cart changed since is a different question.
 */
export async function kitchenQuote(
  actor: Actor,
  orderId: number,
  input: { minutes?: unknown; revision?: unknown }
): Promise<RemoteOrderView> {
  const minutes = minutesOf(input.minutes, 'Час приготування');
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'kitchen');
    // «Змінити час» (РК4): a time the server confirmed by itself is the
    // kitchen's to correct while the guest is still thinking. Its own answer,
    // or the cafe's phone, is not; nor one whose time to agree has run out.
    if (order.status === 'expired') {
      throw new RemoteKitchenConflict('Час для гостя вже минув — кафе спитає кухню знову');
    }
    const requote = order.status === 'quoted' && order.quote_source === 'auto';
    if (!requote) statusIs(order, ['requested'], 'На це замовлення вже відповіли');
    if (Number(input.revision) !== Number(order.revision)) {
      throw new RemoteKitchenConflict('Кафе змінило замовлення — подивіться ще раз');
    }
    const link = linkOf((await client.query(`SELECT * FROM pos_kitchen_links WHERE id = $1`, [order.link_id])).rows[0]);
    const transit = order.transit_minutes == null ? link.transit_minutes : Number(order.transit_minutes);
    const quoted = roundUpToFive(minutes + transit);
    // The same time again is the kitchen's yes to it, not a new question: the
    // guest's time to agree runs on, or every idle tap would hold the order
    // longer than the cafe's own limit. A new time is a new question.
    const sameTime = requote && quoted === Number(order.quoted_minutes);
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'quoted', quote_source = 'kitchen', prep_minutes = $2, transit_minutes = $3,
              quoted_minutes = $4, quoted_by = $5,
              quoted_at = CASE WHEN $7::boolean THEN quoted_at ELSE NOW() END,
              quote_expires_at = CASE WHEN $7::boolean THEN quote_expires_at
                                      ELSE NOW() + make_interval(secs => $6) END,
              updated_at = NOW()
        WHERE id = $1`,
      [orderId, minutes, transit, quoted, actor.staffId, link.quote_ttl_seconds, sameTime]
    );
    await logEvent(client, orderId, actor, requote ? 'requoted' : 'quoted', { prep_minutes: minutes, minutes: quoted });
    return reread(client, actor.storeId, orderId);
  });
}

/**
 * The kitchen cannot: busy, closing, or some dishes are out. Lines marked
 * here come back to the till as «немає», so the cashier can ask again without them.
 */
export async function kitchenDecline(
  actor: Actor,
  orderId: number,
  input: { reason?: unknown; problems?: unknown; revision?: unknown }
): Promise<RemoteOrderView> {
  const reason = cleanText(input.reason, 160);
  const problems: Array<{ itemId: number; problem: 'stop' | 'unavailable' }> = [];
  if (input.problems !== undefined) {
    if (!Array.isArray(input.problems)) throw new RemoteKitchenError('Некоректний список страв');
    for (const raw of input.problems.slice(0, MAX_ITEMS)) {
      const entry = (raw ?? {}) as { item_id?: unknown; problem?: unknown };
      const itemId = Number(entry.item_id);
      const problem = entry.problem === 'unavailable' ? 'unavailable' : 'stop';
      if (!Number.isInteger(itemId) || itemId < 1) throw new RemoteKitchenError('Некоректна страва');
      problems.push({ itemId, problem });
    }
  }
  if (!reason && problems.length === 0) throw new RemoteKitchenError('Вкажіть причину або страви, яких немає');
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'kitchen');
    statusIs(order, ['requested', 'quoted'], 'Замовлення вже оплачено або закрито');
    if (input.revision !== undefined && Number(input.revision) !== Number(order.revision)) {
      throw new RemoteKitchenConflict('Кафе змінило замовлення — подивіться ще раз');
    }
    for (const p of problems) {
      const updated = await client.query(
        `UPDATE pos_remote_order_items SET problem = $3 WHERE id = $1 AND remote_order_id = $2`,
        [p.itemId, orderId, p.problem]
      );
      if (updated.rowCount === 0) throw new RemoteKitchenNotFound('Страву в замовленні не знайдено');
    }
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'declined', decline_reason = $2, quoted_by = $3, quoted_at = NOW(),
              quote_expires_at = NULL, updated_at = NOW()
        WHERE id = $1`,
      [orderId, reason ?? 'Немає деяких страв', actor.staffId]
    );
    await logEvent(client, orderId, actor, 'declined', {
      reason,
      problems: problems.map((p) => ({ item_id: p.itemId, problem: p.problem })),
    });
    return reread(client, actor.storeId, orderId);
  });
}

export async function markReady(actor: Actor, orderId: number): Promise<RemoteOrderView> {
  return simpleStep(actor, orderId, 'kitchen', ['paid', 'cooking'], 'ready', 'ready_at', 'Замовлення ще не оплачено');
}

export async function markDispatched(actor: Actor, orderId: number): Promise<RemoteOrderView> {
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'kitchen');
    if (order.status === 'dispatched') return reread(client, actor.storeId, orderId);
    statusIs(order, ['paid', 'cooking', 'ready'], 'Замовлення ще не оплачено або вже в дорозі');
    await client.query(
      `UPDATE pos_remote_orders
          SET status = 'dispatched', dispatched_at = NOW(), ready_at = COALESCE(ready_at, NOW()), updated_at = NOW()
        WHERE id = $1`,
      [orderId]
    );
    await logEvent(client, orderId, actor, 'dispatched');
    return reread(client, actor.storeId, orderId);
  });
}

/** «Затримка +N хв»: the promise moves, and the cafe sees the new time. */
export async function delayOrder(
  actor: Actor,
  orderId: number,
  input: { minutes?: unknown; reason?: unknown }
): Promise<RemoteOrderView> {
  const minutes = minutesOf(input.minutes, 'Затримка', MAX_DELAY_MINUTES);
  const reason = cleanText(input.reason, 160);
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'kitchen');
    statusIs(order, ['paid', 'cooking', 'ready'], 'Затримку можна поставити лише до відправлення');
    await client.query(
      `UPDATE pos_remote_orders
          SET promised_at = promised_at + make_interval(mins => $2),
              quoted_minutes = quoted_minutes + $2, updated_at = NOW()
        WHERE id = $1`,
      [orderId, minutes]
    );
    await logEvent(client, orderId, actor, 'delayed', { minutes, reason });
    return reread(client, actor.storeId, orderId);
  });
}

/**
 * Cancel a PAID order, from either side, until it has left the kitchen. The
 * kitchen gets back exactly what the order took (the snapshot, not today's
 * recipe). The money is the cafe's: its receipt is refunded at the till the
 * usual way — this does not touch the sale.
 */
export async function cancelPaid(actor: Actor, orderId: number, input: { reason?: unknown }): Promise<RemoteOrderView> {
  const reason = cleanText(input.reason, 160);
  if (!reason) throw new RemoteKitchenError('Вкажіть причину скасування');
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, 'either');
    if (order.status === 'cancelled') return reread(client, actor.storeId, orderId);
    statusIs(order, ['paid', 'cooking', 'ready'], 'Скасувати можна лише оплачене й ще не відправлене замовлення');
    await cancelLockedTx(client, actor, order, reason);
    return reread(client, actor.storeId, orderId);
  });
}

/**
 * The cafe voided the receipt that paid for a kitchen order (РК2): the guest
 * did not pay after all — a cashier's void, or ПРРО refusing the receipt
 * (`abortSale` → `voidSale`). Runs inside the void's transaction.
 *
 * An order still in the kitchen is cancelled and its stock goes back, the
 * same as «Скасувати». One already on its way cannot be called back by a
 * void, so it only gets an event the kitchen will see; returning the food is
 * then a conversation, not a button.
 */
export async function onCafeSaleVoidedTx(
  client: DbClient,
  actor: Actor,
  saleId: number
): Promise<void> {
  const found = await client.query(
    `SELECT id FROM pos_remote_orders WHERE cafe_store_id = $1 AND cafe_sale_id = $2`,
    [actor.storeId, saleId]
  );
  if (found.rows.length === 0) return;
  const orderId = Number(found.rows[0].id);
  const order = await lockOrder(client, actor.storeId, orderId, 'cafe');
  if (order.status === 'cancelled') return;
  if (['paid', 'cooking', 'ready'].includes(String(order.status))) {
    await cancelLockedTx(client, actor, order, 'Чек кафе скасовано');
    return;
  }
  await logEvent(client, orderId, actor, 'cafe_sale_voided', { sale_id: saleId });
}

async function cancelLockedTx(
  client: DbClient,
  actor: Actor,
  order: Record<string, unknown>,
  reason: string
): Promise<void> {
  const orderId = Number(order.id);
  const kitchenStoreId = Number(order.kitchen_store_id);
  const items = await client.query(
    `SELECT id, kitchen_variant_id, quantity FROM pos_remote_order_items WHERE remote_order_id = $1`,
    [orderId]
  );
  // `returnStockForLine` wants a staff id for the movement; only a kitchen
  // person can be on the kitchen's books, so a cancel from the cafe is null.
  const staffForKitchen = actor.storeId === kitchenStoreId ? actor.staffId : null;
  for (const item of items.rows) {
    await returnStockForLine(client, {
      storeId: kitchenStoreId,
      target: 'remote',
      lineId: Number(item.id),
      variantId: Number(item.kitchen_variant_id),
      quantity: Number(item.quantity),
      reason: 'void',
      staffId: staffForKitchen,
      referenceType: 'remote_order',
      referenceId: orderId,
    });
  }
  await client.query(
    `UPDATE pos_remote_orders
        SET status = 'cancelled', decline_reason = $2, cancelled_by = $3, closed_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [orderId, reason, actor.storeId === kitchenStoreId ? 'kitchen' : 'cafe']
  );
  await queueRemoteCancelTx(client, kitchenStoreId, orderId);
  await logEvent(client, orderId, actor, 'cancelled', {
    reason,
    by: actor.storeId === kitchenStoreId ? 'kitchen' : 'cafe',
  });
}

// ── shared step ─────────────────────────────────────────────────────

async function simpleStep(
  actor: Actor,
  orderId: number,
  side: 'cafe' | 'kitchen',
  from: readonly RemoteOrderStatus[],
  to: RemoteOrderStatus,
  stampColumn: 'ready_at' | 'arrived_at',
  message: string
): Promise<RemoteOrderView> {
  return inTransaction(async (client) => {
    const order = await lockOrder(client, actor.storeId, orderId, side);
    if (order.status === to) return reread(client, actor.storeId, orderId);
    statusIs(order, from, message);
    await client.query(
      `UPDATE pos_remote_orders SET status = $2, ${stampColumn} = NOW(), updated_at = NOW() WHERE id = $1`,
      [orderId, to]
    );
    await logEvent(client, orderId, actor, to);
    return reread(client, actor.storeId, orderId);
  });
}

/** The journal of one order, oldest first, for «чому піца їхала 50 хвилин». */
export async function listEvents(
  storeId: number,
  orderId: number
): Promise<Array<{ at: string; kind: string; by: 'cafe' | 'kitchen' | 'system'; payload: unknown }>> {
  const order = await getOrder(storeId, orderId);
  const rows = await pool.query(
    `SELECT at, kind, actor_store_id, payload FROM pos_remote_order_events WHERE remote_order_id = $1 ORDER BY at, id`,
    [orderId]
  );
  return rows.rows.map((row) => ({
    at: isoOrNull(row.at) as string,
    kind: String(row.kind),
    by:
      row.actor_store_id == null
        ? 'system'
        : Number(row.actor_store_id) === order.kitchen_store_id
          ? 'kitchen'
          : 'cafe',
    payload: row.payload,
  }));
}

// ── the report (РК5, §12) ───────────────────────────────────────────

export interface RemoteReportRow {
  /** The other store's id: the row's key — two cafes may share a name. */
  store_id: number;
  /**
   * The other side as this owner knows it: the cafe's name on a kitchen's
   * report, the link's kitchen title («Кухня Пульчинелли») on a cafe's.
   */
  store_name: string;
  /** The other store's public address, if it has one: what tells two same-named points apart. */
  store_address: string | null;
  /**
   * Paid orders the cafe got: the kitchen tapped «Видано», or the cafe tapped
   * «Привезли» / «Видали гостю» (a cook who taps only «Готово» never writes
   * `dispatched_at`, and the cafe's late «Вже привезли» neither).
   */
  orders: number;
  /** Paid orders cancelled before they left, by either side. */
  cancelled: number;
  /** Of `cancelled`, those the KITCHEN cancelled (`cancelled_by`, migration 118). */
  cancelled_kitchen: number;
  /** Of `orders`, at the cafe by the FIRST promise — the time the guest was told. */
  on_time: number;
  /** Of `orders`, at the cafe by the promise as it stood after every «+N хв». */
  on_time_moved: number;
  /** Of `orders`, those the kitchen moved with «+N хв». */
  delayed: number;
  /**
   * Of `orders`, those nobody timed — agreed by phone offline and filed after
   * their promise (`phoneFiledStatus`): neither on time nor late, so «N з M
   * вчасно» counts from `orders - untimed`. Absent on an older server.
   */
  untimed: number;
  /**
   * What the orders the cafe got took off the kitchen's shelf, at TODAY's
   * purchase prices (the snapshot records what left, not what it cost then) —
   * the internal settlement between two points of one ФОП (П1). Lines whose
   * cost is not known are left out and counted in `unpriced_lines`: a zero
   * there would read as «free».
   */
  cost_cents: number;
  unpriced_lines: number;
  dishes: Array<{ name: string; label: string; quantity: number }>;
}

export interface RemoteReport {
  side: 'cafe' | 'kitchen';
  days: number;
  /** The first day counted, on this store's calendar (`YYYY-MM-DD`). */
  from: string;
  rows: RemoteReportRow[];
}

export const REPORT_MAX_DAYS = 90;

/**
 * The orders that reached the cafe — whoever tapped it. Or one handed over with
 * no tap at all: agreed by phone offline and filed only after its promise had
 * long passed (`phoneFiledStatus`) — it reached the guest, nobody timed it.
 */
const REACHED_CAFE = `(o.dispatched_at IS NOT NULL OR o.arrived_at IS NOT NULL OR o.handed_at IS NOT NULL
  OR o.status = 'handed_over')`;

/** When the order was at the cafe: the cafe's own tap, else out of the kitchen's door plus the road. */
const AT_CAFE = `COALESCE(o.arrived_at, o.handed_at,
  o.dispatched_at + make_interval(mins => COALESCE(o.transit_minutes, 0)))`;

/**
 * What ONE unit of a remote line took off the kitchen's shelf, in thousandths
 * of a kopeck: its snapshot, else the kitchen dish's own cost card — the café
 * analytics' rule (`cafe-analytics.service.ts`).
 */
const REMOTE_UNIT_COST_MILLI = `COALESCE((
  SELECT SUM(c.quantity_per_unit * COALESCE(cv.cost_milli, 0))
    FROM pos_remote_order_item_components c
    JOIN pos_variants cv ON cv.id = c.component_variant_id
   WHERE c.remote_order_item_id = i.id
), kv.cost_milli, 0)`;

/** Whether that cost can be trusted: an unpriced leaf (or dish) is «unknown», never 0. */
const REMOTE_COST_IS_KNOWN = `(
  CASE WHEN EXISTS (SELECT 1 FROM pos_remote_order_item_components c WHERE c.remote_order_item_id = i.id)
       THEN NOT EXISTS (
         SELECT 1 FROM pos_remote_order_item_components c
           JOIN pos_variants cv ON cv.id = c.component_variant_id
          WHERE c.remote_order_item_id = i.id AND COALESCE(cv.cost_milli, 0) <= 0
       )
       ELSE COALESCE(kv.cost_milli, 0) > 0
  END
)`;

/**
 * «Віддано на точки» (РК5): what the kitchen handed over to each cafe over the
 * last `days` days of THIS store's calendar (1 = today), by dish and size, at
 * what cost, and how many of those promises it kept — or, read by the cafe,
 * what it got from its kitchen. Paid orders only; an order counts on the day
 * it was paid. «Вчасно» is against the FIRST promise, the time the guest was
 * told — a «+10 хв» pressed before the order ran late does not make it
 * punctual — and `on_time_moved` says how many met the moved one.
 */
export async function remoteReport(storeId: number, side: 'cafe' | 'kitchen', days: number): Promise<RemoteReport> {
  const span = Math.min(Math.max(Number.isFinite(days) ? Math.floor(days) : 7, 1), REPORT_MAX_DAYS);
  const clock = await storeClock(pool, storeId);
  const mine = side === 'kitchen' ? 'o.kitchen_store_id' : 'o.cafe_store_id';
  const other = side === 'kitchen' ? 'o.cafe_store_id' : 'o.kitchen_store_id';
  // The store's own calendar, as every other report of the POS reads it.
  const scope = `
      WHERE ${mine} = $1
        AND o.paid_at IS NOT NULL
        AND (o.paid_at AT TIME ZONE $2)::date >= $3::date - ($4::int - 1)`;
  const params = [storeId, clock.timezone, clock.today, span];
  // The first promise is the moved one less every «+N хв» the kitchen gave.
  const heads = await pool.query(
    `SELECT t.other_key AS other_id, s.name AS other_name, s.public_address AS other_address,
            (SELECT l.kitchen_title FROM pos_kitchen_links l
              WHERE l.cafe_store_id = t.cafe_id AND l.kitchen_store_id = t.kitchen_id
              ORDER BY l.id DESC LIMIT 1) AS kitchen_title,
            t.orders, t.cancelled, t.cancelled_kitchen, t.on_time, t.on_time_moved, t.delayed, t.untimed
       FROM (
         SELECT ${other} AS other_key, MIN(o.cafe_store_id) AS cafe_id, MIN(o.kitchen_store_id) AS kitchen_id,
                COUNT(*) FILTER (WHERE ${REACHED_CAFE})::int AS orders,
                COUNT(*) FILTER (WHERE o.status = 'cancelled' AND NOT ${REACHED_CAFE})::int AS cancelled,
                COUNT(*) FILTER (
                  WHERE o.status = 'cancelled' AND NOT ${REACHED_CAFE} AND o.cancelled_by = 'kitchen'
                )::int AS cancelled_kitchen,
                COUNT(*) FILTER (
                  WHERE ${REACHED_CAFE} AND o.promised_at IS NOT NULL
                    AND ${AT_CAFE} <= o.promised_at - make_interval(mins => d.minutes)
                )::int AS on_time,
                COUNT(*) FILTER (
                  WHERE ${REACHED_CAFE} AND o.promised_at IS NOT NULL AND ${AT_CAFE} <= o.promised_at
                )::int AS on_time_moved,
                COUNT(*) FILTER (WHERE ${REACHED_CAFE} AND d.times > 0)::int AS delayed,
                COUNT(*) FILTER (WHERE ${REACHED_CAFE} AND ${AT_CAFE} IS NULL)::int AS untimed
           FROM pos_remote_orders o
           CROSS JOIN LATERAL (
             SELECT COUNT(*)::int AS times, COALESCE(SUM((e.payload->>'minutes')::int), 0)::int AS minutes
               FROM pos_remote_order_events e
              WHERE e.remote_order_id = o.id AND e.kind = 'delayed'
           ) d
          ${scope}
          GROUP BY ${other}
       ) t
       JOIN pos_stores s ON s.id = t.other_key
      ORDER BY s.name, t.other_key`,
    params
  );
  const dishes = await pool.query(
    `SELECT ${other} AS other_id, i.product_name AS name, COALESCE(i.variant_label, '') AS label,
            SUM(i.quantity)::int AS quantity,
            ${sqlMilliToCents(`SUM(CASE WHEN ${REMOTE_COST_IS_KNOWN} THEN ${REMOTE_UNIT_COST_MILLI} * i.quantity ELSE 0 END)`)}
              AS cost_cents,
            COUNT(*) FILTER (WHERE NOT ${REMOTE_COST_IS_KNOWN})::int AS unpriced_lines
       FROM pos_remote_orders o
       JOIN pos_remote_order_items i ON i.remote_order_id = o.id
       LEFT JOIN pos_variants kv ON kv.id = i.kitchen_variant_id
      ${scope}
        AND ${REACHED_CAFE}
      GROUP BY ${other}, i.product_name, COALESCE(i.variant_label, '')
      ORDER BY quantity DESC, i.product_name, label`,
    params
  );
  return {
    side,
    days: span,
    from: shiftDay(clock.today, -(span - 1)),
    rows: heads.rows.map((row) => {
      const otherId = Number(row.other_id);
      const mineDishes = dishes.rows.filter((d) => Number(d.other_id) === otherId);
      return {
        store_id: otherId,
        store_name:
          side === 'cafe' && row.kitchen_title != null ? String(row.kitchen_title) : String(row.other_name),
        store_address: row.other_address == null || row.other_address === '' ? null : String(row.other_address),
        orders: Number(row.orders),
        cancelled: Number(row.cancelled),
        cancelled_kitchen: Number(row.cancelled_kitchen),
        on_time: Number(row.on_time),
        on_time_moved: Number(row.on_time_moved),
        delayed: Number(row.delayed),
        untimed: Number(row.untimed),
        cost_cents: mineDishes.reduce((sum, d) => sum + Number(d.cost_cents), 0),
        unpriced_lines: mineDishes.reduce((sum, d) => sum + Number(d.unpriced_lines), 0),
        dishes: mineDishes.map((d) => ({ name: String(d.name), label: String(d.label), quantity: Number(d.quantity) })),
      };
    }),
  };
}

/** `YYYY-MM-DD` moved by whole days, on the calendar alone. */
function shiftDay(day: string, by: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + by);
  return at.toISOString().slice(0, 10);
}

/**
 * Which sides this store has a report on: every link it was ever part of,
 * revoked ones included — the season's settlement is read after the link is
 * gone, and the owner's page asks this, not the live setup.
 */
export async function reportSides(storeId: number): Promise<Array<'cafe' | 'kitchen'>> {
  const row = await pool.query(
    `SELECT COALESCE(bool_or(cafe_store_id = $1), false) AS cafe,
            COALESCE(bool_or(kitchen_store_id = $1), false) AS kitchen
       FROM pos_kitchen_links
      WHERE cafe_store_id = $1 OR kitchen_store_id = $1`,
    [storeId]
  );
  const sides: Array<'cafe' | 'kitchen'> = [];
  if (row.rows[0]?.kitchen) sides.push('kitchen');
  if (row.rows[0]?.cafe) sides.push('cafe');
  return sides;
}
