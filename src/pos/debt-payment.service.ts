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
//
// Since Д4 was revised (2026-10-25, G3_DEBTS.md §11) a repayment may also take
// the NEXT line partly: some of its units on the same receipt — an ordinary
// receipt, so a store with ПРРО has it too — and a «внесок» toward the rest,
// money that does not close the line. A «внесок» has no fiscal document yet
// (a Checkbox prepayment chain is step 2), so a store that fiscalises is
// refused one before anything is written, and in a store that does not, the
// receipt and the «внесок» commit in one transaction.

import crypto from 'crypto';
import {
  getSale,
  getSaleByClientUuid,
  completeSale,
  completeSaleTx,
  recordDebtPrepaymentTx,
} from './sales.service.js';
import * as fiscalService from './fiscal/fiscal.service.js';
import { RECEIPT_PENDING_WARNING } from './bill-payment.service.js';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { parseCashRoundingStep } from './cashRounding.js';
import {
  DebtConflict,
  DebtError,
  chooseOldest,
  choosePart,
  owedCents,
  openLines,
  unitsCents,
  type DebtPartInput,
} from './debt-lines.service.js';
import { getCredit, getStatement } from './debts.service.js';
import type { DebtCreditView, DebtLineView } from './debts.service.js';
import type { CompleteSalePaymentInput } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PayDebtInput {
  storeId: number;
  staffId: number;
  customerId: number;
  /** The oldest open lines being paid; absent = everything still owed (unless `part` is set). */
  line_ids?: unknown;
  /**
   * The next line, taken partly (G3_DEBTS.md §11): `{ line_id, quantity?,
   * amount_cents?, method? }` — some of its units on the receipt, a «внесок»
   * toward it, or both.
   */
  part?: unknown;
  /** What pays the receipt; empty when the request is only a «внесок». */
  payments: CompleteSalePaymentInput[];
  client_uuid: unknown;
  /** The cash-rounding step the till showed (0, 10, 50; НБУ № 25). */
  cash_rounding?: unknown;
  /** Absent = the store does not fiscalise from this call (tests, or ПРРО is off). */
  fiscal?: {
    gateFor: () => Promise<fiscalService.FiscalGate>;
    /** Whether the store fiscalises at all — asked before a «внесок», without opening a shift. */
    isOn?: () => Promise<boolean>;
  };
}

type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;

export interface PayDebtResult {
  /** The receipt — or, when the request was only a «внесок», the «внесок». */
  sale: SaleDetail;
  /** The «внесок» this request made (078), or null. */
  prepayment: SaleDetail | null;
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

type PartRequest = DebtPartInput & { method: 'cash' | 'card' };

function parsePart(raw: unknown): PartRequest | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new DebtError('Частина погашення — обʼєкт');
  const part = raw as Record<string, unknown>;
  const lineId = Number(part.line_id);
  if (!Number.isInteger(lineId) || lineId <= 0) throw new DebtError('Рядок боргу не знайдено');
  const whole = (value: unknown, words: string): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new DebtError(words);
    return n;
  };
  const quantity = whole(part.quantity, 'Частина товару — ціла кількість більше нуля');
  const amount = whole(part.amount_cents, 'Внесок — сума більше нуля, у копійках');
  if (quantity === undefined && amount === undefined) {
    throw new DebtError('Вкажіть, скільки товару гаситься або яку суму вносить покупець');
  }
  const method = part.method ?? 'cash';
  if (method !== 'cash' && method !== 'card') throw new DebtError('Внесок — готівкою або карткою');
  return { line_id: lineId, quantity, amount_cents: amount, method };
}

/**
 * The key of a «внесок» rung with a receipt in one request: fixed by the
 * request's own, so a repeated tap finds both and makes neither twice.
 */
export function prepaymentUuidFor(clientUuid: string): string {
  const bytes = crypto.createHash('sha256').update(`debt-prepayment:${clientUuid}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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
  const part = parsePart(input.part);
  const payments = Array.isArray(input.payments) ? input.payments : [];

  // The same tap again: what it wrote is the answer, whatever is owed now.
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
    const prepayment = earlier.debt_prepayment
      ? earlier
      : await getSaleByClientUuid(input.storeId, prepaymentUuidFor(clientUuid));
    return finish(input, earlier, prepayment?.status === 'completed' ? prepayment : null, null, null);
  }

  // A customer of another store is a 404, as everywhere in the journal — not
  // «nothing owed», which would be true and misleading.
  await getCredit(input.storeId, input.customerId);
  const open = await openLines(pool, input.storeId, input.customerId);
  // With a part and no lines named, nothing is taken whole — not «everything».
  const chosen = part && !lineIds?.length ? [] : chooseOldest(open, lineIds);
  const partLine = part ? choosePart(open, chosen.length, part) : null;
  const units = part?.quantity ?? 0;
  const owed =
    chosen.reduce((sum, line) => sum + owedCents(line), 0) + (partLine && units ? unitsCents(partLine, units) : 0);
  const hasReceipt = chosen.length > 0 || units > 0;
  const prepay = part?.amount_cents ?? 0;
  // Nothing to fiscalise for a zero sum — and `completeSale` would refuse its payment anyway.
  if (hasReceipt && owed <= 0) throw new DebtConflict('За цими товарами нічого не винно', 'nothing_owed');
  if (hasReceipt && payments.length === 0) throw new DebtError('Вкажіть, чим платить покупець');
  if (!hasReceipt && payments.length > 0) {
    throw new DebtError('Лише внесок: його суму й спосіб вказують у part, без payments');
  }
  if (prepay > 0) {
    // What the customer hands over is the «внесок» itself, so in cash it has
    // to be a sum the till can take without coins it does not have (НБУ № 25).
    const step = parseCashRoundingStep(input.cash_rounding);
    if (part!.method === 'cash' && step > 0 && prepay % step !== 0) {
      throw new DebtError(`Готівкою вносять суму, кратну ${step} копійкам`);
    }
    // No fiscal document for a «внесок» until the prepayment chain (§11, step
    // 2) — so a store that fiscalises is refused before anything is written.
    if (input.fiscal?.isOn && (await input.fiscal.isOn())) {
      throw new DebtConflict(
        'У магазині з ПРРО внесок за частину товару поки не приймається — гасіть цілими товарами, а решту поверніть покупцеві',
        'prepay_needs_chain'
      );
    }
    return payWithPrepayment(input, clientUuid, {
      lineIds: chosen.map((line) => line.id),
      part: part!,
      units,
      hasReceipt,
      payments,
    });
  }

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
    payments,
    client_uuid: clientUuid,
    debt_part: {
      customer_id: input.customerId,
      line_ids: part ? chosen.map((line) => line.id) : lineIds,
      part: part && units ? { line_id: part.line_id, quantity: units } : null,
    },
    fiscal_status: fiscalises ? 'pending' : 'none',
    cash_rounding: input.cash_rounding,
  });
  if (!sale) throw new Error('Repayment receipt vanished after its commit');
  if (sale.status !== 'completed') {
    throw new DebtConflict('Цей чек погашення скасовано — почніть оплату спочатку', 'sale_voided');
  }
  if (!gate || !fiscalises || sale.fiscal_status === 'done') return finish(input, sale, null, null, null);

  try {
    const view = await fiscalService.fiscalizeSale(gate, { ...sale, customer_phone: sale.customer_phone });
    return finish(input, sale, null, view, null);
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
    return finish(input, sale, null, null, RECEIPT_PENDING_WARNING);
  }
}

/**
 * A request with a «внесок», in a store that does not fiscalise: the receipt
 * for whole lines and units, if any, and the «внесок» commit together — the
 * customer handed the money over once. A duplicate key is a repeated tap that
 * raced this one: what it wrote is the answer.
 */
async function payWithPrepayment(
  input: PayDebtInput,
  clientUuid: string,
  plan: {
    lineIds: number[];
    part: PartRequest;
    units: number;
    hasReceipt: boolean;
    payments: CompleteSalePaymentInput[];
  }
): Promise<PayDebtResult> {
  const client = await pool.connect();
  let receiptId: number | null = null;
  let prepaymentId: number;
  try {
    await client.query('BEGIN');
    if (plan.hasReceipt) {
      receiptId = (
        await completeSaleTx(client, {
          storeId: input.storeId,
          staffId: input.staffId,
          items: [],
          payments: plan.payments,
          client_uuid: clientUuid,
          debt_part: {
            customer_id: input.customerId,
            line_ids: plan.lineIds,
            part: plan.units ? { line_id: plan.part.line_id, quantity: plan.units } : null,
          },
          fiscal_status: 'none',
          cash_rounding: input.cash_rounding,
        })
      ).saleId;
    }
    prepaymentId = await recordDebtPrepaymentTx(client, {
      storeId: input.storeId,
      staffId: input.staffId,
      customerId: input.customerId,
      lineId: plan.part.line_id,
      amountCents: plan.part.amount_cents!,
      method: plan.part.method,
      clientUuid: plan.hasReceipt ? prepaymentUuidFor(clientUuid) : clientUuid,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const unique =
      typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
    if (unique) {
      const earlier = await getSaleByClientUuid(input.storeId, clientUuid);
      if (earlier?.repays_debt && earlier.customer_id === input.customerId && earlier.status === 'completed') {
        const prepayment = earlier.debt_prepayment
          ? earlier
          : await getSaleByClientUuid(input.storeId, prepaymentUuidFor(clientUuid));
        return finish(input, earlier, prepayment, null, null);
      }
    }
    throw error;
  } finally {
    client.release();
  }
  const prepayment = await getSale(input.storeId, prepaymentId);
  if (!prepayment) throw new Error('«Внесок» vanished after its commit');
  const receipt = receiptId == null ? null : await getSale(input.storeId, receiptId);
  return finish(input, receipt ?? prepayment, prepayment, null, null);
}

async function finish(
  input: PayDebtInput,
  sale: SaleDetail,
  prepayment: SaleDetail | null,
  fiscal: fiscalService.FiscalView | null,
  warning: string | null
): Promise<PayDebtResult> {
  const statement = await getStatement(input.storeId, input.customerId);
  return {
    sale: (await getSale(input.storeId, sale.id)) ?? sale,
    prepayment,
    fiscal,
    warning,
    credit: statement.credit,
    open_lines: statement.open_lines,
  };
}
