// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Bouquets ordered now for a day that has not happened yet.
 *
 * Design: `TechDocs/POS_FLORIST_BENCH.md` §14 (phase B6), schema in migration
 * `043`. Three rules, and two of them are the opposite of a parked cart's
 * (`parked-carts.service.ts`) — which is exactly why this is its own table and
 * not more columns on that one.
 *
 * **It holds no stock.** A parked cart holds its stems for four hours because
 * they are physically in the florist's hands. An order for 8 March must hold
 * nothing: those roses have not been delivered, and reserving them would empty
 * the catalogue for the customer standing in the shop today.
 *
 * **It is not paid until handed over.** The fulfilment is an ordinary sale
 * through the ordinary checkout — stock moves then, the ПРРО receipt prints
 * then, and nothing in this file touches the fiscal layer.
 *
 * **Its price is locked, and the lock is a fact the server wrote.** Quoted
 * today, assembled in two weeks when a rose costs more. `priceAt` reads the
 * locked per-unit price out of `pos_preorder_items`; checkout calls it and
 * never accepts a price on the wire. That is what keeps this from being the
 * freely settable line price §3.5 refuses: the number is one this service
 * computed and stored, tied to a document, not one a cashier typed.
 */

import { pool } from '../db.js';
import { logger } from '../logger.js';
import { priceOfComposition, type ComponentInput } from './composites.service.js';
import * as modifiers from './modifiers.service.js';
import type { LineModifierSnapshot } from './modifiers.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MAX_ITEMS = 200;
const MAX_TEXT = 2000;

export class PreorderError extends Error {}

export type PreorderStatus = 'new' | 'assembled' | 'handed_over' | 'cancelled';
export type Fulfilment = 'pickup' | 'delivery';

export interface PreorderItemInput {
  variant_id: number;
  quantity: number;
  components?: ComponentInput[];
  /** The answers chosen (ids), as checkout takes them — К3f. */
  modifiers?: number[];
  /** The kitchen note, bounded like the sale line's. */
  note?: string;
}

export interface CreatePreorderInput {
  storeId: number;
  staffId: number;
  clientUuid: string;
  dueAt: string;
  dueWindowMinutes?: number | null;
  fulfilment?: Fulfilment;
  address?: string | null;
  customerId?: number | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  cardMessage?: string | null;
  note?: string | null;
  items: PreorderItemInput[];
}

export interface PreorderItem {
  id: number;
  variant_id: number;
  quantity: number;
  /** The locked per-unit price — what the shop promised, not today's. Includes the answers' deltas. */
  unit_price_cents: number;
  components: ComponentInput[] | null;
  /**
   * The answers the order was taken with, as a snapshot (migration 051):
   * part of the promise — the hand-over uses these names, never a
   * re-resolved answer. Empty for a plain line.
   */
  modifiers: LineModifierSnapshot[];
  /** The kitchen note, carried into the sale at hand-over. */
  note: string;
  product_name: string;
  label: string;
  unit: string;
  image_url: string | null;
  /** What this line would cost if quoted today. Null when it cannot be priced. */
  current_unit_price_cents: number | null;
}

export interface Preorder {
  id: number;
  status: PreorderStatus;
  staff_id: number;
  staff_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  fulfilment: Fulfilment;
  address: string | null;
  due_at: string;
  due_window_minutes: number | null;
  card_message: string | null;
  note: string | null;
  quoted_total_cents: number;
  sale_id: number | null;
  created_at: string;
  items: PreorderItem[];
  /**
   * What the same order would cost if quoted today, or null when some line
   * cannot be priced any more (a stem the shop delisted).
   *
   * Shown next to the quote rather than instead of it: the shop honours what it
   * promised, and this is how the owner sees what honouring it costs.
   */
  current_total_cents: number | null;
}

function clean(value: string | null | undefined, field: string): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (text.length > MAX_TEXT) throw new PreorderError(`Надто довгий текст: ${field}`);
  return text;
}

/**
 * Take an order: price it once, at today's prices, and freeze that.
 *
 * Priced through `priceOfComposition` — the same function checkout would have
 * used — so the quote is what the customer would have paid buying it on the
 * spot. What makes it a lock is only that it is stored.
 */
export async function createPreorder(
  input: CreatePreorderInput
): Promise<{ preorder: Preorder; created: boolean }> {
  const clientUuid = input.clientUuid?.trim().toLowerCase() ?? '';
  if (!UUID_RE.test(clientUuid)) throw new PreorderError('client_uuid має бути UUID');

  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) throw new PreorderError('Некоректний час готовності');

  const fulfilment: Fulfilment = input.fulfilment === 'delivery' ? 'delivery' : 'pickup';
  const address = clean(input.address, 'address');
  // A delivery with nowhere to deliver to is an order nobody can fulfil, and
  // the courier finds out at the worst possible moment.
  if (fulfilment === 'delivery' && !address) {
    throw new PreorderError('Для доставки потрібна адреса');
  }

  if (!input.items?.length) throw new PreorderError('Замовлення порожнє');
  if (input.items.length > MAX_ITEMS) throw new PreorderError('Забагато позицій');
  for (const item of input.items) {
    if (!Number.isInteger(item.variant_id) || item.variant_id <= 0) {
      throw new PreorderError('Некоректна позиція');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new PreorderError('Некоректна кількість');
    }
    // A bouquet's price is its stems'; a delta on top of that has no meaning
    // — the same rule checkout applies.
    if (item.components?.length && modifiers.normalizeModifierIds(item.modifiers).length > 0) {
      throw new PreorderError('Позиція з власним складом не приймає модифікаторів');
    }
  }

  const existing = await findByClientUuid(input.storeId, clientUuid);
  if (existing) return { preorder: existing, created: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Price every line first: the total is the sum, and a line that cannot be
    // priced must fail the whole order rather than quietly cost nothing. The
    // answers are resolved here, as checkout would (a required question left
    // unanswered is refused now), and their deltas go INTO the lock: what was
    // promised is «латте на вівсяному за 80», not «латте за 65 плюс щось».
    const priced: Array<{
      item: PreorderItemInput;
      unitPriceCents: number;
      chosen: modifiers.ResolvedLineModifiers;
      note: string;
    }> = [];
    for (const item of input.items) {
      const chosen = await modifiers.resolveForVariant(
        client,
        input.storeId,
        item.variant_id,
        modifiers.normalizeModifierIds(item.modifiers)
      );
      const unitPriceCents = (await quoteUnit(client, input.storeId, item)) + chosen.deltaCents;
      if (unitPriceCents < 0) {
        throw new PreorderError('Ціна позиції з модифікаторами не може бути відʼємною');
      }
      priced.push({ item, unitPriceCents, chosen, note: modifiers.cleanLineNote(item.note) });
    }
    const total = priced.reduce((sum, row) => sum + row.unitPriceCents * row.item.quantity, 0);

    const head = await client.query(
      `INSERT INTO pos_preorders
         (store_id, staff_id, customer_id, recipient_name, recipient_phone, fulfilment,
          address, due_at, due_window_minutes, card_message, note, quoted_total_cents,
          client_uuid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.storeId,
        input.staffId,
        input.customerId ?? null,
        clean(input.recipientName, 'recipient_name'),
        clean(input.recipientPhone, 'recipient_phone'),
        fulfilment,
        address,
        dueAt.toISOString(),
        input.dueWindowMinutes ?? null,
        clean(input.cardMessage, 'card_message'),
        clean(input.note, 'note'),
        total,
        clientUuid,
      ]
    );
    const preorderId = Number(head.rows[0].id);

    for (const [index, row] of priced.entries()) {
      await client.query(
        `INSERT INTO pos_preorder_items
           (store_id, preorder_id, variant_id, quantity, unit_price_cents, components, sort_order,
            modifiers, note)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9)`,
        [
          input.storeId,
          preorderId,
          row.item.variant_id,
          row.item.quantity,
          row.unitPriceCents,
          row.item.components?.length ? JSON.stringify(row.item.components) : null,
          index,
          row.chosen.snapshot.length ? JSON.stringify(row.chosen.snapshot) : null,
          row.note,
        ]
      );
    }

    await client.query('COMMIT');

    const preorder = await getPreorder(input.storeId, preorderId);
    if (!preorder) throw new PreorderError('Не вдалося прочитати замовлення');
    logger.info('Preorder created', {
      storeId: input.storeId,
      preorderId,
      dueAt: dueAt.toISOString(),
      totalCents: total,
    });
    return { preorder, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

type DbClient = { query: typeof pool.query };

/** What one line costs right now — the composition's sum, or the card's price. */
async function quoteUnit(
  client: DbClient,
  storeId: number,
  item: PreorderItemInput
): Promise<number> {
  if (item.components?.length) {
    return priceOfComposition(client, storeId, item.components);
  }
  const row = await client.query(
    `SELECT price_cents FROM pos_variants WHERE id = $1 AND store_id = $2`,
    [item.variant_id, storeId]
  );
  if (row.rows.length === 0) throw new PreorderError(`Позиція ${item.variant_id} не знайдена`);
  return Number(row.rows[0].price_cents);
}

/**
 * The same price, but refusing a variant the shop has delisted.
 *
 * Used only for the «what would this cost today» read, never for the quote. A
 * stem that is no longer stocked has no price today, and saying so is more use
 * to the owner than a total quietly computed as if the line were free. The
 * order itself is unaffected: what was promised stays promised.
 */
async function quoteUnitIfStillStocked(
  client: DbClient,
  storeId: number,
  item: PreorderItemInput
): Promise<number> {
  const ids = item.components?.length
    ? item.components.map((c) => c.component_variant_id)
    : [item.variant_id];
  const active = await client.query(
    `SELECT COUNT(*)::int AS n FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = $1 AND v.id = ANY($2::bigint[])
       AND v.is_active = TRUE AND p.is_active = TRUE`,
    [storeId, ids]
  );
  if (Number(active.rows[0]?.n ?? 0) !== new Set(ids).size) {
    throw new PreorderError('Позиції більше немає в каталозі');
  }
  return quoteUnit(client, storeId, item);
}

export async function getPreorder(storeId: number, preorderId: number): Promise<Preorder | null> {
  const head = await pool.query(
    `SELECT p.*, s.display_name AS staff_name, c.name AS customer_name
     FROM pos_preorders p
     LEFT JOIN pos_staff s ON s.id = p.staff_id
     LEFT JOIN pos_customers c ON c.id = p.customer_id
     WHERE p.id = $1 AND p.store_id = $2`,
    [preorderId, storeId]
  );
  if (head.rows.length === 0) return null;
  const row = head.rows[0];

  const rows = await pool.query(
    `SELECT i.id, i.variant_id, i.quantity, i.unit_price_cents, i.components,
            i.modifiers, i.note,
            pr.name AS product_name, pr.image_url, v.label, v.unit
     FROM pos_preorder_items i
     JOIN pos_variants v ON v.id = i.variant_id
     JOIN pos_products pr ON pr.id = v.product_id
     WHERE i.preorder_id = $1 AND i.store_id = $2
     ORDER BY i.sort_order, i.id`,
    [preorderId, storeId]
  );

  const items: PreorderItem[] = [];
  let currentTotal: number | null = 0;
  for (const item of rows.rows) {
    const components = item.components
      ? (item.components as Array<Record<string, unknown>>).map((c) => ({
          component_variant_id: Number(c.component_variant_id),
          quantity: Number(c.quantity),
        }))
      : null;
    // A stem the shop delisted cannot be re-priced. That is worth saying out
    // loud rather than silently costing zero, so the whole current total goes
    // null and the screen shows the quote alone. An answer that was deleted
    // since is the same kind of fact (`liveDeltaCents` → null).
    const snapshot = modifiers.parseLineModifierSnapshot(item.modifiers);
    const base = await quoteUnitIfStillStocked(pool, storeId, {
      variant_id: Number(item.variant_id),
      quantity: Number(item.quantity),
      components: components ?? undefined,
    }).catch(() => null);
    const liveDelta = await modifiers.liveDeltaCents(pool, storeId, snapshot);
    const current = base == null || liveDelta == null ? null : base + liveDelta;
    if (current == null) currentTotal = null;
    else if (currentTotal != null) currentTotal += current * Number(item.quantity);

    items.push({
      id: Number(item.id),
      variant_id: Number(item.variant_id),
      quantity: Number(item.quantity),
      unit_price_cents: Number(item.unit_price_cents),
      components,
      modifiers: snapshot,
      note: typeof item.note === 'string' ? item.note : '',
      product_name: item.product_name ?? '',
      label: item.label ?? '',
      unit: item.unit ?? '',
      image_url: item.image_url ?? null,
      current_unit_price_cents: current,
    });
  }

  return {
    id: Number(row.id),
    status: row.status,
    staff_id: Number(row.staff_id),
    staff_name: row.staff_name ?? null,
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    customer_name: row.customer_name ?? null,
    recipient_name: row.recipient_name ?? null,
    recipient_phone: row.recipient_phone ?? null,
    fulfilment: row.fulfilment,
    address: row.address ?? null,
    due_at: new Date(row.due_at).toISOString(),
    due_window_minutes: row.due_window_minutes == null ? null : Number(row.due_window_minutes),
    card_message: row.card_message ?? null,
    note: row.note ?? null,
    quoted_total_cents: Number(row.quoted_total_cents),
    sale_id: row.sale_id == null ? null : Number(row.sale_id),
    created_at: new Date(row.created_at).toISOString(),
    items,
    current_total_cents: currentTotal,
  };
}

async function findByClientUuid(storeId: number, clientUuid: string): Promise<Preorder | null> {
  const row = await pool.query(
    `SELECT id FROM pos_preorders WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, clientUuid]
  );
  if (row.rows.length === 0) return null;
  return getPreorder(storeId, Number(row.rows[0].id));
}

/**
 * The florist's morning list.
 *
 * Open orders by default and soonest first, because the question being asked is
 * «що робити сьогодні», not «що ми колись продали». An order whose day has
 * passed and which nobody closed stays in the list on purpose: it is exactly
 * the thing that must not fall off a screen quietly.
 */
export async function listPreorders(
  storeId: number,
  opts: { status?: PreorderStatus | 'open'; until?: string } = {}
): Promise<Preorder[]> {
  const params: unknown[] = [storeId];
  const where = ['store_id = $1'];

  const status = opts.status ?? 'open';
  if (status === 'open') {
    where.push(`status IN ('new', 'assembled')`);
  } else {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (opts.until) {
    const until = new Date(opts.until);
    if (Number.isNaN(until.getTime())) throw new PreorderError('Некоректна межа періоду');
    params.push(until.toISOString());
    where.push(`due_at <= $${params.length}`);
  }

  const rows = await pool.query(
    `SELECT id FROM pos_preorders WHERE ${where.join(' AND ')}
     ORDER BY due_at ASC, id ASC LIMIT 200`,
    params
  );
  const out: Preorder[] = [];
  for (const row of rows.rows) {
    const preorder = await getPreorder(storeId, Number(row.id));
    if (preorder) out.push(preorder);
  }
  return out;
}

/** Mark it built and waiting — the florist assembled it ahead of the due time. */
export async function markAssembled(params: {
  storeId: number;
  preorderId: number;
  staffId: number;
}): Promise<Preorder> {
  const result = await pool.query(
    `UPDATE pos_preorders
     SET status = 'assembled', assembled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND status = 'new'
     RETURNING id`,
    [params.preorderId, params.storeId]
  );
  if (result.rows.length === 0) throw new PreorderError('Замовлення вже не нове');
  const preorder = await getPreorder(params.storeId, params.preorderId);
  if (!preorder) throw new PreorderError('Замовлення не знайдено');
  return preorder;
}

export async function cancelPreorder(params: {
  storeId: number;
  preorderId: number;
  staffId: number;
}): Promise<{ cancelled: boolean }> {
  const result = await pool.query(
    `UPDATE pos_preorders
     SET status = 'cancelled', closed_by = $3, closed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND status IN ('new', 'assembled')
     RETURNING id`,
    [params.preorderId, params.storeId, params.staffId]
  );
  return { cancelled: result.rows.length > 0 };
}

/**
 * The order's lines, at the price the shop promised, in the shape checkout takes.
 *
 * This is the whole price lock. Checkout calls it with an id and gets back
 * numbers this service wrote when the order was taken — the client is never in
 * a position to name one.
 */
export interface LockedLine {
  variant_id: number;
  quantity: number;
  /** Includes the answers' deltas — the lock was minted with them. */
  unit_price_cents: number;
  components?: ComponentInput[];
  /** The promised answers; checkout keeps these names and never re-resolves. */
  modifiers: LineModifierSnapshot[];
  note: string;
}

export async function lockedLines(
  client: DbClient,
  storeId: number,
  preorderId: number
): Promise<LockedLine[]> {
  const rows = await client.query(
    `SELECT variant_id, quantity, unit_price_cents, components, modifiers, note
     FROM pos_preorder_items
     WHERE preorder_id = $1 AND store_id = $2
     ORDER BY sort_order, id`,
    [preorderId, storeId]
  );
  return rows.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    unit_price_cents: Number(row.unit_price_cents),
    modifiers: modifiers.parseLineModifierSnapshot(row.modifiers),
    note: typeof row.note === 'string' ? row.note : '',
    ...(row.components
      ? {
          components: (row.components as Array<Record<string, unknown>>).map((c) => ({
            component_variant_id: Number(c.component_variant_id),
            quantity: Number(c.quantity),
          })),
        }
      : {}),
  }));
}

/**
 * Close an order as handed over, inside the caller's transaction.
 *
 * On the sale's own client on purpose, so the hand-over and the receipt commit
 * or roll back together. Two tills reaching for the same bouquet is then a
 * plain row-level race that one of them loses, and a checkout that fails after
 * this needs no compensating «put it back» — there is nothing to put back,
 * because nothing was written.
 *
 * The earlier shape had this in the route, before the sale: it left the order
 * closed when the sale failed, and it silently did not apply to the offline
 * device-stamped path, which calls `completeSale` directly.
 */
export class PreorderClosedError extends PreorderError {}

export async function claimForSale(
  client: DbClient,
  params: { storeId: number; preorderId: number; staffId: number }
): Promise<void> {
  const result = await client.query(
    `UPDATE pos_preorders
     SET status = 'handed_over', closed_by = $3, closed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND status IN ('new', 'assembled')
     RETURNING id`,
    [params.preorderId, params.storeId, params.staffId]
  );
  if (result.rows.length === 0) {
    throw new PreorderClosedError('Замовлення вже видане або скасоване');
  }
}

/** Note which sale the order became, once the till has rung it. */
export async function markSold(params: {
  storeId: number;
  preorderId: number;
  saleId: number;
}): Promise<void> {
  await pool.query(
    `UPDATE pos_preorders SET sale_id = $3, updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND sale_id IS NULL`,
    [params.preorderId, params.storeId, params.saleId]
  );
}
