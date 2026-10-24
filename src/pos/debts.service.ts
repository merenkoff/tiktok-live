// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/debts.service.ts — goods given «під запис» (migration 073,
// TechDocs/grocery/G3_DEBTS.md, phase Г3 of the grocery plan).
//
// The shop's debt notebook, kept by the till. A customer the owner trusts
// takes goods now and pays later; the handover is a NON-fiscal entry here, and
// the fiscal receipt is issued when the money comes (the owner's scheme A),
// through `debt-payment.service.ts`.
//
// What this file does, and the rules that hold it up:
//
// 1. **Credit only within the owner's limit** (decisions Д2, Д3). No limit, no
//    credit; a locked customer takes no more; over the limit the till is told
//    in figures. The customer's row is locked first, so two tills cannot both
//    squeeze under the same limit.
// 2. **The server prices the goods, exactly as a sale would** — the card price,
//    the modifiers' deltas (`pricePlainLine`, shared with checkout), the cart
//    discount shared out by `allocateCartDiscount` — and locks it on the line.
//    The client never names a price.
// 3. **Stock moves once, when the goods are given**, with the reason `credit`
//    and a per-line snapshot (`consumeStockForLine`, target `debt`); a return
//    from an unpaid line replays that snapshot back.
// 4. **The journal is append-only and agrees with the lines.** Every write here
//    adds exactly one entry, whose amount is what the open lines changed by,
//    so «balance = the journal's sum = what the open lines still owe» holds
//    after every one of them.
// 5. **Every write is idempotent on `client_uuid`.** «Під запис» tapped twice
//    on a bad connection gives the goods once.

import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { consumeStockForLine, returnStockForLine } from './composites.service.js';
import { formatUah } from './core/money.js';
import { storeClock } from './core/storeClock.js';
import * as modifiers from './modifiers.service.js';
import { allocateCartDiscount, pricePlainLine } from './sales.service.js';
import type { SaleDraftLine } from './sales.service.js';
import { refundLineAmount } from './lineMoney.js';
import {
  DebtConflict,
  DebtError,
  DebtNotFound,
  balanceCents,
  lockCustomer,
  openLines,
  owedCents,
} from './debt-lines.service.js';
import type { CartDiscountInput } from './types.js';

export { DebtConflict, DebtError, DebtNotFound } from './debt-lines.service.js';

type DbClient = { query: typeof pool.query };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A limit between 1 ₴ and 100 000 ₴ — the CHECK on `pos_customers` (073). */
const LIMIT_MIN = 100;
const LIMIT_MAX = 10_000_000;
const MAX_LINES = 200;
const REASON_MAX = 200;
const ENTRIES_ON_STATEMENT = 50;

/** Movements point back at the journal entry that caused them. */
const ISSUE_REFERENCE = 'debt_issue';
const RETURN_REFERENCE = 'debt_return';

export type DebtEntryKind = 'issue' | 'return' | 'payment' | 'payment_void' | 'writeoff';

export interface DebtCreditView {
  customer_id: number;
  /** NULL: this customer may not take goods «під запис» (Д2). */
  limit_cents: number | null;
  locked: boolean;
  balance_cents: number;
  /** How much more may be given; null without a limit, never below zero. */
  available_cents: number | null;
  set_at: string | null;
  set_by_name: string | null;
}

export type DebtLineStatus = 'open' | 'paid' | 'returned' | 'written_off';

export interface DebtLineView {
  id: number;
  entry_id: number;
  created_at: string;
  product_name: string;
  variant_label: string;
  unit: string;
  quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
  unit_price_cents: number;
  line_discount_cents: number;
  line_total_cents: number;
  /** What is still owed — 0 once the line is paid, written off or returned. */
  owed_cents: number;
  status: DebtLineStatus;
  sale_id: number | null;
  receipt_number: string | null;
  note: string;
}

export interface DebtEntryView {
  id: number;
  kind: DebtEntryKind;
  amount_cents: number;
  created_at: string;
  staff_name: string | null;
  reason: string | null;
  sale_id: number | null;
  receipt_number: string | null;
}

export interface DebtStatement {
  customer: { id: number; name: string; phone: string };
  credit: DebtCreditView;
  open_lines: DebtLineView[];
  /** The latest entries of the journal, newest first. */
  entries: DebtEntryView[];
  oldest_open_at: string | null;
}

export interface DebtWriteResult {
  entry: DebtEntryView;
  lines: DebtLineView[];
  credit: DebtCreditView;
  open_lines: DebtLineView[];
  /** True when this `client_uuid` had already been written — nothing new happened. */
  replay: boolean;
}

// ── reading ────────────────────────────────────────────────────────────────

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}

function toLineView(row: Record<string, unknown>): DebtLineView {
  const quantity = Number(row.quantity);
  const returned = Number(row.returned_quantity);
  const lineTotal = Number(row.line_total_cents);
  const paid = row.sale_id != null;
  const writtenOff = row.written_off_entry_id != null;
  const status: DebtLineStatus = paid
    ? 'paid'
    : writtenOff
      ? 'written_off'
      : returned >= quantity
        ? 'returned'
        : 'open';
  return {
    id: Number(row.id),
    entry_id: Number(row.entry_id),
    created_at: iso(row.created_at),
    product_name: String(row.product_name ?? ''),
    variant_label: String(row.variant_label ?? ''),
    unit: String(row.unit ?? ''),
    quantity,
    returned_quantity: returned,
    remaining_quantity: quantity - returned,
    unit_price_cents: Number(row.unit_price_cents),
    line_discount_cents: Number(row.line_discount_cents),
    line_total_cents: lineTotal,
    owed_cents:
      status === 'open'
        ? owedCents({ line_total_cents: lineTotal, quantity, returned_quantity: returned })
        : 0,
    status,
    sale_id: row.sale_id == null ? null : Number(row.sale_id),
    receipt_number: row.receipt_number == null ? null : String(row.receipt_number),
    note: String(row.note ?? ''),
  };
}

const LINE_COLUMNS = `
  i.id, i.entry_id, i.created_at, i.product_name, i.variant_label, i.unit,
  i.quantity, i.returned_quantity, i.unit_price_cents, i.line_discount_cents,
  i.line_total_cents, i.sale_id, i.written_off_entry_id, i.note,
  s.receipt_number`;

async function readLines(
  client: DbClient,
  storeId: number,
  where: { customerId?: number; entryId?: number; openOnly?: boolean }
): Promise<DebtLineView[]> {
  const params: unknown[] = [storeId];
  const filters: string[] = ['i.store_id = $1'];
  if (where.customerId != null) {
    params.push(where.customerId);
    filters.push(`i.customer_id = $${params.length}`);
  }
  if (where.entryId != null) {
    params.push(where.entryId);
    filters.push(`i.entry_id = $${params.length}`);
  }
  if (where.openOnly) {
    filters.push(
      'i.sale_id IS NULL AND i.written_off_entry_id IS NULL AND i.returned_quantity < i.quantity'
    );
  }
  const rows = await client.query(
    `SELECT ${LINE_COLUMNS}
       FROM pos_debt_items i
       LEFT JOIN pos_sales s ON s.id = i.sale_id
      WHERE ${filters.join(' AND ')}
      ORDER BY i.created_at ASC, i.id ASC`,
    params
  );
  return rows.rows.map(toLineView);
}

function toEntryView(row: Record<string, unknown>): DebtEntryView {
  return {
    id: Number(row.id),
    kind: String(row.kind) as DebtEntryKind,
    amount_cents: Number(row.amount_cents),
    created_at: iso(row.created_at),
    staff_name: row.staff_name == null ? null : String(row.staff_name),
    reason: row.reason == null ? null : String(row.reason),
    sale_id: row.sale_id == null ? null : Number(row.sale_id),
    receipt_number: row.receipt_number == null ? null : String(row.receipt_number),
  };
}

async function readEntry(client: DbClient, storeId: number, entryId: number): Promise<DebtEntryView> {
  const rows = await client.query(
    `SELECT e.id, e.kind, e.amount_cents, e.created_at, e.reason, e.sale_id,
            st.display_name AS staff_name, s.receipt_number
       FROM pos_debt_entries e
       LEFT JOIN pos_staff st ON st.id = e.staff_id
       LEFT JOIN pos_sales s ON s.id = e.sale_id
      WHERE e.store_id = $1 AND e.id = $2`,
    [storeId, entryId]
  );
  return toEntryView(rows.rows[0]);
}

/** The customer's limit, lock and balance, as the till shows them. */
export async function getCredit(
  storeId: number,
  customerId: number,
  client: DbClient = pool
): Promise<DebtCreditView> {
  const row = await client.query(
    `SELECT c.id, c.credit_limit_cents, c.credit_locked, c.credit_set_at, st.display_name AS set_by_name
       FROM pos_customers c
       LEFT JOIN pos_staff st ON st.id = c.credit_set_by
      WHERE c.store_id = $1 AND c.id = $2`,
    [storeId, customerId]
  );
  if (row.rows.length === 0) throw new DebtNotFound('Покупця не знайдено');
  const r = row.rows[0];
  const limit = r.credit_limit_cents == null ? null : Number(r.credit_limit_cents);
  const balance = await balanceCents(client, storeId, customerId);
  return {
    customer_id: Number(r.id),
    limit_cents: limit,
    locked: r.credit_locked === true,
    balance_cents: balance,
    available_cents: limit == null ? null : Math.max(0, limit - balance),
    set_at: r.credit_set_at ? iso(r.credit_set_at) : null,
    set_by_name: r.set_by_name == null ? null : String(r.set_by_name),
  };
}

/** The customer's statement: credit, what is still owed line by line, and the latest of the journal. */
export async function getStatement(storeId: number, customerId: number): Promise<DebtStatement> {
  const customer = await pool.query(
    `SELECT id, name, phone FROM pos_customers WHERE store_id = $1 AND id = $2`,
    [storeId, customerId]
  );
  if (customer.rows.length === 0) throw new DebtNotFound('Покупця не знайдено');
  const credit = await getCredit(storeId, customerId);
  const open = await readLines(pool, storeId, { customerId, openOnly: true });
  const entries = await pool.query(
    `SELECT e.id, e.kind, e.amount_cents, e.created_at, e.reason, e.sale_id,
            st.display_name AS staff_name, s.receipt_number
       FROM pos_debt_entries e
       LEFT JOIN pos_staff st ON st.id = e.staff_id
       LEFT JOIN pos_sales s ON s.id = e.sale_id
      WHERE e.store_id = $1 AND e.customer_id = $2
      ORDER BY e.id DESC
      LIMIT ${ENTRIES_ON_STATEMENT}`,
    [storeId, customerId]
  );
  const c = customer.rows[0];
  return {
    customer: { id: Number(c.id), name: String(c.name ?? ''), phone: String(c.phone ?? '') },
    credit,
    open_lines: open,
    entries: entries.rows.map(toEntryView),
    oldest_open_at: open[0]?.created_at ?? null,
  };
}

export interface DebtorRow {
  customer_id: number;
  name: string;
  phone: string;
  balance_cents: number;
  limit_cents: number | null;
  locked: boolean;
  open_lines: number;
  oldest_open_at: string | null;
}

/**
 * Who owes the shop, the longest-owing first. `all` adds the customers the
 * owner gave a limit who owe nothing right now — the list the owner manages
 * limits from.
 */
export async function listDebtors(storeId: number, opts: { all?: boolean } = {}): Promise<DebtorRow[]> {
  const rows = await pool.query(
    `WITH balance AS (
       SELECT customer_id, SUM(amount_cents)::bigint AS balance
         FROM pos_debt_entries WHERE store_id = $1 GROUP BY customer_id
     ),
     open_lines AS (
       SELECT customer_id, MIN(created_at) AS oldest, COUNT(*)::int AS lines
         FROM pos_debt_items
        WHERE store_id = $1 AND sale_id IS NULL AND written_off_entry_id IS NULL
          AND returned_quantity < quantity
        GROUP BY customer_id
     )
     SELECT c.id, c.name, c.phone, c.credit_limit_cents, c.credit_locked,
            COALESCE(b.balance, 0) AS balance, o.oldest, COALESCE(o.lines, 0) AS lines
       FROM pos_customers c
       LEFT JOIN balance b ON b.customer_id = c.id
       LEFT JOIN open_lines o ON o.customer_id = c.id
      WHERE c.store_id = $1
        AND (COALESCE(b.balance, 0) <> 0 OR ($2::boolean AND c.credit_limit_cents IS NOT NULL))
      ORDER BY o.oldest ASC NULLS LAST, COALESCE(b.balance, 0) DESC, c.name ASC
      LIMIT 500`,
    [storeId, opts.all === true]
  );
  return rows.rows.map((r) => ({
    customer_id: Number(r.id),
    name: String(r.name ?? ''),
    phone: String(r.phone ?? ''),
    balance_cents: Number(r.balance),
    limit_cents: r.credit_limit_cents == null ? null : Number(r.credit_limit_cents),
    locked: r.credit_locked === true,
    open_lines: Number(r.lines),
    oldest_open_at: r.oldest ? iso(r.oldest) : null,
  }));
}

export interface DebtSummary {
  from: string;
  to: string;
  /** Goods given «під запис» in the window. Not takings — see G3_DEBTS.md §4. */
  issued_cents: number;
  /** Repaid by receipts in the window, net of receipts voided in it. */
  repaid_cents: number;
  returned_cents: number;
  written_off_cents: number;
  /** What all customers owed at the end of the window. */
  balance_end_cents: number;
  /** How many customers owed something at the end of the window. */
  debtors_end: number;
}

/** The owner's figures for a window of the store's own days. */
export async function debtSummary(
  storeId: number,
  opts: { from: string; to: string; timezone: string }
): Promise<DebtSummary> {
  const BOUNDS = `
    WITH bounds AS (
      SELECT ($2::date)::timestamp AT TIME ZONE $4 AS range_start,
             (($3::date + INTERVAL '1 day'))::timestamp AT TIME ZONE $4 AS range_end
    )`;
  const params = [storeId, opts.from, opts.to, opts.timezone];
  const figures = await pool.query(
    `${BOUNDS}
     SELECT
       COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'issue' AND e.created_at >= b.range_start AND e.created_at < b.range_end), 0)::bigint AS issued,
       COALESCE(-SUM(e.amount_cents) FILTER (WHERE e.kind IN ('payment', 'payment_void') AND e.created_at >= b.range_start AND e.created_at < b.range_end), 0)::bigint AS repaid,
       COALESCE(-SUM(e.amount_cents) FILTER (WHERE e.kind = 'return' AND e.created_at >= b.range_start AND e.created_at < b.range_end), 0)::bigint AS returned,
       COALESCE(-SUM(e.amount_cents) FILTER (WHERE e.kind = 'writeoff' AND e.created_at >= b.range_start AND e.created_at < b.range_end), 0)::bigint AS written_off,
       COALESCE(SUM(e.amount_cents) FILTER (WHERE e.created_at < b.range_end), 0)::bigint AS balance_end
       FROM pos_debt_entries e CROSS JOIN bounds b
      WHERE e.store_id = $1`,
    params
  );
  const debtors = await pool.query(
    `${BOUNDS}
     SELECT COUNT(*)::int AS n FROM (
       SELECT e.customer_id
         FROM pos_debt_entries e CROSS JOIN bounds b
        WHERE e.store_id = $1 AND e.created_at < b.range_end
        GROUP BY e.customer_id
       HAVING SUM(e.amount_cents) > 0
     ) owing`,
    params
  );
  const f = figures.rows[0];
  return {
    from: opts.from,
    to: opts.to,
    issued_cents: Number(f.issued),
    repaid_cents: Number(f.repaid),
    returned_cents: Number(f.returned),
    written_off_cents: Number(f.written_off),
    balance_end_cents: Number(f.balance_end),
    debtors_end: Number(debtors.rows[0].n),
  };
}

// ── the owner's limit ──────────────────────────────────────────────────────

function parseLimit(raw: unknown): number | null {
  if (raw === null) return null;
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DebtError('Ліміт — ціле число копійок або порожнє значення');
  }
  if (value < LIMIT_MIN || value > LIMIT_MAX) {
    throw new DebtError('Ліміт — від 1 до 100 000 ₴');
  }
  return value;
}

/**
 * Give, change or take away a customer's limit, or lock and unlock new credit.
 *
 * A limit below what is already owed is allowed: new credit stops until the
 * debt comes down, the debt itself stays. So is NULL with a debt still open —
 * it only means «no more».
 */
export async function setCredit(
  storeId: number,
  staffId: number,
  customerId: number,
  input: { credit_limit_cents?: unknown; credit_locked?: unknown }
): Promise<DebtCreditView> {
  const hasLimit = input.credit_limit_cents !== undefined;
  const hasLock = input.credit_locked !== undefined;
  if (!hasLimit && !hasLock) throw new DebtError('Нічого змінювати: немає ні ліміту, ні блокування');
  const limit = hasLimit ? parseLimit(input.credit_limit_cents) : undefined;
  if (hasLock && typeof input.credit_locked !== 'boolean') {
    throw new DebtError('Блокування — так або ні');
  }
  const updated = await pool.query(
    `UPDATE pos_customers
        SET credit_limit_cents = CASE WHEN $3::boolean THEN $4::int ELSE credit_limit_cents END,
            credit_locked = CASE WHEN $5::boolean THEN $6::boolean ELSE credit_locked END,
            credit_set_at = NOW(), credit_set_by = $7, updated_at = NOW()
      WHERE store_id = $1 AND id = $2
      RETURNING id`,
    [storeId, customerId, hasLimit, limit ?? null, hasLock, hasLock ? input.credit_locked : false, staffId]
  );
  if (updated.rows.length === 0) throw new DebtNotFound('Покупця не знайдено');
  return getCredit(storeId, customerId);
}

// ── writing ────────────────────────────────────────────────────────────────

function parseClientUuid(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!UUID_RE.test(value)) throw new DebtError('client_uuid обовʼязковий і має бути UUID');
  return value;
}

function parseReason(raw: unknown, required: boolean): string | null {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (required) throw new DebtError('Вкажіть причину');
    return null;
  }
  if (typeof raw !== 'string') throw new DebtError('Причина має бути текстом');
  const reason = raw.trim();
  if (required && reason.length < 3) throw new DebtError('Причина — щонайменше 3 символи');
  if (reason.length > REASON_MAX) throw new DebtError(`Причина — до ${REASON_MAX} символів`);
  return reason;
}

function parseCartDiscount(raw: unknown): CartDiscountInput | null {
  if (raw === undefined || raw === null) return null;
  const d = raw as { type?: unknown; value?: unknown };
  if ((d.type !== 'percent' && d.type !== 'fixed') || !Number.isInteger(d.value) || Number(d.value) < 0) {
    throw new DebtError('Знижка — відсоток або сума в копійках, не менше нуля');
  }
  if (d.type === 'percent' && Number(d.value) > 100) {
    throw new DebtError('Знижка у відсотках — від 0 до 100');
  }
  return { type: d.type, value: Number(d.value) };
}

interface IssueItem {
  variant_id: number;
  quantity: number;
  modifiers: number[];
  note: string;
}

/** The cart, as plain lines merged the way checkout merges them. */
function parseIssueItems(raw: unknown): IssueItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new DebtError('Немає товарів для запису');
  if (raw.length > MAX_LINES) throw new DebtError(`Не більше ${MAX_LINES} позицій за один запис`);
  const merged = new Map<string, IssueItem>();
  for (const entry of raw) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const variantId = Number(item.variant_id);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(variantId) || variantId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw new DebtError('Кожна позиція — товар і ціла кількість більше нуля');
    }
    // Priced from its stems at the till, with no catalogue price to lock; a
    // catalogue bouquet goes in as itself (G3_DEBTS.md, decision 10).
    if (Array.isArray(item.components) && item.components.length > 0) {
      throw new DebtError('Букет, зібраний на касі, під запис не записується — продайте його або запишіть готовий букет з каталогу');
    }
    const ids = modifiers.normalizeModifierIds(item.modifiers);
    const note = modifiers.cleanLineNote(item.note);
    const key = `${variantId}|${ids.join(',')}|${note}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { variant_id: variantId, quantity, modifiers: ids, note });
  }
  return [...merged.values()];
}

/** A write already made under this `client_uuid`, or null. */
async function replayOf(
  storeId: number,
  clientUuid: string,
  expected: { kind: DebtEntryKind; customerId: number }
): Promise<number | null> {
  const row = await pool.query(
    `SELECT id, kind, customer_id FROM pos_debt_entries WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, clientUuid]
  );
  if (row.rows.length === 0) return null;
  if (String(row.rows[0].kind) !== expected.kind || Number(row.rows[0].customer_id) !== expected.customerId) {
    throw new DebtConflict('Цей client_uuid уже використано для іншого запису', 'uuid_taken');
  }
  return Number(row.rows[0].id);
}

async function resultFor(
  storeId: number,
  customerId: number,
  entryId: number,
  replay: boolean,
  lines: (client: DbClient) => Promise<DebtLineView[]>
): Promise<DebtWriteResult> {
  return {
    entry: await readEntry(pool, storeId, entryId),
    lines: await lines(pool),
    credit: await getCredit(storeId, customerId),
    open_lines: await readLines(pool, storeId, { customerId, openOnly: true }),
    replay,
  };
}

/** One write, in its own transaction; a lost race on `client_uuid` reads as the replay it is. */
async function inTransaction(
  storeId: number,
  clientUuid: string,
  expected: { kind: DebtEntryKind; customerId: number },
  write: (client: PoolClient) => Promise<number>
): Promise<{ entryId: number; replay: boolean }> {
  const earlier = await replayOf(storeId, clientUuid, expected);
  if (earlier != null) return { entryId: earlier, replay: true };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const entryId = await write(client);
    await client.query('COMMIT');
    return { entryId, replay: false };
  } catch (error) {
    await client.query('ROLLBACK');
    const unique =
      typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
    if (unique) {
      const raced = await replayOf(storeId, clientUuid, expected);
      if (raced != null) return { entryId: raced, replay: true };
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Give goods «під запис».
 *
 * One transaction: the customer locked and checked (rule 1), the cart priced
 * as a sale would price it (rule 2), the limit checked against the result,
 * then the `issue` entry, its lines, and the stock with its snapshot (rule 3).
 */
export async function issueOnCredit(input: {
  storeId: number;
  staffId: number;
  customerId: number;
  items: unknown;
  cart_discount?: unknown;
  client_uuid: unknown;
  note?: unknown;
}): Promise<DebtWriteResult> {
  const clientUuid = parseClientUuid(input.client_uuid);
  const items = parseIssueItems(input.items);
  const discount = parseCartDiscount(input.cart_discount);
  const note = parseReason(input.note, false);

  const { entryId, replay } = await inTransaction(
    input.storeId,
    clientUuid,
    { kind: 'issue', customerId: input.customerId },
    async (client) => {
      const customer = await lockCustomer(client, input.storeId, input.customerId);
      if (customer.credit_limit_cents == null) {
        throw new DebtConflict(
          'Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця.',
          'no_credit'
        );
      }
      if (customer.credit_locked) {
        throw new DebtConflict('Власник заблокував записи під запис для цього покупця.', 'credit_locked');
      }

      const variantIds = [...new Set(items.map((item) => item.variant_id))];
      const variants = await client.query(
        `SELECT v.id, v.price_cents, v.compare_at_cents, v.label, v.unit,
                p.id AS product_id, p.name AS product_name,
                p.stop_listed_on::text AS stop_listed_on
           FROM pos_variants v
           JOIN pos_products p ON p.id = v.product_id
          WHERE v.store_id = $1 AND v.id = ANY($2::bigint[]) AND v.is_active = TRUE`,
        [input.storeId, variantIds]
      );
      if (variants.rows.length !== variantIds.length) {
        throw new DebtError('Частину товарів не знайдено або прибрано в архів');
      }
      const byId = new Map(variants.rows.map((row) => [Number(row.id), row]));

      // The day's stop-list says no to credit as firmly as to a sale.
      const clock = await storeClock(client, input.storeId);
      for (const item of items) {
        const row = byId.get(item.variant_id)!;
        if (row.stop_listed_on != null && row.stop_listed_on === clock.today) {
          throw new DebtConflict(`«${row.product_name}» сьогодні в стоп-листі`, 'stop_listed');
        }
      }

      const groups = await modifiers.loadGroupsForProducts(
        client,
        input.storeId,
        [...new Set(variants.rows.map((row) => Number(row.product_id)))],
        { activeOnly: true }
      );
      const drafts: SaleDraftLine[] = items.map((item) => {
        const row = byId.get(item.variant_id)!;
        return pricePlainLine(row, groups.get(Number(row.product_id)) ?? [], item);
      });
      const { lineDiscounts } = allocateCartDiscount(drafts, discount);
      const totals = drafts.map((draft, i) => draft.pre_discount_total - lineDiscounts[i]);
      const total = totals.reduce((sum, t) => sum + t, 0);
      if (total <= 0) throw new DebtError('Нічого записувати: сума нуль');

      const balance = await balanceCents(client, input.storeId, input.customerId);
      if (balance + total > customer.credit_limit_cents) {
        const available = Math.max(0, customer.credit_limit_cents - balance);
        throw new DebtConflict(
          `Понад ліміт: борг ${formatUah(balance)} + ${formatUah(total)} = ${formatUah(balance + total)}, ліміт ${formatUah(customer.credit_limit_cents)}. ` +
            'Підняти ліміт може власник у картці покупця.',
          'over_limit',
          {
            balance_cents: balance,
            attempt_cents: total,
            limit_cents: customer.credit_limit_cents,
            available_cents: available,
          }
        );
      }

      const entry = await client.query(
        `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id, reason, client_uuid)
         VALUES ($1, $2, 'issue', $3, $4, $5, $6)
         RETURNING id`,
        [input.storeId, input.customerId, total, input.staffId, note, clientUuid]
      );
      const newEntryId = Number(entry.rows[0].id);

      for (const [index, draft] of drafts.entries()) {
        const line = await client.query(
          `INSERT INTO pos_debt_items
             (store_id, customer_id, entry_id, variant_id, quantity, unit, product_name,
              variant_label, unit_price_cents, compare_at_unit_cents, line_discount_cents,
              line_total_cents, modifiers, note, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
           RETURNING id`,
          [
            input.storeId,
            input.customerId,
            newEntryId,
            draft.variant_id,
            draft.quantity,
            draft.unit,
            draft.product_name,
            draft.variant_label,
            draft.unit_price_cents,
            draft.compare_at_unit_cents,
            lineDiscounts[index],
            totals[index],
            draft.modifiers?.length ? JSON.stringify(draft.modifiers) : null,
            draft.note ?? '',
            index,
          ]
        );
        // Rule 3: the shelf moves now, with the reason `credit`, and the line
        // remembers what it took — the same function a sale and a round use.
        await consumeStockForLine(client, {
          storeId: input.storeId,
          target: 'debt',
          lineId: Number(line.rows[0].id),
          referenceType: ISSUE_REFERENCE,
          referenceId: newEntryId,
          variantId: draft.variant_id,
          quantity: draft.quantity,
          staffId: input.staffId,
          extra: draft.modifier_components,
          reason: 'credit',
        });
      }
      return newEntryId;
    }
  );

  return resultFor(input.storeId, input.customerId, entryId, replay, (client) =>
    readLines(client, input.storeId, { entryId })
  );
}

/**
 * Take goods back from lines nobody has paid for yet.
 *
 * Any open line, any part of what is still on it. The stock comes back from
 * the line's own snapshot with the reason `credit` (rule 3), and the entry is
 * worth exactly the units returned, by the cumulative rounding a refund uses.
 */
export async function returnFromDebt(input: {
  storeId: number;
  staffId: number;
  customerId: number;
  lines: unknown;
  client_uuid: unknown;
  reason?: unknown;
}): Promise<DebtWriteResult> {
  const clientUuid = parseClientUuid(input.client_uuid);
  const reason = parseReason(input.reason, false);
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new DebtError('Оберіть, що повертається');
  }
  if (input.lines.length > MAX_LINES) throw new DebtError(`Не більше ${MAX_LINES} позицій за раз`);
  const wanted = new Map<number, number>();
  for (const entry of input.lines) {
    const line = (entry ?? {}) as Record<string, unknown>;
    const id = Number(line.line_id);
    const quantity = Number(line.quantity);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw new DebtError('Кожна позиція — рядок боргу і ціла кількість більше нуля');
    }
    wanted.set(id, (wanted.get(id) ?? 0) + quantity);
  }

  const { entryId, replay } = await inTransaction(
    input.storeId,
    clientUuid,
    { kind: 'return', customerId: input.customerId },
    async (client) => {
      await lockCustomer(client, input.storeId, input.customerId);
      const rows = await client.query(
        `SELECT id, variant_id, quantity, returned_quantity, line_total_cents,
                sale_id, written_off_entry_id
           FROM pos_debt_items
          WHERE store_id = $1 AND customer_id = $2 AND id = ANY($3::bigint[])
          FOR UPDATE`,
        [input.storeId, input.customerId, [...wanted.keys()]]
      );
      if (rows.rows.length !== wanted.size) throw new DebtNotFound('Рядок боргу не знайдено');

      const plan = rows.rows.map((row) => {
        const quantity = Number(row.quantity);
        const returned = Number(row.returned_quantity);
        const take = wanted.get(Number(row.id))!;
        if (row.sale_id != null || row.written_off_entry_id != null || returned >= quantity) {
          throw new DebtConflict(
            'Цей товар уже оплачено, списано або повернуто — оновіть виписку',
            'stale_statement'
          );
        }
        if (take > quantity - returned) {
          throw new DebtConflict(
            `Повернути можна не більше, ніж ще винно: ${quantity - returned}`,
            'too_many'
          );
        }
        return {
          id: Number(row.id),
          variantId: Number(row.variant_id),
          take,
          returned,
          amount: refundLineAmount(Number(row.line_total_cents), quantity, returned, take),
        };
      });
      const total = plan.reduce((sum, p) => sum + p.amount, 0);

      const entry = await client.query(
        `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id, reason, client_uuid)
         VALUES ($1, $2, 'return', $3, $4, $5, $6)
         RETURNING id`,
        [input.storeId, input.customerId, -total, input.staffId, reason, clientUuid]
      );
      const newEntryId = Number(entry.rows[0].id);

      for (const p of plan) {
        await client.query(
          `UPDATE pos_debt_items SET returned_quantity = returned_quantity + $3
            WHERE store_id = $1 AND id = $2`,
          [input.storeId, p.id, p.take]
        );
        await client.query(
          `INSERT INTO pos_debt_entry_lines (store_id, entry_id, debt_item_id, quantity, amount_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [input.storeId, newEntryId, p.id, p.take, p.amount]
        );
        await returnStockForLine(client, {
          storeId: input.storeId,
          target: 'debt',
          lineId: p.id,
          variantId: p.variantId,
          quantity: p.take,
          reason: 'credit',
          staffId: input.staffId,
          referenceType: RETURN_REFERENCE,
          referenceId: newEntryId,
        });
      }
      return newEntryId;
    }
  );

  return resultFor(input.storeId, input.customerId, entryId, replay, async (client) => {
    const ids = await client.query(
      `SELECT debt_item_id FROM pos_debt_entry_lines WHERE store_id = $1 AND entry_id = $2`,
      [input.storeId, entryId]
    );
    const all = await readLines(client, input.storeId, { customerId: input.customerId });
    const returnedIds = new Set(ids.rows.map((r) => Number(r.debt_item_id)));
    return all.filter((line) => returnedIds.has(line.id));
  });
}

/**
 * The owner forgives what is still owed on some lines, or on all of them.
 *
 * No stock moves — the goods are not in the shop — and no fiscal document is
 * made: no money changed hands. The reason is required and is what the
 * journal keeps of the decision.
 */
export async function writeOffDebt(input: {
  storeId: number;
  staffId: number;
  customerId: number;
  line_ids?: unknown;
  reason: unknown;
  client_uuid: unknown;
}): Promise<DebtWriteResult> {
  const clientUuid = parseClientUuid(input.client_uuid);
  const reason = parseReason(input.reason, true);
  let ids: number[] | null = null;
  if (input.line_ids !== undefined && input.line_ids !== null) {
    if (!Array.isArray(input.line_ids) || input.line_ids.length === 0) {
      throw new DebtError('Оберіть, що списати, або не вказуйте нічого — тоді весь борг');
    }
    ids = input.line_ids.map(Number);
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new DebtError('Рядок боргу не знайдено');
  }

  const { entryId, replay } = await inTransaction(
    input.storeId,
    clientUuid,
    { kind: 'writeoff', customerId: input.customerId },
    async (client) => {
      await lockCustomer(client, input.storeId, input.customerId);
      const open = await openLines(client, input.storeId, input.customerId, { forUpdate: true });
      let chosen = open;
      if (ids) {
        const wanted = new Set(ids);
        chosen = open.filter((line) => wanted.has(line.id));
        if (chosen.length !== wanted.size) {
          throw new DebtConflict(
            'Частину цих товарів уже оплачено, повернуто або списано — оновіть виписку',
            'stale_statement'
          );
        }
      }
      const total = chosen.reduce((sum, line) => sum + owedCents(line), 0);
      if (total <= 0) throw new DebtError('Нічого списувати: у покупця немає боргу за цими товарами');

      const entry = await client.query(
        `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id, reason, client_uuid)
         VALUES ($1, $2, 'writeoff', $3, $4, $5, $6)
         RETURNING id`,
        [input.storeId, input.customerId, -total, input.staffId, reason, clientUuid]
      );
      const newEntryId = Number(entry.rows[0].id);
      await client.query(
        `UPDATE pos_debt_items SET written_off_entry_id = $3
          WHERE store_id = $1 AND id = ANY($2::bigint[])`,
        [input.storeId, chosen.map((line) => line.id), newEntryId]
      );
      return newEntryId;
    }
  );

  return resultFor(input.storeId, input.customerId, entryId, replay, async (client) => {
    const rows = await client.query(
      `SELECT ${LINE_COLUMNS}
         FROM pos_debt_items i
         LEFT JOIN pos_sales s ON s.id = i.sale_id
        WHERE i.store_id = $1 AND i.written_off_entry_id = $2
        ORDER BY i.created_at ASC, i.id ASC`,
      [input.storeId, entryId]
    );
    return rows.rows.map(toLineView);
  });
}

/** Whether a customer has anything in the journal — a card that does may not be deleted. */
export async function hasJournal(client: DbClient, storeId: number, customerId: number): Promise<boolean> {
  const row = await client.query(
    `SELECT 1 FROM pos_debt_entries WHERE store_id = $1 AND customer_id = $2 LIMIT 1`,
    [storeId, customerId]
  );
  return row.rows.length > 0;
}
