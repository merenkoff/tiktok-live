// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/payload.ts
//
// FiscalDoc (src/pos/fiscal/types.ts) <-> Checkbox's own wire shapes.

import type {
  CheckboxCashPayment,
  CheckboxGoodItemPayload,
  CheckboxPayment,
  CheckboxReceipt,
  CheckboxSellOfflinePayload,
  CheckboxSellPayload,
  CheckboxServicePayload,
} from './client.js';
import type {
  FiscalDocLine,
  FiscalDocPayment,
  FiscalRefundDoc,
  FiscalResult,
  FiscalSaleDoc,
  FiscalServiceDoc,
  OfflineStamp,
} from '../../types.js';

/** `pos_sale_items.quantity` is an INTEGER count of whole units — 1 pc = 1000, mapping.ts:23. */
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
 * Since `quantityMilli` is always an exact multiple of 1000 today (whole
 * units only), `unitPriceCents * (quantityMilli / 1000)` is always an exact
 * integer — no rounding to reconcile.
 */
function mapLine(line: FiscalDocLine, isReturn: boolean): CheckboxGoodItemPayload {
  const units = line.quantityMilli / MILLI_PER_UNIT;
  const undiscountedTotal = line.unitPriceCents * units;
  const discount = undiscountedTotal - line.lineTotalCents;
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

export function mapSellPayload(doc: FiscalSaleDoc | FiscalRefundDoc): CheckboxSellPayload {
  const isReturn = doc.kind === 'refund';
  return {
    id: doc.requestId,
    cashier_name: doc.cashierName,
    goods: doc.lines.map((line) => mapLine(line, isReturn)),
    payments: doc.payments.map(mapPayment),
    ...(doc.kind === 'refund' ? { related_receipt_id: doc.relatedProviderDocId } : {}),
  };
}

/**
 * The offline variant differs from `sell` only by the stamp — Checkbox's own
 * wording ("відрізняється лише наявністю полів fiscal_code та fiscal_date"),
 * so it is the same mapping plus two fields, not a second mapping.
 */
export function mapSellOfflinePayload(
  doc: FiscalSaleDoc | FiscalRefundDoc,
  stamp: OfflineStamp
): CheckboxSellOfflinePayload {
  return {
    ...mapSellPayload(doc),
    fiscal_code: stamp.fiscalCode,
    fiscal_date: stamp.fiscalDate.toISOString(),
    ...(stamp.previousDocId ? { previous_receipt_id: stamp.previousDocId } : {}),
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
    raw: receipt,
  };
}
