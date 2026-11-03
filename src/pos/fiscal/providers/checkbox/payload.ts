// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/payload.ts
//
// FiscalDoc (src/pos/fiscal/types.ts) <-> Checkbox's own wire shapes.

import type {
  CheckboxCashPayment,
  CheckboxChainPaymentPayload,
  CheckboxGoodItemPayload,
  CheckboxPayment,
  CheckboxPrepaymentPayload,
  CheckboxPrepaymentRelation,
  CheckboxReceipt,
  CheckboxRoundingMode,
  CheckboxSellOfflinePayload,
  CheckboxSellPayload,
  CheckboxServicePayload,
} from './client.js';
import type {
  FiscalChainState,
  FiscalDocLine,
  FiscalDocPayment,
  FiscalRefundDoc,
  FiscalResult,
  FiscalSaleDoc,
  FiscalServiceDoc,
  OfflineStamp,
} from '../../types.js';
import { FiscalError } from '../../errors.js';
import { lineAmountCents } from '../../../lineMoney.js';

/** Checkbox's quantity is thousandths of the unit the price is for — 1 pc = 1000, 350 g of a per-kg price = 350. */
const MILLI_PER_UNIT = 1000;

/**
 * Send an exact `discounts[]` entry rather than an override field.
 *
 * The obvious approach — Checkbox's `GoodItemPayload.total_sum`, which lets a
 * caller state the line's final total directly — turned out to be
 * organization-gated: a real sandbox sell failed live with
 * `organization.option_disabled` ("У організації вимкнено розрахунок
 * вартості товару від суми"), meaning some merchants simply cannot use it.
 * `discounts[{mode:'VALUE'}]` is the base mechanism instead, confirmed live
 * to use the same kopecks unit as everything else (a 2000 VALUE discount on
 * a 20000 price sold for exactly 18000).
 *
 * The discount sent is **derived**, not `line.discountCents` verbatim:
 * `mapping.ts` always zeroes `discountCents` on a refund line (the reduction
 * "already lives inside amount_cents"), so trusting it here would send an
 * undiscounted `price × quantity` to Checkbox on any refund of a line that
 * was originally discounted — a mismatch against our own `lineTotalCents`
 * that `assertLinesMatchTotal` already guarantees is the correct total.
 *
 * `price × quantity` is `lineAmountCents` — the very function the sale priced
 * the line with (migration 075). For pieces it is exact; for a weighed line
 * (grams at a price per kilogram) it rounds half a kopeck up, which is what
 * Checkbox is assumed to do until the sandbox run says otherwise
 * (TechDocs/grocery/G4_WEIGHED.md §8). A line that comes to MORE than that
 * would need an `EXTRA_CHARGE`, which nothing has verified — so it is refused
 * before it leaves rather than sent to differ from Checkbox's own sum by a
 * kopeck. No line our arithmetic makes can get there.
 */
function mapLine(line: FiscalDocLine, isReturn: boolean): CheckboxGoodItemPayload {
  const undiscountedTotal = lineAmountCents(line.quantityMilli, line.unitPriceCents, MILLI_PER_UNIT);
  const discount = undiscountedTotal - line.lineTotalCents;
  if (discount < 0) {
    throw new FiscalError(
      `Line «${line.name}» comes to ${line.lineTotalCents}, more than its price × quantity ${undiscountedTotal}`,
      'rejected'
    );
  }
  return {
    good: {
      code: line.barcode ?? line.sourceLineRef ?? line.name.slice(0, 256),
      name: line.name,
      price: line.unitPriceCents,
      ...(line.barcode ? { barcode: line.barcode } : {}),
      ...(line.uktzed ? { uktzed: line.uktzed } : {}),
      // null taxCode -> omit `tax` entirely, matching Checkbox's own semantics
      // for a good that is not a taxable object, rather than sending a
      // fabricated code.
      ...(line.taxCode ? { tax: [Number(line.taxCode)] } : {}),
    },
    quantity: line.quantityMilli,
    ...(discount > 0 ? { discounts: [{ type: 'DISCOUNT', mode: 'VALUE', value: discount }] } : {}),
    ...(isReturn ? { is_return: true } : {}),
  };
}

function mapPayment(payment: FiscalDocPayment): CheckboxPayment {
  return payment.method === 'cash'
    ? { type: 'CASH', value: payment.amountCents }
    : { type: 'CASHLESS', value: payment.amountCents };
}

/**
 * Cash rounding (TechDocs/POS_CASH_ROUNDING.md, Д6). Checkbox's own spec for
 * the older boolean: «for it to work in the payments block, the amount
 * already rounded according to the rules of the National Bank of Ukraine must
 * be specified» — which the documents already carry: a sale's cash row is the
 * notes and coins handed over, a refund's is the sum after rounding
 * (`mapping.ts`). So the mode is the whole of the change, and it is sent only
 * when there is a rounding: a receipt without one is byte-for-byte the
 * payload it was before.
 */
function roundingMode(doc: FiscalSaleDoc | FiscalRefundDoc): CheckboxRoundingMode | null {
  const rounding = doc.cashRounding;
  if (!rounding || rounding.amountCents === 0) return null;
  return rounding.step === 10 ? 'ROUND_10' : 'ROUND_50';
}

export function mapSellPayload(doc: FiscalSaleDoc | FiscalRefundDoc): CheckboxSellPayload {
  const isReturn = doc.kind === 'refund';
  const mode = roundingMode(doc);
  return {
    id: doc.requestId,
    cashier_name: doc.cashierName,
    goods: doc.lines.map((line) => mapLine(line, isReturn)),
    payments: doc.payments.map(mapPayment),
    ...(doc.kind === 'refund' ? { related_receipt_id: doc.relatedProviderDocId } : {}),
    ...(mode ? { rounding_mode: mode } : {}),
  };
}

/**
 * The offline variant differs from `sell` only by the stamp — Checkbox's own
 * wording ("відрізняється лише наявністю полів fiscal_code та fiscal_date"),
 * so it is the same mapping plus two fields, not a second mapping.
 *
 * `previous_receipt_id` is deliberately NOT sent, even when the caller has one.
 * The sandbox run of 2026-09-12 (fixtures `offline_receipt_sell_offline_*`)
 * replayed a real outage: the first receipt, with no pointer, was accepted;
 * the second, carrying the id Checkbox had just returned for the first — which
 * was also the register's latest receipt by serial — was refused with
 * `receipt.previous_id_last_id_differs`, "id попереднього чека відрізняється
 * від останнього збереженого чека".
 *
 * So Checkbox's notion of "the last saved receipt" is not the one we can
 * compute, and an offline chain cannot be built on a value we are only
 * guessing at: the field is optional, while getting it wrong costs every
 * receipt of the outage after the first (a 400 no classifier treats as
 * terminal, retried until the document runs out of attempts). Omitted, the
 * provider orders the chain by `fiscal_date`, which is what the tax office
 * reads anyway.
 */
export function mapSellOfflinePayload(
  doc: FiscalSaleDoc | FiscalRefundDoc,
  stamp: OfflineStamp
): CheckboxSellOfflinePayload {
  return {
    ...mapSellPayload(doc),
    fiscal_code: stamp.fiscalCode,
    fiscal_date: stamp.fiscalDate.toISOString(),
  };
}

/**
 * The first «внесок» toward a line: a chain for the line's goods — `goods`
 * built by `mapLine`, the very mapping a sale's lines go through, so a line
 * discount or a share of the cart discount reaches Checkbox as its `DISCOUNT
 * VALUE` and a weighed line as grams at a price per kilogram (sandbox run of
 * 2026-10-25, answers 5 and 6) — and our number for it, which Checkbox takes
 * as the chain's own (answer 1). A «внесок» is never rounded: the till takes
 * it as a sum it can be paid in, so `rounding_mode` stays absent.
 */
export function mapPrepaymentPayload(doc: FiscalSaleDoc): CheckboxPrepaymentPayload {
  if (!doc.chain) throw new FiscalError('Not a chain document', 'rejected');
  const mode = roundingMode(doc);
  return {
    id: doc.requestId,
    cashier_name: doc.cashierName,
    goods: doc.lines.map((line) => mapLine(line, false)),
    payments: doc.payments.map(mapPayment),
    ...(mode ? { rounding_mode: mode } : {}),
    custom_relation_id: doc.chain.relationId,
  };
}

/**
 * A further document of an open chain — one more prepayment, or the
 * after-payment that closes it: only the money leaves, Checkbox takes the
 * goods from the chain. The after-payment's cash is what was handed over and
 * its rounding is the sale's (answer 4: our rounded cash with
 * `rounding_mode` closes the chain exactly as it settles a sale).
 */
export function mapChainPaymentPayload(doc: FiscalSaleDoc): CheckboxChainPaymentPayload {
  const mode = roundingMode(doc);
  return {
    id: doc.requestId,
    cashier_name: doc.cashierName,
    payments: doc.payments.map(mapPayment),
    ...(mode ? { rounding_mode: mode } : {}),
  };
}

/**
 * Checkbox's view of a chain, in the contract's words. `PARTIAL_CANCELLED`
 * was never seen in the sandbox; it is read as returned, which is what it
 * means for us — no further document may go into it.
 */
export function toChainState(relation: CheckboxPrepaymentRelation): FiscalChainState {
  const chain = relation.receipt_chain ?? { pre_payment_receipts: [] };
  const total = Number(relation.total_sum) || 0;
  const paid = Number(relation.paid_sum) || 0;
  const status =
    relation.pre_payment_status === 'PARTIAL_PAID'
      ? 'open'
      : relation.pre_payment_status === 'FULL_PAID'
        ? 'paid'
        : 'returned';
  return {
    relationId: relation.relation_id,
    status,
    totalCents: total,
    paidCents: paid,
    leftCents: typeof relation.left_to_pay === 'number' ? relation.left_to_pay : Math.max(0, total - paid),
    documents: [
      ...(chain.pre_payment_receipts ?? []),
      ...(chain.after_payment_receipt ? [chain.after_payment_receipt] : []),
    ],
    returns: { ...(chain.returned_receipts_mapping ?? {}) },
    raw: relation,
  };
}

export function mapServicePayload(doc: FiscalServiceDoc): CheckboxServicePayload {
  const signed = doc.kind === 'service_in' ? doc.amountCents : -doc.amountCents;
  const payment: CheckboxCashPayment = { type: 'CASH', value: signed };
  return { id: doc.requestId, payment };
}

/**
 * `tax_url` doubles as `qrPayload`: Checkbox does not hand back separate "raw
 * QR data" from the pre-rendered link — the tax-office verification URL
 * itself is what gets encoded into the QR on the paper receipt. Its `mac`
 * query parameter changes on every re-fetch of the same receipt (observed in
 * the sandbox), but since callers only ever read this once, right after the
 * document settles, and persist it (`pos_fiscal_receipts`), that variability
 * never surfaces as a bug.
 */
export function toFiscalResult(receipt: CheckboxReceipt): FiscalResult {
  return {
    providerDocId: receipt.id,
    fiscalCode: receipt.fiscal_code,
    fiscalDate: receipt.fiscal_date,
    taxUrl: receipt.tax_url,
    qrPayload: receipt.tax_url,
    // The sandbox organization has no VAT, so there's nothing to verify this
    // against; left null rather than guessed from `receipt.taxes[]`, which
    // FiscalResult already documents as an acceptable value.
    vatCents: null,
    receiptText: null,
    controlNumber: receipt.control_number ?? null,
    roundingCents: typeof receipt.round_sum === 'number' ? receipt.round_sum : null,
    raw: receipt,
  };
}
