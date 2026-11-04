// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/bill-payment.service.ts — paying a table bill (phase К4d;
// TechDocs/POS_TABLES.md §4.4, §9).
//
// Its own file rather than a function in `bills.service.ts`, because paying
// goes through `completeSale`, and `sales.service.ts` already reads the bill's
// lines — putting this there would close an import cycle for no gain.
//
// The whole phase is three rules:
//
// 1. **Splitting by items is N sales; splitting evenly is N payments on one.**
//    Not a compromise — a line the law and the schema drew together.
//    `pos_fiscal_receipts` has a unique index on `(sale_id) WHERE
//    doc_type='sale'`, so one sale carries at most one fiscal receipt. When
//    the guests divide the DISHES, each part is its own list of goods and so
//    its own receipt; when they divide the SUM, the list is one and so is the
//    receipt, and «порівну на трьох» is three payment rows `completeSale`
//    already accepts. Both shapes are the same call here: a part with its own
//    `line_ids` is a split by items, and a single part with three payments is
//    a split by sum.
// 2. **The bill's discount is computed once, over the whole bill, and handed
//    to the parts as fixed amounts.** Re-running a percentage per part is the
//    mistake §9.14 names: Σ of the parts would not equal the discount on the
//    whole, and the guests would find it by adding the receipts up.
// 3. **Each part is its own transaction.** A fiscalisation that fails on the
//    second of three receipts leaves the first and third exactly where they
//    are, and the bill stays open carrying what is still unpaid — which is
//    simply `sale_id IS NULL` on its lines.
// 4. **In a store that fiscalises, a part is not paid until its receipt is
//    registered — or provably cannot be.** The same three outcomes the till's
//    checkout has (`checkout.routes.ts`), because the law does not care which
//    screen took the money:
//      · ПРРО unreachable BEFORE the part is written → nothing is written, the
//        plates stay owed (`BillFiscalRefusal`, stage `preflight`);
//      · the provider REFUSED the document (it cannot exist) → the part is
//        undone: its sale voided and its plates back on the bill as unpaid
//        (`abortSale` → `voidSale`, which knows a bill's part), and NO stock returned, because
//        the round took it and the dish was cooked (`BillFiscalRefusal`,
//        stage `document`);
//      · the outcome is AMBIGUOUS (a timeout — the receipt may exist) → the
//        sale STANDS, `failed`, for the retry cron to settle, and the answer
//        carries a warning. Voiding here would double-fiscalise the re-ring.
//    Before this the route never asked ПРРО anything and every table sale in a
//    ПРРО store stayed `fiscal_status='none'` forever — no receipt, and a
//    refund that had nothing to return against.
// 5. **A part goes through the register its dishes belong to** (ДК2,
//    TechDocs/POS_DUAL_REGISTER.md §4.2). In a store with a second register
//    switched on, a part holding food and alcohol is two receipts — two
//    ФОП — one per register, register 1 first. The guest still pays once
//    (Д2): every receipt but the last takes exactly what it owes, after its
//    own cash rounding, and the last takes the rest, change included (Д8).
//    One payment row per part, then: splitting the SUM («порівну») and
//    mixing methods are refused while the second register works (Д6, Д8).

import * as bills from './bills.service.js';
import { parseCashRoundingStep, saleRoundingCents } from './cashRounding.js';
import { registerPartUuidFor } from './core/derivedUuid.js';
import { completeSale } from './sales.service.js';
import * as fiscalService from './fiscal/fiscal.service.js';
import { activeRegisters, registersOfLines } from './fiscal/routing.js';
import { assertNoWaitingPours } from './bottles.service.js';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import type { CartDiscountInput, CompleteSalePaymentInput } from './types.js';

/** One receipt: some of the bill's lines, and how they were paid for. */
export interface BillPaymentPart {
  /** Which lines this receipt covers. Absent = everything still unpaid. */
  line_ids?: number[];
  payments: CompleteSalePaymentInput[];
  client_uuid?: string | null;
  note?: string;
}

export interface PayBillFiscal {
  /**
   * A pre-flight, asked once PER PART: the gate carries a time budget for the
   * provider calls of one document, and between two guests of a split a shift
   * can close or the register change hands. Throws what `preflight` throws.
   */
  gateFor: (registerNo: number) => Promise<fiscalService.FiscalGate>;
}

export interface PayBillInput {
  storeId: number;
  staffId: number;
  billId: number;
  parts: BillPaymentPart[];
  /** The discount on the BILL — applied once, then shared out (rule 2). */
  cart_discount?: CartDiscountInput | null;
  customer_id?: number | null;
  /** Absent = the store does not fiscalise from this call (tests, or the gate is off). */
  fiscal?: PayBillFiscal;
  /**
   * The cash-rounding step the waiter's screen used (0, 10, 50; НБУ № 25).
   * Each part is its own receipt, so each rounds its own cash part — the
   * same function the till's checkout goes through (TechDocs/POS_CASH_ROUNDING.md, Д10).
   */
  cash_rounding?: unknown;
}

/** One paid part and what its receipt came to. */
export interface PaidPartFiscal {
  sale_id: number;
  fiscal: fiscalService.FiscalView;
}

export interface PayBillResult {
  bill: bills.Bill;
  sale_ids: number[];
  /** The receipts registered by THIS call, in part order. Empty when the store does not fiscalise. */
  fiscal: PaidPartFiscal[];
  /** Set when a part is paid but its receipt is still to be registered — the waiter must not ring it again. */
  warning: string | null;
}

/** What a waiter reads when the money is taken and the receipt is not (yet) registered. */
export const RECEIPT_PENDING_WARNING =
  'Оплату прийнято, але чек у ПРРО ще не зареєстровано — система повторить спробу сама. Не пробивайте його вдруге.';

/**
 * A part could not be paid because of ПРРО. Carries what the route needs to
 * say so truthfully: which parts DID go through before this one, and whether
 * the failed part's sale was written and undone.
 */
export class BillFiscalRefusal extends Error {
  constructor(
    message: string,
    readonly detail: {
      /** `preflight`: nothing of this part was written. `document`: it was, and has been undone. */
      stage: 'preflight' | 'document';
      /** The `FiscalError` behind it (or whatever the pre-flight threw). */
      cause: unknown;
      /** Sales of earlier parts of this call — paid and registered. */
      paidSaleIds: number[];
      /** The undone part's sale, at stage `document`. */
      saleId: number | null;
      voided: boolean;
    }
  ) {
    super(message);
    this.name = 'BillFiscalRefusal';
  }
}

const MAX_PARTS = 20;

/** What a waiter reads when a part tries «порівну» or two methods while a second register works. */
export const SPLIT_EVEN_DUAL_REGISTER =
  'Поки працює друга каса, рахунок не ділиться порівну і оплачується одним способом — оплатіть по стравах';

/** One receipt as it will be rung: a part's dishes of ONE register. */
interface Receipt {
  part: BillPaymentPart;
  register: number;
  /** Undefined = whatever the part named (all the bill's open lines when it named none). */
  lineIds: number[] | undefined;
  total: number;
  clientUuid: string | null;
  payments: CompleteSalePaymentInput[];
}

/**
 * Share a whole-bill discount out across the parts in proportion to what each
 * one owes, with the remainder on the last — the same allocation rule
 * `allocateCartDiscount` already uses between the lines of one sale, applied
 * one level up.
 */
export function shareDiscount(partTotals: number[], wholeDiscountCents: number): number[] {
  const sum = partTotals.reduce((a, b) => a + b, 0);
  if (sum <= 0 || wholeDiscountCents <= 0) return partTotals.map(() => 0);
  const capped = Math.min(wholeDiscountCents, sum);
  const shares = partTotals.map((total) => Math.floor((capped * total) / sum));
  const assigned = shares.reduce((a, b) => a + b, 0);
  // The rounding remainder goes to the last part that owes anything, so the
  // parts add up to the bill's discount exactly.
  let rest = capped - assigned;
  for (let i = shares.length - 1; i >= 0 && rest > 0; i -= 1) {
    if (partTotals[i] > 0) {
      const room = partTotals[i] - shares[i];
      const take = Math.min(rest, room);
      shares[i] += take;
      rest -= take;
    }
  }
  return shares;
}

/** What the whole bill's discount comes to, before it is shared out. */
function wholeDiscount(
  totalCents: number,
  discount: CartDiscountInput | null | undefined
): number {
  if (!discount || totalCents <= 0) return 0;
  if (discount.type === 'percent') {
    if (discount.value < 0 || discount.value > 100) {
      throw new bills.BillError('Знижка у відсотках має бути від 0 до 100');
    }
    return Math.round((totalCents * discount.value) / 100);
  }
  if (discount.type === 'fixed') {
    if (discount.value < 0) throw new bills.BillError('Знижка не може бути відʼємною');
    return Math.min(discount.value, totalCents);
  }
  throw new bills.BillError('Невідомий тип знижки');
}

/**
 * Pay a bill — as one receipt, or as several.
 *
 * Returns the bill as it stands afterwards and the sales that were rung, in
 * the order the parts were given. Sequential on purpose: each part commits on
 * its own (rule 3), and a part that throws leaves the ones before it paid.
 */
export async function payBill(input: PayBillInput): Promise<PayBillResult> {
  const { receipts, shares } = await planBillReceipts(input);

  const saleIds: number[] = [];
  const registered: PaidPartFiscal[] = [];
  let warning: string | null = null;
  for (const [index, receipt] of receipts.entries()) {
    const part = receipt.part;
    // Asked BEFORE anything of this part is written: no sale row, no burned
    // receipt number, no stock movement — the whole «block the sale when ПРРО
    // is unreachable» stance of the till's checkout.
    let gate: fiscalService.FiscalGate | null = null;
    if (input.fiscal) {
      try {
        gate = await input.fiscal.gateFor(receipt.register);
      } catch (cause) {
        throw new BillFiscalRefusal(
          cause instanceof Error ? cause.message : 'ПРРО недоступне',
          { stage: 'preflight', cause, paidSaleIds: [...saleIds], saleId: null, voided: false }
        );
      }
    }
    const fiscalises = gate?.on === true;

    const sale = await completeSale({
      storeId: input.storeId,
      staffId: input.staffId,
      items: [],
      payments: receipt.payments,
      note: part.note,
      customer_id: input.customer_id ?? null,
      client_uuid: receipt.clientUuid,
      // A fixed amount, never the bill's percentage: see rule 2.
      cart_discount: shares[index] > 0 ? { type: 'fixed', value: shares[index] } : null,
      bill_part: { bill_id: input.billId, line_ids: receipt.lineIds },
      fiscal_status: fiscalises ? 'pending' : 'none',
      cash_rounding: input.cash_rounding,
      fiscal_register: receipt.register,
    });
    if (!sale) continue;
    // A part's `client_uuid` that names an already-undone sale must not come
    // back as a success: the checkout answers the same replay with a 409.
    if (sale.status !== 'completed') {
      throw new bills.BillConflict('Цей чек скасовано — почніть оплату спочатку');
    }
    saleIds.push(sale.id);
    // A table's receipt prints on the bar's printer, whoever took the money
    // (Д13, ДК3-Г): the desktop holding «Чеки столів» picks it up from the
    // queue once its document is registered. A replayed part is already in it.
    await pool.query(
      `UPDATE pos_sales SET print_requested_at = NOW()
       WHERE id = $1 AND store_id = $2 AND print_requested_at IS NULL`,
      [sale.id, input.storeId]
    );
    if (!gate || !fiscalises || sale.fiscal_status === 'done') continue;

    try {
      const view = await fiscalService.fiscalizeSale(gate, {
        ...sale,
        customer_phone: sale.customer_phone,
      });
      registered.push({ sale_id: sale.id, fiscal: view });
    } catch (error) {
      if (error instanceof fiscalService.FiscalDocumentFailed && !error.mayExist) {
        // The document cannot exist at the provider, so this part was never
        // paid in law: undo it and put its plates back on the bill.
        const voided = await fiscalService.abortSale(input.storeId, sale.id, input.staffId, error.row);
        if (voided) {
          saleIds.pop();
          throw new BillFiscalRefusal(error.message, {
            stage: 'document',
            cause: error.cause,
            paidSaleIds: [...saleIds],
            saleId: sale.id,
            voided: true,
          });
        }
      }
      // Ambiguous (the receipt may exist), or the undo itself could not run:
      // the sale STANDS. The retry cron settles it; the waiter is told.
      logger.error('Table bill part paid, receipt not registered', {
        storeId: input.storeId,
        billId: input.billId,
        saleId: sale.id,
        mayExistAtProvider: error instanceof fiscalService.FiscalDocumentFailed ? error.mayExist : null,
        error: error instanceof Error ? error.message : String(error),
      });
      warning = RECEIPT_PENDING_WARNING;
    }
  }

  await bills.closeIfSettled(input.storeId, input.staffId, input.billId);
  return {
    bill: await bills.getBill(input.storeId, input.billId),
    sale_ids: saleIds,
    fiscal: registered,
    warning,
  };
}

/** One receipt of a bill payment as the waiter's screen shows it before the tap (ДК3-Г). */
export interface BillReceiptQuote {
  register_no: number;
  /** What the receipt's goods come to after its share of the bill's discount. */
  total_cents: number;
  /** Its own cash rounding (НБУ № 25); 0 for a card. */
  rounding_cents: number;
  /** What the guest hands over for it: total + rounding. */
  due_cents: number;
}

/**
 * What paying these parts would ring, receipt by receipt, without writing
 * anything: the same plan `payBill` follows — dishes grouped by register, the
 * bill's discount shared once, each receipt's cash rounded by itself — so the
 * waiter reads «Кухня 820 ₴ · Бар 360 ₴» before the guest pays, and the card
 * goes through each ФОП's terminal for exactly that (Д14). The parts' payment
 * amounts are not checked here; only their method matters.
 */
export async function quoteBillPayment(
  input: Omit<PayBillInput, 'fiscal'>
): Promise<{ receipts: BillReceiptQuote[]; due_cents: number }> {
  const step = parseCashRoundingStep(input.cash_rounding);
  const parts = (input.parts ?? []).map((part) => ({
    ...part,
    // Only the method decides the rounding; an amount large enough that the
    // money check of the real payment never trips on a quote.
    payments: (part.payments ?? []).map((p) => ({ ...p, amount_cents: 1_000_000_000 })),
  }));
  const { receipts, shares } = await planBillReceipts({ ...input, parts });
  const quoted = receipts.map((receipt, index) => {
    const total = receipt.total - shares[index];
    const method = receipt.part.payments?.[0]?.method ?? 'card';
    const rounding = saleRoundingCents(total, [{ method, amount_cents: total }], step);
    return { register_no: receipt.register, total_cents: total, rounding_cents: rounding, due_cents: total + rounding };
  });
  return { receipts: quoted, due_cents: quoted.reduce((sum, r) => sum + r.due_cents, 0) };
}

/**
 * Everything `payBill` decides before it writes: the bill can be paid, what
 * each receipt owes and through which register (rule 5), the discount shared
 * once over all of them (rule 2), and the one payment of a two-register part
 * shared between its receipts (Д8). Shared with `quoteBillPayment`, so the
 * quote can never disagree with the payment.
 */
async function planBillReceipts(
  input: Omit<PayBillInput, 'fiscal'>
): Promise<{ receipts: Receipt[]; shares: number[] }> {
  if (!input.parts?.length) throw new bills.BillError('Немає чим платити');
  if (input.parts.length > MAX_PARTS) {
    throw new bills.BillError(`Рахунок ділиться щонайбільше на ${MAX_PARTS} частин`);
  }

  const head = await pool.query(
    `SELECT status FROM pos_bills WHERE store_id = $1 AND id = $2`,
    [input.storeId, input.billId]
  );
  if (head.rows.length === 0) throw new bills.BillNotFound('Рахунок не знайдено');
  const status = String(head.rows[0].status);
  if (status === 'paid') throw new bills.BillConflict('Рахунок уже оплачено');
  if (status === 'cancelled') throw new bills.BillConflict('Рахунок скасовано');

  const balance = await bills.billBalance(pool, input.storeId, input.billId);
  if (balance.openLines === 0) throw new bills.BillConflict('Рахунок уже оплачено');
  // A plate the kitchen has not been told about is not owed for. Fire it or
  // take it off — paying it would put an unmade dish on a fiscal receipt.
  if (balance.draftLines > 0) {
    throw new bills.BillConflict(
      'У рахунку є невідправлені позиції — відправте їх на кухню або зніміть'
    );
  }

  // What each part owes, at the prices their rounds locked — and, in a store
  // with a second register switched on, which register each dish goes
  // through (rule 5). Read before any part is rung, so the discount is shared
  // out over the whole bill (rule 2) rather than over whatever is left when
  // each part's turn comes.
  const extra = await activeRegisters(pool, input.storeId);
  const receipts: Receipt[] = [];
  for (const part of input.parts) {
    if (extra.size > 0 && part.payments?.length !== 1) {
      throw new bills.BillConflict(SPLIT_EVEN_DUAL_REGISTER);
    }
    const lines = await bills.lockedBillLines(pool, {
      storeId: input.storeId,
      billId: input.billId,
      lineIds: part.line_ids,
    });
    // Before any part is rung (ДК5-Б, Д18): a pour still waiting for the bar's
    // scan would make this receipt the first sale from a bottle without its stamp.
    await assertNoWaitingPours(
      pool,
      input.storeId,
      lines.map((l) => l.bill_item_id)
    );
    // By what each dish's round poured (ДК5, Д20): a coffee with a cognac
    // answer goes on the cognac's register's receipt.
    const byLine =
      extra.size > 0
        ? await registersOfLines(
            pool,
            input.storeId,
            lines.map((l) => ({ variant_id: l.variant_id, bill_item_id: l.bill_item_id }))
          )
        : null;
    const groups = new Map<number, typeof lines>();
    lines.forEach((line, index) => {
      const register = byLine?.[index] ?? 1;
      groups.set(register, [...(groups.get(register) ?? []), line]);
    });
    const registers = [...groups.keys()].sort((a, b) => a - b);
    if (registers.length === 0) registers.push(1);
    registers.forEach((register, index) => {
      const own = groups.get(register) ?? [];
      receipts.push({
        part,
        register,
        // One register: the part as the waiter named it. Two: each receipt
        // names its own dishes.
        lineIds: registers.length === 1 ? part.line_ids : own.map((l) => l.bill_item_id),
        total: own.reduce((sum, l) => sum + l.unit_price_cents * l.quantity, 0),
        clientUuid:
          part.client_uuid && index > 0
            ? registerPartUuidFor(part.client_uuid, register)
            : (part.client_uuid ?? null),
        payments: part.payments,
      });
    });
  }
  const shares = shareDiscount(
    receipts.map((r) => r.total),
    wholeDiscount(balance.openCents, input.cart_discount)
  );
  shareSplitPayments(receipts, shares, parseCashRoundingStep(input.cash_rounding));
  return { receipts, shares };
}

/**
 * The guest pays a part once; a part that became two receipts shares that one
 * payment between them (rule 5, decision Д8): each receipt but the last takes
 * exactly what it owes — its total after its discount share, plus its own
 * cash rounding — and the last takes the rest, so the change is on it.
 * Refused before anything is written when the money does not cover both.
 */
function shareSplitPayments(
  receipts: Receipt[],
  shares: number[],
  step: ReturnType<typeof parseCashRoundingStep>
): void {
  const owed = (index: number, method: string) => {
    const total = receipts[index].total - shares[index];
    return total + saleRoundingCents(total, [{ method, amount_cents: total }], step);
  };
  let index = 0;
  while (index < receipts.length) {
    let end = index;
    while (end + 1 < receipts.length && receipts[end + 1].part === receipts[index].part) end += 1;
    if (end > index) {
      const [paid] = receipts[index].part.payments;
      let taken = 0;
      for (let k = index; k < end; k += 1) {
        const due = owed(k, paid.method);
        receipts[k].payments = [{ ...paid, amount_cents: due }];
        taken += due;
      }
      const rest = paid.amount_cents - taken;
      if (rest < owed(end, paid.method)) {
        throw new bills.BillError('Оплати не вистачає на обидва чеки');
      }
      receipts[end].payments = [{ ...paid, amount_cents: rest }];
    }
    index = end + 1;
  }
}
