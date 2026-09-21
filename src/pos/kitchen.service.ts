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
import type { TagStation } from './tags.service.js';
import type { PrepStatus } from './types.js';
import { parseLineModifierSnapshot } from './modifiers.service.js';

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
  /**
   * Where the line is made, from its product's tags (`pos_tags.station`,
   * migration 050): `['bar']`, `['kitchen']`, both, or none — the ticket
   * printer sends a line with none to the kitchen.
   */
  stations: TagStation[];
}

export interface KitchenOrder {
  id: number;
  /**
   * Which of the two things on this board it is (К4c). A counter sale is
   * `'sale'` and carries a daily number; a round of an open bill is
   * `'round'` and carries a table and a sequence instead. Additive — a host
   * that predates tables reads the same fields it always did, so
   * `POS_API_VERSION` stays at 2.
   */
  kind: 'sale' | 'round';
  /** What the card says at the top: «№ 7», or «Стіл 5 · раунд 2». */
  title: string;
  /** Round only; null for a counter sale. */
  table_name: string | null;
  round_seq: number | null;
  order_no: number | null;
  /** A round has no receipt yet — empty string there, never a made-up number. */
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

/**
 * The one step each tap is allowed to take. Anything else is a disagreement.
 *
 * Exported because a round of an open bill (К4c) takes exactly the same two
 * taps as a counter sale. The guarded UPDATE differs — another table, and
 * `cancelled_at IS NULL` where a sale says `status <> 'voided'` — but the
 * steps and the words must not.
 */
export const ALLOWED_FROM: Record<'ready' | 'served', PrepStatus[]> = {
  ready: ['new'],
  served: ['ready'],
};

/**
 * Where a line is made, from its product's tags — the same subquery for a
 * sale line and a bill line, both of which name their variant as `i.variant_id`.
 */
const STATIONS_SQL = `(SELECT array_agg(DISTINCT t.station ORDER BY t.station)
                         FROM pos_variants v
                         JOIN pos_product_tags pt ON pt.product_id = v.product_id
                         JOIN pos_tags t ON t.id = pt.tag_id
                        WHERE v.id = i.variant_id AND t.station IS NOT NULL)`;

function stationsOf(value: unknown): TagStation[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((x): x is TagStation => x === 'kitchen' || x === 'bar')
    : [];
}

function isoOrNull(value: unknown): string | null {
  return value ? new Date(value as string).toISOString() : null;
}

export function prepRowOf(row: Record<string, unknown>): PrepStatusRow {
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
      `SELECT i.id, i.sale_id, i.product_name, i.variant_label, i.quantity, i.note,
              ${STATIONS_SQL} AS stations
       FROM pos_sale_items i
       WHERE i.sale_id = ANY($1::bigint[])
       ORDER BY i.sale_id, i.id`,
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
        stations: stationsOf(row.stations),
      });
      itemsBySale.set(saleId, list);
    }
  }

  const orders: KitchenOrder[] = heads.rows.map((row) => {
    const orderNo = row.order_no == null ? null : Number(row.order_no);
    return {
      id: Number(row.id),
      kind: 'sale' as const,
      title: orderNo == null ? `Чек ${String(row.receipt_number)}` : `№ ${orderNo}`,
      table_name: null,
      round_seq: null,
      order_no: orderNo,
      receipt_number: String(row.receipt_number),
      prep_status: row.prep_status === 'ready' ? ('ready' as const) : ('new' as const),
      created_at: new Date(row.created_at as string).toISOString(),
      ready_at: isoOrNull(row.ready_at),
      staff_name: String(row.staff_name ?? ''),
      note: typeof row.note === 'string' && row.note ? row.note : null,
      items: itemsBySale.get(Number(row.id)) ?? [],
    };
  });

  orders.push(...(await openRounds(storeId)));
  // One board, two sources, one order: oldest first, as the kitchen works.
  orders.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

  return { orders, now: new Date().toISOString() };
}

/**
 * Rounds of open bills, for the same board (К4c, TechDocs/POS_TABLES.md §11).
 *
 * Deliberately WITHOUT the day window the sales query uses: a bill opened
 * before midnight is still being eaten after it, and dropping its round off
 * the board at 00:00 would hide food that is on the pass. A cancelled round
 * is out — that is the kitchen's «скасувати», exactly as a voided sale is.
 */
async function openRounds(storeId: number): Promise<KitchenOrder[]> {
  const heads = await pool.query(
    `SELECT r.id, r.seq, r.prep_status, r.fired_at, r.ready_at,
            b.note, t.name AS table_name, st.display_name AS staff_name
     FROM pos_bill_rounds r
     JOIN pos_bills b ON b.id = r.bill_id
     JOIN pos_tables t ON t.id = b.table_id
     JOIN pos_staff st ON st.id = r.fired_by
     WHERE r.store_id = $1
       AND r.prep_status IN ('new', 'ready')
       AND r.cancelled_at IS NULL
       AND b.status = 'open'
     ORDER BY r.fired_at ASC, r.id ASC`,
    [storeId]
  );
  if (heads.rows.length === 0) return [];

  const roundIds = heads.rows.map((row) => Number(row.id));
  const itemRows = await pool.query(
    `SELECT i.id, i.round_id, i.product_name, i.variant_label, i.quantity, i.note,
            i.modifiers, ${STATIONS_SQL} AS stations
     FROM pos_bill_items i
     WHERE i.round_id = ANY($1::bigint[])
     ORDER BY i.round_id, i.sort_order, i.id`,
    [roundIds]
  );
  const itemsByRound = new Map<number, KitchenOrderItem[]>();
  for (const row of itemRows.rows) {
    const roundId = Number(row.round_id);
    const list = itemsByRound.get(roundId) ?? [];
    list.push({
      id: Number(row.id),
      product_name: String(row.product_name ?? ''),
      variant_label: String(row.variant_label ?? ''),
      quantity: Number(row.quantity),
      // The answers live on the line as a snapshot, not in a join table: a
      // bill line is written once and read back exactly as it was fired.
      modifiers: parseLineModifierSnapshot(row.modifiers).map((m) => ({
        group_name: m.group_name,
        name: m.name,
      })),
      note: typeof row.note === 'string' ? row.note : '',
      stations: stationsOf(row.stations),
    });
    itemsByRound.set(roundId, list);
  }

  return heads.rows.map((row) => ({
    id: Number(row.id),
    kind: 'round' as const,
    title: `Стіл ${String(row.table_name)} · раунд ${Number(row.seq)}`,
    table_name: String(row.table_name),
    round_seq: Number(row.seq),
    order_no: null,
    receipt_number: '',
    prep_status: row.prep_status === 'ready' ? ('ready' as const) : ('new' as const),
    created_at: new Date(row.fired_at as string).toISOString(),
    ready_at: isoOrNull(row.ready_at),
    staff_name: String(row.staff_name ?? ''),
    note: typeof row.note === 'string' && row.note ? row.note : null,
    items: itemsByRound.get(Number(row.id)) ?? [],
  }));
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
  if (updated.rows.length > 0) return prepRowOf(updated.rows[0]);

  const current = await pool.query(
    `SELECT id, status, prep_status, ready_at, served_at
     FROM pos_sales WHERE id = $1 AND store_id = $2`,
    [params.saleId, params.storeId]
  );
  const row = current.rows[0];
  return explainPrepRefusal({
    row,
    wanted: params.status,
    gone: row?.status === 'voided',
    notFoundMessage: 'Замовлення не знайдено',
    goneMessage: 'Чек скасовано',
  });
}

/**
 * Why a guarded prep UPDATE matched nothing — shared by a sale and a round.
 *
 * Returns the row for a re-tap of the state it is already in (200: the state
 * the caller wanted is the state there is), and throws for everything else.
 * Only the two nouns differ between the callers — «Чек скасовано» against
 * «Раунд скасовано» — because everything else the kitchen reads must be word
 * for word the same whatever it is looking at.
 */
export function explainPrepRefusal(params: {
  row: Record<string, unknown> | undefined;
  wanted: 'ready' | 'served';
  gone: boolean;
  notFoundMessage: string;
  goneMessage: string;
}): PrepStatusRow {
  if (!params.row) throw new KitchenNotFound(params.notFoundMessage);
  if (params.gone) throw new KitchenError(params.goneMessage);
  if (params.row.prep_status === params.wanted) return prepRowOf(params.row);
  if (params.wanted === 'served' && params.row.prep_status === 'new') {
    throw new KitchenError('Спершу натисніть „Готово“');
  }
  throw new KitchenError('Замовлення вже видано');
}

/**
 * «Сьогодні не робимо»: put a dish on the day's stop-list, or take it off.
 *
 * Staff level on purpose — the person who knows the cheesecake is gone is
 * the barista, and the owner is not behind the counter at seven in the
 * morning. Keyed on the store's day (migration 050), so it forgets itself
 * at the store's midnight; the catalog greys the tile and the checkout
 * refuses the dish while the day lasts.
 */
export async function setStopListed(params: {
  storeId: number;
  productId: number;
  stopListed: boolean;
}): Promise<{ product_id: number; stop_listed: boolean; stop_listed_on: string | null }> {
  const clock = await readStoreClock(params.storeId);
  if (!clock.vertical.kitchen) throw new KitchenError(NO_KITCHEN);
  const result = await pool.query(
    `UPDATE pos_products
     SET stop_listed_on = CASE WHEN $3::boolean THEN $4::date ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND is_active = TRUE
     RETURNING stop_listed_on::text AS stop_listed_on`,
    [params.productId, params.storeId, params.stopListed, clock.today]
  );
  if (result.rows.length === 0) throw new KitchenNotFound('Товар не знайдено');
  const on = (result.rows[0].stop_listed_on as string | null) ?? null;
  return { product_id: params.productId, stop_listed: on === clock.today, stop_listed_on: on };
}
