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
// money that does not close the line. In a store that does not fiscalise the
// receipt and the «внесок» commit in one transaction (step 1).
//
// Under ПРРО a «внесок» is a document of its line's prepayment chain (079,
// §11 «Крок 2»): the first one opens the chain, the next ones join it, and the
// receipt that closes the line is the chain's after-payment — which is never
// mixed with an ordinary receipt. So one sum from the customer may be several
// documents, paid in the order of the lines: each line closing through its
// chain alone, the other whole lines and the units together, the «внесок»
// last. Each is its own transaction with its own pre-flight and its own three
// outcomes, as each part of a table bill is; the first that does not go
// through stops the rest, and the answer says which went through and what to
// hand back. Each document's key comes from the request's, so the same
// request again goes on from the document it stopped at.

import crypto from 'crypto';
import {
  getSale,
  getSaleByClientUuid,
  completeSale,
  completeSaleTx,
  recordDebtPrepaymentTx,
} from './sales.service.js';
import * as fiscalService from './fiscal/fiscal.service.js';
import { FiscalError } from './fiscal/errors.js';
import { RECEIPT_PENDING_WARNING } from './bill-payment.service.js';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { cashRoundingDelta, parseCashRoundingStep } from './cashRounding.js';
import { formatUah } from './core/money.js';
import {
  DebtConflict,
  DebtError,
  assertChainSettled,
  chooseOldest,
  choosePart,
  linesById,
  owedCents,
  openLines,
  remainingUnits,
  unitsCents,
  type DebtPartInput,
  type OpenDebtLine,
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
  /**
   * What pays the receipt; empty when the request is only a «внесок». When
   * the goods are several documents (a line closing through its chain), one
   * method, shared out over them in order.
   */
  payments: CompleteSalePaymentInput[];
  client_uuid: unknown;
  /** The cash-rounding step the till showed (0, 10, 50; НБУ № 25). */
  cash_rounding?: unknown;
  /** Absent = the store does not fiscalise from this call (tests, or ПРРО is off). */
  fiscal?: {
    /** A pre-flight, asked once per document: `chain` for one of a prepayment chain. */
    gateFor: (op?: fiscalService.FiscalOp) => Promise<fiscalService.FiscalGate>;
    /** What the store's ПРРО can do — asked before anything is written, without opening a shift. */
    capability?: () => Promise<fiscalService.FiscalCapability>;
  };
}

type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;

/**
 * One document of a repayment: `receipt` — goods on an ordinary receipt;
 * `chain_close` — the receipt that closes a line paid by «внески» through its
 * ПРРО chain (its «чек післяплати»); `prepayment` — a «внесок».
 */
export type PayDebtPartKind = 'receipt' | 'chain_close' | 'prepayment';

export interface PayDebtPart {
  kind: PayDebtPartKind;
  sale: SaleDetail;
  /** Registered by THIS call; null when nothing is fiscalised, on a repeat, or while it is still to be. */
  fiscal: fiscalService.FiscalView | null;
}

export interface PayDebtResult {
  /** The receipt — or, when the request was only a «внесок», the «внесок». */
  sale: SaleDetail;
  /** The «внесок» this request made (078), or null. */
  prepayment: SaleDetail | null;
  /** `sale`'s document registered by THIS call; null when the store does not fiscalise or it is still to be. */
  fiscal: fiscalService.FiscalView | null;
  /** Set when the money is taken but a document is still to be registered — do not ring it again. */
  warning: string | null;
  credit: DebtCreditView;
  open_lines: DebtLineView[];
  /** Every document of the request, in the order they were made (§11 «Крок 2»). */
  parts: PayDebtPart[];
}

/** The repayment could not go through because of ПРРО — and what happened to it. */
export class DebtFiscalRefusal extends Error {
  constructor(
    message: string,
    readonly detail: {
      /** `preflight`: nothing of this document was written. `document`: it was, and has been undone. */
      stage: 'preflight' | 'document';
      cause: unknown;
      saleId: number | null;
      voided: boolean;
      /** The document that stopped. */
      part: PayDebtPartKind;
      /** Sales of the documents before it — taken, registered or still to be. */
      paidSaleIds: number[];
      /** What was handed over for this document and the ones after it: give it back. */
      notTakenCents: number;
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

/** A UUID fixed by a label — the same request gives the same keys. */
export function derivedUuid(label: string): string {
  const bytes = crypto.createHash('sha256').update(label).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The key of a «внесок» rung with a receipt in one request: fixed by the
 * request's own, so a repeated tap finds both and makes neither twice.
 */
export function prepaymentUuidFor(clientUuid: string): string {
  return derivedUuid(`debt-prepayment:${clientUuid}`);
}

/**
 * The key of the receipt at `index` (from 1) among a request's receipts, when
 * a line closing through its chain splits the goods into several (§11 «Крок
 * 2»). The first receipt keeps the request's own key, as it always has.
 */
export function debtPartUuidFor(clientUuid: string, index: number): string {
  return derivedUuid(`debt-part:${clientUuid}:${index}`);
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
  const capability = input.fiscal?.capability ? await input.fiscal.capability() : null;
  // Several documents per request only where ПРРО keeps prepayment chains;
  // everywhere else a request is a receipt and its «внесок», as in step 1.
  const inParts = Boolean(input.fiscal && capability?.on && capability.chains);

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
    // In parts, the answer may have been lost after any of the documents:
    // `payInParts` finds the ones written and goes on from the next. Without
    // the lines named there is no telling what «everything» meant then.
    if (!inParts || (!lineIds?.length && !part)) {
      const prepayment = earlier.debt_prepayment
        ? earlier
        : await getSaleByClientUuid(input.storeId, prepaymentUuidFor(clientUuid));
      return finish(input, earlier, prepayment?.status === 'completed' ? prepayment : null, null, null);
    }
  } else {
    // A customer of another store is a 404, as everywhere in the journal — not
    // «nothing owed», which would be true and misleading.
    await getCredit(input.storeId, input.customerId);
  }

  if (inParts) return payInParts(input, { clientUuid, lineIds, part, payments, capability: capability! });

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
    assertPrepayPayable(part!, input.cash_rounding);
    // A store that fiscalises through a provider with no prepayment chain
    // (Cashalot until step 3) has no document for a «внесок» — refused
    // before anything is written.
    if (capability?.on) {
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
      gate = await input.fiscal.gateFor('sale');
    } catch (cause) {
      throw new DebtFiscalRefusal(cause instanceof Error ? cause.message : 'ПРРО недоступне', {
        stage: 'preflight',
        cause,
        saleId: null,
        voided: false,
        part: 'receipt',
        paidSaleIds: [],
        notTakenCents: sumPayments(payments),
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
          part: 'receipt',
          paidSaleIds: [],
          notTakenCents: sumPayments(payments),
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

function sumPayments(payments: ReadonlyArray<{ amount_cents: number }>): number {
  return payments.reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0);
}

/** What the customer hands over as a «внесок» in cash must be a sum the till can take without coins it does not have (НБУ № 25). */
function assertPrepayPayable(part: PartRequest, cashRounding: unknown): void {
  const step = parseCashRoundingStep(cashRounding);
  if (part.method === 'cash' && step > 0 && (part.amount_cents ?? 0) % step !== 0) {
    throw new DebtError(`Готівкою вносять суму, кратну ${step} копійкам`);
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
    prepaymentId = (
      await recordDebtPrepaymentTx(client, {
        storeId: input.storeId,
        staffId: input.staffId,
        customerId: input.customerId,
        lineId: plan.part.line_id,
        amountCents: plan.part.amount_cents!,
        method: plan.part.method,
        clientUuid: plan.hasReceipt ? prepaymentUuidFor(clientUuid) : clientUuid,
      })
    ).saleId;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}

// ── Several documents: a store whose ПРРО keeps prepayment chains ─────────────

/** One document of the request, as planned. */
interface Segment {
  kind: PayDebtPartKind;
  clientUuid: string;
  /** Whole lines it pays (a `receipt` or a `chain_close`), oldest first. */
  lineIds: number[];
  /** Units of the part line, on the last ordinary receipt. */
  units: { line_id: number; quantity: number } | null;
  /** `chain_close`: the line's chain. */
  chainId: string | null;
  /** `prepayment`: the «внесок». */
  prepay: PartRequest | null;
  /** What it is handed over to pay (a `receipt` or a `chain_close`). */
  payments: CompleteSalePaymentInput[];
}

/**
 * The documents a request is, in the order its lines are paid (§11 «Крок 2»):
 * a line closing through its ПРРО chain on a receipt of its own, the whole
 * lines between such lines together, the units of the part line on the last
 * ordinary receipt, the «внесок» last.
 */
function planSegments(
  clientUuid: string,
  whole: OpenDebtLine[],
  chainOf: (line: OpenDebtLine) => string | null,
  part: PartRequest | null
): Segment[] {
  const blank = (kind: PayDebtPartKind): Segment => ({
    kind,
    clientUuid: '',
    lineIds: [],
    units: null,
    chainId: null,
    prepay: null,
    payments: [],
  });
  const receipts: Segment[] = [];
  let current: Segment | null = null;
  for (const line of whole) {
    const chainId = chainOf(line);
    if (chainId) {
      current = null;
      receipts.push({ ...blank('chain_close'), lineIds: [line.id], chainId });
      continue;
    }
    if (!current) {
      current = blank('receipt');
      receipts.push(current);
    }
    current.lineIds.push(line.id);
  }
  if (part?.quantity) {
    if (!current) {
      current = blank('receipt');
      receipts.push(current);
    }
    current.units = { line_id: part.line_id, quantity: part.quantity };
  }
  receipts.forEach((segment, index) => {
    segment.clientUuid = index === 0 ? clientUuid : debtPartUuidFor(clientUuid, index);
  });
  const segments = [...receipts];
  if (part?.amount_cents) {
    segments.push({
      ...blank('prepayment'),
      clientUuid: receipts.length > 0 ? prepaymentUuidFor(clientUuid) : clientUuid,
      prepay: part,
    });
  }
  return segments;
}

/**
 * What each receipt of the request is handed over. One receipt takes the
 * request's payments as they are. Several share ONE method out in their
 * order: each gets what it comes to — in cash, rounded on its own, since each
 * is its own receipt (НБУ № 25) — and the last one the rest, change included.
 */
function sharePayments(
  segments: Segment[],
  owedOf: (segment: Segment) => number,
  payments: CompleteSalePaymentInput[],
  cashRounding: unknown,
  alreadyTaken: Map<Segment, number>
): void {
  const receipts = segments.filter((segment) => segment.kind !== 'prepayment');
  if (receipts.length === 0) return;
  if (receipts.length === 1) {
    receipts[0].payments = payments;
    return;
  }
  const methods = new Set(payments.map((payment) => payment.method));
  if (payments.length === 0 || methods.size !== 1) {
    throw new DebtError(
      'Товар, за який вносили через ПРРО, закривається окремим чеком — тоді покупець платить одним способом: готівкою або карткою'
    );
  }
  const method = payments[0].method;
  const step = method === 'cash' ? parseCashRoundingStep(cashRounding) : 0;
  const handed = sumPayments(payments);
  let rest = handed;
  let due = 0;
  receipts.forEach((segment, index) => {
    const taken = alreadyTaken.get(segment);
    if (taken != null) {
      rest -= taken;
      due += taken;
      return;
    }
    const goods = owedOf(segment);
    const owed = goods + cashRoundingDelta(goods, step);
    due += owed;
    if (index < receipts.length - 1) {
      segment.payments = [{ method, amount_cents: owed }];
      rest -= owed;
      return;
    }
    if (rest < owed) {
      throw new DebtError(
        `Покупець дає ${formatUah(handed)}, а ці товари окремими чеками — ${formatUah(due)}`
      );
    }
    segment.payments = [{ method, amount_cents: rest }];
  });
}

async function payInParts(
  input: PayDebtInput,
  req: {
    clientUuid: string;
    lineIds?: number[];
    part: PartRequest | null;
    payments: CompleteSalePaymentInput[];
    capability: fiscalService.FiscalCapability;
  }
): Promise<PayDebtResult> {
  const { storeId, customerId } = input;
  const open = await openLines(pool, storeId, customerId);
  // The whole lines of the request. Named, they are read by id whatever has
  // happened to them since: an earlier attempt of this very request may have
  // closed some. Not named, every line open now.
  let whole: OpenDebtLine[];
  if (req.part && !req.lineIds?.length) {
    whole = [];
  } else if (req.lineIds?.length) {
    whole = await linesById(pool, storeId, customerId, req.lineIds);
    if (whole.length !== new Set(req.lineIds).size) {
      throw new DebtConflict(
        'Виписка змінилася — частину цих товарів уже оплачено, повернуто або списано. Оновіть її.',
        'stale_statement'
      );
    }
  } else {
    whole = chooseOldest(open);
  }
  // A line closes through its chain only in the provider that keeps it — a
  // store that switched closes it with an ordinary receipt (§11, «Відомі межі»).
  const chainOf = (line: OpenDebtLine) =>
    line.fiscal_chain_id && line.fiscal_chain_provider === req.capability.provider ? line.fiscal_chain_id : null;
  const segments = planSegments(req.clientUuid, whole, chainOf, req.part);
  if (segments.length === 0) throw new DebtConflict('У покупця немає відкритого боргу', 'nothing_owed');

  // What an earlier attempt of this request already wrote, its answer lost.
  const written = new Map<Segment, SaleDetail>();
  for (const segment of segments) {
    const sale = await getSaleByClientUuid(storeId, segment.clientUuid);
    if (!sale) continue;
    if (!sale.repays_debt || sale.customer_id !== customerId) {
      throw new DebtConflict('Цей client_uuid уже використано для іншого чека', 'uuid_taken');
    }
    if (sale.status !== 'completed') {
      throw new DebtConflict('Цей чек погашення скасовано — почніть оплату спочатку', 'sale_voided', {
        sale_ids: [...written.values()].map((done) => done.id),
      });
    }
    // The same key with other lines is not the same request: going on from
    // it would report one document as another and pay what was never asked.
    if (!(await sameDocument(storeId, segment, sale))) {
      throw new DebtConflict(
        'Цю оплату вже проведено з іншими товарами — оновіть виписку й прийміть оплату спочатку',
        'stale_statement',
        { sale_ids: [...written.values(), sale].map((done) => done.id) }
      );
    }
    written.set(segment, sale);
  }
  const todo = segments.filter((segment) => !written.has(segment));
  if (todo.length > 0 && segments.indexOf(todo[0]) + todo.length !== segments.length) {
    // Written out of order — not something this file makes. Say so rather than guess.
    throw new DebtConflict('Виписка змінилася — оновіть її й прийміть оплату спочатку', 'stale_statement');
  }

  // What is still to be written must be exactly what the statement shows: the
  // oldest open lines, then the part line, by the same rules as step 1.
  const todoWhole = todo.flatMap((segment) => segment.lineIds);
  const chosen = todoWhole.length > 0 ? chooseOldest(open, todoWhole) : [];
  const unitsTodo = todo.find((segment) => segment.units)?.units ?? null;
  const prepayTodo = todo.find((segment) => segment.prepay)?.prepay ?? null;
  const partLine =
    req.part && (unitsTodo || prepayTodo)
      ? choosePart(open, chosen.length, {
          line_id: req.part.line_id,
          quantity: unitsTodo?.quantity,
          amount_cents: prepayTodo?.amount_cents,
        })
      : null;
  if (prepayTodo) assertPrepayPayable(prepayTodo, input.cash_rounding);
  // A chain takes its next document only once the last one is registered,
  // and only in the provider that keeps it — asked here, before anything is
  // written, and again under the customer's lock by the write itself.
  if (prepayTodo && partLine?.fiscal_chain_id && partLine.fiscal_chain_provider !== req.capability.provider) {
    throw new DebtConflict(
      'Внески за цей товар приймали через інший ПРРО — його закривають цілим чеком',
      'chain_other_provider'
    );
  }
  for (const segment of todo) {
    const chainId = segment.chainId ?? (segment.prepay && partLine ? chainOf(partLine) : null);
    if (chainId) await assertChainSettled(pool, storeId, chainId);
  }

  const byId = new Map(open.map((line) => [line.id, line]));
  const owedOf = (segment: Segment): number =>
    segment.lineIds.reduce((sum, id) => sum + owedCents(byId.get(id)!), 0) +
    (segment.units && partLine ? unitsCents(partLine, segment.units.quantity) : 0);
  const receiptsTodo = todo.filter((segment) => segment.kind !== 'prepayment');
  if (receiptsTodo.some((segment) => owedOf(segment) <= 0)) {
    throw new DebtConflict('За цими товарами нічого не винно', 'nothing_owed');
  }
  const hasReceipts = segments.some((segment) => segment.kind !== 'prepayment');
  if (receiptsTodo.length > 0 && req.payments.length === 0) throw new DebtError('Вкажіть, чим платить покупець');
  if (!hasReceipts && req.payments.length > 0) {
    throw new DebtError('Лише внесок: його суму й спосіб вказують у part, без payments');
  }
  const taken = new Map<Segment, number>();
  for (const [segment, sale] of written) {
    if (segment.kind !== 'prepayment') taken.set(segment, sumPayments(sale.payments));
  }
  sharePayments(segments, owedOf, req.payments, input.cash_rounding, taken);

  const parts: PayDebtPart[] = segments
    .filter((segment) => written.has(segment))
    .map((segment) => ({ kind: segment.kind, sale: written.get(segment)!, fiscal: null }));
  let warning: string | null = parts.some((p) => p.sale.fiscal_status === 'pending' || p.sale.fiscal_status === 'failed')
    ? RECEIPT_PENDING_WARNING
    : null;

  for (const [index, segment] of todo.entries()) {
    const notTakenCents = todo
      .slice(index)
      .reduce((sum, later) => sum + (later.prepay ? later.prepay.amount_cents ?? 0 : sumPayments(later.payments)), 0);
    const refusal = (stage: 'preflight' | 'document', cause: unknown, saleId: number | null, voided: boolean) =>
      new DebtFiscalRefusal(cause instanceof Error ? cause.message : 'ПРРО недоступне', {
        stage,
        cause,
        saleId,
        voided,
        part: segment.kind,
        paidSaleIds: parts.map((p) => p.sale.id),
        notTakenCents,
      });
    // A refusal of the write itself (another till paid a line meanwhile)
    // after some documents went through must still say which did.
    const stopped = (error: unknown): never => {
      if (error instanceof DebtError && parts.length > 0) {
        throw new DebtConflict(error.message, error instanceof DebtConflict ? error.code : 'debt_conflict', {
          ...(error instanceof DebtConflict ? error.detail : {}),
          sale_ids: parts.map((p) => p.sale.id),
          not_taken_cents: notTakenCents,
        });
      }
      throw error;
    };

    // Asked BEFORE this document is written: no sale row, no burned receipt
    // number. A chain's document never goes offline (`chain`).
    let gate: fiscalService.FiscalGate;
    try {
      gate = await input.fiscal!.gateFor(segment.kind === 'receipt' ? 'sale' : 'chain');
    } catch (cause) {
      throw refusal('preflight', cause, null, false);
    }
    const fiscalises = gate.on === true;
    if (fiscalises && segment.kind !== 'receipt' && gate.mode !== 'online') {
      // The `chain` gate never hands out an offline one; said here, before
      // the write, so a document that cannot be registered is never written.
      throw refusal('preflight', new FiscalError('Ланцюжок передплати не реєструється офлайн', 'offline_session_open'), null, false);
    }
    if (fiscalises && segment.kind === 'prepayment' && !gate.ctx?.provider.prepaymentChain) {
      // The owner changed the provider between the two questions.
      throw new DebtConflict(
        'У магазині з ПРРО внесок за частину товару поки не приймається — гасіть цілими товарами, а решту поверніть покупцеві',
        'prepay_needs_chain'
      );
    }

    if (segment.kind === 'prepayment') {
      const step = await writePrepayment(input, segment, gate).catch(stopped);
      parts.push({ kind: 'prepayment', sale: step.sale, fiscal: null });
      if (!fiscalises || !step.chain) continue;
      try {
        const view = await fiscalService.fiscalizeChainPrepayment(
          gate,
          { ...step.sale, client_uuid: segment.clientUuid, customer_phone: step.sale.customer_phone },
          [
            {
              variant_id: step.line.variant_id,
              ref: `debt-${step.line.id}`,
              product_name: step.line.product_name,
              variant_label: step.line.variant_label,
              quantity: remainingUnits(step.line),
              unit_price_cents: step.line.unit_price_cents,
              owed_cents: step.owedBeforeCents,
              price_per: step.line.price_per,
              unit: step.line.unit,
            },
          ],
          step.chain
        );
        parts[parts.length - 1].fiscal = view;
      } catch (error) {
        if (await undoRefused(input, error, step.sale.id)) {
          parts.pop();
          throw refusal('document', (error as fiscalService.FiscalDocumentFailed).cause, step.sale.id, true);
        }
        logAmbiguous(input, step.sale.id, error);
        warning = RECEIPT_PENDING_WARNING;
      }
      continue;
    }

    const sale = await completeSale({
      storeId,
      staffId: input.staffId,
      items: [],
      payments: segment.payments,
      client_uuid: segment.clientUuid,
      debt_part: {
        customer_id: customerId,
        line_ids: segment.lineIds,
        part: segment.units,
        // Without ПРРО now, the line closes with an ordinary receipt.
        chain_id: fiscalises ? segment.chainId : null,
        chain_provider: fiscalises && !segment.chainId ? (req.capability.provider ?? null) : null,
      },
      fiscal_status: fiscalises ? 'pending' : 'none',
      cash_rounding: input.cash_rounding,
    }).catch(stopped);
    if (!sale) throw new Error('Repayment receipt vanished after its commit');
    if (sale.status !== 'completed') {
      throw new DebtConflict('Цей чек погашення скасовано — почніть оплату спочатку', 'sale_voided', {
        sale_ids: parts.map((p) => p.sale.id),
      });
    }
    parts.push({ kind: segment.kind, sale, fiscal: null });
    if (!fiscalises || sale.fiscal_status === 'done') continue;
    try {
      const view = await fiscalService.fiscalizeSale(
        gate,
        { ...sale, customer_phone: sale.customer_phone },
        segment.chainId ? { chain: { relationId: segment.chainId, op: 'pay' } } : {}
      );
      parts[parts.length - 1].fiscal = view;
    } catch (error) {
      if (await undoRefused(input, error, sale.id)) {
        parts.pop();
        throw refusal('document', (error as fiscalService.FiscalDocumentFailed).cause, sale.id, true);
      }
      logAmbiguous(input, sale.id, error);
      warning = RECEIPT_PENDING_WARNING;
    }
  }

  return finishParts(input, parts, warning);
}

/**
 * Whether a document an earlier attempt of this request wrote is the one this
 * segment plans: a «внесок» toward the same line, or a receipt for exactly the
 * same lines and units.
 */
async function sameDocument(storeId: number, segment: Segment, sale: SaleDetail): Promise<boolean> {
  if (segment.kind === 'prepayment') return sale.debt_prepayment?.line_id === segment.prepay?.line_id;
  if (sale.debt_prepayment) return false;
  const rows = await pool.query(
    `SELECT debt_item_id FROM pos_sale_items
      WHERE store_id = $1 AND sale_id = $2 AND debt_item_id IS NOT NULL`,
    [storeId, sale.id]
  );
  const paid = new Set(rows.rows.map((row) => Number(row.debt_item_id)));
  const planned = new Set([...segment.lineIds, ...(segment.units ? [segment.units.line_id] : [])]);
  return paid.size === planned.size && [...planned].every((id) => paid.has(id));
}

/** A «внесок» of the request, in its own transaction — under ПРРО, a document of the line's chain. */
async function writePrepayment(
  input: PayDebtInput,
  segment: Segment,
  gate: fiscalService.FiscalGate
): Promise<{
  sale: SaleDetail;
  chain: { relationId: string; op: 'open' | 'pay' } | null;
  line: OpenDebtLine;
  owedBeforeCents: number;
}> {
  const client = await pool.connect();
  let recorded: Awaited<ReturnType<typeof recordDebtPrepaymentTx>>;
  try {
    await client.query('BEGIN');
    recorded = await recordDebtPrepaymentTx(client, {
      storeId: input.storeId,
      staffId: input.staffId,
      customerId: input.customerId,
      lineId: segment.prepay!.line_id,
      amountCents: segment.prepay!.amount_cents!,
      method: segment.prepay!.method,
      clientUuid: segment.clientUuid,
      chain: gate.on && gate.ctx ? { provider: gate.ctx.provider.id } : null,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      // A repeated tap raced this one and wrote the same «внесок».
      throw new DebtConflict('Цей внесок уже приймається — оновіть виписку', 'stale_statement');
    }
    throw error;
  } finally {
    client.release();
  }
  const sale = await getSale(input.storeId, recorded.saleId);
  if (!sale) throw new Error('«Внесок» vanished after its commit');
  return { sale, chain: recorded.chain, line: recorded.line, owedBeforeCents: recorded.owedBeforeCents };
}

/**
 * A document the provider refused (it cannot exist): the debt was never paid
 * by it in law, so it is undone — a receipt's lines back to the debt, a
 * «внесок»'s money — with no stock moved. True when it was.
 */
async function undoRefused(input: PayDebtInput, error: unknown, saleId: number): Promise<boolean> {
  if (!(error instanceof fiscalService.FiscalDocumentFailed) || error.mayExist) return false;
  return fiscalService.abortSale(input.storeId, saleId, input.staffId, error.row);
}

function logAmbiguous(input: PayDebtInput, saleId: number, error: unknown): void {
  logger.error('Debt repaid, document not registered', {
    storeId: input.storeId,
    customerId: input.customerId,
    saleId,
    mayExistAtProvider: error instanceof fiscalService.FiscalDocumentFailed ? error.mayExist : null,
    error: error instanceof Error ? error.message : String(error),
  });
}

async function finishParts(input: PayDebtInput, parts: PayDebtPart[], warning: string | null): Promise<PayDebtResult> {
  const fresh: PayDebtPart[] = [];
  for (const part of parts) {
    fresh.push({ ...part, sale: (await getSale(input.storeId, part.sale.id)) ?? part.sale });
  }
  const main = fresh.find((part) => part.kind !== 'prepayment') ?? fresh[0];
  const prepayment = fresh.find((part) => part.kind === 'prepayment')?.sale ?? null;
  const statement = await getStatement(input.storeId, input.customerId);
  return {
    sale: main.sale,
    prepayment,
    fiscal: main.fiscal,
    warning,
    credit: statement.credit,
    open_lines: statement.open_lines,
    parts: fresh,
  };
}

async function finish(
  input: PayDebtInput,
  sale: SaleDetail,
  prepayment: SaleDetail | null,
  fiscal: fiscalService.FiscalView | null,
  warning: string | null
): Promise<PayDebtResult> {
  const statement = await getStatement(input.storeId, input.customerId);
  const current = (await getSale(input.storeId, sale.id)) ?? sale;
  const parts: PayDebtPart[] = [];
  if (!current.debt_prepayment) parts.push({ kind: 'receipt', sale: current, fiscal });
  if (prepayment) {
    parts.push({ kind: 'prepayment', sale: prepayment, fiscal: current.debt_prepayment ? fiscal : null });
  }
  return {
    sale: current,
    prepayment,
    fiscal,
    warning,
    credit: statement.credit,
    open_lines: statement.open_lines,
    parts,
  };
}
