// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/mapping.ts
//
// Our sale/refund rows → the provider-neutral fiscal document.
//
// Pure by design: every input is passed in, nothing is queried. That keeps the
// money arithmetic testable without a database, and keeps `src/pos/fiscal/`
// free of any dependency on `sales.service.ts`.

import { FiscalError } from './errors.js';
import { displayUnit } from '../weighed.js';
import { lineAmountCents } from '../lineMoney.js';
import type {
  FiscalCashRounding,
  FiscalChainStep,
  FiscalDocLine,
  FiscalDocPayment,
  FiscalRefundDoc,
  FiscalSaleDoc,
  FiscalServiceDoc,
} from './types.js';

/**
 * A fiscal quantity is in thousandths of the unit the price is for. A line's
 * `quantity` is a whole number of base units (`pos_sale_items.quantity
 * INTEGER`), so a piece is 1000 and a weighed line — grams at a price per
 * kilogram, `price_per` 1000 (migration 075) — is its grams as they are.
 */
const MILLI_PER_UNIT = 1000;

/** The subset of a `getSale` item this mapping needs. */
export interface SaleItemInput {
  id: number;
  product_name: string;
  variant_label: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  line_discount_cents: number;
  /** `pos_sale_items.unit` — what `quantity` counts in. Optional: older callers and tests omit it. */
  unit?: string;
  /**
   * What `unit_price_cents` is for (migration 075): 1000 on a weighed line —
   * grams at a price per kilogram. Optional: absent is 1, every line before it.
   */
  price_per?: number;
}

export interface SalePaymentInput {
  method: string;
  amount_cents: number;
  provider_ref?: string | null;
}

export interface SaleInput {
  receipt_number: string;
  staff_name: string;
  total_cents: number;
  cart_discount_cents: number;
  note?: string | null;
  customer_phone?: string | null;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  /** Migration 071: the step the cash part was rounded by, and by how much. */
  cash_rounding?: number;
  rounding_cents?: number;
}

/**
 * The document's rounding, or null when there is none — a zero rounding is
 * no rounding, and the provider then gets exactly the payload it got before.
 * A step that is not 10 or 50 with a non-zero amount cannot come out of
 * `sales.service.ts` (the CHECK in migration 071 forbids it); refusing it here
 * keeps a hand-edited row from reaching the tax office as ROUND_50.
 */
export function cashRoundingOf(source: {
  cash_rounding?: number;
  rounding_cents?: number;
}): FiscalCashRounding | null {
  const amount = Number(source.rounding_cents ?? 0);
  if (!amount) return null;
  const step = Number(source.cash_rounding ?? 0);
  if (step !== 10 && step !== 50) {
    throw new FiscalError(`Rounding of ${amount} with an unknown step ${step}`, 'rejected');
  }
  return { step, amountCents: amount };
}

export interface TaxCodeResolution {
  /** `pos_products.fiscal_tax_code` per sale-item id, where the product has one. */
  byItemId: Readonly<Record<number, string | null>>;
  /** `pos_fiscal_settings.default_tax_code`. */
  fallback: string | null;
}

export interface BarcodeResolution {
  /** Variant barcode per sale-item id, when known. */
  byItemId?: Readonly<Record<number, string | null>>;
  uktzedByItemId?: Readonly<Record<number, string | null>>;
}

/**
 * A product name a human can read on a paper receipt.
 *
 * `variant_label` is often empty (`pos_sale_items.variant_label` defaults to
 * `''`), so it is appended only when it says something.
 */
export function fiscalLineName(productName: string, variantLabel: string): string {
  const label = variantLabel.trim();
  const name = productName.trim();
  return label ? `${name} (${label})` : name;
}

/**
 * The line's unit, only when the sale item names one — an absent field keeps
 * the line exactly what it was before contract v2, which is what lets the
 * stored payloads and the Checkbox adapter go on unchanged. A weighed line
 * reads in the unit its price is for: «кг», «л» (075).
 */
function unitOf(item: SaleItemInput): { unit?: string } {
  const unit = item.unit?.trim();
  return unit ? { unit: displayUnit(unit, item.price_per ?? 1) } : {};
}

/**
 * `quantity` base units as thousandths of the unit the price is for: a piece
 * is 1000, 350 g at a price per kilogram is 350. Anything else — a basis that
 * does not divide, a fraction — would reach the provider as a quantity it
 * cannot represent, so it is refused before anything leaves.
 */
function quantityMilliOf(quantity: number, pricePer: number | undefined, itemId: number): number {
  const per = pricePer ?? 1;
  const milli = (quantity * MILLI_PER_UNIT) / per;
  if (!Number.isInteger(milli) || milli <= 0) {
    throw new FiscalError(
      `Line ${itemId}: quantity ${quantity} at price_per ${per} is not a whole number of thousandths`,
      'rejected'
    );
  }
  return milli;
}

function resolveTaxCode(itemId: number, tax: TaxCodeResolution): string | null {
  const own = tax.byItemId[itemId];
  return (own ?? null) || tax.fallback;
}

function mapPayments(payments: SalePaymentInput[]): FiscalDocPayment[] {
  return payments.map((p) => {
    if (p.method !== 'cash' && p.method !== 'card' && p.method !== 'qr') {
      throw new FiscalError(`Unsupported payment method "${p.method}"`, 'rejected');
    }
    return {
      method: p.method,
      amountCents: p.amount_cents,
      providerRef: p.provider_ref ?? null,
    };
  });
}

/**
 * Map a completed sale to a fiscal sale document.
 *
 * Line money comes from `line_total_cents`, the post-discount figure — the same
 * rule `refundLineAmount` enforces in `sales.service.ts`. Using
 * `unit_price_cents × quantity` instead would fiscalise more than the customer
 * paid on any discounted receipt.
 */
export function buildSaleDoc(input: {
  requestId: string;
  sale: SaleInput;
  tax: TaxCodeResolution;
  codes?: BarcodeResolution;
}): FiscalSaleDoc {
  const { requestId, sale, tax, codes } = input;
  if (sale.items.length === 0) {
    throw new FiscalError('Cannot fiscalise a sale with no items', 'rejected');
  }

  const lines: FiscalDocLine[] = sale.items.map((item) => ({
    name: fiscalLineName(item.product_name, item.variant_label),
    quantityMilli: quantityMilliOf(item.quantity, item.price_per, item.id),
    unitPriceCents: item.unit_price_cents,
    lineTotalCents: item.line_total_cents,
    discountCents: item.line_discount_cents,
    taxCode: resolveTaxCode(item.id, tax),
    barcode: codes?.byItemId?.[item.id] ?? null,
    uktzed: codes?.uktzedByItemId?.[item.id] ?? null,
    sourceLineRef: String(item.id),
    ...unitOf(item),
  }));

  assertLinesMatchTotal(lines, sale.total_cents, 'sale');

  return {
    kind: 'sale',
    requestId,
    ourNumber: sale.receipt_number,
    cashierName: sale.staff_name,
    lines,
    payments: mapPayments(sale.payments),
    totalCents: sale.total_cents,
    discountCents: sale.cart_discount_cents,
    note: sale.note ?? null,
    customerPhone: sale.customer_phone ?? null,
    // The cash payment stays what was handed over: the provider rounds the
    // total and works the change out from that (TechDocs/POS_CASH_ROUNDING.md, Д6).
    cashRounding: cashRoundingOf(sale),
  };
}

/** The goods of a prepayment chain — a «під запис» line, at what is still owed for it. */
export interface ChainGoodsInput {
  /** Traces the fiscal line back to its debt line, e.g. `debt-42`. */
  ref: string;
  product_name: string;
  variant_label: string;
  /** The units still owed for, in the line's base unit (grams of a weighed line). */
  quantity: number;
  unit_price_cents: number;
  /** What is still owed for them before this document — their line total in the chain. */
  owed_cents: number;
  price_per?: number;
  unit?: string;
  tax_code: string | null;
  barcode: string | null;
  uktzed: string | null;
}

/**
 * A «внесок» as a document of its line's prepayment chain
 * (TechDocs/grocery/G3_DEBTS.md §11 «Крок 2»).
 *
 * A «внесок» is a sale with no goods lines of its own — money toward goods the
 * customer already has — so its lines are the debt line's: the units still
 * owed for, at what is still owed for them, its discount being everything
 * that came off since (the line and cart discounts, units returned or paid,
 * earlier «внески»). That is the contract's meaning of a chain document's
 * lines (`FiscalChainStep`), and the money is the «внесок» alone, always below
 * them: the sum that closes a line is the receipt that closes it, not a
 * «внесок». Never rounded — the till takes a «внесок» as a sum it can be paid
 * in, so the cash is exactly it.
 */
export function buildChainPrepaymentDoc(input: {
  requestId: string;
  sale: {
    receipt_number: string;
    staff_name: string;
    total_cents: number;
    payments: SalePaymentInput[];
    customer_phone?: string | null;
  };
  goods: ChainGoodsInput[];
  chain: FiscalChainStep;
}): FiscalSaleDoc {
  const { requestId, sale, goods, chain } = input;
  if (goods.length === 0) throw new FiscalError('A chain document needs the goods it is for', 'rejected');

  const lines: FiscalDocLine[] = goods.map((item, index) => {
    const quantityMilli = quantityMilliOf(item.quantity, item.price_per, index);
    const undiscounted = lineAmountCents(quantityMilli, item.unit_price_cents, MILLI_PER_UNIT);
    if (item.owed_cents <= 0 || item.owed_cents > undiscounted) {
      throw new FiscalError(
        `Chain goods «${item.product_name}» owe ${item.owed_cents} of their ${undiscounted}`,
        'rejected'
      );
    }
    return {
      name: fiscalLineName(item.product_name, item.variant_label),
      quantityMilli,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.owed_cents,
      discountCents: undiscounted - item.owed_cents,
      taxCode: item.tax_code,
      barcode: item.barcode,
      uktzed: item.uktzed,
      sourceLineRef: item.ref,
      ...(item.unit?.trim() ? { unit: displayUnit(item.unit.trim(), item.price_per ?? 1) } : {}),
    };
  });

  const owed = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  if (sale.total_cents <= 0 || sale.total_cents >= owed) {
    throw new FiscalError(
      `A «внесок» of ${sale.total_cents} must be above zero and below the ${owed} still owed`,
      'rejected'
    );
  }
  const payments = mapPayments(sale.payments);
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (paid !== sale.total_cents) {
    throw new FiscalError(`A «внесок» of ${sale.total_cents} is paid ${paid}`, 'rejected');
  }

  return {
    kind: 'sale',
    requestId,
    ourNumber: sale.receipt_number,
    cashierName: sale.staff_name,
    lines,
    payments,
    totalCents: sale.total_cents,
    discountCents: 0,
    note: null,
    customerPhone: sale.customer_phone ?? null,
    cashRounding: null,
    chain,
  };
}

/** One line of a refund, with the amount the refund document actually recorded. */
export interface RefundLineInput {
  sale_item_id: number;
  quantity: number;
  /**
   * What was refunded for these units, in cents.
   *
   * Passed in rather than recomputed: `refundSale` has already worked it out
   * with `refundLineAmount`, and a second implementation of that cumulative
   * rounding rule here would be a money bug waiting to happen.
   */
  amount_cents: number;
}

export interface RefundInput {
  refund_number: string;
  staff_name: string;
  total_cents: number;
  method: string | null;
  reason?: string | null;
  lines: RefundLineInput[];
  /** Migration 071: a cash refund's rounding — the money handed back is `total_cents + rounding_cents`. */
  cash_rounding?: number;
  rounding_cents?: number;
}

/**
 * Map a refund document to a fiscal return document.
 *
 * `relatedProviderDocId` is the fiscalised sale's id at the provider — a return
 * that does not reference its sale is not a valid чек повернення.
 */
export function buildRefundDoc(input: {
  requestId: string;
  refund: RefundInput;
  sale: SaleInput;
  relatedProviderDocId: string;
  tax: TaxCodeResolution;
  codes?: BarcodeResolution;
}): FiscalRefundDoc {
  const { requestId, refund, sale, relatedProviderDocId, tax, codes } = input;
  if (refund.lines.length === 0) {
    throw new FiscalError('Cannot fiscalise a refund with no lines', 'rejected');
  }
  if (!relatedProviderDocId) {
    throw new FiscalError('Cannot fiscalise a refund without the original receipt', 'rejected');
  }

  const itemsById = new Map(sale.items.map((item) => [item.id, item]));

  const lines: FiscalDocLine[] = refund.lines.map((line) => {
    const item = itemsById.get(line.sale_item_id);
    if (!item) {
      throw new FiscalError(
        `Refund line references sale item ${line.sale_item_id}, which is not on the sale`,
        'rejected'
      );
    }
    return {
      name: fiscalLineName(item.product_name, item.variant_label),
      // A weighed line only ever comes back whole (sales.service.ts), so its
      // price × quantity is the sale line's own and the sums agree.
      quantityMilli: quantityMilliOf(line.quantity, item.price_per, item.id),
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: line.amount_cents,
      // The line discount already lives inside `amount_cents`; restating it
      // would double-count against the total the provider checks.
      discountCents: 0,
      taxCode: resolveTaxCode(item.id, tax),
      barcode: codes?.byItemId?.[item.id] ?? null,
      uktzed: codes?.uktzedByItemId?.[item.id] ?? null,
      sourceLineRef: String(item.id),
      ...unitOf(item),
    };
  });

  assertLinesMatchTotal(lines, refund.total_cents, 'refund');

  // A refund is settled by exactly one method (`pos_refunds.method`); older
  // rows predate the column and fall back to cash, matching the receipt.
  const method = refund.method ?? 'cash';
  if (method !== 'cash' && method !== 'card' && method !== 'qr') {
    throw new FiscalError(`Unsupported refund method "${method}"`, 'rejected');
  }
  // Only cash handed back is ever rounded (НБУ № 25 п. 6); a non-zero
  // rounding on a card refund would be a bug upstream, not a document.
  const cashRounding = cashRoundingOf(refund);
  if (cashRounding && method !== 'cash') {
    throw new FiscalError(`A ${method} refund cannot carry cash rounding`, 'rejected');
  }

  return {
    kind: 'refund',
    requestId,
    ourNumber: refund.refund_number,
    cashierName: refund.staff_name,
    lines,
    // What actually leaves the drawer: Checkbox wants the amount «already
    // rounded according to the rules of the National Bank» in payments.
    payments: [{ method, amountCents: refund.total_cents + (cashRounding?.amountCents ?? 0) }],
    totalCents: refund.total_cents,
    discountCents: 0,
    note: refund.reason ?? null,
    relatedProviderDocId,
    relatedOurNumber: sale.receipt_number,
    cashRounding,
  };
}

export function buildServiceDoc(input: {
  requestId: string;
  ourNumber: string;
  cashierName: string;
  amountCents: number;
}): FiscalServiceDoc {
  if (input.amountCents === 0) {
    throw new FiscalError('Service receipt amount cannot be zero', 'rejected');
  }
  return {
    kind: input.amountCents > 0 ? 'service_in' : 'service_out',
    requestId: input.requestId,
    ourNumber: input.ourNumber,
    cashierName: input.cashierName,
    amountCents: Math.abs(input.amountCents),
  };
}

/**
 * The document total must be exactly the sum of its lines.
 *
 * A provider rejects a mismatch with an opaque 422, at the till, mid-checkout.
 * Catching it here turns that into a specific message with the two numbers in
 * it — and it is a real risk, because our cart discount is allocated across
 * lines with a last-line-absorbs-the-remainder rule (`allocateCartDiscount`).
 */
function assertLinesMatchTotal(
  lines: FiscalDocLine[],
  totalCents: number,
  what: string
): void {
  const sum = lines.reduce((acc, line) => acc + line.lineTotalCents, 0);
  if (sum !== totalCents) {
    throw new FiscalError(
      `Fiscal ${what} lines sum to ${sum} but the document total is ${totalCents}`,
      'rejected'
    );
  }
}
