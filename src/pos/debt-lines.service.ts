// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/debt-lines.service.ts — the lines of a «під запис» debt, as a
// repayment receipt sees them (migration 073, TechDocs/grocery/G3_DEBTS.md).
//
// Its own file because `sales.service.ts` imports it: a repayment is an
// ordinary sale, and `completeSaleTx` reads the lines it pays from here,
// inside its own transaction. `debts.service.ts` in turn imports the sale's
// pricing, so keeping these there would close an import cycle.
//
// Three rules everything below rests on:
//
// 1. **Every write to one customer's debt starts by locking that customer's
//    row.** Issue, return, repayment and write-off then run one after another
//    for that customer: two tills cannot both squeeze under the limit, nor both
//    pay the same line.
// 2. **What is owed on a line is its locked total minus what came back**, by
//    the same cumulative rounding a refund uses, so the units of a line always
//    add up to exactly its total in whatever order they are returned or paid.
// 3. **A repayment pays the oldest lines first, whole** (decision Д4). The
//    till names the lines; this checks they are the oldest ones still open,
//    which is also what turns a screen another till made stale into a 409
//    rather than a receipt for the wrong goods.

import { pool } from '../db.js';
import * as modifiers from './modifiers.service.js';
import type { LineModifierSnapshot } from './modifiers.service.js';
import { refundLineAmount } from './lineMoney.js';
import type { WeightSource } from './weighed.js';

type DbClient = { query: typeof pool.query };

/** Bad input — a 400 in the cashier's words. */
export class DebtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebtError';
  }
}

/** The state of the debt does not allow it — a 409. */
export class DebtConflict extends DebtError {
  constructor(
    message: string,
    /** Machine-readable reason for a client that wants to react to it. */
    readonly code: string = 'debt_conflict',
    /** Figures the till shows next to the sentence (the limit refusal). */
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'DebtConflict';
  }
}

/** A customer or a line that is not this store's — a 404. */
export class DebtNotFound extends DebtError {
  constructor(message: string) {
    super(message);
    this.name = 'DebtNotFound';
  }
}

/** The credit columns of a customer, as read under the lock. */
export interface CustomerCreditRow {
  id: number;
  name: string;
  phone: string;
  credit_limit_cents: number | null;
  credit_locked: boolean;
}

/** One open line, oldest first. */
export interface OpenDebtLine {
  id: number;
  variant_id: number;
  quantity: number;
  returned_quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  modifiers: LineModifierSnapshot[];
  note: string;
  /** 1000 for goods weighed when they were given — grams at a price per kg (075). */
  price_per: number;
  weight_source: WeightSource | null;
  /** What `quantity` counted in when the goods were given — the line's own snapshot. */
  unit: string;
}

/** What is still owed on a line once `returned_quantity` units came back (rule 2). */
export function owedCents(line: {
  line_total_cents: number;
  quantity: number;
  returned_quantity: number;
}): number {
  return (
    line.line_total_cents -
    refundLineAmount(line.line_total_cents, line.quantity, 0, line.returned_quantity)
  );
}

/** Lock the customer's row for this transaction (rule 1) and read their credit. */
export async function lockCustomer(
  client: DbClient,
  storeId: number,
  customerId: number
): Promise<CustomerCreditRow> {
  const row = await client.query(
    `SELECT id, name, phone, credit_limit_cents, credit_locked
       FROM pos_customers
      WHERE id = $1 AND store_id = $2
      FOR UPDATE`,
    [customerId, storeId]
  );
  if (row.rows.length === 0) throw new DebtNotFound('Покупця не знайдено');
  const r = row.rows[0];
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    phone: String(r.phone ?? ''),
    credit_limit_cents: r.credit_limit_cents == null ? null : Number(r.credit_limit_cents),
    credit_locked: r.credit_locked === true,
  };
}

/** The customer's balance: the sum of the journal. */
export async function balanceCents(
  client: DbClient,
  storeId: number,
  customerId: number
): Promise<number> {
  const row = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS balance
       FROM pos_debt_entries
      WHERE store_id = $1 AND customer_id = $2`,
    [storeId, customerId]
  );
  return Number(row.rows[0]?.balance ?? 0);
}

/**
 * The customer's open lines, oldest first — the order a repayment takes them
 * in. `forUpdate` locks them for the caller's transaction.
 */
export async function openLines(
  client: DbClient,
  storeId: number,
  customerId: number,
  opts: { forUpdate?: boolean } = {}
): Promise<OpenDebtLine[]> {
  const rows = await client.query(
    `SELECT id, variant_id, quantity, returned_quantity, unit_price_cents,
            line_total_cents, modifiers, note, price_per, weight_source, unit
       FROM pos_debt_items
      WHERE store_id = $1 AND customer_id = $2
        AND sale_id IS NULL AND written_off_entry_id IS NULL
        AND returned_quantity < quantity
      ORDER BY created_at ASC, id ASC
      ${opts.forUpdate ? 'FOR UPDATE' : ''}`,
    [storeId, customerId]
  );
  return rows.rows.map((row) => ({
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    returned_quantity: Number(row.returned_quantity),
    unit_price_cents: Number(row.unit_price_cents),
    line_total_cents: Number(row.line_total_cents),
    modifiers: modifiers.parseLineModifierSnapshot(row.modifiers),
    note: String(row.note ?? ''),
    price_per: Number(row.price_per ?? 1),
    weight_source: (row.weight_source as WeightSource | null) ?? null,
    unit: String(row.unit ?? ''),
  }));
}

/**
 * The lines a repayment takes out of `open` (oldest first): all of them, or
 * the ones the till named — which must be the oldest still open (rule 3).
 * Pure, so the repayment can ask it before ПРРО is asked anything and again
 * under the lock, and both answer with the same words.
 */
export function chooseOldest(open: OpenDebtLine[], lineIds?: number[]): OpenDebtLine[] {
  if (open.length === 0) {
    throw new DebtConflict('У покупця немає відкритого боргу', 'nothing_owed');
  }
  if (!lineIds?.length) return open;
  const wanted = new Set(lineIds.map(Number));
  if (wanted.size !== lineIds.length || ![...wanted].every((id) => open.some((l) => l.id === id))) {
    throw new DebtConflict(
      'Виписка змінилася — частину цих товарів уже оплачено, повернуто або списано. Оновіть її.',
      'stale_statement'
    );
  }
  const chosen = open.slice(0, wanted.size);
  if (!chosen.every((line) => wanted.has(line.id))) {
    throw new DebtConflict(
      'Погашати можна лише від найстарішого товару — так, як він записаний у виписці.',
      'not_oldest'
    );
  }
  return chosen;
}

/**
 * The lines a repayment receipt is about to pay, in the shape `completeSale`'s
 * locked branch takes — plus the exact sum each one is owed, so the receipt
 * carries the amount the statement showed rather than a discount re-derived
 * today (G3_DEBTS.md, decision 3).
 *
 * `lineIds` absent pays everything still open; present, it must be the oldest
 * lines still open (rule 3).
 */
export async function lockedDebtLines(
  client: DbClient,
  params: { storeId: number; customerId: number; lineIds?: number[] }
): Promise<
  Array<{
    variant_id: number;
    quantity: number;
    unit_price_cents: number;
    modifiers: LineModifierSnapshot[];
    note: string;
    debt_item_id: number;
    fixed_total_cents: number;
    price_per: number;
    weight_source: WeightSource | null;
    unit: string;
  }>
> {
  await lockCustomer(client, params.storeId, params.customerId);
  const open = await openLines(client, params.storeId, params.customerId, { forUpdate: true });
  return chooseOldest(open, params.lineIds).map((line) => ({
    variant_id: line.variant_id,
    quantity: line.quantity - line.returned_quantity,
    unit_price_cents: line.unit_price_cents,
    modifiers: line.modifiers,
    note: line.note,
    debt_item_id: line.id,
    fixed_total_cents: owedCents(line),
    // The receipt line keeps the basis the price was locked at and the mark
    // of a hand-typed weight (075) — a weighed line is only ever paid whole.
    price_per: line.price_per,
    weight_source: line.weight_source,
    // The unit the line was given in, not the card's today: a gram line stays
    // a gram line on its receipt whatever the owner did to the card since.
    unit: line.unit,
  }));
}

/**
 * Tie a receipt line to the debt line it pays, and copy what that line took
 * off the shelf — WITHOUT moving stock, because the goods left when they were
 * given (073, decision 3). A refund of the receipt then reverses the copy.
 */
export async function attachPaidDebtLine(
  client: DbClient,
  params: { storeId: number; debtItemId: number; saleId: number; saleItemId: number }
): Promise<void> {
  await client.query(
    `INSERT INTO pos_sale_item_components
       (store_id, sale_item_id, component_variant_id, quantity_per_unit, sort_order)
     SELECT store_id, $3, component_variant_id, quantity_per_unit, sort_order
       FROM pos_debt_item_components
      WHERE store_id = $1 AND debt_item_id = $2
      ORDER BY sort_order ASC, id ASC`,
    [params.storeId, params.debtItemId, params.saleItemId]
  );
  await client.query(
    `UPDATE pos_debt_items SET sale_id = $3 WHERE store_id = $1 AND id = $2`,
    [params.storeId, params.debtItemId, params.saleId]
  );
}

/** The journal's `payment` for a repayment receipt, in the receipt's own transaction. */
export async function recordPaymentEntry(
  client: DbClient,
  params: { storeId: number; customerId: number; saleId: number; staffId: number; amountCents: number }
): Promise<void> {
  await client.query(
    `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id, sale_id)
     VALUES ($1, $2, 'payment', $3, $4, $5)`,
    [params.storeId, params.customerId, -Math.abs(params.amountCents), params.staffId, params.saleId]
  );
}

/**
 * The other half of {@link attachPaidDebtLine}: a voided repayment receipt
 * gives its lines back to the debt, and the journal says so with a
 * `payment_void` for the same amount.
 *
 * The goods stay with the customer, so no stock moves; the receipt's copied
 * snapshot stays with the voided receipt as history. Idempotent: a second call
 * finds nothing to release, and the unique index refuses a second void.
 *
 * Locks the customer first, like every other write to a debt (rule 1): the
 * balance goes back up here, and a handover running beside it must see either
 * all of that or none of it when it checks the limit.
 */
export async function releaseDebtLinesForSale(
  client: DbClient,
  params: { storeId: number; saleId: number; staffId: number }
): Promise<number> {
  const payment = await client.query(
    `SELECT customer_id, amount_cents FROM pos_debt_entries
      WHERE store_id = $1 AND sale_id = $2 AND kind = 'payment'`,
    [params.storeId, params.saleId]
  );
  if (payment.rows.length > 0) {
    await lockCustomer(client, params.storeId, Number(payment.rows[0].customer_id));
  }
  const released = await client.query(
    `UPDATE pos_debt_items SET sale_id = NULL WHERE store_id = $1 AND sale_id = $2`,
    [params.storeId, params.saleId]
  );
  if (payment.rows.length > 0) {
    await client.query(
      `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id, sale_id, reason)
       VALUES ($1, $2, 'payment_void', $3, $4, $5, 'Чек погашення скасовано')
       ON CONFLICT (sale_id, kind) WHERE sale_id IS NOT NULL DO NOTHING`,
      [
        params.storeId,
        Number(payment.rows[0].customer_id),
        Math.abs(Number(payment.rows[0].amount_cents)),
        params.staffId,
        params.saleId,
      ]
    );
  }
  return released.rowCount ?? 0;
}
