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
import type {
  FiscalDocLine,
  FiscalDocPayment,
  FiscalRefundDoc,
  FiscalSaleDoc,
  FiscalServiceDoc,
} from './types.js';

/** Units are whole today (`pos_sale_items.quantity INTEGER`); 1 pc = 1000. */
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
    quantityMilli: item.quantity * MILLI_PER_UNIT,
    unitPriceCents: item.unit_price_cents,
    lineTotalCents: item.line_total_cents,
    discountCents: item.line_discount_cents,
    taxCode: resolveTaxCode(item.id, tax),
    barcode: codes?.byItemId?.[item.id] ?? null,
    uktzed: codes?.uktzedByItemId?.[item.id] ?? null,
    sourceLineRef: String(item.id),
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
      quantityMilli: line.quantity * MILLI_PER_UNIT,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: line.amount_cents,
      // The line discount already lives inside `amount_cents`; restating it
      // would double-count against the total the provider checks.
      discountCents: 0,
      taxCode: resolveTaxCode(item.id, tax),
      barcode: codes?.byItemId?.[item.id] ?? null,
      uktzed: codes?.uktzedByItemId?.[item.id] ?? null,
      sourceLineRef: String(item.id),
    };
  });

  assertLinesMatchTotal(lines, refund.total_cents, 'refund');

  // A refund is settled by exactly one method (`pos_refunds.method`); older
  // rows predate the column and fall back to cash, matching the receipt.
  const method = refund.method ?? 'cash';
  if (method !== 'cash' && method !== 'card' && method !== 'qr') {
    throw new FiscalError(`Unsupported refund method "${method}"`, 'rejected');
  }

  return {
    kind: 'refund',
    requestId,
    ourNumber: refund.refund_number,
    cashierName: refund.staff_name,
    lines,
    payments: [{ method, amountCents: refund.total_cents }],
    totalCents: refund.total_cents,
    discountCents: 0,
    note: refund.reason ?? null,
    relatedProviderDocId,
    relatedOurNumber: sale.receipt_number,
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
