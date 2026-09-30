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
//        (`abortSale` → `voidBillPartSale`), and NO stock returned, because
//        the round took it and the dish was cooked (`BillFiscalRefusal`,
//        stage `document`);
//      · the outcome is AMBIGUOUS (a timeout — the receipt may exist) → the
//        sale STANDS, `failed`, for the retry cron to settle, and the answer
//        carries a warning. Voiding here would double-fiscalise the re-ring.
//    Before this the route never asked ПРРО anything and every table sale in a
//    ПРРО store stayed `fiscal_status='none'` forever — no receipt, and a
//    refund that had nothing to return against.

import * as bills from './bills.service.js';
import { completeSale } from './sales.service.js';
import * as fiscalService from './fiscal/fiscal.service.js';
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
  gateFor: () => Promise<fiscalService.FiscalGate>;
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

  // What each part owes, at the prices their rounds locked. Read before any
  // part is rung, so the discount is shared out over the whole bill (rule 2)
  // rather than over whatever is left when each part's turn comes.
  const partTotals: number[] = [];
  for (const part of input.parts) {
    const lines = await bills.lockedBillLines(pool, {
      storeId: input.storeId,
      billId: input.billId,
      lineIds: part.line_ids,
    });
    partTotals.push(lines.reduce((sum, l) => sum + l.unit_price_cents * l.quantity, 0));
  }
  const shares = shareDiscount(partTotals, wholeDiscount(balance.openCents, input.cart_discount));

  const saleIds: number[] = [];
  const registered: PaidPartFiscal[] = [];
  let warning: string | null = null;
  for (const [index, part] of input.parts.entries()) {
    // Asked BEFORE anything of this part is written: no sale row, no burned
    // receipt number, no stock movement — the whole «block the sale when ПРРО
    // is unreachable» stance of the till's checkout.
    let gate: fiscalService.FiscalGate | null = null;
    if (input.fiscal) {
      try {
        gate = await input.fiscal.gateFor();
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
      payments: part.payments,
      note: part.note,
      customer_id: input.customer_id ?? null,
      client_uuid: part.client_uuid ?? null,
      // A fixed amount, never the bill's percentage: see rule 2.
      cart_discount: shares[index] > 0 ? { type: 'fixed', value: shares[index] } : null,
      bill_part: { bill_id: input.billId, line_ids: part.line_ids },
      fiscal_status: fiscalises ? 'pending' : 'none',
    });
    if (!sale) continue;
    // A part's `client_uuid` that names an already-undone sale must not come
    // back as a success: the checkout answers the same replay with a 409.
    if (sale.status !== 'completed') {
      throw new bills.BillConflict('Цей чек скасовано — почніть оплату спочатку');
    }
    saleIds.push(sale.id);
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
