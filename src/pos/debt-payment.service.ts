// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/debt-payment.service.ts — paying off goods taken «під запис»
// (migration 073, TechDocs/grocery/G3_DEBTS.md §3).
//
// A repayment is an ordinary sale: one receipt for the goods being paid for,
// at the prices and discounts fixed when they were given (`completeSale` with
// `debt_part`). Its own file for the same reason `bill-payment.service.ts` has
// one — it needs the sale and ПРРО both, and neither should need it back.
//
// The ПРРО outcomes are the till's three, as for a table bill's part:
//   · ПРРО unreachable BEFORE anything is written → nothing is written, the
//     goods stay owed (`DebtFiscalRefusal`, stage `preflight`);
//   · the provider REFUSED the document (it cannot exist) → the receipt is
//     voided and its lines go back to the debt, with NO stock returned — the
//     goods are with the customer (`DebtFiscalRefusal`, stage `document`);
//   · the outcome is AMBIGUOUS (a timeout — the receipt may exist) → the sale
//     STANDS, `failed`, for the retry cron, and the answer carries a warning.
//     Voiding here would fiscalise the cashier's second try twice.

import { getSale, getSaleByClientUuid, completeSale } from './sales.service.js';
import * as fiscalService from './fiscal/fiscal.service.js';
import { RECEIPT_PENDING_WARNING } from './bill-payment.service.js';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { DebtConflict, DebtError, chooseOldest, owedCents, openLines } from './debt-lines.service.js';
import { getCredit, getStatement } from './debts.service.js';
import type { DebtCreditView, DebtLineView } from './debts.service.js';
import type { CompleteSalePaymentInput } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PayDebtInput {
  storeId: number;
  staffId: number;
  customerId: number;
  /** The oldest open lines being paid; absent = everything still owed. */
  line_ids?: unknown;
  payments: CompleteSalePaymentInput[];
  client_uuid: unknown;
  /** The cash-rounding step the till showed (0, 10, 50; НБУ № 25). */
  cash_rounding?: unknown;
  /** Absent = the store does not fiscalise from this call (tests, or ПРРО is off). */
  fiscal?: { gateFor: () => Promise<fiscalService.FiscalGate> };
}

type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;

export interface PayDebtResult {
  sale: SaleDetail;
  /** The receipt registered by THIS call; null when the store does not fiscalise or it is still to be. */
  fiscal: fiscalService.FiscalView | null;
  /** Set when the money is taken but the receipt is still to be registered — do not ring it again. */
  warning: string | null;
  credit: DebtCreditView;
  open_lines: DebtLineView[];
}

/** The repayment could not go through because of ПРРО — and what happened to it. */
export class DebtFiscalRefusal extends Error {
  constructor(
    message: string,
    readonly detail: {
      /** `preflight`: nothing was written. `document`: it was, and has been undone. */
      stage: 'preflight' | 'document';
      cause: unknown;
      saleId: number | null;
      voided: boolean;
    }
  ) {
    super(message);
    this.name = 'DebtFiscalRefusal';
  }
}

function parseLineIds(raw: unknown): number[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DebtError('Оберіть товари, які покупець гасить, або не вказуйте нічого — тоді весь борг');
  }
  const ids = raw.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new DebtError('Рядок боргу не знайдено');
  return ids;
}

/**
 * Take money for goods taken «під запис».
 *
 * Checks what it can before ПРРО is asked anything — a customer with nothing
 * owed, or a till naming lines that are not the oldest, must not open a shift
 * for nothing. `completeSale` checks all of it again under the customer's
 * lock, which is what holds against a second till.
 */
export async function payDebt(input: PayDebtInput): Promise<PayDebtResult> {
  const clientUuid = typeof input.client_uuid === 'string' ? input.client_uuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(clientUuid)) throw new DebtError('client_uuid обовʼязковий і має бути UUID');
  const lineIds = parseLineIds(input.line_ids);
  if (!Array.isArray(input.payments) || input.payments.length === 0) {
    throw new DebtError('Вкажіть, чим платить покупець');
  }

  // The same tap again: the receipt it made is the answer, whatever is owed now.
  // Only if it IS this customer's repayment — a key a till spent on another
  // receipt must not make this debt look paid.
  const earlier = await getSaleByClientUuid(input.storeId, clientUuid);
  if (earlier) {
    if (!earlier.repays_debt || earlier.customer_id !== input.customerId) {
      throw new DebtConflict('Цей client_uuid уже використано для іншого чека', 'uuid_taken');
    }
    if (earlier.status !== 'completed') {
      throw new DebtConflict('Цей чек погашення скасовано — почніть оплату спочатку', 'sale_voided');
    }
    return finish(input, earlier, null, null);
  }

  // A customer of another store is a 404, as everywhere in the journal — not
  // «nothing owed», which would be true and misleading.
  await getCredit(input.storeId, input.customerId);
  const chosen = chooseOldest(await openLines(pool, input.storeId, input.customerId), lineIds);
  // Nothing to fiscalise for a zero sum — and `completeSale` would refuse its payment anyway.
  const owed = chosen.reduce((sum, line) => sum + owedCents(line), 0);
  if (owed <= 0) throw new DebtConflict('За цими товарами нічого не винно', 'nothing_owed');

  // Asked BEFORE anything is written: no sale row, no burned receipt number.
  let gate: fiscalService.FiscalGate | null = null;
  if (input.fiscal) {
    try {
      gate = await input.fiscal.gateFor();
    } catch (cause) {
      throw new DebtFiscalRefusal(cause instanceof Error ? cause.message : 'ПРРО недоступне', {
        stage: 'preflight',
        cause,
        saleId: null,
        voided: false,
      });
    }
  }
  const fiscalises = gate?.on === true;

  const sale = await completeSale({
    storeId: input.storeId,
    staffId: input.staffId,
    items: [],
    payments: input.payments,
    client_uuid: clientUuid,
    debt_part: { customer_id: input.customerId, line_ids: lineIds },
    fiscal_status: fiscalises ? 'pending' : 'none',
    cash_rounding: input.cash_rounding,
  });
  if (!sale) throw new Error('Repayment receipt vanished after its commit');
  if (sale.status !== 'completed') {
    throw new DebtConflict('Цей чек погашення скасовано — почніть оплату спочатку', 'sale_voided');
  }
  if (!gate || !fiscalises || sale.fiscal_status === 'done') return finish(input, sale, null, null);

  try {
    const view = await fiscalService.fiscalizeSale(gate, { ...sale, customer_phone: sale.customer_phone });
    return finish(input, sale, view, null);
  } catch (error) {
    if (error instanceof fiscalService.FiscalDocumentFailed && !error.mayExist) {
      // The document cannot exist at the provider, so the debt was never paid
      // in law: undo the receipt and give its lines back to the debt.
      const voided = await fiscalService.abortSale(input.storeId, sale.id, input.staffId, error.row);
      if (voided) {
        throw new DebtFiscalRefusal(error.message, {
          stage: 'document',
          cause: error.cause,
          saleId: sale.id,
          voided: true,
        });
      }
    }
    logger.error('Debt repaid, receipt not registered', {
      storeId: input.storeId,
      customerId: input.customerId,
      saleId: sale.id,
      mayExistAtProvider: error instanceof fiscalService.FiscalDocumentFailed ? error.mayExist : null,
      error: error instanceof Error ? error.message : String(error),
    });
    return finish(input, sale, null, RECEIPT_PENDING_WARNING);
  }
}

async function finish(
  input: PayDebtInput,
  sale: SaleDetail,
  fiscal: fiscalService.FiscalView | null,
  warning: string | null
): Promise<PayDebtResult> {
  const statement = await getStatement(input.storeId, input.customerId);
  return {
    sale: (await getSale(input.storeId, sale.id)) ?? sale,
    fiscal,
    warning,
    credit: statement.credit,
    open_lines: statement.open_lines,
  };
}
