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

import { ExciseError } from './excise.js';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import {
  consumeStockForLine,
  priceOfComposition,
  returnStockForLine,
} from './composites.service.js';
import type { ComponentInput } from './composites.service.js';
import * as bills from './bills.service.js';
import { ALLOWED_FROM, explainPrepRefusal, KitchenNotFound, STATIONS_SQL } from './kitchen.service.js';
import type { PrepStatusRow } from './kitchen.service.js';
import * as modifiers from './modifiers.service.js';
import { customBouquetLabel } from './sales.service.js';
import { newPourContext, undoRoundPours } from './bottles.service.js';
import { ROUND_PRINT_LEASE } from './round-print.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Movements a round makes point back at it, so a report can name the round. */
const ROUND_REFERENCE = 'bill_round';

export interface FireRoundInput {
  storeId: number;
  staffId: number;
  billId: number;
  clientUuid?: unknown;
}

export interface FireRoundTxInput {
  storeId: number;
  /** Null only for a guest's order sent straight to the kitchen (QR menu Q9). */
  staffId: number | null;
  billId: number;
  clientUuid?: unknown;
  /**
   * Fire only these draft lines. A guest's auto-sent order fires its own rows
   * and nothing the waiter is still typing; a waiter's «На кухню» passes none
   * and sends the whole draft, as it always has.
   */
  itemIds?: number[];
  /** The guest order this round came from, when a guest fired it. */
  guestOrderId?: number | null;
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fireRoundTx(client, input);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return bills.getBill(input.storeId, input.billId);
}

/**
 * The body of `fireRound` for a caller that already holds a transaction — a
 * guest's auto-sent order opens the bill, adds its lines and fires them in
 * ONE, so a refusal anywhere leaves no bill, no line and no stock moved. The
 * caller owns BEGIN/COMMIT. Returns the round, or the earlier one when the
 * same `client_uuid` already fired.
 */
export async function fireRoundTx(
  client: PoolClient,
  input: FireRoundTxInput
): Promise<{ roundId: number; replay: boolean }> {
  const clientUuid =
    input.clientUuid == null ? null : String(input.clientUuid).trim().toLowerCase();
  if (clientUuid !== null && !UUID_RE.test(clientUuid)) {
    throw new bills.BillError('client_uuid має бути UUID');
  }
  if (input.staffId == null && input.guestOrderId == null) {
    throw new bills.BillError('Раунд відправляє офіціант');
  }

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
    if (replay.rows.length > 0) return { roundId: Number(replay.rows[0].id), replay: true };
  }

  const only = input.itemIds ?? null;
  const draft = await client.query(
    `SELECT i.id, i.variant_id, i.quantity, i.components, i.modifiers, i.note,
            v.label, v.unit, v.price_cents, v.compare_at_cents,
            p.name AS product_name, p.excise_per_unit,
            (SELECT COUNT(*) FROM pos_excise_labels l
              WHERE l.bill_item_id = i.id AND l.released_at IS NULL AND l.sale_item_id IS NULL)::int AS stamps
       FROM pos_bill_items i
       JOIN pos_variants v ON v.id = i.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE i.bill_id = $1 AND i.round_id IS NULL
        AND ($2::bigint[] IS NULL OR i.id = ANY($2::bigint[]))
      ORDER BY i.sort_order ASC, i.id ASC`,
    [input.billId, only]
  );
  if (draft.rows.length === 0) {
    throw new bills.BillConflict('Немає чого відправляти — додайте позиції');
  }
  // A bottle sold whole goes to the table only with its stamp scanned (ДК4-Б,
  // Д4): the receipt that pays it later must carry it.
  for (const row of draft.rows) {
    if (row.excise_per_unit && Number(row.stamps) !== Number(row.quantity)) {
      throw new ExciseError(
        `«${row.product_name}»: скануйте акцизну марку кожної пляшки — потрібно ${row.quantity}, є ${row.stamps}`,
        'excise_labels_needed',
        409,
        { item_id: Number(row.id), needed: Number(row.quantity), have: Number(row.stamps) }
      );
    }
  }

  const round = await client.query(
    `INSERT INTO pos_bill_rounds
       (store_id, bill_id, seq, fired_by, fired_by_guest, guest_order_id, client_uuid)
     VALUES ($1, $2,
             (SELECT COALESCE(MAX(seq), 0) + 1 FROM pos_bill_rounds WHERE bill_id = $2),
             $3, $4, $5, $6)
     RETURNING id`,
    [
      input.storeId,
      input.billId,
      input.staffId,
      input.staffId == null,
      input.guestOrderId ?? null,
      clientUuid,
    ]
  );
  const roundId = Number(round.rows[0].id);
  // What the round pours from the bar's open bottles (ДК5-Б): it never waits
  // for a stamp — what does not fit queues for the bar to scan the next
  // bottle, and the bill is not paid until it has (Д18).
  const pour = newPourContext({ storeId: input.storeId, staffId: input.staffId, mode: 'queue' });

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
    const liveDelta = await modifiers.liveDeltaCents(client, input.storeId, snapshot, variantId);
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
      pour,
    });
  }

  await queueRoundPrints(client, input.storeId, roundId);

  await client.query(`UPDATE pos_bills SET updated_at = NOW() WHERE id = $1`, [input.billId]);
  return { roundId, replay: false };
}

/**
 * Put the round on the stations' print queue (`pos_round_prints`, migration
 * 109): one job per station its lines are made at, from the products' tags
 * exactly as the kitchen board reads them. A line with no station goes to the
 * kitchen, never nowhere; a store whose tags name no station gets one kitchen
 * job, printed with no heading. Inside the firing transaction, so a round that
 * rolls back leaves no job, and only for a NEW round — a replayed tap never
 * prints twice.
 */
async function queueRoundPrints(client: PoolClient, storeId: number, roundId: number): Promise<void> {
  await client.query(
    `INSERT INTO pos_round_prints (store_id, round_id, station)
     SELECT DISTINCT $1::bigint, $2::bigint, st.station
       FROM pos_bill_items i
       CROSS JOIN LATERAL unnest(
         CASE WHEN EXISTS (SELECT 1 FROM pos_tags t WHERE t.store_id = $1 AND t.station IS NOT NULL)
              THEN COALESCE((${STATIONS_SQL})::text[], ARRAY['kitchen']::text[])
              ELSE ARRAY['kitchen']::text[]
         END
       ) AS st(station)
      WHERE i.round_id = $2
     ON CONFLICT DO NOTHING`,
    [storeId, roundId]
  );
}

/**
 * A paper «СКАСОВАНО» (migration 110) for every station that already has the
 * round on paper — its ticket printed, or taken by a desktop within the lease
 * and maybe coming out of the printer right now. A station whose ticket was
 * never taken gets nothing: the queue skips a cancelled round, so the cook
 * never saw it and needs no second slip to ignore.
 */
async function queueRoundCancelPrints(client: PoolClient, storeId: number, roundId: number): Promise<void> {
  await client.query(
    `INSERT INTO pos_round_prints (store_id, round_id, station, kind)
     SELECT store_id, round_id, station, 'cancel'
       FROM pos_round_prints
      WHERE store_id = $1 AND round_id = $2 AND kind = 'fire'
        AND (printed_at IS NOT NULL OR claimed_at > NOW() - ${ROUND_PRINT_LEASE})
     ON CONFLICT DO NOTHING`,
    [storeId, roundId]
  );
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
    // The bill first (the order every bill writer takes), and only an open
    // one: a paid bill's round is a refund, never a cancel.
    await bills.loadOpenBill(client, params.storeId, params.billId);
    const round = await client.query(
      `SELECT r.id, r.prep_status, r.cancelled_at
         FROM pos_bill_rounds r
        WHERE r.store_id = $1 AND r.bill_id = $2 AND r.id = $3
        FOR UPDATE`,
      [params.storeId, params.billId, params.roundId]
    );
    if (round.rows.length === 0) throw new bills.BillNotFound('Раунд не знайдено');
    const row = round.rows[0];
    if (row.cancelled_at != null) throw new bills.BillConflict('Раунд уже скасовано');
    if (row.prep_status === 'served') {
      throw new bills.BillConflict('Раунд уже видано — це повернення, а не скасування');
    }
    // A plate of this round may already be on a receipt (a split pays fired
    // lines whatever the kitchen's state). Cancelling would credit its stock
    // back while the fiscal receipt says it was sold.
    const paid = await client.query(
      `SELECT 1 FROM pos_bill_items WHERE round_id = $1 AND sale_id IS NOT NULL LIMIT 1`,
      [params.roundId]
    );
    if (paid.rows.length > 0) {
      throw new bills.BillConflict('Частину раунду вже оплачено — це повернення, а не скасування');
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
    await client.query(`UPDATE pos_bills SET updated_at = NOW() WHERE id = $1`, [params.billId]);
    await queueRoundCancelPrints(client, params.storeId, params.roundId);
    // Nor was it poured (ДК5-Б): the millilitres go back into their bottles,
    // and its pours stop waiting for the bar.
    await undoRoundPours(client, params.storeId, params.roundId);
    // Bottles that never reached the table are not sold: their stamps are free (ДК4-Б).
    await client.query(
      `UPDATE pos_excise_labels SET released_at = NOW()
        WHERE bill_item_id IN (SELECT id FROM pos_bill_items WHERE round_id = $1)
          AND sale_item_id IS NULL AND released_at IS NULL`,
      [params.roundId]
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
