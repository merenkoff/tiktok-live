// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/kitchen.service.ts — the kitchen's side of the counter (café phase
// К3a; migration 049, TechDocs/POS_CAFE.md §10, POS_VERTICALS.md §7n).
//
// A paid café order is `new` until the kitchen taps «Готово» (`ready`), and
// `ready` until the barista hands it over and taps «Видано» (`served`). Two
// taps, no clock: nothing here moves an order by time, and the board hides
// one only when its row says `served`. A void is the kitchen's «cancel» — the
// list leaves a voided sale out, and the next poll drops the card.
//
// The board shows the store's current day, not «everything unserved»: order
// numbers restart daily, and yesterday's «№ 3» next to today's «№ 3» is worse
// than a stale row nobody sees. That row keeps its `new` — no sweep writes
// `served_at`, because that column means «somebody handed it over».

import { pool } from '../db.js';
import { readStoreClock } from './core/storeClock.js';
import type { PrepStatus } from './types.js';

export class KitchenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KitchenError';
  }
}

/** The order is not this store's, or does not exist at all. */
export class KitchenNotFound extends KitchenError {
  constructor(message: string) {
    super(message);
    this.name = 'KitchenNotFound';
  }
}

export interface KitchenOrderItem {
  id: number;
  product_name: string;
  /** The caption the sale line carries — already «M · вівсяне» (К1f). */
  variant_label: string;
  quantity: number;
  /** The answers, by name, in the order the groups were asked. */
  modifiers: Array<{ group_name: string; name: string }>;
  /** The kitchen note. Never on the fiscal receipt; always here. */
  note: string;
}

export interface KitchenOrder {
  id: number;
  order_no: number | null;
  receipt_number: string;
  prep_status: 'new' | 'ready';
  created_at: string;
  ready_at: string | null;
  staff_name: string;
  /** The receipt-level note («Замовлення: …» on the ticket). */
  note: string | null;
  items: KitchenOrderItem[];
}

export interface PrepStatusRow {
  id: number;
  prep_status: PrepStatus;
  ready_at: string | null;
  served_at: string | null;
}

const NO_KITCHEN = 'Цей магазин не має кухні';

/** The one step each tap is allowed to take. Anything else is a disagreement. */
const ALLOWED_FROM: Record<'ready' | 'served', PrepStatus[]> = {
  ready: ['new'],
  served: ['ready'],
};

function isoOrNull(value: unknown): string | null {
  return value ? new Date(value as string).toISOString() : null;
}

function rowOf(row: Record<string, unknown>): PrepStatusRow {
  const raw = row.prep_status;
  return {
    id: Number(row.id),
    prep_status: raw === 'new' || raw === 'ready' ? raw : 'served',
    ready_at: isoOrNull(row.ready_at),
    served_at: isoOrNull(row.served_at),
  };
}

/**
 * Today's open orders, oldest first, with what the kitchen needs to make them.
 *
 * `now` is the server's clock at the moment of the read: the board computes
 * waiting times against it rather than against the tablet's, which nobody
 * sets. Read-only by construction — see the file header.
 */
export async function listOpenOrders(
  storeId: number
): Promise<{ orders: KitchenOrder[]; now: string }> {
  const clock = await readStoreClock(storeId);
  if (!clock.vertical.kitchen) throw new KitchenError(NO_KITCHEN);

  const heads = await pool.query(
    `SELECT s.id, s.order_no, s.receipt_number, s.prep_status, s.created_at, s.ready_at,
            s.note, st.display_name AS staff_name
     FROM pos_sales s
     JOIN pos_staff st ON st.id = s.staff_id
     WHERE s.store_id = $1
       AND s.prep_status IN ('new', 'ready')
       AND s.status <> 'voided'
       AND s.created_at >= (($2::date)::timestamp AT TIME ZONE $3)
     ORDER BY s.created_at ASC, s.id ASC`,
    [storeId, clock.today, clock.timezone]
  );

  const saleIds = heads.rows.map((row) => Number(row.id));
  const itemsBySale = new Map<number, KitchenOrderItem[]>();
  if (saleIds.length > 0) {
    const modifierRows = await pool.query(
      `SELECT m.sale_item_id, m.group_name, m.name
       FROM pos_sale_item_modifiers m
       JOIN pos_sale_items i ON i.id = m.sale_item_id
       WHERE i.sale_id = ANY($1::bigint[])
       ORDER BY m.sale_item_id, m.sort_order, m.id`,
      [saleIds]
    );
    const modifiersByItem = new Map<number, Array<{ group_name: string; name: string }>>();
    for (const row of modifierRows.rows) {
      const itemId = Number(row.sale_item_id);
      const list = modifiersByItem.get(itemId) ?? [];
      list.push({ group_name: String(row.group_name), name: String(row.name) });
      modifiersByItem.set(itemId, list);
    }

    const itemRows = await pool.query(
      `SELECT id, sale_id, product_name, variant_label, quantity, note
       FROM pos_sale_items
       WHERE sale_id = ANY($1::bigint[])
       ORDER BY sale_id, id`,
      [saleIds]
    );
    for (const row of itemRows.rows) {
      const saleId = Number(row.sale_id);
      const list = itemsBySale.get(saleId) ?? [];
      list.push({
        id: Number(row.id),
        product_name: String(row.product_name),
        variant_label: String(row.variant_label ?? ''),
        quantity: Number(row.quantity),
        modifiers: modifiersByItem.get(Number(row.id)) ?? [],
        note: typeof row.note === 'string' ? row.note : '',
      });
      itemsBySale.set(saleId, list);
    }
  }

  const orders: KitchenOrder[] = heads.rows.map((row) => ({
    id: Number(row.id),
    order_no: row.order_no == null ? null : Number(row.order_no),
    receipt_number: String(row.receipt_number),
    prep_status: row.prep_status === 'ready' ? 'ready' : 'new',
    created_at: new Date(row.created_at as string).toISOString(),
    ready_at: isoOrNull(row.ready_at),
    staff_name: String(row.staff_name ?? ''),
    note: typeof row.note === 'string' && row.note ? row.note : null,
    items: itemsBySale.get(Number(row.id)) ?? [],
  }));

  return { orders, now: new Date().toISOString() };
}

/**
 * One tap: «Готово» (`new → ready`) or «Видано» (`ready → served`).
 *
 * A guarded UPDATE, so two screens racing for the same order resolve on the
 * row. When it lands, the row comes back with its new stamp. When it does
 * not, the row is re-read to say why in the kitchen's words: a re-tap of the
 * state the order is already in is a 200 — the state the caller wanted is
 * the state there is (the `releaseCart` argument) — while a skipped or
 * reversed step is a conflict the slower screen must see.
 */
export async function setPrepStatus(params: {
  storeId: number;
  saleId: number;
  status: 'ready' | 'served';
}): Promise<PrepStatusRow> {
  const updated = await pool.query(
    `UPDATE pos_sales
     SET prep_status = $3::text,
         ready_at = CASE WHEN $3::text = 'ready' THEN NOW() ELSE ready_at END,
         served_at = CASE WHEN $3::text = 'served' THEN NOW() ELSE served_at END
     WHERE id = $1 AND store_id = $2
       AND status <> 'voided'
       AND prep_status = ANY($4::text[])
     RETURNING id, prep_status, ready_at, served_at`,
    [params.saleId, params.storeId, params.status, ALLOWED_FROM[params.status]]
  );
  if (updated.rows.length > 0) return rowOf(updated.rows[0]);

  const current = await pool.query(
    `SELECT id, status, prep_status, ready_at, served_at
     FROM pos_sales WHERE id = $1 AND store_id = $2`,
    [params.saleId, params.storeId]
  );
  const row = current.rows[0];
  if (!row) throw new KitchenNotFound('Замовлення не знайдено');
  if (row.status === 'voided') throw new KitchenError('Чек скасовано');
  if (row.prep_status === params.status) return rowOf(row);
  if (params.status === 'served' && row.prep_status === 'new') {
    throw new KitchenError('Спершу натисніть „Готово“');
  }
  throw new KitchenError('Замовлення вже видано');
}
