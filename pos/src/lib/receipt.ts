// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { SaleDetail } from '../types';
import type { ReceiptData } from './printer';

export function buildReceiptPayload(
  sale: SaleDetail,
  storeName: string,
  customerName?: string | null
): ReceiptData {
  return {
    store_name: storeName,
    receipt_number: sale.receipt_number,
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
