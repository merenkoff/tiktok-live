// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/rounds.service.ts — firing a round to the kitchen (phase К4c;
// migration 052, TechDocs/POS_TABLES.md §4.1–4.3, §9, §11).
//
// The round is the unit of truth on a bill. Not the bill and not the receipt:
// it is the round that flies to the kitchen, the round that moves stock, and
// the round that fixes the price. A bill is a sequence of rounds, and the
// cheque is who paid for it (К4d).
//
// Five things are easy to get backwards:
//
// 1. **Stock moves here, at fire time — not at payment.** The kitchen took the
//    ingredients when it got the ticket, and that is when the shelf must say
//    so; otherwise the stop-list by stock stops working in exactly the hour it
//    is needed, because two rooms order from the same kilogram that exists
//    once. The price of that decision is that cancelling a round has to give
//    the stock back as its own movement, which `cancelRound` does.
// 2. **The price is fixed here too**, for the same reason the pre-order lock
//    exists: a bill that lives three hours must not be silently repriced
//    mid-dinner by a menu edit. So the answers are re-priced at this moment,
//    not at the moment they were added — with one exception: an answer the
//    owner has since deleted keeps the delta it was added with, because that
//    is what the guest was promised, and it writes off nothing, exactly as a
//    handed-over pre-order does (К3f).
// 3. **The snapshot is the truth, and it is written per line.** What the round
//    actually took goes into `pos_bill_item_components` through the very same
//    function a sale uses; К4d then copies those rows into the sale without
//    moving stock again, and a refund reverses that copy. Nothing downstream
//    ever re-reads the recipe.
// 4. **Cancelling reverses the snapshot, never the recipe** — and is refused
//    once the round is `served`: a dish that was handed over is returned, not
//    cancelled, and returning it is a refund (К4d). The lines stay on the
//    cancelled round rather than falling back into the draft: what the kitchen
//    already started is a fact, not an edit.
// 5. **Firing is idempotent on `client_uuid`.** «На кухню» tapped twice on a
//    bad connection must not write off dinner twice.

import { pool } from '../db.js';
import {
  consumeStockForLine,
  priceOfComposition,
  returnStockForLine,
} from './composites.service.js';
import type { ComponentInput } from './composites.service.js';
import * as bills from './bills.service.js';
import { ALLOWED_FROM, explainPrepRefusal, KitchenNotFound } from './kitchen.service.js';
import type { PrepStatusRow } from './kitchen.service.js';
import * as modifiers from './modifiers.service.js';
import { customBouquetLabel } from './sales.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Movements a round makes point back at it, so a report can name the round. */
const ROUND_REFERENCE = 'bill_round';

export interface FireRoundInput {
  storeId: number;
  staffId: number;
  billId: number;
  clientUuid?: unknown;
}

/**
 * Send everything in the draft to the kitchen as one round.
 *
 * One transaction: the round row, then per line the locked price, the caption
 * snapshot and the stock movement with its own snapshot. A draft with nothing
 * in it is refused rather than producing an empty ticket the kitchen would
 * have to ignore.
 */
export async function fireRound(input: FireRoundInput): Promise<bills.Bill> {
  const clientUuid =
    input.clientUuid == null ? null : String(input.clientUuid).trim().toLowerCase();
  if (clientUuid !== null && !UUID_RE.test(clientUuid)) {
    throw new bills.BillError('client_uuid має бути UUID');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bill = await client.query(
      `SELECT status FROM pos_bills WHERE store_id = $1 AND id = $2 FOR UPDATE`,
      [input.storeId, input.billId]
    );
    if (bill.rows.length === 0) throw new bills.BillNotFound('Рахунок не знайдено');
    const status = String(bill.rows[0].status);
    if (status === 'paid') throw new bills.BillConflict('Рахунок уже оплачено');
    if (status === 'cancelled') throw new bills.BillConflict('Рахунок скасовано');

    // Rule 5: the same tap twice is the same round, never a second one.
    if (clientUuid) {
      const replay = await client.query(
        `SELECT id FROM pos_bill_rounds WHERE store_id = $1 AND client_uuid = $2`,
        [input.storeId, clientUuid]
      );
      if (replay.rows.length > 0) {
        await client.query('COMMIT');
        client.release();
        return await bills.getBill(input.storeId, input.billId);
      }
    }

    const draft = await client.query(
      `SELECT i.id, i.variant_id, i.quantity, i.components, i.modifiers, i.note,
              v.label, v.unit, v.price_cents, v.compare_at_cents,
              p.name AS product_name
         FROM pos_bill_items i
         JOIN pos_variants v ON v.id = i.variant_id
         JOIN pos_products p ON p.id = v.product_id
        WHERE i.bill_id = $1 AND i.round_id IS NULL
        ORDER BY i.sort_order ASC, i.id ASC`,
      [input.billId]
    );
    if (draft.rows.length === 0) {
      throw new bills.BillConflict('Немає чого відправляти — додайте позиції');
    }

    const round = await client.query(
      `INSERT INTO pos_bill_rounds (store_id, bill_id, seq, fired_by, client_uuid)
       VALUES ($1, $2,
               (SELECT COALESCE(MAX(seq), 0) + 1 FROM pos_bill_rounds WHERE bill_id = $2),
               $3, $4)
       RETURNING id`,
      [input.storeId, input.billId, input.staffId, clientUuid]
    );
    const roundId = Number(round.rows[0].id);

    for (const row of draft.rows) {
      const lineId = Number(row.id);
      const variantId = Number(row.variant_id);
      const quantity = Number(row.quantity);
      const components = (row.components as ComponentInput[] | null) ?? null;
      const snapshot = modifiers.parseLineModifierSnapshot(row.modifiers);

      // Rule 2: re-price the answers now, and fall back to what was promised
      // for one that no longer exists. `promisedLineModifiers` supplies the
      // names for the caption and — from the LIVE rows — what they write off,
      // so a deleted answer costs what it said and takes nothing off a shelf.
      const promised = await modifiers.promisedLineModifiers(client, input.storeId, snapshot);
      const liveDelta = await modifiers.liveDeltaCents(client, input.storeId, snapshot);
      const deltaCents =
        liveDelta ?? snapshot.reduce((sum, m) => sum + m.price_delta_cents, 0);

      let unitPrice: number;
      let caption: string;
      let compareAt: number | null;
      if (components?.length) {
        // Assembled at the counter: priced from its parts, exactly as a sale
        // prices one, and captioned by what went into it rather than by the
        // catalogue card every such plate shares.
        unitPrice = await priceOfComposition(client, input.storeId, components);
        caption = customBouquetLabel(components);
        compareAt = null;
      } else {
        unitPrice = Number(row.price_cents) + deltaCents;
        caption = modifiers.lineCaption(String(row.label ?? ''), promised.names);
        compareAt =
          row.compare_at_cents == null ? null : Number(row.compare_at_cents) + deltaCents;
      }
      if (unitPrice < 0) {
        throw new bills.BillError(`«${String(row.product_name)}» має відʼємну ціну`);
      }

      await client.query(
        `UPDATE pos_bill_items
            SET round_id = $2, unit_price_cents = $3, compare_at_unit_cents = $4,
                product_name = $5, variant_label = $6, unit = $7,
                modifiers = $8::jsonb
          WHERE id = $1`,
        [
          lineId,
          roundId,
          unitPrice,
          compareAt,
          String(row.product_name),
          caption,
          String(row.unit ?? ''),
          promised.snapshot.length ? JSON.stringify(promised.snapshot) : null,
        ]
      );

      // Rule 1 and 3 in one call: the shelf moves and the line remembers what
      // it took, through the same function `completeSale` uses.
      await consumeStockForLine(client, {
        storeId: input.storeId,
        target: 'bill',
        lineId,
        referenceType: ROUND_REFERENCE,
        referenceId: roundId,
        variantId,
        quantity,
        staffId: input.staffId,
        components: components ?? undefined,
        extra: promised.components,
      });
    }

    await client.query(`UPDATE pos_bills SET updated_at = NOW() WHERE id = $1`, [input.billId]);
    await client.query('COMMIT');
    client.release();
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
  return bills.getBill(input.storeId, input.billId);
}

/**
 * Take a round back: give the stock to the shelf and mark the round cancelled.
 *
 * Refused once it is `served` (rule 4). The reversal replays the line's own
 * snapshot, so a recipe edited between firing and cancelling cannot credit
 * back ingredients the kitchen never took.
 */
export async function cancelRound(params: {
  storeId: number;
  staffId: number;
  billId: number;
  roundId: number;
}): Promise<bills.Bill> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const round = await client.query(
      `SELECT r.id, r.prep_status, r.cancelled_at
         FROM pos_bill_rounds r
         JOIN pos_bills b ON b.id = r.bill_id
        WHERE r.store_id = $1 AND r.bill_id = $2 AND r.id = $3
        FOR UPDATE OF r`,
      [params.storeId, params.billId, params.roundId]
    );
    if (round.rows.length === 0) throw new bills.BillNotFound('Раунд не знайдено');
    const row = round.rows[0];
    if (row.cancelled_at != null) throw new bills.BillConflict('Раунд уже скасовано');
    if (row.prep_status === 'served') {
      throw new bills.BillConflict('Раунд уже видано — це повернення, а не скасування');
    }

    const lines = await client.query(
      `SELECT id, variant_id, quantity FROM pos_bill_items WHERE round_id = $1`,
      [params.roundId]
    );
    for (const line of lines.rows) {
      await returnStockForLine(client, {
        storeId: params.storeId,
        target: 'bill',
        lineId: Number(line.id),
        variantId: Number(line.variant_id),
        quantity: Number(line.quantity),
        reason: 'void',
        staffId: params.staffId,
        referenceType: ROUND_REFERENCE,
        referenceId: params.roundId,
      });
    }

    await client.query(
      `UPDATE pos_bill_rounds SET cancelled_at = NOW(), cancelled_by = $2 WHERE id = $1`,
      [params.roundId, params.staffId]
    );
    await client.query('COMMIT');
    client.release();
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
  return bills.getBill(params.storeId, params.billId);
}

/**
 * One tap on the board, for a round instead of a sale.
 *
 * The same two steps and the same words as `setPrepStatus`: only the table
 * and the «this one is gone» predicate differ — `cancelled_at IS NOT NULL`
 * where a sale says `status = 'voided'`.
 */
export async function setRoundPrep(params: {
  storeId: number;
  roundId: number;
  status: 'ready' | 'served';
}): Promise<PrepStatusRow> {
  const updated = await pool.query(
    `UPDATE pos_bill_rounds
     SET prep_status = $3::text,
         ready_at = CASE WHEN $3::text = 'ready' THEN NOW() ELSE ready_at END,
         served_at = CASE WHEN $3::text = 'served' THEN NOW() ELSE served_at END
     WHERE id = $1 AND store_id = $2
       AND cancelled_at IS NULL
       AND prep_status = ANY($4::text[])
     RETURNING id, prep_status, ready_at, served_at`,
    [params.roundId, params.storeId, params.status, ALLOWED_FROM[params.status]]
  );
  if (updated.rows.length > 0) {
    const row = updated.rows[0];
    return {
      id: Number(row.id),
      prep_status: row.prep_status === 'new' || row.prep_status === 'ready' ? row.prep_status : 'served',
      ready_at: row.ready_at ? new Date(row.ready_at as string).toISOString() : null,
      served_at: row.served_at ? new Date(row.served_at as string).toISOString() : null,
    };
  }

  const current = await pool.query(
    `SELECT id, prep_status, ready_at, served_at, cancelled_at
     FROM pos_bill_rounds WHERE id = $1 AND store_id = $2`,
    [params.roundId, params.storeId]
  );
  const row = current.rows[0];
  return explainPrepRefusal({
    row,
    wanted: params.status,
    gone: row?.cancelled_at != null,
    notFoundMessage: 'Раунд не знайдено',
    goneMessage: 'Раунд скасовано',
  });
}

/** Re-exported so a route can map it without importing the kitchen service. */
export { KitchenNotFound };
