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
// 3. **A repayment pays the oldest lines first** (decision Д4). The till
//    names the lines; this checks they are the oldest ones still open, which
//    is also what turns a screen another till made stale into a 409 rather
//    than a receipt for the wrong goods. Since Д4 was revised (2026-10-25,
//    G3_DEBTS.md §11) the next line after them may be paid in part: some of
//    its units on the same receipt, or a «внесок» toward it — and then that
//    is the only line taking anything partly.

import { pool } from '../db.js';
import { formatUah } from './core/money.js';
import * as modifiers from './modifiers.service.js';
import type { LineModifierSnapshot } from './modifiers.service.js';
import { refundLineAmount } from './lineMoney.js';
import { formatQuantity, isWeighed, type WeightSource } from './weighed.js';

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
  /** Units already paid by receipts (078) — part of the line, never all of an open one. */
  paid_quantity: number;
  /** Money taken toward the line as «внески» (078). */
  prepaid_cents: number;
  unit_price_cents: number;
  line_total_cents: number;
  modifiers: LineModifierSnapshot[];
  note: string;
  /** 1000 for goods weighed when they were given — grams at a price per kg (075). */
  price_per: number;
  weight_source: WeightSource | null;
  /** What `quantity` counted in when the goods were given — the line's own snapshot. */
  unit: string;
  product_name: string;
  variant_label: string;
  /** The ПРРО prepayment chain its «внески» went to (079), and whose it is. */
  fiscal_chain_id: string | null;
  fiscal_chain_provider: string | null;
}

/**
 * Our number for a line's prepayment chain (079, G3_DEBTS.md §11 «Крок 2») —
 * the provider takes it as the chain's own. `attempt` counts the chains
 * opened on the line, because a used number stays taken at the provider even
 * after its chain is returned. Checkbox wants 10 to 256 characters, so the
 * line is padded; it is printed on the customer's receipt, so nothing more.
 */
export function chainIdFor(storeId: number, lineId: number, attempt: number): string {
  return `ls-${storeId}-${String(lineId).padStart(6, '0')}-${attempt}`;
}

/**
 * The previous documents of a chain must be registered before the next one
 * goes: until the opening receipt is `done` there is no chain at the provider
 * to pay into, and a further receipt still in flight would leave what the
 * provider expects unknown. A sale of the chain with no ledger row yet is in
 * flight too — between its commit and its document.
 *
 * One the retry has given up on (`abandoned`, or `failed` with no next
 * attempt — what the owner's «Потребують уваги» lists) is not «a minute»
 * away: the owner settles it with the provider, and voids the «внесок» if the
 * provider has no such receipt.
 */
export async function assertChainSettled(client: DbClient, storeId: number, chainId: string): Promise<void> {
  const unsettled = await client.query(
    `SELECT r.status, r.next_attempt_at
       FROM pos_sales s
       LEFT JOIN pos_fiscal_receipts r ON r.sale_id = s.id AND r.doc_type = 'sale'
      WHERE s.store_id = $1 AND s.fiscal_chain_id = $2 AND s.status = 'completed'
        AND r.status IS DISTINCT FROM 'done'`,
    [storeId, chainId]
  );
  if (unsettled.rows.length === 0) return;
  const parked = unsettled.rows.some(
    (row) => row.status === 'abandoned' || (row.status === 'failed' && row.next_attempt_at == null)
  );
  if (parked) {
    throw new DebtConflict(
      'Попередній внесок за цей товар не вдалося зареєструвати в ПРРО — власник розбирається з ним на сторінці «ПРРО»',
      'chain_parked'
    );
  }
  throw new DebtConflict(
    'Попередній внесок за цей товар ще реєструється в ПРРО — спробуйте за хвилину',
    'chain_pending'
  );
}

/**
 * Why a void of this sale must wait, or be the owner's (079, §11 «Крок 2»):
 * it is a document of a ПРРО prepayment chain that ПРРО has not registered.
 * While the retry still means to send it, a void races the provider — the
 * retry never sends a voided sale's document, but its first attempt may
 * already be there. Once the retry gave up, only the owner undoes it, after
 * looking in the provider's cabinet. Null: nothing stands in the way here (a
 * registered one is the caller's `sale_fiscalised`).
 */
export async function chainVoidRefusal(
  storeId: number,
  saleId: number,
  role: string
): Promise<{ status: 403 | 409; code: string; message: string } | null> {
  const result = await pool.query(
    `SELECT r.status, r.next_attempt_at
       FROM pos_sales s
       JOIN pos_fiscal_receipts r ON r.sale_id = s.id AND r.doc_type = 'sale'
      WHERE s.store_id = $1 AND s.id = $2 AND s.status = 'completed' AND s.fiscal_chain_id IS NOT NULL`,
    [storeId, saleId]
  );
  const row = result.rows[0];
  if (!row || row.status === 'done') return null;
  if (row.status !== 'abandoned' && !(row.status === 'failed' && row.next_attempt_at == null)) {
    return {
      status: 409,
      code: 'chain_pending',
      message: 'Цей документ ще реєструється в ПРРО — спробуйте за хвилину',
    };
  }
  if (role === 'owner') return null;
  return {
    status: 403,
    code: 'chain_parked',
    message: 'ПРРО не зареєстрував цей документ — скасувати його може лише власник, перевіривши кабінет ПРРО',
  };
}

/** The units of a line nobody has returned or paid for yet. */
export function remainingUnits(line: {
  quantity: number;
  returned_quantity: number;
  paid_quantity?: number;
}): number {
  return line.quantity - line.returned_quantity - (line.paid_quantity ?? 0);
}

/**
 * What is still owed on a line (rule 2): its locked total minus the share of
 * the units that left it — returned or paid, in any order — minus the
 * «внески» taken toward the rest (078).
 */
export function owedCents(line: {
  line_total_cents: number;
  quantity: number;
  returned_quantity: number;
  paid_quantity?: number;
  prepaid_cents?: number;
}): number {
  const left = line.returned_quantity + (line.paid_quantity ?? 0);
  return (
    line.line_total_cents -
    refundLineAmount(line.line_total_cents, line.quantity, 0, left) -
    (line.prepaid_cents ?? 0)
  );
}

/**
 * What `units` more of a line come to, after the ones that already left it —
 * the same cumulative share a return of those units would credit. Paying the
 * last units of a line with no «внески» is exactly `owedCents`.
 */
export function unitsCents(
  line: { line_total_cents: number; quantity: number; returned_quantity: number; paid_quantity?: number },
  units: number
): number {
  const left = line.returned_quantity + (line.paid_quantity ?? 0);
  return refundLineAmount(line.line_total_cents, line.quantity, left, units);
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
    `SELECT ${LINE_SELECT}
       FROM pos_debt_items
      WHERE store_id = $1 AND customer_id = $2
        AND sale_id IS NULL AND written_off_entry_id IS NULL
        AND returned_quantity + paid_quantity < quantity
      ORDER BY created_at ASC, id ASC
      ${opts.forUpdate ? 'FOR UPDATE' : ''}`,
    [storeId, customerId]
  );
  return rows.rows.map(toOpenLine);
}

const LINE_SELECT = `id, variant_id, quantity, returned_quantity, paid_quantity, prepaid_cents,
            unit_price_cents, line_total_cents, modifiers, note, price_per, weight_source, unit,
            product_name, variant_label, fiscal_chain_id, fiscal_chain_provider`;

function toOpenLine(row: Record<string, unknown>): OpenDebtLine {
  return {
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    returned_quantity: Number(row.returned_quantity),
    paid_quantity: Number(row.paid_quantity ?? 0),
    prepaid_cents: Number(row.prepaid_cents ?? 0),
    unit_price_cents: Number(row.unit_price_cents),
    line_total_cents: Number(row.line_total_cents),
    modifiers: modifiers.parseLineModifierSnapshot(row.modifiers),
    note: String(row.note ?? ''),
    price_per: Number(row.price_per ?? 1),
    weight_source: (row.weight_source as WeightSource | null) ?? null,
    unit: String(row.unit ?? ''),
    product_name: String(row.product_name ?? ''),
    variant_label: String(row.variant_label ?? ''),
    fiscal_chain_id: row.fiscal_chain_id == null ? null : String(row.fiscal_chain_id),
    fiscal_chain_provider: row.fiscal_chain_provider == null ? null : String(row.fiscal_chain_provider),
  };
}

/**
 * Lines of one customer by id, whatever has happened to them since — a
 * repayment repeated after a lost answer names lines that its own first
 * attempt may already have closed. Oldest first, as a repayment takes them.
 */
export async function linesById(
  client: DbClient,
  storeId: number,
  customerId: number,
  ids: number[]
): Promise<OpenDebtLine[]> {
  if (ids.length === 0) return [];
  const rows = await client.query(
    `SELECT ${LINE_SELECT}
       FROM pos_debt_items
      WHERE store_id = $1 AND customer_id = $2 AND id = ANY($3::bigint[])
      ORDER BY created_at ASC, id ASC`,
    [storeId, customerId, ids]
  );
  return rows.rows.map(toOpenLine);
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

/** What a repayment takes partly, after its whole lines (G3_DEBTS.md §11). */
export interface DebtPartInput {
  line_id: number;
  /** Units of a line counted in pieces — fewer than it still has. */
  quantity?: number;
  /** A «внесок» toward the line — less than is owed on it after `quantity`. */
  amount_cents?: number;
}

/**
 * The line a repayment takes partly: the oldest one still open after the
 * whole lines it pays (`wholeCount` of them), and only in the ways §11 allows
 * — units of a line counted in pieces, a «внесок» short of what is owed. Pure,
 * like {@link chooseOldest}, and asked again under the lock.
 */
export function choosePart(open: OpenDebtLine[], wholeCount: number, part: DebtPartInput): OpenDebtLine {
  const line = open[wholeCount];
  if (!line || line.id !== part.line_id) {
    if (!open.some((l) => l.id === part.line_id)) {
      throw new DebtConflict(
        'Виписка змінилася — частину цих товарів уже оплачено, повернуто або списано. Оновіть її.',
        'stale_statement'
      );
    }
    throw new DebtConflict(
      'Частинами гаситься лише наступний товар після найстаріших — так, як вони записані у виписці.',
      'not_oldest'
    );
  }
  const remaining = remainingUnits(line);
  if (part.quantity != null) {
    if (isWeighed(line.price_per)) {
      throw new DebtConflict(
        `Ваговий товар гаситься лише цілим рядком — ${formatQuantity(remaining, line.unit, line.price_per)}`,
        'weighed_whole_line'
      );
    }
    if (line.prepaid_cents > 0) {
      throw new DebtConflict(
        `На цей товар уже внесено ${formatUah(line.prepaid_cents)} — його гасять лише цілим`,
        'has_prepayment'
      );
    }
    if (part.quantity >= remaining) {
      throw new DebtConflict(
        `Частиною можна погасити менше, ніж лишилося (${remaining}); усе — це цілий товар`,
        'too_many'
      );
    }
  }
  if (part.amount_cents != null) {
    const after = owedCents(line) - (part.quantity ? unitsCents(line, part.quantity) : 0);
    if (part.amount_cents >= after) {
      throw new DebtConflict(
        `Внесок має бути менший, ніж винно за цим товаром (${formatUah(after)}): таку суму гасять цілим товаром`,
        'prepay_covers_line'
      );
    }
  }
  return line;
}

/** A receipt line paying a «під запис» line, in the shape `completeSale`'s locked branch takes. */
export interface LockedDebtLine {
  variant_id: number;
  quantity: number;
  unit_price_cents: number;
  modifiers: LineModifierSnapshot[];
  note: string;
  debt_item_id: number;
  fixed_total_cents: number;
  /** What this line took earlier as «внески» — set when the receipt closes it (078). */
  debt_prepaid_cents: number;
  price_per: number;
  weight_source: WeightSource | null;
  unit: string;
}

function receiptLine(line: OpenDebtLine, units: number, cents: number): LockedDebtLine {
  return {
    variant_id: line.variant_id,
    quantity: units,
    unit_price_cents: line.unit_price_cents,
    modifiers: line.modifiers,
    note: line.note,
    debt_item_id: line.id,
    fixed_total_cents: cents,
    debt_prepaid_cents: units === remainingUnits(line) ? line.prepaid_cents : 0,
    // The receipt line keeps the basis the price was locked at and the mark
    // of a hand-typed weight (075) — a weighed line is only ever paid whole.
    price_per: line.price_per,
    weight_source: line.weight_source,
    // The unit the line was given in, not the card's today: a gram line stays
    // a gram line on its receipt whatever the owner did to the card since.
    unit: line.unit,
  };
}

/**
 * The lines a repayment receipt is about to pay, in the shape `completeSale`'s
 * locked branch takes — plus the exact sum each one is owed, so the receipt
 * carries the amount the statement showed rather than a discount re-derived
 * today (G3_DEBTS.md, decision 3).
 *
 * `lineIds` absent pays everything still open; present, it must be the oldest
 * lines still open (rule 3). `part` adds some units of the next line — the one
 * a «внесок» in the same request goes to, if any (§11).
 */
export async function lockedDebtLines(
  client: DbClient,
  params: {
    storeId: number;
    customerId: number;
    lineIds?: number[];
    part?: { line_id: number; quantity: number } | null;
    /**
     * The receipt closes a line paid by «внески» through its ПРРО chain — its
     * «чек післяплати» (079, G3_DEBTS.md §11 «Крок 2»): that one line alone,
     * and only once every earlier document of the chain is registered.
     */
    chainId?: string | null;
    /**
     * On an ordinary receipt: the provider whose chains close on a receipt of
     * their own. A line that opened one since the till read the statement
     * (another till took a «внесок») is not closed here behind its chain.
     */
    chainProvider?: string | null;
  }
): Promise<LockedDebtLine[]> {
  await lockCustomer(client, params.storeId, params.customerId);
  const open = await openLines(client, params.storeId, params.customerId, { forUpdate: true });
  // With a part and no lines named, nothing is taken whole — not «everything».
  const whole = params.part && !params.lineIds?.length ? [] : chooseOldest(open, params.lineIds);
  if (!params.chainId && params.chainProvider && whole.some((line) => line.fiscal_chain_provider === params.chainProvider)) {
    throw new DebtConflict(
      'Виписка змінилася — за цей товар щойно прийняли внесок. Оновіть її.',
      'stale_statement'
    );
  }
  if (params.chainId) {
    if (whole.length !== 1 || params.part) {
      throw new DebtError('Товар, за який вносили через ПРРО, закривається окремим чеком');
    }
    if (whole[0].fiscal_chain_id !== params.chainId) {
      throw new DebtConflict(
        'Виписка змінилася — частину цих товарів уже оплачено, повернуто або списано. Оновіть її.',
        'stale_statement'
      );
    }
    await assertChainSettled(client, params.storeId, params.chainId);
  }
  const lines = whole.map((line) => receiptLine(line, remainingUnits(line), owedCents(line)));
  if (params.part) {
    const line = choosePart(open, whole.length, { line_id: params.part.line_id, quantity: params.part.quantity });
    lines.push(receiptLine(line, params.part.quantity, unitsCents(line, params.part.quantity)));
  }
  return lines;
}

/**
 * Tie a receipt line to the debt line it pays, and copy what that line took
 * off the shelf — WITHOUT moving stock, because the goods left when they were
 * given (073, decision 3). A refund of the receipt then reverses the copy.
 *
 * `quantity` units become paid (078); the receipt that pays the last of them
 * closes the line and is its `sale_id`.
 */
export async function attachPaidDebtLine(
  client: DbClient,
  params: { storeId: number; debtItemId: number; saleId: number; saleItemId: number; quantity: number }
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
    `UPDATE pos_debt_items
        SET paid_quantity = paid_quantity + $4,
            sale_id = CASE WHEN returned_quantity + paid_quantity + $4 >= quantity THEN $3 ELSE sale_id END
      WHERE store_id = $1 AND id = $2`,
    [params.storeId, params.debtItemId, params.saleId, params.quantity]
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
 * gives its lines back to the debt — the units it paid (078), and a «внесок»
 * its money — and the journal says so with a `payment_void` for the same
 * amount.
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
    `SELECT id, customer_id, amount_cents FROM pos_debt_entries
      WHERE store_id = $1 AND sale_id = $2 AND kind = 'payment'`,
    [params.storeId, params.saleId]
  );
  if (payment.rows.length > 0) {
    await lockCustomer(client, params.storeId, Number(payment.rows[0].customer_id));
    await assertNothingBuiltOn(client, { ...params, entryId: Number(payment.rows[0].id) });
  }
  // The units each receipt line paid, whether or not it was the one that
  // closed the line; a «внесок» has no lines, only its money.
  const released = await client.query(
    `UPDATE pos_debt_items d
        SET paid_quantity = d.paid_quantity - si.quantity,
            sale_id = CASE WHEN d.sale_id = $2 THEN NULL ELSE d.sale_id END
       FROM pos_sale_items si
      WHERE si.sale_id = $2 AND si.debt_item_id = d.id AND d.store_id = $1`,
    [params.storeId, params.saleId]
  );
  const unprepaid = await client.query(
    `UPDATE pos_debt_items d
        SET prepaid_cents = d.prepaid_cents - s.total_cents
       FROM pos_sales s
      WHERE s.id = $2 AND s.store_id = $1 AND s.debt_prepay_item_id = d.id AND s.status = 'completed'`,
    [params.storeId, params.saleId]
  );
  // The only sale of a chain going (079): its document — the opening one —
  // was refused, so there is no chain at the provider. The line leaves it,
  // and its next «внесок» opens a new chain under the next number.
  await client.query(
    `UPDATE pos_debt_items d
        SET fiscal_chain_id = NULL, fiscal_chain_provider = NULL
       FROM pos_sales s
      WHERE s.id = $2 AND s.store_id = $1 AND s.debt_prepay_item_id = d.id
        AND s.fiscal_chain_id IS NOT NULL AND d.fiscal_chain_id = s.fiscal_chain_id
        AND NOT EXISTS (
          SELECT 1 FROM pos_sales other
           WHERE other.store_id = $1 AND other.fiscal_chain_id = s.fiscal_chain_id
             AND other.status = 'completed' AND other.id <> s.id
        )`,
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
  return (released.rowCount ?? 0) + (unprepaid.rowCount ?? 0);
}

/**
 * A void gives back exactly what its payment took only while nothing was
 * built on it since (078). The goods it paid toward must still be open — not
 * written off, not closed by another receipt; a «внесок» whose line a later
 * receipt closed is already inside that receipt's sum. And units on a receipt
 * must be the last to have left their line: after a later return or receipt
 * the cumulative share of what left the line would no longer come back to
 * this receipt's sum, and the journal would drift from the lines by a kopeck.
 * The cashier undoes the later one first.
 */
async function assertNothingBuiltOn(
  client: DbClient,
  params: { storeId: number; saleId: number; entryId: number }
): Promise<void> {
  const touched = await client.query(
    `SELECT d.id, d.product_name, d.variant_label, d.sale_id, d.written_off_entry_id,
            closer.receipt_number AS closed_by, d.fiscal_chain_id,
            (SELECT s.fiscal_chain_id FROM pos_sales s WHERE s.id = $2) AS voided_chain,
            EXISTS (SELECT 1 FROM pos_sale_items si WHERE si.sale_id = $2 AND si.debt_item_id = d.id) AS units
       FROM pos_debt_items d
       LEFT JOIN pos_sales closer ON closer.id = d.sale_id
      WHERE d.store_id = $1
        AND (d.id IN (SELECT si.debt_item_id FROM pos_sale_items si WHERE si.sale_id = $2)
             OR d.id = (SELECT s.debt_prepay_item_id FROM pos_sales s WHERE s.id = $2))
      ORDER BY d.id
      FOR UPDATE OF d`,
    [params.storeId, params.saleId]
  );
  for (const line of touched.rows) {
    const title = line.variant_label ? `${line.product_name} · ${line.variant_label}` : String(line.product_name);
    if (line.written_off_entry_id != null) {
      throw new DebtConflict(`«${title}» уже списано — цей платіж не скасовується`, 'written_off');
    }
    // A line paid toward through its ПРРО chain (079): the chain expects
    // exactly what is owed, so nothing outside it may move that sum — the
    // chain goes back first (2-Б).
    if (line.fiscal_chain_id != null && line.voided_chain !== line.fiscal_chain_id) {
      throw new DebtConflict(
        `За «${title}» уже є внески в ПРРО — спершу скасуйте їх («Скасувати внески»)`,
        'chain_open'
      );
    }
    if (line.sale_id != null && Number(line.sale_id) !== params.saleId) {
      const by = line.closed_by ? `чек ${line.closed_by}` : 'інший чек';
      throw new DebtConflict(`«${title}» уже закрив ${by} — спершу скасуйте його`, 'closed_later');
    }
    if (!line.units) continue;
    const later = await client.query(
      `SELECT 1 FROM pos_debt_entries e
         JOIN pos_debt_entry_lines el ON el.entry_id = e.id
        WHERE e.store_id = $1 AND e.kind = 'return' AND el.debt_item_id = $2 AND e.id > $3
       UNION ALL
       SELECT 1 FROM pos_sale_items si
         JOIN pos_sales s ON s.id = si.sale_id
        WHERE si.debt_item_id = $2 AND s.status = 'completed' AND s.id > $4
       LIMIT 1`,
      [params.storeId, Number(line.id), params.entryId, params.saleId]
    );
    if (later.rows.length > 0) {
      throw new DebtConflict(
        `Після цього чека «${title}» ще гасили або повертали — спершу скасуйте пізніші записи`,
        'later_entries'
      );
    }
  }
}

/** A «внесок» as written — and, under ПРРО, the chain document it is. */
export interface RecordedPrepayment {
  saleId: number;
  /** Null where nothing is fiscalised. */
  chain: { relationId: string; op: 'open' | 'pay' } | null;
  /** The line as it stood before the «внесок»: the goods of its chain. */
  line: OpenDebtLine;
  owedBeforeCents: number;
}

/**
 * A «внесок» (078, G3_DEBTS.md §11): money toward the oldest open line that
 * does not close it. A row in `pos_sales` with no goods lines — takings and
 * the payment split see it on its own day — pointing at the line, the line's
 * `prepaid_cents` up by the sum, and a `payment` in the journal, all inside
 * the caller's transaction, after whatever receipt the same request rang.
 *
 * Checked again here, under the customer's lock: the line must still be the
 * oldest one open and still owe more than the «внесок».
 *
 * `chain` — the store registers it with ПРРО through the provider's
 * prepayment chain (079, §11 «Крок 2»). The line's first «внесок» opens the
 * chain under our next number for it; a further one joins it, once every
 * earlier document of the chain is registered. Without `chain` nothing is
 * fiscalised now, so a line still carrying a chain leaves it: a «внесок» the
 * provider never saw would leave it expecting more than is owed, and the
 * chain could never be closed — the line closes with an ordinary receipt.
 */
export async function recordPrepaymentTx(
  client: DbClient,
  params: {
    storeId: number;
    staffId: number;
    customerId: number;
    lineId: number;
    amountCents: number;
    method: 'cash' | 'card';
    clientUuid: string;
    receiptNumber: string;
    chain?: { provider: string } | null;
  }
): Promise<RecordedPrepayment> {
  await lockCustomer(client, params.storeId, params.customerId);
  const open = await openLines(client, params.storeId, params.customerId, { forUpdate: true });
  const line = choosePart(open, 0, { line_id: params.lineId, amount_cents: params.amountCents });
  const owedBeforeCents = owedCents(line);

  let chain: RecordedPrepayment['chain'] = null;
  if (params.chain) {
    if (line.fiscal_chain_id) {
      if (line.fiscal_chain_provider !== params.chain.provider) {
        throw new DebtConflict(
          'Внески за цей товар приймали через інший ПРРО — його закривають цілим чеком',
          'chain_other_provider'
        );
      }
      await assertChainSettled(client, params.storeId, line.fiscal_chain_id);
      chain = { relationId: line.fiscal_chain_id, op: 'pay' };
    } else {
      const counted = await client.query(
        `UPDATE pos_debt_items SET fiscal_chain_attempts = fiscal_chain_attempts + 1
          WHERE store_id = $1 AND id = $2
          RETURNING fiscal_chain_attempts`,
        [params.storeId, line.id]
      );
      const relationId = chainIdFor(params.storeId, line.id, Number(counted.rows[0].fiscal_chain_attempts));
      await client.query(
        `UPDATE pos_debt_items SET fiscal_chain_id = $3, fiscal_chain_provider = $4
          WHERE store_id = $1 AND id = $2`,
        [params.storeId, line.id, relationId, params.chain.provider]
      );
      chain = { relationId, op: 'open' };
    }
  } else if (line.fiscal_chain_id) {
    await client.query(
      `UPDATE pos_debt_items SET fiscal_chain_id = NULL, fiscal_chain_provider = NULL
        WHERE store_id = $1 AND id = $2`,
      [params.storeId, line.id]
    );
  }

  const sale = await client.query(
    `INSERT INTO pos_sales
       (store_id, staff_id, receipt_number, status, subtotal_cents, total_cents, customer_id,
        cart_discount_cents, client_uuid, fiscal_status, prep_status, served_at,
        cash_rounding, rounding_cents, debt_prepay_item_id, fiscal_chain_id)
     VALUES ($1, $2, $3, 'completed', $4, $4, $5, 0, $6, $8, 'served', NOW(), 0, 0, $7, $9)
     RETURNING id`,
    [
      params.storeId,
      params.staffId,
      params.receiptNumber,
      params.amountCents,
      params.customerId,
      params.clientUuid,
      params.lineId,
      // Stamped inside the transaction, like a sale's: a crash before the
      // document must not leave a fiscalisable «внесок» looking like 'none'.
      chain ? 'pending' : 'none',
      chain?.relationId ?? null,
    ]
  );
  const saleId = Number(sale.rows[0].id);
  await client.query(
    `INSERT INTO pos_payments (sale_id, store_id, method, amount_cents) VALUES ($1, $2, $3, $4)`,
    [saleId, params.storeId, params.method, params.amountCents]
  );
  await client.query(
    `UPDATE pos_debt_items SET prepaid_cents = prepaid_cents + $3 WHERE store_id = $1 AND id = $2`,
    [params.storeId, params.lineId, params.amountCents]
  );
  await recordPaymentEntry(client, {
    storeId: params.storeId,
    customerId: params.customerId,
    saleId,
    staffId: params.staffId,
    amountCents: params.amountCents,
  });
  return { saleId, chain, line, owedBeforeCents };
}
