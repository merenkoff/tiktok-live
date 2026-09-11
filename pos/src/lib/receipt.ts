// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FiscalActionResult, SaleDetail, SaleFiscalDoc } from '../types';
import type { ReceiptData, ReceiptFiscal } from './printer';
import { refundLineAmount } from './money';

/**
 * What the paper carries from a fiscal document, if anything.
 *
 * The till never reads `receipt_source` — the server only ships
 * `receipt_text` when the owner chose the provider's receipt AND it was
 * actually fetched, so "print it iff present" is exactly that setting with
 * the fetch-failed fallback built in.
 */
function fiscalParts(doc: SaleFiscalDoc | FiscalActionResult | null | undefined): {
  provider_text: string | null;
  fiscal: ReceiptFiscal | null;
} {
  if (!doc || !doc.fiscal_code || !isPrintableFiscalDoc(doc)) {
    return { provider_text: null, fiscal: null };
  }
  const offline = doc.mode === 'offline';
  return {
    // An offline document never has provider text — there was no provider call
    // to fetch it from — so this falls back to our layout by construction.
    provider_text: doc.receipt_text?.trim() ? doc.receipt_text : null,
    fiscal: {
      fiscal_code: doc.fiscal_code,
      fiscal_date: doc.fiscal_date ? new Date(doc.fiscal_date).toLocaleString('uk-UA') : null,
      tax_url: doc.tax_url,
      offline,
      control_number: doc.control_number ?? null,
    },
  };
}

/**
 * Does this document put a fiscal block on paper at all?
 *
 * `done` — yes, the ordinary case. `pending` + `mode: 'offline'` — also yes:
 * the fiscal number is a real tax-office code from the reserve, and the receipt
 * the customer is handed has to carry it together with the «ОФЛАЙН» mark. Any
 * other `pending` is a document still in flight with no number of its own, and
 * `failed` has nothing to print.
 */
function isPrintableFiscalDoc(doc: SaleFiscalDoc | FiscalActionResult): boolean {
  return doc.status === 'done' || (doc.status === 'pending' && doc.mode === 'offline');
}

/**
 * Is the fiscal block complete enough to hand the customer without a word?
 *
 * The till auto-prints only these. An offline receipt whose контрольне число
 * has not arrived yet is deliberately NOT complete: it is printable on demand
 * (the cashier presses «Друк чека» and knows what they are giving out), but
 * printing it automatically would quietly hand over a receipt missing a
 * required field. See TechDocs/POS_FISCAL_OFFLINE.md.
 */
export function fiscalBlockComplete(
  doc: SaleFiscalDoc | FiscalActionResult | null | undefined
): boolean {
  if (!doc || !doc.fiscal_code) return false;
  if (doc.status === 'done') return true;
  return doc.status === 'pending' && doc.mode === 'offline' && Boolean(doc.control_number);
}

export function buildReceiptPayload(
  sale: SaleDetail,
  storeName: string,
  customerName?: string | null
): ReceiptData {
  return {
    ...fiscalParts(sale.fiscal),
    store_name: storeName,
    kind: 'sale',
    receipt_number: sale.receipt_number,
    refund_of_receipt: null,
    created_at: new Date(sale.created_at).toLocaleString('uk-UA'),
    staff_name: sale.staff_name,
    customer_name: customerName ?? sale.customer_name ?? null,
    items: sale.items.map((item) => ({
      name: item.product_name,
      variant_label: item.variant_label,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
    })),
    subtotal_cents: sale.subtotal_cents,
    discount_cents: sale.cart_discount_cents ?? null,
    total_cents: sale.total_cents,
    payments: sale.payments.map((p) => ({ method: p.method, amount_cents: p.amount_cents })),
  };
}

/**
 * A refund is its own document, so it prints its own lines: only what came
 * back, priced at what was actually charged for those units, and the method
 * the money went out by — not the original sale's payments.
 */
export function buildRefundReceiptPayload(
  sale: SaleDetail,
  refund: SaleDetail['refunds'][number],
  lines: Array<{ sale_item_id: number; quantity: number }>,
  storeName: string,
  /** The REFUND's own fiscal document, from the refund response — never the sale's. */
  fiscal?: FiscalActionResult | null
): ReceiptData {
  const byId = new Map(sale.items.map((item) => [item.id, item]));
  const items = lines.flatMap((line) => {
    const item = byId.get(line.sale_item_id);
    if (!item) return [];
    // `refunded_quantity` already includes this refund, so step back over it to
    // price these units exactly as the server did.
    const before = item.refunded_quantity - line.quantity;
    const amount = refundLineAmount(
      item.line_total_cents,
      item.quantity,
      Math.max(0, before),
      line.quantity
    );
    return [
      {
        name: item.product_name,
        variant_label: item.variant_label,
        quantity: line.quantity,
        unit_price_cents: Math.round(amount / line.quantity),
        line_total_cents: amount,
      },
    ];
  });

  return {
    ...fiscalParts(fiscal),
    store_name: storeName,
    kind: 'refund',
    receipt_number: refund.refund_number ?? `RF-${refund.id}`,
    refund_of_receipt: sale.receipt_number,
    created_at: new Date(refund.created_at).toLocaleString('uk-UA'),
    staff_name: refund.staff_name,
    customer_name: sale.customer_name ?? null,
    items,
    subtotal_cents: refund.total_cents,
    discount_cents: null,
    total_cents: refund.total_cents,
    payments: refund.method ? [{ method: refund.method, amount_cents: refund.total_cents }] : [],
  };
}
