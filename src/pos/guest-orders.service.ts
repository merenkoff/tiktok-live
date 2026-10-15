// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/guest-orders.service.ts — a guest asks for dishes from the QR menu,
// a waiter accepts (TechDocs/POS_QR_MENU.md, phase Q6; migration 058).
//
// The one rule everything here serves: NOTHING a guest sends reaches the
// kitchen, the stock or the bill until a waiter accepts it. A request lives in
// `pos_guest_orders` and becomes bill lines in one transaction, under the
// WAITER's staff id, using the same functions a waiter's own taps use
// (`openBillTx`, `addDraftItemTx`, then `fireRound`). Why not simply draft
// lines with a flag is in the header of migration 058.
//
// The one exception is the owner's own (phase Q9, migration 068): with
// `public_menu_auto_kitchen` on, an order up to the owner's limit goes straight
// to the kitchen — `reorders` only when a waiter has already opened the table's
// bill, `all` always. It is the same request row, decided `sent` in the same
// transaction that inserts it, its lines added as rows of their OWN (never
// merged into what a waiter is typing) and fired as a round of their own; a
// waiter then sees a notice and taps «Бачу». If any line cannot go (stopped
// between the menu and the tap), the whole order falls back to a request
// that waits for a waiter, exactly as it would have with the switch off.
//
// Two audiences, one file, because the state machine is one:
//
//   the GUEST (no login; the route has already checked the store token, the
//   table and its key) — create, look at own requests, cancel a pending one;
//   the WAITER (`ensurePosAuth`) — list what is waiting, accept, reject.
//
// A guest is unauthenticated and a QR is a photograph away from anyone, so the
// guest side is defensive: every line is checked against the PUBLISHED menu
// (an ingredient, a retired dish or a stopped one is refused), answers go
// through the same group rules as a waiter's, and the volume is capped per
// table — lines, quantity, requests waiting, requests per ten minutes — in
// memory, per process (no `trustProxy`, so an IP is not a usable key; the
// table is).

import crypto from 'crypto';
import type pg from 'pg';
import { pool } from '../db.js';
import * as bills from './bills.service.js';
import * as rounds from './rounds.service.js';
import { listLiveCalls, type LiveWaiterCall } from './waiter-calls.service.js';
import * as modifiers from './modifiers.service.js';
import { readStoreClock } from './core/storeClock.js';
import type { AutoKitchenMode, MenuTable, PublicMenu } from './public-menu/menu.service.js';

export class GuestOrderError extends Error {}
export class GuestOrderNotFound extends GuestOrderError {}
/** 409: the request is no longer in a state that allows this. */
export class GuestOrderConflict extends GuestOrderError {}
/** 409 on one line: the waiter can accept the rest without it. */
export class GuestOrderLineProblem extends GuestOrderConflict {
  constructor(
    message: string,
    readonly itemId: number
  ) {
    super(message);
  }
}
/** 429: too many requests from one table. */
export class GuestOrderTooMany extends GuestOrderError {}

// ── limits ──────────────────────────────────────────────────────────

export const MAX_ITEMS = 30;
export const MAX_QUANTITY = 20;
export const MAX_PENDING_PER_TABLE = 3;
export const MAX_REQUESTS_PER_WINDOW = 8;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
/** How long an unanswered request stays a request. */
export const TTL_MINUTES = 30;
/** How many of their own requests a phone may ask about at once. */
export const MAX_STATUS_IDS = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const recent = new Map<string, number[]>();

/** Test seam: forget who asked how often. */
export function resetGuestOrderLimits(): void {
  recent.clear();
}

/** Count one new request against the table's window; throws when it is already full. */
function takeRateSlot(storeId: number, tableId: number, now = Date.now()): void {
  const key = `${storeId}:${tableId}`;
  const fresh = (recent.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (fresh.length >= MAX_REQUESTS_PER_WINDOW) {
    recent.set(key, fresh);
    throw new GuestOrderTooMany('Забагато запитів із цього столу — зачекайте кілька хвилин або покличте офіціанта');
  }
  fresh.push(now);
  recent.set(key, fresh);
}

// ── shapes ──────────────────────────────────────────────────────────

export interface GuestOrderLineInput {
  variant_id?: unknown;
  quantity?: unknown;
  modifiers?: unknown;
  note?: unknown;
}

export interface GuestOrderInput {
  client_uuid?: unknown;
  items?: unknown;
}

export interface GuestOrderLine {
  name: string;
  /** The size and the answers, composed («M · вівсяне»); empty for a plain dish. */
  caption: string;
  quantity: number;
  note: string;
}

/** What the guest's own phone is told about a request of theirs. Nothing of a waiter, nothing numeric. */
export interface GuestOrderView {
  client_uuid: string;
  /** `sent` — went straight to the kitchen under the owner's auto-send (phase Q9). */
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled' | 'sent';
  created_at: string;
  expires_at: string;
  /** The waiter's reason, when they gave one. */
  reason: string | null;
  lines: GuestOrderLine[];
}

type OrderStatus = GuestOrderView['status'];

function isoOf(value: unknown): string {
  return new Date(value as string).toISOString();
}

async function loadLines(orderIds: number[]): Promise<Map<number, GuestOrderLine[]>> {
  const out = new Map<number, GuestOrderLine[]>();
  if (orderIds.length === 0) return out;
  const result = await pool.query(
    `SELECT order_id, product_name, variant_label, quantity, note
       FROM pos_guest_order_items
      WHERE order_id = ANY($1::bigint[])
      ORDER BY order_id, sort_order ASC, id ASC`,
    [orderIds]
  );
  for (const row of result.rows) {
    const id = Number(row.order_id);
    out.set(id, [
      ...(out.get(id) ?? []),
      {
        name: String(row.product_name),
        caption: String(row.variant_label ?? ''),
        quantity: Number(row.quantity),
        note: String(row.note ?? ''),
      },
    ]);
  }
  return out;
}

async function viewsOf(rows: Array<Record<string, unknown>>): Promise<GuestOrderView[]> {
  const lines = await loadLines(rows.map((row) => Number(row.id)));
  return rows.map((row) => ({
    client_uuid: String(row.client_uuid),
    status: row.status as OrderStatus,
    created_at: isoOf(row.created_at),
    expires_at: isoOf(row.expires_at),
    reason: row.reject_reason == null ? null : String(row.reject_reason),
    lines: lines.get(Number(row.id)) ?? [],
  }));
}

/** Requests nobody answered in time stop being requests. Called wherever they are read. */
export async function expireStaleGuestOrders(storeId: number): Promise<void> {
  await pool.query(
    `UPDATE pos_guest_orders
        SET status = 'expired', decided_at = NOW()
      WHERE store_id = $1 AND status = 'pending' AND expires_at < NOW()`,
    [storeId]
  );
}

// ── the guest ───────────────────────────────────────────────────────

interface ParsedLine {
  variantId: number;
  quantity: number;
  modifierIds: number[];
  note: string;
}

function parseLines(raw: unknown): ParsedLine[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new GuestOrderError('Додайте хоча б одну страву');
  if (raw.length > MAX_ITEMS) throw new GuestOrderError(`Забагато позицій: не більше ${MAX_ITEMS}`);
  return raw.map((entry) => {
    const line = (entry ?? {}) as GuestOrderLineInput;
    const variantId = Number(line.variant_id);
    if (!Number.isInteger(variantId) || variantId <= 0) throw new GuestOrderError('Некоректна страва');
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new GuestOrderError(`Кількість має бути від 1 до ${MAX_QUANTITY}`);
    }
    try {
      return {
        variantId,
        quantity,
        modifierIds: modifiers.normalizeModifierIds(line.modifiers),
        note: modifiers.cleanLineNote(line.note),
      };
    } catch (error) {
      if (error instanceof modifiers.ModifierError) throw new GuestOrderError(error.message);
      throw error;
    }
  });
}

/** Every dish the published menu offers today, by size id. */
function menuIndex(menu: PublicMenu) {
  const index = new Map<number, { product: PublicMenu['categories'][number]['products'][number]; variantIndex: number }>();
  for (const category of menu.categories) {
    for (const product of category.products) {
      product.variants.forEach((variant, variantIndex) => index.set(variant.id, { product, variantIndex }));
    }
  }
  return index;
}

async function findByUuid(storeId: number, uuid: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM pos_guest_orders WHERE store_id = $1 AND client_uuid = $2`, [
    storeId,
    uuid,
  ]);
  return result.rows[0] ?? null;
}

/** The owner's auto-send settings, as the store row has them (phase Q9). */
export interface AutoSendPolicy {
  mode: AutoKitchenMode;
  limitCents: number;
}

const NO_AUTO_SEND: AutoSendPolicy = { mode: 'off', limitCents: 0 };

/**
 * A guest asks for dishes. The route has already established that the store's
 * ordering switch is on and that the table and its key are real.
 *
 * Idempotent on `client_uuid`: the same request twice (a retry on a bad
 * connection) is the same row, and does not spend a slot of the table's
 * allowance a second time — nor fires a second round.
 */
export async function createGuestOrder(
  storeId: number,
  table: MenuTable,
  menu: PublicMenu,
  input: GuestOrderInput,
  policy: AutoSendPolicy = NO_AUTO_SEND
): Promise<GuestOrderView> {
  const uuid = typeof input.client_uuid === 'string' ? input.client_uuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(uuid)) throw new GuestOrderError('client_uuid має бути UUID');
  const lines = parseLines(input.items);

  await expireStaleGuestOrders(storeId);
  const existing = await findByUuid(storeId, uuid);
  if (existing) {
    if (Number(existing.table_id) !== table.id) throw new GuestOrderConflict('Цей запит уже використано');
    return (await viewsOf([existing]))[0]!;
  }

  const pending = await pool.query(
    `SELECT COUNT(*)::int AS n FROM pos_guest_orders WHERE store_id = $1 AND table_id = $2 AND status = 'pending'`,
    [storeId, table.id]
  );
  if (Number(pending.rows[0].n) >= MAX_PENDING_PER_TABLE) {
    throw new GuestOrderTooMany('Ваші попередні запити ще чекають офіціанта — зачекайте або покличте його');
  }

  // Every line against what the guest can see on the menu, then against the
  // groups' own rules — the same ones a waiter's tap meets.
  const index = menuIndex(menu);
  const resolved: Array<{ line: ParsedLine; name: string; caption: string; snapshot: modifiers.LineModifierSnapshot[] }> = [];
  // What the order comes to at the prices the guest sees — the cart's
  // «Орієнтовно», and the number the owner's auto-send limit is held against.
  let totalCents = 0;
  for (const line of lines) {
    const hit = index.get(line.variantId);
    if (!hit) throw new GuestOrderError('Цієї страви немає в меню');
    const { product, variantIndex } = hit;
    const variant = product.variants[variantIndex]!;
    if (product.stopped || !product.available || !variant.available) {
      throw new GuestOrderConflict(`«${product.name}» зараз недоступна`);
    }
    let chosen: modifiers.ResolvedLineModifiers;
    try {
      chosen = await modifiers.resolveForVariant(pool, storeId, line.variantId, line.modifierIds);
    } catch (error) {
      if (error instanceof modifiers.ModifierError) throw new GuestOrderError(error.message);
      throw error;
    }
    const size = product.variants.length > 1 ? variant.label : '';
    const caption = [size, ...chosen.snapshot.map((m) => m.name)].filter((part) => part !== '').join(' · ');
    resolved.push({ line, name: product.name, caption, snapshot: chosen.snapshot });
    totalCents += (variant.price_cents + chosen.deltaCents) * line.quantity;
  }

  takeRateSlot(storeId, table.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO pos_guest_orders (store_id, table_id, client_uuid, expires_at, total_cents)
       VALUES ($1, $2, $3, NOW() + make_interval(mins => $4), $5)
       RETURNING *`,
      [storeId, table.id, uuid, TTL_MINUTES, totalCents]
    );
    let order = inserted.rows[0];
    let sort = 0;
    for (const item of resolved) {
      await client.query(
        `INSERT INTO pos_guest_order_items
           (order_id, variant_id, quantity, product_name, variant_label, modifiers, note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          order.id,
          item.line.variantId,
          item.line.quantity,
          item.name,
          item.caption,
          item.snapshot.length ? JSON.stringify(item.snapshot) : null,
          item.line.note,
          sort,
        ]
      );
      sort += 1;
    }
    if (policy.mode !== 'off' && totalCents <= policy.limitCents) {
      order = (await tryAutoSend(client, storeId, table.id, Number(order.id), policy.mode)) ?? order;
    }
    await client.query('COMMIT');
    return (await viewsOf([order]))[0]!;
  } catch (error) {
    await client.query('ROLLBACK');
    // Two taps of the same request racing: the loser reads the winner's row.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      const won = await findByUuid(storeId, uuid);
      if (won && Number(won.table_id) === table.id) return (await viewsOf([won]))[0]!;
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Phase Q9: send a just-inserted request straight to the kitchen, inside the
 * caller's transaction. Returns the request row as `sent`, or null when it
 * stays a request for a waiter — `reorders` and no waiter has opened the
 * table's bill, or a line could not go (stopped, taken off the menu, its
 * answers no longer valid). A refusal rolls back to a savepoint, so the
 * request itself is kept and nothing of the attempt is: no bill, no line, no
 * round, no stock.
 */
async function tryAutoSend(
  client: pg.PoolClient,
  storeId: number,
  tableId: number,
  orderId: number,
  mode: Exclude<AutoKitchenMode, 'off'>
): Promise<Record<string, unknown> | null> {
  await client.query('SAVEPOINT guest_auto_send');
  try {
    const open = await client.query(
      `SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2 AND status = 'open'`,
      [storeId, tableId]
    );
    let billId: number;
    if (open.rows.length > 0) {
      billId = Number(open.rows[0].id);
    } else if (mode === 'all') {
      // Nobody seated the table: the bill opens with no waiter behind it, and
      // the first «Бачу» on this order makes it that waiter's.
      billId = (await bills.openBillTx(client, { storeId, staffId: null, openedByGuest: true, tableId })).billId;
    } else {
      await client.query('RELEASE SAVEPOINT guest_auto_send');
      return null;
    }

    const items = await client.query(
      `SELECT id, variant_id, quantity, modifiers, note
         FROM pos_guest_order_items WHERE order_id = $1 ORDER BY sort_order ASC, id ASC`,
      [orderId]
    );
    const lineIds: number[] = [];
    for (const row of items.rows) {
      const ids = modifiers
        .parseLineModifierSnapshot(row.modifiers)
        .map((m) => m.modifier_id)
        .filter((id): id is number => id != null);
      lineIds.push(
        await bills.insertGuestDraftItemTx(client, storeId, billId, orderId, {
          variant_id: Number(row.variant_id),
          quantity: Number(row.quantity),
          modifiers: ids,
          note: String(row.note ?? ''),
        })
      );
    }
    const fired = await rounds.fireRoundTx(client, {
      storeId,
      staffId: null,
      billId,
      clientUuid: roundUuidFor(orderId),
      itemIds: lineIds,
      guestOrderId: orderId,
    });
    const sent = await client.query(
      `UPDATE pos_guest_orders
          SET status = 'sent', bill_id = $2, round_id = $3, decided_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId, billId, fired.roundId]
    );
    await client.query('RELEASE SAVEPOINT guest_auto_send');
    return sent.rows[0];
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT guest_auto_send');
    // A dish that cannot go is the waiter's to sort out, as it always was:
    // the order waits for them with the problem line marked. Anything else is
    // a real failure and fails the request.
    if (error instanceof bills.BillError || error instanceof modifiers.ModifierError) return null;
    throw error;
  }
}

/** The guest's own requests, by the ids their phone holds. Only this table's, only this store's. */
export async function listOwnGuestOrders(storeId: number, table: MenuTable, rawIds: unknown): Promise<GuestOrderView[]> {
  const ids = (Array.isArray(rawIds) ? rawIds : typeof rawIds === 'string' ? rawIds.split(',') : [])
    .map((id) => String(id).trim().toLowerCase())
    .filter((id) => UUID_RE.test(id))
    .slice(0, MAX_STATUS_IDS);
  if (ids.length === 0) return [];
  await expireStaleGuestOrders(storeId);
  const result = await pool.query(
    `SELECT * FROM pos_guest_orders
      WHERE store_id = $1 AND table_id = $2 AND client_uuid = ANY($3::uuid[])
      ORDER BY created_at ASC`,
    [storeId, table.id, ids]
  );
  return viewsOf(result.rows);
}

/** The guest changes their mind while the request is still waiting. */
export async function cancelOwnGuestOrder(storeId: number, table: MenuTable, rawUuid: unknown): Promise<GuestOrderView> {
  const uuid = typeof rawUuid === 'string' ? rawUuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(uuid)) throw new GuestOrderNotFound('Запит не знайдено');
  await expireStaleGuestOrders(storeId);
  const updated = await pool.query(
    `UPDATE pos_guest_orders
        SET status = 'cancelled', decided_at = NOW()
      WHERE store_id = $1 AND table_id = $2 AND client_uuid = $3 AND status = 'pending'
      RETURNING *`,
    [storeId, table.id, uuid]
  );
  if (updated.rows.length > 0) return (await viewsOf(updated.rows))[0]!;
  const row = await pool.query(`SELECT * FROM pos_guest_orders WHERE store_id = $1 AND table_id = $2 AND client_uuid = $3`, [
    storeId,
    table.id,
    uuid,
  ]);
  if (row.rows.length === 0) throw new GuestOrderNotFound('Запит не знайдено');
  const view = (await viewsOf(row.rows))[0]!;
  // Cancelling twice is fine; cancelling what a waiter already took is not.
  if (view.status === 'cancelled') return view;
  throw new GuestOrderConflict(
    view.status === 'accepted'
      ? 'Запит уже прийнято — скасуйте в офіціанта'
      : view.status === 'sent'
        ? 'Замовлення вже на кухні — скасуйте в офіціанта'
        : 'Запит уже не чекає'
  );
}

// ── the waiter ──────────────────────────────────────────────────────

export interface WaitingLine {
  id: number;
  name: string;
  caption: string;
  quantity: number;
  note: string;
  /** Why this line cannot be accepted right now (stopped, taken off the menu), or null. */
  problem: string | null;
}

export interface WaitingGuestOrder {
  id: number;
  table_id: number;
  table_name: string;
  hall_name: string;
  created_at: string;
  expires_at: string;
  /** The table already has an open bill: accepting adds to it rather than opening one. */
  has_open_bill: boolean;
  lines: WaitingLine[];
}

/** Everything waiting for a waiter — one table's, or the whole store's. */
export async function listWaitingGuestOrders(storeId: number, tableId?: number): Promise<WaitingGuestOrder[]> {
  await expireStaleGuestOrders(storeId);
  const clock = await readStoreClock(storeId);
  const orders = await pool.query(
    `SELECT o.id, o.table_id, o.created_at, o.expires_at, t.name AS table_name, h.name AS hall_name,
            EXISTS (SELECT 1 FROM pos_bills b WHERE b.store_id = o.store_id AND b.table_id = o.table_id AND b.status = 'open') AS has_open_bill
       FROM pos_guest_orders o
       JOIN pos_tables t ON t.id = o.table_id
       JOIN pos_halls h ON h.id = t.hall_id
      WHERE o.store_id = $1 AND o.status = 'pending' AND ($2::bigint IS NULL OR o.table_id = $2)
      ORDER BY o.created_at ASC`,
    [storeId, tableId ?? null]
  );
  const ids = orders.rows.map((row) => Number(row.id));
  const items = ids.length
    ? await pool.query(
        `SELECT i.id, i.order_id, i.product_name, i.variant_label, i.quantity, i.note,
                p.is_active, (p.stop_listed_on IS NOT NULL AND p.stop_listed_on::text = $2) AS stopped
           FROM pos_guest_order_items i
           JOIN pos_variants v ON v.id = i.variant_id
           JOIN pos_products p ON p.id = v.product_id
          WHERE i.order_id = ANY($1::bigint[])
          ORDER BY i.order_id, i.sort_order ASC, i.id ASC`,
        [ids, clock.today]
      )
    : { rows: [] as Array<Record<string, unknown>> };
  const byOrder = new Map<number, WaitingLine[]>();
  for (const row of items.rows) {
    const id = Number(row.order_id);
    byOrder.set(id, [
      ...(byOrder.get(id) ?? []),
      {
        id: Number(row.id),
        name: String(row.product_name),
        caption: String(row.variant_label ?? ''),
        quantity: Number(row.quantity),
        note: String(row.note ?? ''),
        problem: row.is_active !== true ? 'знято з меню' : row.stopped === true ? 'сьогодні в стоп-листі' : null,
      },
    ]);
  }
  return orders.rows.map((row) => ({
    id: Number(row.id),
    table_id: Number(row.table_id),
    table_name: String(row.table_name),
    hall_name: String(row.hall_name),
    created_at: isoOf(row.created_at),
    expires_at: isoOf(row.expires_at),
    has_open_bill: row.has_open_bill === true,
    lines: byOrder.get(Number(row.id)) ?? [],
  }));
}

export interface AcceptInput {
  storeId: number;
  staffId: number;
  orderId: number;
  /** Ids of `pos_guest_order_items` to leave out (a dish that ran out): the rest is accepted. */
  excludeItemIds?: number[];
  guests?: unknown;
}

export interface AcceptResult {
  bill: bills.Bill;
  /** The lines went to the kitchen as a round. False when the draft already held the waiter's own lines. */
  fired: boolean;
  /** Set when the lines are in the bill but the round did not go out. */
  warning: string | null;
  /** The request had already been accepted; nothing was done a second time. */
  already: boolean;
}

/** A stable UUID for the round an accepted request fires, so a retried accept can never fire twice. */
export function roundUuidFor(orderId: number): string {
  const bytes = crypto.createHash('sha256').update(`guest-order-round:${orderId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The waiter accepts: the table's bill (opened if there is none) gets the
 * lines, in ONE transaction that also marks the request accepted — so a
 * refusal on the third dish leaves no bill and no half of an order, and a
 * double tap finds the request already accepted. Then, if the draft held
 * nothing but these lines, they go to the kitchen as a round; if the waiter
 * had lines of their own in it, they stay a draft — `fireRound` sends the
 * whole draft and must not quietly send what somebody is still typing.
 */
export async function acceptGuestOrder(input: AcceptInput): Promise<AcceptResult> {
  const client = await pool.connect();
  let outcome: AcceptOutcome;
  try {
    await client.query('BEGIN');
    outcome = await acceptInTransaction(client, input);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection is gone; there is nothing left to roll back.
    }
    throw error;
  } finally {
    client.release();
  }

  if (outcome.kind === 'expired') throw new GuestOrderConflict(STATUS_WORDS.expired);
  if (outcome.kind === 'already') {
    return { bill: await bills.getBill(input.storeId, outcome.billId), fired: false, warning: null, already: true };
  }

  const { billId } = outcome;
  let fired = false;
  let warning: string | null = null;
  if (outcome.draftWasEmpty) {
    try {
      await rounds.fireRound({
        storeId: input.storeId,
        staffId: input.staffId,
        billId,
        clientUuid: roundUuidFor(input.orderId),
      });
      fired = true;
    } catch (error) {
      // The lines are in the bill and the request is accepted; the waiter can
      // still press «На кухню». Say so instead of pretending it went.
      warning = `Замовлення в рахунку, але не відправлено на кухню: ${error instanceof Error ? error.message : 'помилка'}`;
    }
  } else {
    warning = 'У чернетці були ваші позиції — перевірте рахунок і відправте на кухню самі';
  }
  return { bill: await bills.getBill(input.storeId, billId), fired, warning, already: false };
}

type AcceptOutcome =
  | { kind: 'already'; billId: number }
  | { kind: 'expired' }
  | { kind: 'done'; billId: number; draftWasEmpty: boolean };

/** Everything `acceptGuestOrder` does inside its transaction; the caller owns BEGIN/COMMIT/ROLLBACK. */
async function acceptInTransaction(client: pg.PoolClient, input: AcceptInput): Promise<AcceptOutcome> {
  const locked = await client.query(`SELECT * FROM pos_guest_orders WHERE store_id = $1 AND id = $2 FOR UPDATE`, [
    input.storeId,
    input.orderId,
  ]);
  if (locked.rows.length === 0) throw new GuestOrderNotFound('Запит не знайдено');
  const order = locked.rows[0];
  const status = String(order.status) as OrderStatus;
  if (status === 'accepted') return { kind: 'already', billId: Number(order.bill_id) };
  if (status !== 'pending') throw new GuestOrderConflict(STATUS_WORDS[status]);
  if (new Date(order.expires_at as string).getTime() < Date.now()) {
    await client.query(`UPDATE pos_guest_orders SET status = 'expired', decided_at = NOW() WHERE id = $1`, [order.id]);
    return { kind: 'expired' };
  }

  const table = await client.query(
    `SELECT t.is_active AND h.is_active AS live
       FROM pos_tables t JOIN pos_halls h ON h.id = t.hall_id
      WHERE t.id = $1 AND t.store_id = $2`,
    [order.table_id, input.storeId]
  );
  if (table.rows[0]?.live !== true) throw new GuestOrderConflict('Стіл прибрано з плану');

  const items = await client.query(
    `SELECT id, variant_id, quantity, modifiers, note
       FROM pos_guest_order_items WHERE order_id = $1 ORDER BY sort_order ASC, id ASC`,
    [order.id]
  );
  const excludedIds = new Set(input.excludeItemIds ?? []);
  const wanted = items.rows.filter((row) => !excludedIds.has(Number(row.id)));
  if (wanted.length === 0) throw new GuestOrderError('Немає що приймати — відхиліть запит');

  const opened = await bills.openBillTx(client, {
    storeId: input.storeId,
    staffId: input.staffId,
    tableId: Number(order.table_id),
    guests: input.guests,
  });
  const draft = await client.query(
    `SELECT COUNT(*)::int AS n FROM pos_bill_items WHERE bill_id = $1 AND round_id IS NULL`,
    [opened.billId]
  );
  const draftWasEmpty = Number(draft.rows[0].n) === 0;

  for (const row of wanted) {
    const ids = modifiers
      .parseLineModifierSnapshot(row.modifiers)
      .map((m) => m.modifier_id)
      .filter((id): id is number => id != null);
    try {
      await bills.addDraftItemTx(client, input.storeId, input.staffId, opened.billId, {
        variant_id: Number(row.variant_id),
        quantity: Number(row.quantity),
        modifiers: ids,
        note: String(row.note ?? ''),
      });
    } catch (error) {
      // The dish ran out, or was taken off the menu, between the request and
      // now: say WHICH line, so the waiter can accept the rest without it.
      if (error instanceof bills.BillError || error instanceof modifiers.ModifierError) {
        throw new GuestOrderLineProblem(error.message, Number(row.id));
      }
      throw error;
    }
  }

  await client.query(
    `UPDATE pos_guest_orders
        SET status = 'accepted', bill_id = $2, decided_at = NOW(), decided_by = $3
      WHERE id = $1`,
    [order.id, opened.billId, input.staffId]
  );
  return { kind: 'done', billId: opened.billId, draftWasEmpty };
}

const STATUS_WORDS: Record<Exclude<OrderStatus, 'pending' | 'accepted'>, string> = {
  rejected: 'Запит уже відхилено',
  expired: 'Запит застарів — гість має надіслати новий',
  cancelled: 'Гість скасував запит',
  sent: 'Замовлення вже на кухні — його надіслав гість',
};

/** The waiter turns a request down, with a reason the guest may read. Idempotent. */
export async function rejectGuestOrder(input: {
  storeId: number;
  staffId: number;
  orderId: number;
  reason?: unknown;
}): Promise<{ status: 'rejected' }> {
  let reason: string | null = null;
  if (input.reason !== undefined && input.reason !== null && input.reason !== '') {
    if (typeof input.reason !== 'string') throw new GuestOrderError('Причина має бути текстом');
    reason = input.reason.trim().slice(0, 120) || null;
  }
  const updated = await pool.query(
    `UPDATE pos_guest_orders
        SET status = 'rejected', decided_at = NOW(), decided_by = $3, reject_reason = $4
      WHERE store_id = $1 AND id = $2 AND status = 'pending'
      RETURNING id`,
    [input.storeId, input.orderId, input.staffId, reason]
  );
  if (updated.rows.length > 0) return { status: 'rejected' };
  const row = await pool.query(`SELECT status FROM pos_guest_orders WHERE store_id = $1 AND id = $2`, [
    input.storeId,
    input.orderId,
  ]);
  if (row.rows.length === 0) throw new GuestOrderNotFound('Запит не знайдено');
  const status = String(row.rows[0].status) as OrderStatus;
  if (status === 'rejected') return { status: 'rejected' };
  throw new GuestOrderConflict(status === 'accepted' ? 'Запит уже прийнято' : STATUS_WORDS[status as keyof typeof STATUS_WORDS] ?? 'Запит уже не чекає');
}

// ── the waiter's notices (phase Q9) ─────────────────────────────────

/** An order a guest sent straight to the kitchen that no waiter has looked at yet. */
export interface SentGuestOrderNotice {
  id: number;
  table_id: number;
  table_name: string;
  hall_name: string;
  created_at: string;
  bill_id: number;
  /** The round it became — «раунд 3» on the bill and the kitchen board. Null if that round is gone. */
  round_seq: number | null;
  /** The bill was opened by this order: nobody has the table yet, and «Бачу» gives it to the waiter. */
  bill_opened_by_guest: boolean;
  total_cents: number;
  lines: GuestOrderLine[];
}

/**
 * How long an unseen notice stays on a waiter's screen. Long enough for a slow
 * evening, short enough that a forgotten one does not greet the morning shift.
 */
export const NOTICE_HOURS = 6;

/**
 * Orders that went straight to the kitchen and that no waiter has said «Бачу»
 * to — one table's, or the whole store's. Only while the bill they went to is
 * still open: once it is paid, telling anyone about a round is history.
 */
export async function listSentNotices(storeId: number, tableId?: number): Promise<SentGuestOrderNotice[]> {
  const result = await pool.query(
    `SELECT o.id, o.table_id, o.created_at, o.bill_id, o.total_cents, r.seq AS round_seq,
            t.name AS table_name, h.name AS hall_name, b.opened_by IS NULL AS bill_opened_by_guest
       FROM pos_guest_orders o
       JOIN pos_bills b ON b.id = o.bill_id
       JOIN pos_tables t ON t.id = o.table_id
       JOIN pos_halls h ON h.id = t.hall_id
       LEFT JOIN pos_bill_rounds r ON r.id = o.round_id
      WHERE o.store_id = $1 AND o.status = 'sent' AND o.seen_at IS NULL
        AND b.status = 'open'
        AND o.created_at > NOW() - make_interval(hours => $3)
        AND ($2::bigint IS NULL OR o.table_id = $2)
      ORDER BY o.created_at ASC`,
    [storeId, tableId ?? null, NOTICE_HOURS]
  );
  const lines = await loadLines(result.rows.map((row) => Number(row.id)));
  return result.rows.map((row) => ({
    id: Number(row.id),
    table_id: Number(row.table_id),
    table_name: String(row.table_name),
    hall_name: String(row.hall_name),
    created_at: isoOf(row.created_at),
    bill_id: Number(row.bill_id),
    round_seq: row.round_seq == null ? null : Number(row.round_seq),
    bill_opened_by_guest: row.bill_opened_by_guest === true,
    total_cents: Number(row.total_cents ?? 0),
    lines: lines.get(Number(row.id)) ?? [],
  }));
}

/** Everything a waiter's screen polls for, in one answer. */
export interface GuestFeed {
  /** Requests waiting for a waiter to accept (phase Q6) — what the answer always carried. */
  orders: WaitingGuestOrder[];
  /** Orders already on their way to the kitchen, not yet seen (phase Q9). */
  sent: SentGuestOrderNotice[];
  /** Guests calling a waiter or asking for the bill (phase Q8). */
  calls: LiveWaiterCall[];
}

export async function loadGuestFeed(storeId: number, tableId?: number): Promise<GuestFeed> {
  const [orders, sent, calls] = await Promise.all([
    listWaitingGuestOrders(storeId, tableId),
    listSentNotices(storeId, tableId),
    listLiveCalls(storeId, tableId),
  ]);
  return { orders, sent, calls };
}

/**
 * A waiter's «Бачу» on an order a guest sent straight to the kitchen. If that
 * order opened the bill, the table becomes this waiter's — the hall map's «мій
 * стіл» and the pre-bill's «Офіціант». Idempotent: a second tap, or a second
 * waiter, changes nothing.
 */
export async function markGuestOrderSeen(input: {
  storeId: number;
  staffId: number;
  orderId: number;
}): Promise<{ seen: true; bill_id: number | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, status, bill_id, seen_at FROM pos_guest_orders WHERE store_id = $1 AND id = $2 FOR UPDATE`,
      [input.storeId, input.orderId]
    );
    if (locked.rows.length === 0) throw new GuestOrderNotFound('Запит не знайдено');
    const order = locked.rows[0];
    if (order.status !== 'sent') throw new GuestOrderConflict('Це запит, а не замовлення на кухні — прийміть або відхиліть його');
    const billId = order.bill_id == null ? null : Number(order.bill_id);
    if (order.seen_at == null) {
      await client.query(`UPDATE pos_guest_orders SET seen_at = NOW(), seen_by = $2 WHERE id = $1`, [
        order.id,
        input.staffId,
      ]);
      if (billId != null) await bills.claimGuestBillTx(client, input.storeId, billId, input.staffId);
    }
    await client.query('COMMIT');
    return { seen: true, bill_id: billId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
