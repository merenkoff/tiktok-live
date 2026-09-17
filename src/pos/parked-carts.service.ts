// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Carts put aside at one till and rung up at another.
 *
 * Design: `TechDocs/POS_FLORIST_BENCH.md` §9 (phase B4), schema in migration
 * `042`. Three things here are easy to get backwards.
 *
 * **A parked cart holds stock, and what it holds is resolved by the same code
 * the sale uses.** `resolveStockDemand` decides whether a line takes the
 * variant's own shelf or its components; the reserve calls it with the very
 * same arguments the checkout will. Resolving it twice, in two places, is how
 * a bouquet ends up holding stems it never takes.
 *
 * **A reserve never refuses anything.** `applyStockDelta` deliberately lets a
 * sale drive stock negative — a till that raced another one still handed the
 * goods over, and refusing to record that loses money rather than saving
 * flowers. A reserve is the same kind of fact: it lowers what the catalog
 * offers, and that is all. Nothing here rejects a sale, a write-off or a
 * second park.
 *
 * **Picking a cart up does not ring it.** `pickUp` hands the till back exactly
 * what `completeSale` takes and closes the cart in the same transaction, so
 * the stems stop being held the moment they are in someone's cart — and the
 * sale that follows is an ordinary sale, with the ordinary fiscal path. A
 * service that tried to park and ring in one call would have to own the ПРРО
 * outcome too, which is a second checkout by another name.
 */

import { pool } from '../db.js';
import { logger } from '../logger.js';
import { resolveStockDemand, type ComponentInput } from './composites.service.js';
import type { CartDiscountInput } from './types.js';

type DbClient = { query: typeof pool.query };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * How long a parked cart holds its stems.
 *
 * Four hours is most of a shift: long enough that a customer who went to the
 * cash machine or to pick a card still finds their bouquet waiting, short
 * enough that a cart forgotten on Friday evening is not still holding the
 * fridge on Saturday morning. The shop can put a cart back by hand at any
 * time; this is only what happens when nobody does.
 */
export const PARKED_CART_TTL_MS = 4 * 60 * 60 * 1000;

/** Nothing sane parks more than this, and a runaway client should not be able to. */
const MAX_ITEMS = 200;
const MAX_LABEL = 120;

export class ParkedCartError extends Error {}

export interface ParkCartItemInput {
  variant_id: number;
  quantity: number;
  /** The bouquet this line was assembled as, when it carries its own recipe. */
  components?: ComponentInput[];
}

export interface ParkCartInput {
  storeId: number;
  staffId: number;
  clientUuid: string;
  label: string;
  note?: string | null;
  customerId?: number | null;
  cartDiscount?: CartDiscountInput | null;
  items: ParkCartItemInput[];
}

export interface ParkedCartItem {
  id: number;
  variant_id: number;
  quantity: number;
  components: ComponentInput[] | null;
  product_name: string;
  label: string;
  unit: string;
  price_cents: number;
  image_url: string | null;
}

export interface ParkedCart {
  id: number;
  label: string;
  note: string | null;
  status: 'open' | 'picked' | 'released' | 'expired';
  staff_id: number;
  staff_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  cart_discount: CartDiscountInput | null;
  expires_at: string;
  created_at: string;
  /** Lines, in the order they were parked. */
  items: ParkedCartItem[];
  /** What the lines add up to at today's prices — a label, not a promise. */
  total_cents: number;
}

/** Put a cart aside, holding what ringing it would consume. */
export async function parkCart(input: ParkCartInput): Promise<{ cart: ParkedCart; created: boolean }> {
  const clientUuid = input.clientUuid?.trim().toLowerCase() ?? '';
  if (!UUID_RE.test(clientUuid)) throw new ParkedCartError('client_uuid має бути UUID');

  const label = (input.label ?? '').trim();
  if (!label) throw new ParkedCartError('Назвіть відкладений кошик');
  if (label.length > MAX_LABEL) throw new ParkedCartError('Надто довга назва');

  if (!input.items?.length) throw new ParkedCartError('Кошик порожній');
  if (input.items.length > MAX_ITEMS) throw new ParkedCartError('Забагато позицій');
  for (const item of input.items) {
    if (!Number.isInteger(item.variant_id) || item.variant_id <= 0) {
      throw new ParkedCartError('Некоректна позиція');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ParkedCartError('Некоректна кількість');
    }
  }

  // Idempotent on `client_uuid` like every other till write: a double tap on a
  // flaky connection must not hold the same stems twice.
  const existing = await findByClientUuid(input.storeId, clientUuid);
  if (existing) return { cart: existing, created: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cartRow = await client.query(
      `INSERT INTO pos_parked_carts
         (store_id, staff_id, label, note, customer_id, cart_discount, expires_at, client_uuid)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW() + ($7 || ' milliseconds')::interval, $8)
       RETURNING id`,
      [
        input.storeId,
        input.staffId,
        label,
        input.note?.trim() || null,
        input.customerId ?? null,
        input.cartDiscount ? JSON.stringify(input.cartDiscount) : null,
        String(PARKED_CART_TTL_MS),
        clientUuid,
      ]
    );
    const cartId = Number(cartRow.rows[0].id);

    // What the reserve holds, summed per variant: two lines of the same rose —
    // one loose, one inside a bouquet — are one shelf.
    const held = new Map<number, number>();

    for (const [index, item] of input.items.entries()) {
      await client.query(
        `INSERT INTO pos_parked_cart_items
           (store_id, cart_id, variant_id, quantity, components, sort_order)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          input.storeId,
          cartId,
          item.variant_id,
          item.quantity,
          item.components?.length ? JSON.stringify(item.components) : null,
          index,
        ]
      );

      const demand = await resolveStockDemand(client, {
        storeId: input.storeId,
        variantId: item.variant_id,
        components: item.components,
      });
      if (demand.kind === 'own') {
        held.set(item.variant_id, (held.get(item.variant_id) ?? 0) + item.quantity);
      } else {
        for (const row of demand.composition) {
          const total = row.quantity * item.quantity;
          held.set(row.component_variant_id, (held.get(row.component_variant_id) ?? 0) + total);
        }
      }
    }

    for (const [variantId, quantity] of held) {
      await client.query(
        `INSERT INTO pos_stock_reservations (store_id, cart_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [input.storeId, cartId, variantId, quantity]
      );
    }

    await client.query('COMMIT');

    const cart = await getCart(input.storeId, cartId);
    if (!cart) throw new ParkedCartError('Не вдалося прочитати відкладений кошик');
    logger.info('Parked cart created', {
      storeId: input.storeId,
      cartId,
      lines: input.items.length,
      reserved: held.size,
    });
    return { cart, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The carts this store is still holding.
 *
 * Lapsed ones are left out by the same predicate the reserve view uses, so a
 * cart stops being offered at exactly the moment it stops holding stock —
 * whether or not the cleanup cron has run.
 */
export async function listOpenCarts(storeId: number): Promise<ParkedCart[]> {
  const rows = await pool.query(
    `SELECT id FROM pos_parked_carts
     WHERE store_id = $1 AND status = 'open' AND expires_at > NOW()
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [storeId]
  );
  const carts: ParkedCart[] = [];
  for (const row of rows.rows) {
    const cart = await getCart(storeId, Number(row.id));
    if (cart) carts.push(cart);
  }
  return carts;
}

export async function getCart(storeId: number, cartId: number): Promise<ParkedCart | null> {
  const head = await pool.query(
    `SELECT c.*, s.display_name AS staff_name, cu.name AS customer_name
     FROM pos_parked_carts c
     LEFT JOIN pos_staff s ON s.id = c.staff_id
     LEFT JOIN pos_customers cu ON cu.id = c.customer_id
     WHERE c.id = $1 AND c.store_id = $2`,
    [cartId, storeId]
  );
  if (head.rows.length === 0) return null;
  const row = head.rows[0];

  const items = await pool.query(
    `SELECT i.id, i.variant_id, i.quantity, i.components,
            p.name AS product_name, p.image_url,
            v.label, v.unit, v.price_cents
     FROM pos_parked_cart_items i
     JOIN pos_variants v ON v.id = i.variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE i.cart_id = $1 AND i.store_id = $2
     ORDER BY i.sort_order, i.id`,
    [cartId, storeId]
  );

  const mapped: ParkedCartItem[] = items.rows.map((item) => ({
    id: Number(item.id),
    variant_id: Number(item.variant_id),
    quantity: Number(item.quantity),
    components: item.components
      ? (item.components as Array<Record<string, unknown>>).map((c) => ({
          component_variant_id: Number(c.component_variant_id),
          quantity: Number(c.quantity),
        }))
      : null,
    product_name: item.product_name ?? '',
    label: item.label ?? '',
    unit: item.unit ?? '',
    price_cents: Number(item.price_cents ?? 0),
    image_url: item.image_url ?? null,
  }));

  return {
    id: Number(row.id),
    label: row.label,
    note: row.note ?? null,
    status: row.status,
    staff_id: Number(row.staff_id),
    staff_name: row.staff_name ?? null,
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    customer_name: row.customer_name ?? null,
    cart_discount: (row.cart_discount as CartDiscountInput | null) ?? null,
    expires_at: new Date(row.expires_at).toISOString(),
    created_at: new Date(row.created_at).toISOString(),
    items: mapped,
    // At today's prices, and deliberately without the bouquet arithmetic: this
    // is the line under a name in a list, so the cashier can tell two waiting
    // carts apart. The cart is priced for real when it is rung.
    total_cents: mapped.reduce((sum, item) => sum + item.price_cents * item.quantity, 0),
  };
}

async function findByClientUuid(storeId: number, clientUuid: string): Promise<ParkedCart | null> {
  const row = await pool.query(
    `SELECT id FROM pos_parked_carts WHERE store_id = $1 AND client_uuid = $2`,
    [storeId, clientUuid]
  );
  if (row.rows.length === 0) return null;
  return getCart(storeId, Number(row.rows[0].id));
}

/**
 * Take a cart back to a till.
 *
 * Closing it and handing it over is one transaction: a cart that was returned
 * to a cashier but still counts as parked is holding stems that are now in
 * someone's hands, and the second till would offer the same bouquet again.
 *
 * The other way round — closing it and losing the payload — is why this returns
 * the cart it read *inside* that transaction rather than re-reading after.
 */
export async function pickUp(params: {
  storeId: number;
  staffId: number;
  cartId: number;
}): Promise<ParkedCart> {
  const cart = await getCart(params.storeId, params.cartId);
  if (!cart) throw new ParkedCartError('Відкладений кошик не знайдено');

  const closed = await pool.query(
    `UPDATE pos_parked_carts
     SET status = 'picked', closed_by = $3, closed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND status = 'open' AND expires_at > NOW()
     RETURNING id`,
    [params.cartId, params.storeId, params.staffId]
  );
  // Lost the race, or it lapsed between the read and the write. Read the row
  // back rather than trusting the status from a moment ago: "someone else
  // already took it" and "it expired" are different conversations at the
  // counter, and the one that just became true is the one to report.
  if (closed.rows.length === 0) {
    const now = await pool.query(
      `SELECT status, expires_at <= NOW() AS lapsed FROM pos_parked_carts
       WHERE id = $1 AND store_id = $2`,
      [params.cartId, params.storeId]
    );
    const state = now.rows[0];
    throw new ParkedCartError(
      state?.status === 'open' && state?.lapsed
        ? 'Термін відкладеного кошика минув'
        : 'Кошик уже забрали'
    );
  }

  logger.info('Parked cart picked up', { storeId: params.storeId, cartId: params.cartId });
  return { ...cart, status: 'picked' };
}

/**
 * Put a cart back: the customer changed their mind, or it was parked by
 * mistake. The stems go back on the shelf immediately, because the reserve is
 * gone the moment the cart stops being `open`.
 */
export async function releaseCart(params: {
  storeId: number;
  staffId: number;
  cartId: number;
}): Promise<{ released: boolean }> {
  const result = await pool.query(
    `UPDATE pos_parked_carts
     SET status = 'released', closed_by = $3, closed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND status = 'open'
     RETURNING id`,
    [params.cartId, params.storeId, params.staffId]
  );
  return { released: result.rows.length > 0 };
}

/**
 * Note on a picked-up cart which sale it became, once the till has rung it.
 *
 * Best-effort on purpose: the sale is already complete and fiscalised by the
 * time this is called, and failing the checkout because a parked-cart row could
 * not be annotated would throw away a receipt over bookkeeping.
 */
export async function markSold(params: {
  storeId: number;
  cartId: number;
  saleId: number;
}): Promise<void> {
  await pool.query(
    `UPDATE pos_parked_carts SET sale_id = $3, updated_at = NOW()
     WHERE id = $1 AND store_id = $2 AND sale_id IS NULL`,
    [params.cartId, params.storeId, params.saleId]
  );
}

/**
 * Housekeeping, not correctness.
 *
 * Every read already ignores a lapsed cart, so this only moves `open` rows
 * nobody will look at again into `expired` — which is what keeps the till's
 * list query on its index and gives the owner something truthful to read later.
 */
export async function expireParkedCarts(): Promise<number> {
  const result = await pool.query(
    `UPDATE pos_parked_carts SET status = 'expired', updated_at = NOW()
     WHERE status = 'open' AND expires_at <= NOW()
     RETURNING id`
  );
  return result.rows.length;
}

/** What one variant is holding right now — the view, for a caller that needs one. */
export async function reservedFor(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<number> {
  const result = await client.query(
    `SELECT reserved FROM pos_stock_reserved WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  return Number(result.rows[0]?.reserved ?? 0);
}
