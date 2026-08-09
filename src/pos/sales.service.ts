// src/pos/sales.service.ts

import { pool } from '../db.js';
import { applyStockDelta } from './stock.service.js';
import type {
  CompleteSaleItemInput,
  CompleteSalePaymentInput,
  RefundItemInput,
} from './types.js';

function variantLabel(size: string, color: string): string {
  return [color, size].filter(Boolean).join(' / ');
}

async function nextReceiptNumber(
  client: { query: typeof pool.query },
  storeId: number
): Promise<string> {
  const result = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM pos_sales WHERE store_id = $1`,
    [storeId]
  );
  const n = Number(result.rows[0].cnt) + 1;
  return `R-${String(n).padStart(5, '0')}`;
}

export async function completeSale(params: {
  storeId: number;
  staffId: number;
  items: CompleteSaleItemInput[];
  payments: CompleteSalePaymentInput[];
  note?: string;
}) {
  if (!params.items?.length) throw new Error('Cart is empty');
  if (!params.payments?.length) throw new Error('Payment required');

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
    if (payment.method !== 'cash' && payment.method !== 'card') {
      throw new Error('Invalid payment method');
    }
    paymentsTotal += payment.amount_cents;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const variantIds = [...qtyByVariant.keys()];
    const variantsResult = await client.query(
      `SELECT v.id, v.price_cents, v.size, v.color, p.name AS product_name
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
    const lineItems: Array<{
      variant_id: number;
      product_name: string;
      variant_label: string;
      quantity: number;
      unit_price_cents: number;
      line_total_cents: number;
    }> = [];

    for (const [variantId, quantity] of qtyByVariant) {
      const variant = variantMap.get(variantId)!;
      const unit = Number(variant.price_cents);
      const lineTotal = unit * quantity;
      subtotal += lineTotal;
      lineItems.push({
        variant_id: variantId,
        product_name: variant.product_name,
        variant_label: variantLabel(variant.size, variant.color),
        quantity,
        unit_price_cents: unit,
        line_total_cents: lineTotal,
      });
    }

    if (paymentsTotal < subtotal) {
      throw new Error('Insufficient payment');
    }

    const receiptNumber = await nextReceiptNumber(client, params.storeId);
    const saleResult = await client.query(
      `INSERT INTO pos_sales
         (store_id, staff_id, receipt_number, status, subtotal_cents, total_cents, note)
       VALUES ($1, $2, $3, 'completed', $4, $4, $5)
       RETURNING *`,
      [params.storeId, params.staffId, receiptNumber, subtotal, params.note ?? null]
    );
    const sale = saleResult.rows[0];
    const saleId = Number(sale.id);

    for (const line of lineItems) {
      await client.query(
        `INSERT INTO pos_sale_items
           (sale_id, store_id, variant_id, product_name, variant_label,
            quantity, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          saleId,
          params.storeId,
          line.variant_id,
          line.product_name,
          line.variant_label,
          line.quantity,
          line.unit_price_cents,
          line.line_total_cents,
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

    // Cash change is not stored as negative; only tendered amounts that cover the sale.
    // For mixed tenders we store exact payment lines; overpay on cash is allowed (change).
    let remaining = subtotal;
    for (const payment of params.payments) {
      const applied =
        payment.method === 'cash'
          ? Math.min(payment.amount_cents, Math.max(remaining, payment.amount_cents))
          : Math.min(payment.amount_cents, remaining || payment.amount_cents);

      // Store the tendered amount as provided (cashier accountability)
      await client.query(
        `INSERT INTO pos_payments (sale_id, store_id, method, amount_cents)
         VALUES ($1, $2, $3, $4)`,
        [saleId, params.storeId, payment.method, payment.amount_cents]
      );
      remaining -= Math.min(payment.amount_cents, remaining);
      void applied;
    }

    await client.query('COMMIT');
    return getSale(params.storeId, saleId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSale(storeId: number, saleId: number) {
  const saleResult = await pool.query(
    `SELECT s.*, st.display_name AS staff_name
     FROM pos_sales s
     JOIN pos_staff st ON st.id = s.staff_id
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
    receipt_number: sale.receipt_number,
    status: sale.status,
    subtotal_cents: Number(sale.subtotal_cents),
    total_cents: Number(sale.total_cents),
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
      line_total_cents: Number(row.line_total_cents),
      refunded_quantity: Number(row.refunded_quantity),
    })),
    payments: payments.rows.map((row) => ({
      id: Number(row.id),
      method: row.method,
      amount_cents: Number(row.amount_cents),
    })),
    refunds: refunds.rows.map((row) => ({
      id: Number(row.id),
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
    `SELECT s.*, st.display_name AS staff_name
     FROM pos_sales s
     JOIN pos_staff st ON st.id = s.staff_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map((sale) => ({
    id: Number(sale.id),
    receipt_number: sale.receipt_number,
    status: sale.status,
    total_cents: Number(sale.total_cents),
    refunded_cents: Number(sale.refunded_cents),
    staff_name: sale.staff_name,
    created_at: sale.created_at,
  }));
}

export async function voidSale(params: {
  storeId: number;
  saleId: number;
  staffId: number;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleResult = await client.query(
      `SELECT * FROM pos_sales WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [params.saleId, params.storeId]
    );
    if (saleResult.rows.length === 0) throw new Error('Sale not found');
    const sale = saleResult.rows[0];
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
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function refundSale(params: {
  storeId: number;
  saleId: number;
  staffId: number;
  items: RefundItemInput[];
  reason?: string;
}) {
  if (!params.items?.length) throw new Error('Refund items required');

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

      const unit = Number(item.unit_price_cents);
      const lineTotal = unit * input.quantity;
      refundTotal += lineTotal;
      refundLines.push({
        sale_item_id: Number(item.id),
        variant_id: Number(item.variant_id),
        quantity: input.quantity,
        unit_price_cents: unit,
        line_total_cents: lineTotal,
      });
    }

    const refundResult = await client.query(
      `INSERT INTO pos_refunds (sale_id, store_id, staff_id, total_cents, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [params.saleId, params.storeId, params.staffId, refundTotal, params.reason ?? null]
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
    throw error;
  } finally {
    client.release();
  }
}
