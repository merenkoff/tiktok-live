// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/split-sale.service.ts — one cart, one receipt per register (ДК2-Б,
// TechDocs/POS_DUAL_REGISTER.md §4.2).
//
// «Шабля» sells food through one ФОП's register and alcohol through another's.
// A cart holding both is two receipts — the law draws that line: each ФОП
// registers only its own goods. The guest still pays once (decision Д2), so
// this file is the till's checkout run once per register, with the rules
// that make two receipts out of one payment:
//
// 1. **Nothing is written until both receipts are known to be writable.** A
//    dry run — the real `completeSaleTx` inside a transaction that is rolled
//    back — prices each receipt exactly (discounts, modifiers, cash rounding)
//    and meets every refusal a sale can meet (stock, stop-list, archive)
//    before the first receipt exists. The same dry run answers the till's
//    `POST /sales/split-quote`, which is what the cashier reads the two card
//    amounts from before the terminals are touched.
// 2. **One payment, shared out (Д8).** One method for the whole cart; every
//    receipt but the last takes exactly what it owes after its own cash
//    rounding, and the last takes the rest — so «Отримано / Решта» is on it.
//    A cart's discount is a percentage on each receipt, or a fixed amount
//    shared out once in proportion (`shareDiscount`, the bill's rule).
// 3. **Each receipt is its own transaction and its own ПРРО document,** with
//    the three outcomes of a single checkout. A receipt whose document cannot
//    exist is undone, and the receipts after it are not rung: the till keeps
//    their lines (`notTakenItems`) and hands back what was not taken.
// 4. **Keys follow the request.** Register 1's receipt keeps the request's
//    `client_uuid`, the others are derived from it (`registerPartUuidFor`),
//    so a repeated request finds what it already wrote and rings only the rest.

import { pool } from '../db.js';
import { logger } from '../logger.js';
import { shareDiscount } from './bill-payment.service.js';
import { registerPartUuidFor } from './core/derivedUuid.js';
import { ExciseError } from './excise.js';
import * as fiscalService from './fiscal/fiscal.service.js';
import { registersOfLines } from './fiscal/routing.js';
import { normalizeModifierIds } from './modifiers.service.js';
import { completeSale, completeSaleTx, getSale, getSaleByClientUuid } from './sales.service.js';
import type {
  CartDiscountInput,
  CompleteSaleItemInput,
  CompleteSalePaymentInput,
  PaymentMethod,
} from './types.js';

type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;

export interface SplitSaleInput {
  storeId: number;
  staffId: number;
  deviceId: string | null;
  items: CompleteSaleItemInput[];
  payments: CompleteSalePaymentInput[];
  note?: string;
  cart_discount?: CartDiscountInput | null;
  customer_id?: number | null;
  client_uuid: string;
  cash_rounding?: unknown;
  /**
   * The bottles the order opens, by their stamps (ДК5). Every receipt gets
   * the whole list; each opens only the bottles its own lines pour from, and
   * a line pouring from a bottle is on that bottle's register (Д20).
   */
  open_bottles?: unknown;
}

/** One receipt of the cart, as planned. */
export interface SplitReceiptPlan {
  register_no: number;
  /** Indexes into the request's `items`. */
  item_indexes: number[];
  /** What the goods come to after the receipt's discount. */
  total_cents: number;
  rounding_cents: number;
  /** What this receipt is paid: `total_cents + rounding_cents`. */
  due_cents: number;
  cart_discount: CartDiscountInput | null;
}

export interface SplitPartResult {
  register_no: number;
  /** The sale; its `fiscal` is the document this call registered, when it registered one. */
  sale: SaleDetail | (Omit<SaleDetail, 'fiscal'> & { fiscal: fiscalService.FiscalView });
}

export interface SplitSaleResult {
  parts: SplitPartResult[];
  /** Set when a receipt is paid but its document is still to be registered. */
  warning: string | null;
}

/** The cart cannot be split as asked — nothing was written. */
export class SplitSaleError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: 400 | 409 = 400
  ) {
    super(message);
    this.name = 'SplitSaleError';
  }
}

/**
 * A receipt could not be rung because of ПРРО (or a refusal no dry run could
 * see). Earlier receipts stand: the till prints them, keeps the lines of
 * this and every later receipt, and hands back `notTakenCents`.
 */
export class SplitSaleRefusal extends Error {
  constructor(
    message: string,
    readonly detail: {
      stage: 'preflight' | 'sale' | 'document';
      cause: unknown;
      registerNo: number;
      done: SplitPartResult[];
      saleId: number | null;
      voided: boolean;
      notTakenCents: number;
      notTakenItems: number[];
    }
  ) {
    super(message);
    this.name = 'SplitSaleRefusal';
  }
}

export const SPLIT_RECEIPT_PENDING_WARNING =
  'Оплату прийнято, але один із чеків у ПРРО ще не зареєстровано — система повторить спробу сама. Не пробивайте його вдруге.';

/** The cart's lines by register, register 1 first. */
export async function groupByRegister(
  storeId: number,
  items: CompleteSaleItemInput[]
): Promise<Map<number, number[]>> {
  // By line, not by product (ДК5, Д20): a coffee with a cognac answer goes
  // where the cognac goes.
  const byLine = await registersOfLines(
    pool,
    storeId,
    items.map((item) => ({
      variant_id: Number(item.variant_id),
      modifiers: item.components?.length ? [] : normalizeModifierIds(item.modifiers),
    }))
  );
  const groups = new Map<number, number[]>();
  items.forEach((_item, index) => {
    const register = byLine[index] ?? 1;
    groups.set(register, [...(groups.get(register) ?? []), index]);
  });
  return new Map([...groups.entries()].sort(([a], [b]) => a - b));
}

/** A bottle a cart would open without its stamp (ДК5, Д4). */
export interface NeededBottle {
  variant_id: number;
  product_name: string;
  count: number;
}

/**
 * `POST /bottles/check`: the new bottles a cart would open that the till has
 * no stamp for — asked BEFORE the payment screen, so a cashier never runs a
 * card on the terminal and only then hears «відкрийте нову пляшку». The same
 * dry run as the split quote (the real `completeSaleTx`, rolled back), one
 * per register, so it pours exactly as the sale will. Any other refusal —
 * stock, the stop-list, a whole bottle's stamp — is not this question's: the
 * payment meets it in its own words, so it answers «none» here.
 */
export async function bottlesNeeded(input: {
  storeId: number;
  staffId: number;
  items: CompleteSaleItemInput[];
  open_bottles?: unknown;
}): Promise<NeededBottle[]> {
  if (!Array.isArray(input.items) || input.items.length === 0) return [];
  let groups: Map<number, number[]>;
  try {
    groups = await groupByRegister(input.storeId, input.items);
  } catch {
    return [];
  }
  const out = new Map<number, NeededBottle>();
  for (const [register, indexes] of groups) {
    try {
      await dryRun(
        { storeId: input.storeId, staffId: input.staffId, open_bottles: input.open_bottles } as SplitSaleInput,
        register,
        indexes.map((i) => input.items[i]),
        null,
        'cash'
      );
    } catch (error) {
      if (!(error instanceof ExciseError) || error.code !== 'bottle_needed') continue;
      for (const raw of (error.detail.bottles as NeededBottle[] | undefined) ?? []) {
        const have = out.get(raw.variant_id);
        out.set(raw.variant_id, have ? { ...have, count: have.count + raw.count } : { ...raw });
      }
    }
  }
  return [...out.values()];
}

/** The one method a split cart is paid by (Д8), or a refusal in words. */
function singleMethod(payments: CompleteSalePaymentInput[]): PaymentMethod {
  const methods = new Set((payments ?? []).map((p) => p.method));
  if (methods.size !== 1) {
    throw new SplitSaleError(
      'Замовлення на дві каси оплачується одним способом — готівкою або карткою, не частинами',
      'split_mixed_payment',
      409
    );
  }
  return [...methods][0];
}

/**
 * Price one receipt exactly as it would be written, and write nothing: the
 * real `completeSaleTx`, rolled back. Any refusal it meets (stock, the
 * stop-list, an archived card) is the refusal the real write would meet.
 */
async function dryRun(
  input: SplitSaleInput,
  registerNo: number,
  items: CompleteSaleItemInput[],
  cartDiscount: CartDiscountInput | null,
  method: PaymentMethod
): Promise<{ total: number; rounding: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { saleId } = await completeSaleTx(client, {
      storeId: input.storeId,
      staffId: input.staffId,
      items,
      // Any sum covers it; the dry run only asks what the receipt comes to.
      payments: [{ method, amount_cents: 1_000_000_000 }],
      cart_discount: cartDiscount,
      customer_id: input.customer_id ?? null,
      client_uuid: null,
      fiscal_status: 'none',
      cash_rounding: input.cash_rounding,
      fiscal_register: registerNo,
      open_bottles: input.open_bottles,
    });
    const row = await client.query(
      `SELECT total_cents, rounding_cents FROM pos_sales WHERE id = $1`,
      [saleId]
    );
    return {
      total: Number(row.rows[0].total_cents),
      rounding: Number(row.rows[0].rounding_cents),
    };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/**
 * The receipts a cart becomes, priced (rule 1). Also the answer to
 * `POST /sales/split-quote`. A receipt already written under this request's
 * keys is read back rather than priced again — a repeated request must not
 * dry-run goods that already left the shelf.
 */
export async function planSplit(
  input: Omit<SplitSaleInput, 'client_uuid'> & { client_uuid?: string | null }
): Promise<SplitReceiptPlan[]> {
  if (!input.items?.length) throw new SplitSaleError('Кошик порожній', 'empty_cart');
  const method = singleMethod(input.payments);
  const groups = await groupByRegister(input.storeId, input.items);
  const registers = [...groups.keys()];
  const itemsOf = (register: number) => groups.get(register)!.map((i) => input.items[i]);
  const existing = new Map<number, SaleDetail>();
  if (input.client_uuid) {
    for (const register of registers) {
      const sale = await getSaleByClientUuid(
        input.storeId,
        registerPartUuidFor(input.client_uuid, register)
      );
      if (sale) existing.set(register, sale);
    }
  }

  // A percentage is the same percentage on every receipt; a fixed amount is
  // shared out once over what each receipt's goods come to (rule 2).
  const discounts = new Map<number, CartDiscountInput | null>();
  const discount = input.cart_discount ?? null;
  if (discount?.type === 'fixed' && discount.value > 0) {
    const subtotals: number[] = [];
    for (const register of registers) {
      const sale = existing.get(register);
      subtotals.push(
        sale
          ? Number(sale.total_cents) + Number(sale.cart_discount_cents ?? 0)
          : (await dryRun(input as SplitSaleInput, register, itemsOf(register), null, method)).total
      );
    }
    const shares = shareDiscount(subtotals, discount.value);
    registers.forEach((register, i) =>
      discounts.set(register, shares[i] > 0 ? { type: 'fixed', value: shares[i] } : null)
    );
  } else {
    registers.forEach((register) => discounts.set(register, discount));
  }

  const plan: SplitReceiptPlan[] = [];
  for (const register of registers) {
    const sale = existing.get(register);
    const priced = sale
      ? { total: Number(sale.total_cents), rounding: Number(sale.rounding_cents ?? 0) }
      : await dryRun(
          input as SplitSaleInput,
          register,
          itemsOf(register),
          discounts.get(register) ?? null,
          method
        );
    plan.push({
      register_no: register,
      item_indexes: groups.get(register)!,
      total_cents: priced.total,
      rounding_cents: priced.rounding,
      due_cents: priced.total + priced.rounding,
      cart_discount: discounts.get(register) ?? null,
    });
  }
  return plan;
}

/**
 * Ring a cart that spans registers: one sale and one ПРРО document per
 * register, register 1 first (rules 1–4). Throws `SplitSaleError` before
 * anything is written, `SplitSaleRefusal` once something has been.
 */
export async function completeSplitSale(input: SplitSaleInput): Promise<SplitSaleResult> {
  const plan = await planSplit(input);
  const method = singleMethod(input.payments);
  const tendered = input.payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const owed = plan.reduce((sum, receipt) => sum + receipt.due_cents, 0);
  if (tendered < owed) {
    throw new SplitSaleError('Оплати не вистачає на обидва чеки', 'insufficient_payment');
  }

  const done: SplitPartResult[] = [];
  let warning: string | null = null;
  let taken = 0;
  for (const [index, receipt] of plan.entries()) {
    const last = index === plan.length - 1;
    const amount = last ? tendered - taken : receipt.due_cents;
    const rest = plan.slice(index);
    const refusal = (
      stage: 'preflight' | 'sale' | 'document',
      cause: unknown,
      saleId: number | null,
      voided: boolean
    ) =>
      new SplitSaleRefusal(cause instanceof Error ? cause.message : 'Чек не пробито', {
        stage,
        cause,
        registerNo: receipt.register_no,
        done: [...done],
        saleId,
        voided,
        notTakenCents: tendered - taken,
        notTakenItems: rest.flatMap((r) => r.item_indexes),
      });

    // Written by an earlier try of this same request: it stands as it is
    // (the retry cron owns its document), and the next one is rung.
    const already = await getSaleByClientUuid(
      input.storeId,
      registerPartUuidFor(input.client_uuid, receipt.register_no)
    );
    if (already) {
      if (already.status !== 'completed') {
        throw new SplitSaleError('Цей чек скасовано — почніть новий', 'sale_voided_not_fiscalised', 409);
      }
      taken += (already.payments ?? []).reduce(
        (sum: number, p: { amount_cents: number }) => sum + Number(p.amount_cents),
        0
      );
      done.push({ register_no: receipt.register_no, sale: already });
      continue;
    }

    let gate: fiscalService.FiscalGate;
    try {
      gate = await fiscalService.preflight(
        input.storeId,
        input.staffId,
        input.deviceId,
        'sale',
        receipt.register_no
      );
    } catch (cause) {
      if (done.length === 0) throw cause;
      throw refusal('preflight', cause, null, false);
    }

    let sale: SaleDetail | null;
    try {
      sale = await completeSale({
        storeId: input.storeId,
        staffId: input.staffId,
        items: receipt.item_indexes.map((i) => input.items[i]),
        payments: [{ method, amount_cents: amount }],
        note: index === 0 ? input.note : undefined,
        cart_discount: receipt.cart_discount,
        customer_id: input.customer_id ?? null,
        client_uuid: registerPartUuidFor(input.client_uuid, receipt.register_no),
        fiscal_status: gate.on ? 'pending' : 'none',
        cash_rounding: input.cash_rounding,
        fiscal_register: receipt.register_no,
        open_bottles: input.open_bottles,
      });
    } catch (cause) {
      if (done.length === 0) throw cause;
      throw refusal('sale', cause, null, false);
    }
    if (!sale) throw refusal('sale', new Error('Чек не прочитано після запису'), null, false);
    if (sale.status !== 'completed') {
      throw new SplitSaleError('Цей чек скасовано — почніть новий', 'sale_voided_not_fiscalised', 409);
    }
    taken += amount;

    if (!gate.on || sale.fiscal_status === 'done') {
      done.push({ register_no: receipt.register_no, sale });
      continue;
    }
    try {
      const fiscal = await fiscalService.fiscalizeSale(gate, {
        ...sale,
        customer_phone: sale.customer_phone,
      });
      done.push({ register_no: receipt.register_no, sale: { ...sale, fiscal } });
    } catch (error) {
      if (error instanceof fiscalService.FiscalDocumentFailed && !error.mayExist) {
        const voided = await fiscalService.abortSale(input.storeId, sale.id, input.staffId, error.row);
        if (voided) {
          taken -= amount;
          throw refusal('document', error.cause, sale.id, true);
        }
      }
      // Ambiguous, or the undo could not run: the receipt STANDS for the
      // retry cron, exactly as a single checkout's — and the next one is rung.
      logger.error('Split sale: receipt paid, document not registered', {
        storeId: input.storeId,
        saleId: sale.id,
        registerNo: receipt.register_no,
        error: error instanceof Error ? error.message : String(error),
      });
      warning = SPLIT_RECEIPT_PENDING_WARNING;
      done.push({ register_no: receipt.register_no, sale });
    }
  }
  return { parts: done, warning };
}
