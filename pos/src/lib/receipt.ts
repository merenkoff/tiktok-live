// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { SaleDetail } from '../types';
import type { ReceiptData } from './printer';
import { refundLineAmount } from './money';

export function buildReceiptPayload(
  sale: SaleDetail,
  storeName: string,
  customerName?: string | null
): ReceiptData {
  return {
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
  storeName: string
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
