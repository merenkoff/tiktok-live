// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/sales.service.ts

import { pool } from '../db.js';
import { applyStockDelta } from './stock.service.js';
import type {
  CartDiscountInput,
  CompleteSaleItemInput,
  CompleteSalePaymentInput,
  RefundItemInput,
  RefundMethod,
} from './types.js';
import { getCustomer } from './customers.service.js';

function variantLabel(size: string, color: string): string {
  return [color, size].filter(Boolean).join(' / ');
}

/** Allocate cart discount only across lines without product discount (compare_at). */
export function allocateCartDiscount(
  lines: Array<{ pre_discount_total: number; has_product_discount: boolean }>,
  cartDiscount: CartDiscountInput | null | undefined
): { lineDiscounts: number[]; cartDiscountCents: number } {
  const lineDiscounts = lines.map(() => 0);
  if (!cartDiscount) return { lineDiscounts, cartDiscountCents: 0 };

  const eligibleIdx: number[] = [];
  let eligibleSum = 0;
  lines.forEach((line, i) => {
    if (!line.has_product_discount && line.pre_discount_total > 0) {
      eligibleIdx.push(i);
      eligibleSum += line.pre_discount_total;
    }
  });
  if (eligibleIdx.length === 0 || eligibleSum <= 0) {
    return { lineDiscounts, cartDiscountCents: 0 };
  }

  let cartDiscountCents = 0;
  if (cartDiscount.type === 'percent') {
    const pct = cartDiscount.value;
    if (pct < 0 || pct > 100) throw new Error('Invalid percent discount');
    cartDiscountCents = Math.round((eligibleSum * pct) / 100);
  } else if (cartDiscount.type === 'fixed') {
    if (cartDiscount.value < 0) throw new Error('Invalid fixed discount');
    cartDiscountCents = Math.min(cartDiscount.value, eligibleSum);
  } else {
    throw new Error('Invalid cart discount type');
  }

  if (cartDiscountCents <= 0) return { lineDiscounts, cartDiscountCents: 0 };

  let allocated = 0;
  for (let k = 0; k < eligibleIdx.length; k++) {
    const i = eligibleIdx[k];
    if (k === eligibleIdx.length - 1) {
      lineDiscounts[i] = cartDiscountCents - allocated;
    } else {
      const share = Math.floor(
        (cartDiscountCents * lines[i].pre_discount_total) / eligibleSum
      );
      lineDiscounts[i] = share;
      allocated += share;
    }
  }

  return { lineDiscounts, cartDiscountCents };
}

/**
 * Money to return for `n` more units of a sale line.
 *
 * Works off `line_total_cents` (post-discount), not `unit_price_cents` — the
 * latter is the pre-discount price, so charging refunds against it hands back
 * more than the customer actually paid on any discounted receipt.
 *
 * Cumulative form on purpose: taking the difference between two rounded
 * running totals (rather than rounding each slice) means the units of a line
 * always sum to exactly `line_total_cents`, in whatever order they come back.
 */
export function refundLineAmount(
  lineTotalCents: number,
  quantity: number,
  alreadyRefunded: number,
  n: number
): number {
  if (quantity <= 0) return 0;
  const through = (units: number) => Math.round((lineTotalCents * units) / quantity);
  return through(alreadyRefunded + n) - through(alreadyRefunded);
}

/**
 * Draw the next per-store document number from `pos_store_counters`.
 *
 * This used to be `COUNT(*) + 1` over the document table. Two tills in one
 * store checking out at the same moment each counted in their own snapshot,
 * produced the same number, and the loser died on the
 * `(store_id, receipt_number)` unique index — a completed sale lost at the
 * till. The counter row serialises them instead: `UPDATE … RETURNING` takes a
 * row lock, so the second transaction waits and gets the next value.
 *
 * The counter is seeded from the highest number already issued (not from
 * `COUNT`), so numbering stays continuous for stores that were trading before
 * this change and never reuses a number. Same mechanism the stock documents
 * have always used — see `nextDocNumber` in stock-documents.service.ts.
 */
async function nextDocumentNumber(
  client: { query: typeof pool.query },
  storeId: number,
  opts: { counterKey: string; prefix: string; table: string; column: string }
): Promise<string> {
  // Seed from the highest number already issued. The pattern is anchored to
  // this document's own prefix and capped at nine digits: anything that does
  // not look like one of our numbers is ignored rather than parsed into an
  // out-of-range seed (`next_value` is an int4).
  await client.query(
    `INSERT INTO pos_store_counters (store_id, counter_key, next_value)
     VALUES (
       $1,
       $2,
       (SELECT COALESCE(MAX(substring(${opts.column} from ('^' || $3 || '-([0-9]{1,9})$'))::int), 0) + 1
        FROM ${opts.table} WHERE store_id = $1)
     )
     ON CONFLICT (store_id, counter_key) DO NOTHING`,
    [storeId, opts.counterKey, opts.prefix]
  );
  const result = await client.query(
    `UPDATE pos_store_counters
     SET next_value = next_value + 1
     WHERE store_id = $1 AND counter_key = $2
     RETURNING next_value - 1 AS seq`,
    [storeId, opts.counterKey]
  );
  const seq = Number(result.rows[0].seq);
  return `${opts.prefix}-${String(seq).padStart(5, '0')}`;
}

async function nextReceiptNumber(
  client: { query: typeof pool.query },
  storeId: number
): Promise<string> {
  return nextDocumentNumber(client, storeId, {
    counterKey: 'sale',
    prefix: 'R',
    table: 'pos_sales',
    column: 'receipt_number',
  });
}

/** Refunds are their own documents, so they carry their own numbering. */
async function nextRefundNumber(
  client: { query: typeof pool.query },
  storeId: number
): Promise<string> {
  return nextDocumentNumber(client, storeId, {
    counterKey: 'refund',
    prefix: 'RF',
    table: 'pos_refunds',
    column: 'refund_number',
  });
}

export async function getSaleByClientUuid(storeId: number, clientUuid: string) {
  const result = await pool.query(
    `SELECT id FROM pos_sales WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, clientUuid]
  );
  if (result.rows.length === 0) return null;
  return getSale(storeId, Number(result.rows[0].id));
}

export async function completeSale(params: {
  storeId: number;
  staffId: number;
  items: CompleteSaleItemInput[];
  payments: CompleteSalePaymentInput[];
  note?: string;
  cart_discount?: CartDiscountInput | null;
  customer_id?: number | null;
  client_uuid?: string | null;
}) {
  if (!params.items?.length) throw new Error('Cart is empty');
  if (!params.payments?.length) throw new Error('Payment required');

  const clientUuid = params.client_uuid?.trim() || null;
  if (clientUuid) {
    const existing = await getSaleByClientUuid(params.storeId, clientUuid);
    if (existing) return existing;
  }

  if (params.customer_id) {
    const customer = await getCustomer(params.storeId, params.customer_id);
    if (!customer) throw new Error('Customer not found');
  }

  const qtyByVariant = new Map<number, number>();
  for (const item of params.items) {
    if (!item.variant_id || item.quantity <= 0) {
      throw new Error('Invalid cart item');
    }
    qtyByVariant.set(
      item.variant_id,
      (qtyByVariant.get(item.variant_id) ?? 0) + item.quantity
    );
  }

  let paymentsTotal = 0;
  for (const payment of params.payments) {
    if (payment.amount_cents <= 0) throw new Error('Invalid payment amount');
    if (payment.method !== 'cash' && payment.method !== 'card' && payment.method !== 'qr') {
      throw new Error('Invalid payment method');
    }
    paymentsTotal += payment.amount_cents;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const variantIds = [...qtyByVariant.keys()];
    const variantsResult = await client.query(
      `SELECT v.id, v.price_cents, v.compare_at_cents, v.size, v.color, p.name AS product_name
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND v.id = ANY($2::bigint[]) AND v.is_active = TRUE`,
      [params.storeId, variantIds]
    );

    if (variantsResult.rows.length !== variantIds.length) {
      throw new Error('Some variants not found or inactive');
    }

    const variantMap = new Map(variantsResult.rows.map((row) => [Number(row.id), row]));
    let subtotal = 0;
    const draftLines: Array<{
      variant_id: number;
      product_name: string;
      variant_label: string;
      quantity: number;
      unit_price_cents: number;
      compare_at_unit_cents: number | null;
      pre_discount_total: number;
      has_product_discount: boolean;
    }> = [];

    for (const [variantId, quantity] of qtyByVariant) {
      const variant = variantMap.get(variantId)!;
      const unit = Number(variant.price_cents);
      const compareAt =
        variant.compare_at_cents == null ? null : Number(variant.compare_at_cents);
      const pre = unit * quantity;
      subtotal += pre;
      draftLines.push({
        variant_id: variantId,
        product_name: variant.product_name,
        variant_label: variantLabel(variant.size, variant.color),
        quantity,
        unit_price_cents: unit,
        compare_at_unit_cents: compareAt,
        pre_discount_total: pre,
        has_product_discount: compareAt != null,
      });
    }

    const { lineDiscounts, cartDiscountCents } = allocateCartDiscount(
      draftLines,
      params.cart_discount
    );

    const lineItems = draftLines.map((line, i) => ({
      ...line,
      line_discount_cents: lineDiscounts[i],
      line_total_cents: line.pre_discount_total - lineDiscounts[i],
    }));

    const total = lineItems.reduce((s, l) => s + l.line_total_cents, 0);

    if (paymentsTotal < total) {
      throw new Error('Insufficient payment');
    }

    const discountType = params.cart_discount?.type ?? null;
    const discountValue =
      params.cart_discount != null ? params.cart_discount.value : null;

    const receiptNumber = await nextReceiptNumber(client, params.storeId);
    const saleResult = await client.query(
      `INSERT INTO pos_sales
         (store_id, staff_id, receipt_number, status, subtotal_cents, total_cents, note,
          customer_id, cart_discount_type, cart_discount_value, cart_discount_cents, client_uuid)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        params.storeId,
        params.staffId,
        receiptNumber,
        subtotal,
        total,
        params.note ?? null,
        params.customer_id ?? null,
        discountType,
        discountValue,
        cartDiscountCents,
        clientUuid,
      ]
    );
    const sale = saleResult.rows[0];
    const saleId = Number(sale.id);

    for (const line of lineItems) {
      await client.query(
        `INSERT INTO pos_sale_items
           (sale_id, store_id, variant_id, product_name, variant_label,
            quantity, unit_price_cents, line_total_cents,
            compare_at_unit_cents, line_discount_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          saleId,
          params.storeId,
          line.variant_id,
          line.product_name,
          line.variant_label,
          line.quantity,
          line.unit_price_cents,
          line.line_total_cents,
          line.compare_at_unit_cents,
          line.line_discount_cents,
        ]
      );

      await applyStockDelta(client, {
        storeId: params.storeId,
        variantId: line.variant_id,
        delta: -line.quantity,
        reason: 'sale',
        staffId: params.staffId,
        referenceType: 'sale',
        referenceId: saleId,
      });
    }

    for (const payment of params.payments) {
      await client.query(
        `INSERT INTO pos_payments (sale_id, store_id, method, amount_cents, provider_ref)
         VALUES ($1, $2, $3, $4, $5)`,
        [saleId, params.storeId, payment.method, payment.amount_cents, payment.provider_ref ?? null]
      );
    }

    await client.query('COMMIT');
    return getSale(params.storeId, saleId);
  } catch (error) {
    await client.query('ROLLBACK');
    const unique =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505';
    if (unique && clientUuid) {
      const existing = await getSaleByClientUuid(params.storeId, clientUuid);
      if (existing) return existing;
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getSale(storeId: number, saleId: number) {
  const saleResult = await pool.query(
    `SELECT s.*, st.display_name AS staff_name,
            c.name AS customer_name, c.phone AS customer_phone
     FROM pos_sales s
     JOIN pos_staff st ON st.id = s.staff_id
     LEFT JOIN pos_customers c ON c.id = s.customer_id
     WHERE s.id = $1 AND s.store_id = $2`,
    [saleId, storeId]
  );
  if (saleResult.rows.length === 0) return null;
  const sale = saleResult.rows[0];

  const items = await pool.query(
    `SELECT * FROM pos_sale_items WHERE sale_id = $1 ORDER BY id`,
    [saleId]
  );
  const payments = await pool.query(
    `SELECT * FROM pos_payments WHERE sale_id = $1 ORDER BY id`,
    [saleId]
  );
  const refunds = await pool.query(
    `SELECT r.*, st.display_name AS staff_name
     FROM pos_refunds r
     JOIN pos_staff st ON st.id = r.staff_id
     WHERE r.sale_id = $1
     ORDER BY r.id`,
    [saleId]
  );

  return {
    id: Number(sale.id),
    store_id: Number(sale.store_id),
    staff_id: Number(sale.staff_id),
    staff_name: sale.staff_name,
    customer_id: sale.customer_id == null ? null : Number(sale.customer_id),
    customer_name: sale.customer_name ?? null,
    customer_phone: sale.customer_phone ?? null,
    receipt_number: sale.receipt_number,
    client_uuid: sale.client_uuid ?? null,
    status: sale.status,
    subtotal_cents: Number(sale.subtotal_cents),
    total_cents: Number(sale.total_cents),
    cart_discount_type: sale.cart_discount_type ?? null,
    cart_discount_value:
      sale.cart_discount_value == null ? null : Number(sale.cart_discount_value),
    cart_discount_cents: Number(sale.cart_discount_cents ?? 0),
    refunded_cents: Number(sale.refunded_cents),
    note: sale.note,
    created_at: sale.created_at,
    voided_at: sale.voided_at,
    items: items.rows.map((row) => ({
      id: Number(row.id),
      variant_id: Number(row.variant_id),
      product_name: row.product_name,
      variant_label: row.variant_label,
      quantity: Number(row.quantity),
      unit_price_cents: Number(row.unit_price_cents),
      compare_at_unit_cents:
        row.compare_at_unit_cents == null ? null : Number(row.compare_at_unit_cents),
      line_discount_cents: Number(row.line_discount_cents ?? 0),
      line_total_cents: Number(row.line_total_cents),
      refunded_quantity: Number(row.refunded_quantity),
    })),
    payments: payments.rows.map((row) => ({
      id: Number(row.id),
      method: row.method,
      amount_cents: Number(row.amount_cents),
      confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    })),
    refunds: refunds.rows.map((row) => ({
      id: Number(row.id),
      refund_number: row.refund_number ?? null,
      client_uuid: row.client_uuid ?? null,
      method: row.method ?? null,
      total_cents: Number(row.total_cents),
      reason: row.reason,
      staff_name: row.staff_name,
      created_at: row.created_at,
    })),
  };
}

export async function listSales(
  storeId: number,
  opts: { limit?: number; from?: Date; to?: Date } = {}
) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const params: unknown[] = [storeId];
  const conditions = ['s.store_id = $1'];

  if (opts.from) {
    params.push(opts.from);
    conditions.push(`s.created_at >= $${params.length}`);
  }
  if (opts.to) {
    params.push(opts.to);
    conditions.push(`s.created_at < $${params.length}`);
  }

  params.push(limit);
  const result = await pool.query(
    `SELECT s.*, st.display_name AS staff_name, c.name AS customer_name,
            EXISTS (
              SELECT 1 FROM pos_payments p
              WHERE p.sale_id = s.id AND p.method = 'qr' AND p.confirmed_at IS NULL
            ) AS qr_pending
     FROM pos_sales s
     JOIN pos_staff st ON st.id = s.staff_id
     LEFT JOIN pos_customers c ON c.id = s.customer_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map((sale) => ({
    id: Number(sale.id),
    receipt_number: sale.receipt_number,
    client_uuid: sale.client_uuid ?? null,
    status: sale.status,
    total_cents: Number(sale.total_cents),
    refunded_cents: Number(sale.refunded_cents),
    staff_name: sale.staff_name,
    customer_name: sale.customer_name ?? null,
    created_at: sale.created_at,
    qr_pending: Boolean(sale.qr_pending),
  }));
}

/**
 * Discards a receipt outright, returning every line to stock.
 *
 * Reserved for the pre-fiscalisation case: once ПРРО is wired up a receipt the
 * tax service has seen can no longer be cancelled, only refunded, so the UI
 * goes through `refundSale` instead. Kept because that "not fiscalised yet"
 * path is exactly what fiscalisation will need.
 */
export async function voidSale(params: {
  storeId: number;
  saleId: number;
  staffId: number;
}) {
  const client = await pool.connect();
  let alreadyVoided = false;
  try {
    await client.query('BEGIN');

    const saleResult = await client.query(
      `SELECT * FROM pos_sales WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.saleId, params.storeId]
    );
    if (saleResult.rows.length === 0) throw new Error('Sale not found');
    const sale = saleResult.rows[0];

    // Idempotent by design: the offline cashier queues voids in its outbox and
    // may replay the same request after a network blip. Re-voiding is a no-op
    // that returns the sale, not an error — mirrors completeSale/client_uuid.
    if (sale.status === 'voided') {
      await client.query('ROLLBACK');
      alreadyVoided = true;
      return getSale(params.storeId, params.saleId);
    }
    if (sale.status !== 'completed') {
      throw new Error('Only completed sales can be voided');
    }
    if (Number(sale.refunded_cents) > 0) {
      throw new Error('Cannot void a sale with refunds');
    }

    const items = await client.query(
      `SELECT * FROM pos_sale_items WHERE sale_id = $1 FOR UPDATE`,
      [params.saleId]
    );

    for (const item of items.rows) {
      await applyStockDelta(client, {
        storeId: params.storeId,
        variantId: Number(item.variant_id),
        delta: Number(item.quantity),
        reason: 'void',
        staffId: params.staffId,
        referenceType: 'sale',
        referenceId: params.saleId,
      });
    }

    await client.query(
      `UPDATE pos_sales
       SET status = 'voided', voided_at = NOW()
       WHERE id = $1`,
      [params.saleId]
    );

    await client.query('COMMIT');
    return getSale(params.storeId, params.saleId);
  } catch (error) {
    if (!alreadyVoided) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const REFUND_METHODS: RefundMethod[] = ['cash', 'card', 'qr'];

export async function getRefundByClientUuid(storeId: number, clientUuid: string) {
  const result = await pool.query(
    `SELECT sale_id FROM pos_refunds WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, clientUuid]
  );
  if (result.rows.length === 0) return null;
  return getSale(storeId, Number(result.rows[0].sale_id));
}

export async function refundSale(params: {
  storeId: number;
  saleId: number;
  staffId: number;
  items: RefundItemInput[];
  reason?: string;
  method?: RefundMethod | null;
  client_uuid?: string | null;
}) {
  if (!params.items?.length) throw new Error('Refund items required');

  const clientUuid = params.client_uuid?.trim() || null;
  if (clientUuid) {
    const existing = await getRefundByClientUuid(params.storeId, clientUuid);
    if (existing) return existing;
  }

  const method = params.method ?? null;
  if (method && !REFUND_METHODS.includes(method)) {
    throw new Error('Invalid refund method');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleResult = await client.query(
      `SELECT * FROM pos_sales WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.saleId, params.storeId]
    );
    if (saleResult.rows.length === 0) throw new Error('Sale not found');
    const sale = saleResult.rows[0];
    if (sale.status === 'voided') throw new Error('Cannot refund a voided sale');
    if (sale.status === 'refunded') throw new Error('Sale already fully refunded');

    const itemsResult = await client.query(
      `SELECT * FROM pos_sale_items WHERE sale_id = $1 FOR UPDATE`,
      [params.saleId]
    );
    const itemMap = new Map(itemsResult.rows.map((row) => [Number(row.id), row]));

    let refundTotal = 0;
    const refundLines: Array<{
      sale_item_id: number;
      variant_id: number;
      quantity: number;
      unit_price_cents: number;
      line_total_cents: number;
    }> = [];

    for (const input of params.items) {
      const item = itemMap.get(input.sale_item_id);
      if (!item) throw new Error(`Sale item ${input.sale_item_id} not found`);
      if (input.quantity <= 0) throw new Error('Invalid refund quantity');

      const already = Number(item.refunded_quantity);
      const available = Number(item.quantity) - already;
      if (input.quantity > available) {
        throw new Error(`Cannot refund more than available for item ${input.sale_item_id}`);
      }

      // Refund against the discounted line total, and cumulatively, so the
      // units of a line always add back up to exactly what was charged.
      const lineTotal = refundLineAmount(
        Number(item.line_total_cents),
        Number(item.quantity),
        already,
        input.quantity
      );
      refundTotal += lineTotal;
      refundLines.push({
        sale_item_id: Number(item.id),
        variant_id: Number(item.variant_id),
        quantity: input.quantity,
        unit_price_cents: Number(item.unit_price_cents),
        line_total_cents: lineTotal,
      });
    }

    const refundNumber = await nextRefundNumber(client, params.storeId);
    const refundResult = await client.query(
      `INSERT INTO pos_refunds
         (sale_id, store_id, staff_id, total_cents, reason, client_uuid, refund_number, method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        params.saleId,
        params.storeId,
        params.staffId,
        refundTotal,
        params.reason ?? null,
        clientUuid,
        refundNumber,
        method,
      ]
    );
    const refundId = Number(refundResult.rows[0].id);

    for (const line of refundLines) {
      await client.query(
        `INSERT INTO pos_refund_items
           (refund_id, sale_item_id, variant_id, quantity, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          refundId,
          line.sale_item_id,
          line.variant_id,
          line.quantity,
          line.unit_price_cents,
          line.line_total_cents,
        ]
      );

      await client.query(
        `UPDATE pos_sale_items
         SET refunded_quantity = refunded_quantity + $1
         WHERE id = $2`,
        [line.quantity, line.sale_item_id]
      );

      await applyStockDelta(client, {
        storeId: params.storeId,
        variantId: line.variant_id,
        delta: line.quantity,
        reason: 'refund',
        staffId: params.staffId,
        referenceType: 'refund',
        referenceId: refundId,
      });
    }

    const newRefunded = Number(sale.refunded_cents) + refundTotal;
    const fullyRefunded = newRefunded >= Number(sale.total_cents);
    await client.query(
      `UPDATE pos_sales
       SET refunded_cents = $1,
           status = $2
       WHERE id = $3`,
      [newRefunded, fullyRefunded ? 'refunded' : 'partially_refunded', params.saleId]
    );

    await client.query('COMMIT');
    return getSale(params.storeId, params.saleId);
  } catch (error) {
    await client.query('ROLLBACK');
    // Two tills replaying the same refund can collide on the client_uuid index.
    const unique =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505';
    if (unique && clientUuid) {
      const existing = await getRefundByClientUuid(params.storeId, clientUuid);
      if (existing) return existing;
    }
    throw error;
  } finally {
    client.release();
  }
}
