// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/stock.service.ts

import { pool } from '../db.js';
import { assertStockable } from './composites.service.js';
import type { StockReason, WriteoffReasonCode } from './types.js';

type DbClient = { query: typeof pool.query };

export async function adjustStock(params: {
  storeId: number;
  variantId: number;
  delta: number;
  staffId: number;
  note?: string;
}): Promise<{ variant_id: number; quantity: number }> {
  if (params.delta === 0) throw new Error('Delta cannot be zero');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertStockable(client, params.storeId, params.variantId);
    const next = await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: params.variantId,
      delta: params.delta,
      reason: 'adjust',
      staffId: params.staffId,
      note: params.note,
    });
    await client.query('COMMIT');
    return { variant_id: params.variantId, quantity: next };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyStockDelta(
  client: { query: typeof pool.query },
  params: {
    storeId: number;
    variantId: number;
    delta: number;
    reason: StockReason;
    staffId: number;
    referenceType?: string;
    referenceId?: number;
    note?: string;
    unitCostCents?: number | null;
    occurredAt?: Date | string;
  }
): Promise<number> {
  const stockResult = await client.query(
    `SELECT quantity FROM pos_stock
     WHERE variant_id = $1 AND store_id = $2
     FOR UPDATE`,
    [params.variantId, params.storeId]
  );

  if (stockResult.rows.length === 0) {
    throw new Error(`Stock not found for variant ${params.variantId}`);
  }

  const current = Number(stockResult.rows[0].quantity);
  const next = current + params.delta;
  // Offline cashiers may race another till; sales still complete (qty can go negative).
  if (next < 0 && params.reason !== 'sale') {
    throw new Error(`Insufficient stock for variant ${params.variantId}`);
  }

  await client.query(
    `UPDATE pos_stock
     SET quantity = $1, updated_at = NOW()
     WHERE variant_id = $2 AND store_id = $3`,
    [next, params.variantId, params.storeId]
  );

  await client.query(
    `INSERT INTO pos_stock_movements
       (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id,
        unit_cost_cents, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))`,
    [
      params.storeId,
      params.variantId,
      params.delta,
      params.reason,
      params.referenceType ?? null,
      params.referenceId ?? null,
      params.note ?? null,
      params.staffId,
      params.unitCostCents ?? null,
      params.occurredAt ?? null,
    ]
  );

  return next;
}

/**
 * The write-off counter — `СП-YYYY-NNNNN`, the same key `stock-documents`
 * and the florist's bench already draw from, so a write-off made from a
 * refund slots into the owner's list in sequence.
 */
export async function nextWriteoffNumber(client: DbClient, storeId: number): Promise<string> {
  const year = new Date().getFullYear();
  const counterKey = `writeoff_${year}`;
  await client.query(
    `INSERT INTO pos_store_counters (store_id, counter_key, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (store_id, counter_key) DO NOTHING`,
    [storeId, counterKey]
  );
  const result = await client.query(
    `UPDATE pos_store_counters
     SET next_value = next_value + 1
     WHERE store_id = $1 AND counter_key = $2
     RETURNING next_value - 1 AS seq`,
    [storeId, counterKey]
  );
  return `СП-${year}-${String(Number(result.rows[0].seq)).padStart(5, '0')}`;
}

/**
 * A write-off written and posted in one go, inside the caller's transaction.
 *
 * `createDocument` / `addLine` / `postDocument` each open their own
 * transaction, which is right for the owner's screen and wrong for a refund
 * that must take defective goods off the shelf in the SAME transaction that
 * put them back — a crash in between would leave a torn jacket counted as
 * sellable. Same shape as the bench's showcase write-off: the row is born
 * `posted`, each line carries the variant's purchase cost so the loss report
 * can price it, and the movement points back at the document so the owner's
 * reversal (`reverseDocument`) credits exactly these units.
 */
export async function writeOffPostedTx(
  client: DbClient,
  params: {
    storeId: number;
    staffId: number;
    reasonCode: WriteoffReasonCode;
    note: string;
    clientUuid: string | null;
    lines: Array<{ variantId: number; quantity: number }>;
  }
): Promise<{ documentId: number; docNumber: string }> {
  if (params.lines.length === 0) throw new Error('Write-off has no lines');
  const docNumber = await nextWriteoffNumber(client, params.storeId);
  const doc = await client.query(
    `INSERT INTO pos_stock_documents
       (store_id, type, status, doc_number, occurred_at, reason_code, note, created_by,
        posted_by, posted_at, client_uuid)
     VALUES ($1, 'writeoff', 'posted', $2, NOW(), $3, $4, $5, $5, NOW(), $6)
     RETURNING id`,
    [params.storeId, docNumber, params.reasonCode, params.note, params.staffId, params.clientUuid]
  );
  const documentId = Number(doc.rows[0].id);

  for (const line of params.lines) {
    if (line.quantity <= 0) continue;
    const variant = await client.query(
      `SELECT v.cost_cents, p.name
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       WHERE v.id = $1 AND v.store_id = $2`,
      [line.variantId, params.storeId]
    );
    const unitCost =
      variant.rows[0]?.cost_cents == null ? null : Number(variant.rows[0].cost_cents);
    await client.query(
      `INSERT INTO pos_stock_document_lines
         (document_id, store_id, variant_id, quantity, unit_cost_cents)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, params.storeId, line.variantId, line.quantity, unitCost]
    );
    try {
      await applyStockDelta(client, {
        storeId: params.storeId,
        variantId: line.variantId,
        delta: -line.quantity,
        reason: 'writeoff',
        staffId: params.staffId,
        referenceType: 'stock_document',
        referenceId: documentId,
        note: params.note,
        unitCostCents: unitCost,
      });
    } catch (error) {
      // Only reachable when the shelf was already below zero before the
      // units came back: the owner has a count to fix before a defect can
      // be written off against it.
      if (error instanceof Error && error.message.startsWith('Insufficient stock')) {
        const name = String(variant.rows[0]?.name ?? `#${line.variantId}`);
        throw new Error(
          `Залишок «${name}» відʼємний — спершу виправте залишок, потім оформлюйте брак`
        );
      }
      throw error;
    }
  }
  return { documentId, docNumber };
}

export async function listLowStock(storeId: number, threshold = 3) {
  const result = await pool.query(
    `SELECT v.id AS variant_id, p.name AS product_name, v.label, v.unit, s.quantity
     FROM pos_stock s
     JOIN pos_variants v ON v.id = s.variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE s.store_id = $1 AND s.quantity <= $2 AND v.is_active = TRUE
       -- Without this every derived composite would sit at 0 and permanently
       -- top the low-stock list, drowning the components that actually ran out.
       AND NOT (p.kind = 'composite' AND p.stock_mode = 'derived')
     ORDER BY s.quantity ASC, p.name ASC`,
    [storeId, threshold]
  );
  return result.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    product_name: row.product_name,
    label: row.label ?? '',
    unit: row.unit ?? '',
    quantity: Number(row.quantity),
  }));
}

export async function getVariantStock(storeId: number, variantId: number): Promise<number> {
  const result = await pool.query(
    `SELECT quantity FROM pos_stock WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  if (result.rows.length === 0) throw new Error('Stock row not found');
  return Number(result.rows[0].quantity);
}
