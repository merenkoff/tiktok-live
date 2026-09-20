// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/sales.service.ts

import { pool } from '../db.js';
import {
  consumeStockForSaleItem,
  isDerivedComposite,
  priceOfComposition,
  returnStockForSaleItem,
  validateComponents,
} from './composites.service.js';
import type { ComponentInput } from './composites.service.js';
import type {
  CartDiscountInput,
  CompleteSaleItemInput,
  CompleteSalePaymentInput,
  RefundItemInput,
  RefundMethod,
  PrepStatus,
} from './types.js';
import { getCustomer } from './customers.service.js';
import { storeClock } from './core/storeClock.js';
import * as preorders from './preorders.service.js';
import * as modifiers from './modifiers.service.js';
import type { LineModifierSnapshot } from './modifiers.service.js';

/**
 * The caption for a bouquet assembled at the counter: how many stems went in.
 *
 * Kept deliberately short — it is snapshotted into `pos_sale_items.
 * variant_label`, which a 32-character ПРРО receipt prints next to the product
 * name. The recipe itself lives in `pos_sale_item_components`, and the till and
 * the refund screen read it from there; this is only what a printed line can
 * afford to say.
 */
export function customBouquetLabel(components: ComponentInput[]): string {
  const stems = components.reduce((sum, row) => sum + row.quantity, 0);
  return `${stems} ${pluralStems(stems)}`;
}

function pluralStems(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'стебел';
  switch (n % 10) {
    case 1:
      return 'стебло';
    case 2:
    case 3:
    case 4:
      return 'стебла';
    default:
      return 'стебел';
  }
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

/**
 * The order number the barista calls out: 1, 2, 3… restarting every day the
 * store's own clock says has begun (migration 047). Seeded at 1 with the
 * day-keyed form `nextDocNumber` uses for stock documents — not the
 * MAX-seeded receipt form, whose key never changes. Inside the sale's
 * transaction, so a rolled-back sale gives its number back.
 */
async function nextOrderNo(
  client: { query: typeof pool.query },
  storeId: number,
  today: string
): Promise<number> {
  const counterKey = `order_${today}`;
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
  return Number(result.rows[0].seq);
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
  /** `'pending'` when the caller is about to fiscalise this sale. See the INSERT. */
  fiscal_status?: 'none' | 'pending';
  /**
   * A pre-order being handed over (`preorders.service.ts`, фаза B6).
   *
   * Its lines are read from the order at the price the shop promised, and are
   * added to whatever else the customer picked up at the counter. The caller
   * names an id and nothing else: the numbers come out of a table this server
   * wrote when the order was taken, which is what keeps the price lock from
   * being the freely settable line price §3.5 refuses.
   */
  preorder_id?: number | null;
  /**
   * The desktop till replaying a sale it rang while offline (`sync.ts`,
   * café phase К3). The customer left hours ago with a paper ticket, so the
   * sale is stamped `served` instead of landing on the kitchen board as a
   * fresh order (migration 049), and the day's stop-list does not refuse
   * it (К3b). It relaxes a menu rule and marks kitchen state — never money.
   */
  offline_replay?: boolean;
}) {
  if (!params.items?.length && !params.preorder_id) throw new Error('Cart is empty');
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

  // Two kinds of cart line. Ordinary ones merge by variant — and by the
  // modifiers and the kitchen note they carry: a latte on oat milk and a latte
  // on ordinary milk are two lines, two identical ones are one line of two,
  // and the same set named in a different order is the same set. A line
  // carrying its own composition — a bouquet the cashier put together at the
  // counter — stays its own line: two custom bouquets off the same catalogue
  // card are two different bouquets, and merging them would lose one of the
  // two recipes.
  const plainLines = new Map<
    string,
    { variant_id: number; quantity: number; modifiers: number[]; note: string }
  >();
  const customItems: Array<{ variant_id: number; quantity: number; components: ComponentInput[] }> =
    [];
  for (const item of params.items ?? []) {
    if (!item.variant_id || item.quantity <= 0) {
      throw new Error('Invalid cart item');
    }
    const modifierIds = modifiers.normalizeModifierIds(item.modifiers);
    const note = modifiers.cleanLineNote(item.note);
    if (item.components?.length) {
      // A bouquet's price is its stems'; a delta on top of that has no meaning.
      if (modifierIds.length > 0) {
        throw new Error('A line assembled at the counter cannot carry modifiers');
      }
      customItems.push({
        variant_id: item.variant_id,
        quantity: item.quantity,
        components: item.components,
      });
      continue;
    }
    const key = `${item.variant_id}|${modifierIds.join(',')}|${note}`;
    const existing = plainLines.get(key);
    if (existing) existing.quantity += item.quantity;
    else plainLines.set(key, { variant_id: item.variant_id, quantity: item.quantity, modifiers: modifierIds, note });
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

    // The store's day and vertical, read once inside the transaction: the
    // order counter's day and the kitchen stamp below must agree with each
    // other and with the row the INSERT is about to join.
    const clock = await storeClock(client, params.storeId);

    // A pre-order's lines, at the price the shop promised. Read here rather
    // than taken from the request: the caller named an id, and these numbers
    // are ones this server wrote when the order was taken.
    //
    // Closed in the same transaction, so the hand-over and the receipt commit
    // together. Two tills reaching for the same bouquet is then a row-level
    // race one of them loses, and a checkout that fails afterwards needs no
    // compensating «put it back».
    const locked = params.preorder_id
      ? await preorders.lockedLines(client, params.storeId, params.preorder_id)
      : [];
    if (params.preorder_id) {
      if (locked.length === 0) throw new Error('Preorder has no lines');
      await preorders.claimForSale(client, {
        storeId: params.storeId,
        preorderId: params.preorder_id,
        staffId: params.staffId,
      });
    }

    const variantIds = [
      ...new Set([
        ...[...plainLines.values()].map((line) => line.variant_id),
        ...customItems.map((item) => item.variant_id),
        ...locked.map((line) => line.variant_id),
      ]),
    ];
    const variantsResult = await client.query(
      `SELECT v.id, v.price_cents, v.compare_at_cents, v.label, v.unit,
              p.id AS product_id, p.name AS product_name,
              p.stop_listed_on::text AS stop_listed_on
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND v.id = ANY($2::bigint[]) AND v.is_active = TRUE`,
      [params.storeId, variantIds]
    );

    if (variantsResult.rows.length !== variantIds.length) {
      throw new Error('Some variants not found or inactive');
    }

    const variantMap = new Map(variantsResult.rows.map((row) => [Number(row.id), row]));

    // The day's stop-list (migration 050, К3b): a stale second till that still
    // shows the tile is told in so many words. Never a replay — the goods left
    // while the till was offline — and never a pre-order's locked line, which
    // was promised before the dish was pulled.
    if (!params.offline_replay) {
      const rung = [
        ...[...plainLines.values()].map((line) => line.variant_id),
        ...customItems.map((item) => item.variant_id),
      ];
      for (const variantId of rung) {
        const row = variantMap.get(variantId)!;
        if (row.stop_listed_on != null && row.stop_listed_on === clock.today) {
          throw new Error(`«${row.product_name}» сьогодні в стоп-листі`);
        }
      }
    }
    let subtotal = 0;
    const draftLines: Array<{
      variant_id: number;
      product_name: string;
      variant_label: string;
      unit: string;
      quantity: number;
      unit_price_cents: number;
      compare_at_unit_cents: number | null;
      pre_discount_total: number;
      has_product_discount: boolean;
      /** Present only on a bouquet assembled at the counter. */
      components?: ComponentInput[];
      /** Kitchen note; '' when none. */
      note?: string;
      /** What the line chose, when it chose anything (migration 046). */
      modifiers?: LineModifierSnapshot[];
      /** What those choices write off, per one unit, authored. */
      modifier_components?: ComponentInput[];
    }> = [];

    // Every product's questions, once. A line naming no modifiers is checked
    // too: a required group is required whichever client is asking, and an
    // older till that has never heard of modifiers must not sell a latte with
    // no milk in it.
    const groupsByProduct = await modifiers.loadGroupsForProducts(
      client,
      params.storeId,
      [...new Set([...plainLines.values()].map((line) => Number(variantMap.get(line.variant_id)!.product_id)))],
      { activeOnly: true }
    );

    for (const line of plainLines.values()) {
      const variant = variantMap.get(line.variant_id)!;
      const chosen = modifiers.resolveLineModifiers(
        groupsByProduct.get(Number(variant.product_id)) ?? [],
        line.modifiers
      );
      // The card price plus the deltas — never a sum of ingredients, which is
      // the opposite of a bouquet and deliberately so (POS_CAFE.md §4.1). A
      // delta may be negative; the result may not.
      const unit = Number(variant.price_cents) + chosen.deltaCents;
      if (unit < 0) throw new Error('Modifiers cannot take the line price below zero');
      // Shifted by the same sum, so the receipt's markdown stays what the card
      // says; a delta that only moved the price would print a bigger or a
      // negative discount.
      const compareAt =
        variant.compare_at_cents == null
          ? null
          : Number(variant.compare_at_cents) + chosen.deltaCents;
      const pre = unit * line.quantity;
      subtotal += pre;
      draftLines.push({
        variant_id: line.variant_id,
        product_name: variant.product_name,
        // The caption is whatever the store's vertical already derived onto the
        // row, plus the modifiers chosen; the sale snapshots it, so a later
        // variant edit cannot rewrite history on a printed receipt.
        variant_label: modifiers.lineCaption(variant.label ?? '', chosen.names),
        unit: variant.unit ?? '',
        quantity: line.quantity,
        unit_price_cents: unit,
        compare_at_unit_cents: compareAt,
        pre_discount_total: pre,
        note: line.note,
        ...(chosen.snapshot.length > 0
          ? { modifiers: chosen.snapshot, modifier_components: chosen.components }
          : {}),
        has_product_discount: compareAt != null,
      });
    }

    for (const line of locked) {
      const variant = variantMap.get(line.variant_id)!;
      // Never merged with a walk-in line of the same variant: the promised
      // price applies to the order's roses and today's to the ones the
      // customer picked up at the counter, and merging would silently pick one.
      const pre = line.unit_price_cents * line.quantity;
      subtotal += pre;
      const components = line.components?.length
        ? await validateComponents(client, params.storeId, line.variant_id, line.components)
        : undefined;
      draftLines.push({
        variant_id: line.variant_id,
        product_name: variant.product_name,
        variant_label: components ? customBouquetLabel(components) : (variant.label ?? ''),
        unit: variant.unit ?? '',
        quantity: line.quantity,
        unit_price_cents: line.unit_price_cents,
        // A promised price is not a markdown off today's card, and showing one
        // would put a discount on the receipt that nobody gave.
        compare_at_unit_cents: null,
        pre_discount_total: pre,
        has_product_discount: false,
        ...(components ? { components } : {}),
      });
    }

    for (const item of customItems) {
      const variant = variantMap.get(item.variant_id)!;
      const components = await validateComponents(
        client,
        params.storeId,
        item.variant_id,
        item.components
      );
      // Only a composite assembled at sale time can be rung with its own
      // recipe: one with its own stock was already built, and a simple product
      // has nothing to assemble.
      if (!(await isDerivedComposite(client, params.storeId, item.variant_id))) {
        throw new Error(`Variant ${item.variant_id} cannot be assembled at the till`);
      }
      const unit = await priceOfComposition(client, params.storeId, components);
      const pre = unit * item.quantity;
      subtotal += pre;
      draftLines.push({
        variant_id: item.variant_id,
        product_name: variant.product_name,
        // NOT the catalogue card's caption. That card is «Букет на замовлення ·
        // Червоний» for every custom bouquet ever rung on it, and the ПРРО
        // receipt, the sales list and the refund screen would all show the same
        // meaningless line. What actually distinguishes this one is what went
        // into it, so the caption counts that.
        variant_label: customBouquetLabel(components),
        unit: variant.unit ?? '',
        quantity: item.quantity,
        unit_price_cents: unit,
        // The catalogue card's compare-at would be about a different bouquet.
        compare_at_unit_cents: null,
        pre_discount_total: pre,
        has_product_discount: false,
        components,
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
    const orderNo = await nextOrderNo(client, params.storeId, clock.today);
    // Kitchen state (migration 049). Only a kitchen vertical puts a sale on
    // the board, and a sale the desktop till replays after selling offline
    // was handed over on a paper ticket hours ago — `new` again would ask
    // the barista to make it twice. Stamped inside the transaction, like
    // `fiscal_status`, so no follow-up UPDATE can be lost.
    const toBoard = clock.vertical.kitchen && !params.offline_replay;
    const saleResult = await client.query(
      `INSERT INTO pos_sales
         (store_id, staff_id, receipt_number, status, subtotal_cents, total_cents, note,
          customer_id, cart_discount_type, cart_discount_value, cart_discount_cents, client_uuid,
          fiscal_status, order_no, prep_status, served_at)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14::text, CASE WHEN $14::text = 'new' THEN NULL ELSE NOW() END)
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
        // Stamped INSIDE this transaction, never by a follow-up UPDATE: a crash
        // between COMMIT and the fiscalisation call must not leave a
        // fiscalisable sale looking like 'none', which no reconciler would ever
        // find. Silently un-fiscalised revenue is the worst outcome available.
        params.fiscal_status ?? 'none',
        orderNo,
        toBoard ? 'new' : 'served',
      ]
    );
    const sale = saleResult.rows[0];
    const saleId = Number(sale.id);

    for (const line of lineItems) {
      const itemResult = await client.query(
        `INSERT INTO pos_sale_items
           (sale_id, store_id, variant_id, product_name, variant_label, unit,
            quantity, unit_price_cents, line_total_cents,
            compare_at_unit_cents, line_discount_cents, note)
         VALUES ($1, $2, $3, $4, $5, $11, $6, $7, $8, $9, $10, $12)
         RETURNING id`,
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
          line.unit,
          line.note ?? '',
        ]
      );
      const saleItemId = Number(itemResult.rows[0].id);

      // What the line chose, by name and delta: a group renamed next week
      // must not rewrite a printed receipt.
      for (const chosen of line.modifiers ?? []) {
        await client.query(
          `INSERT INTO pos_sale_item_modifiers
             (store_id, sale_item_id, modifier_id, group_name, name, price_delta_cents, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            params.storeId,
            saleItemId,
            chosen.modifier_id,
            chosen.group_name,
            chosen.name,
            chosen.price_delta_cents,
            chosen.sort_order,
          ]
        );
      }

      // Composite-aware: a derived composite (a bouquet assembled when it
      // sells) writes off its components and records what it took on this line,
      // so the refund below can give back exactly that.
      await consumeStockForSaleItem(client, {
        storeId: params.storeId,
        saleId,
        saleItemId,
        variantId: line.variant_id,
        quantity: line.quantity,
        staffId: params.staffId,
        components: line.components,
        extra: line.modifier_components,
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

/**
 * Project a refund as un-fiscalised.
 *
 * Used when fiscalisation failed before a ledger row existed — the refund is
 * then invisible to the retry cron and to `listAttentionDocs`, both of which
 * work off `pos_fiscal_receipts`, so the projection is the only place its state
 * can be recorded at all.
 */
export async function markRefundFiscalFailed(
  storeId: number,
  refundId: number
): Promise<void> {
  await pool.query(
    `UPDATE pos_refunds SET fiscal_status = 'failed' WHERE id = $1 AND store_id = $2`,
    [refundId, storeId]
  );
}

/** The kitchen columns of a `pos_sales` row (migration 049), as the wire reports them. */
function kitchenFields(sale: Record<string, unknown>): {
  prep_status: PrepStatus;
  ready_at: string | null;
  served_at: string | null;
} {
  const raw = sale.prep_status;
  return {
    prep_status: raw === 'new' || raw === 'ready' ? raw : 'served',
    ready_at: sale.ready_at ? new Date(sale.ready_at as string).toISOString() : null,
    served_at: sale.served_at ? new Date(sale.served_at as string).toISOString() : null,
  };
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
  // What each line actually took off the shelf. Present only for composites —
  // and for a bouquet assembled at the counter this is the ONLY place its
  // recipe exists, so the receipt and the refund screen read it from here.
  const components = await pool.query(
    `SELECT c.sale_item_id, c.component_variant_id, c.quantity_per_unit,
            p.name AS product_name, v.label, v.unit
     FROM pos_sale_item_components c
     JOIN pos_sale_items i ON i.id = c.sale_item_id
     JOIN pos_variants v ON v.id = c.component_variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE i.sale_id = $1
     ORDER BY c.sale_item_id, c.sort_order, c.id`,
    [saleId]
  );
  const componentsByItem = new Map<number, Array<Record<string, unknown>>>();
  for (const row of components.rows) {
    const itemId = Number(row.sale_item_id);
    const list = componentsByItem.get(itemId) ?? [];
    list.push({
      component_variant_id: Number(row.component_variant_id),
      quantity_per_unit: Number(row.quantity_per_unit),
      product_name: row.product_name,
      label: row.label ?? '',
      unit: row.unit ?? '',
    });
    componentsByItem.set(itemId, list);
  }
  // What each line chose, as it was named at the time (migration 046).
  const chosen = await pool.query(
    `SELECT m.sale_item_id, m.modifier_id, m.group_name, m.name, m.price_delta_cents
     FROM pos_sale_item_modifiers m
     JOIN pos_sale_items i ON i.id = m.sale_item_id
     WHERE i.sale_id = $1
     ORDER BY m.sale_item_id, m.sort_order, m.id`,
    [saleId]
  );
  const modifiersByItem = new Map<number, Array<Record<string, unknown>>>();
  for (const row of chosen.rows) {
    const itemId = Number(row.sale_item_id);
    const list = modifiersByItem.get(itemId) ?? [];
    list.push({
      modifier_id: row.modifier_id == null ? null : Number(row.modifier_id),
      group_name: row.group_name,
      name: row.name,
      price_delta_cents: Number(row.price_delta_cents),
    });
    modifiersByItem.set(itemId, list);
  }

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

  // The ПРРО result, when this store fiscalises. Plain fields on the sale, not
  // a separate lookup for the client: the ESC/POS ticket is rendered in Rust
  // and the offline receipt mirror is host-owned, so neither could ever reach a
  // module-provided renderer. See TechDocs/POS_FISCAL_PRRO.md §1.
  const fiscalRow = await pool.query(
    `SELECT fiscal_code, fiscal_date, tax_url, qr_payload, receipt_text,
            status, mode, control_number, error_code, error_message
     FROM pos_fiscal_receipts
     WHERE sale_id = $1 AND doc_type = 'sale'`,
    [saleId]
  );
  const fiscal = fiscalRow.rows[0] ?? null;

  return {
    id: Number(sale.id),
    store_id: Number(sale.store_id),
    staff_id: Number(sale.staff_id),
    staff_name: sale.staff_name,
    customer_id: sale.customer_id == null ? null : Number(sale.customer_id),
    customer_name: sale.customer_name ?? null,
    customer_phone: sale.customer_phone ?? null,
    receipt_number: sale.receipt_number,
    order_no: sale.order_no == null ? null : Number(sale.order_no),
    client_uuid: sale.client_uuid ?? null,
    status: sale.status,
    ...kitchenFields(sale),
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
    fiscal_status: sale.fiscal_status ?? 'none',
    fiscal: fiscal
      ? {
          status: fiscal.status as string,
          // `mode` and `control_number` matter to the till, not just to the
          // ledger: an offline-stamped receipt already carries a real
          // tax-office number, and the paper it prints is a different document
          // from an online one (see TechDocs/POS_FISCAL_OFFLINE.md §4). Without
          // them here a re-opened sale looks like an ordinary `pending` one.
          mode: fiscal.mode === 'offline' ? ('offline' as const) : ('online' as const),
          control_number: fiscal.control_number ?? null,
          fiscal_code: fiscal.fiscal_code ?? null,
          fiscal_date: fiscal.fiscal_date
            ? new Date(fiscal.fiscal_date).toISOString()
            : null,
          tax_url: fiscal.tax_url ?? null,
          qr_payload: fiscal.qr_payload ?? null,
          receipt_text: fiscal.receipt_text ?? null,
          error_code: fiscal.error_code ?? null,
          error_message: fiscal.error_message ?? null,
        }
      : null,
    items: items.rows.map((row) => ({
      id: Number(row.id),
      variant_id: Number(row.variant_id),
      product_name: row.product_name,
      variant_label: row.variant_label,
      unit: row.unit ?? '',
      quantity: Number(row.quantity),
      unit_price_cents: Number(row.unit_price_cents),
      compare_at_unit_cents:
        row.compare_at_unit_cents == null ? null : Number(row.compare_at_unit_cents),
      line_discount_cents: Number(row.line_discount_cents ?? 0),
      line_total_cents: Number(row.line_total_cents),
      refunded_quantity: Number(row.refunded_quantity),
      components: componentsByItem.get(Number(row.id)) ?? [],
      modifiers: modifiersByItem.get(Number(row.id)) ?? [],
      note: typeof row.note === 'string' ? row.note : '',
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
    order_no: sale.order_no == null ? null : Number(sale.order_no),
    client_uuid: sale.client_uuid ?? null,
    status: sale.status,
    ...kitchenFields(sale),
    total_cents: Number(sale.total_cents),
    refunded_cents: Number(sale.refunded_cents),
    staff_name: sale.staff_name,
    customer_name: sale.customer_name ?? null,
    created_at: sale.created_at,
    qr_pending: Boolean(sale.qr_pending),
    // Projection, not a join: 99% of rows belong to stores that do not
    // fiscalise, and the receipts list stays a zero-join query for them.
    fiscal_status: sale.fiscal_status ?? 'none',
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
      await returnStockForSaleItem(client, {
        storeId: params.storeId,
        saleItemId: Number(item.id),
        variantId: Number(item.variant_id),
        quantity: Number(item.quantity),
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
  /** `'pending'` when the caller is about to fiscalise this refund. */
  fiscal_status?: 'none' | 'pending';
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
         (sale_id, store_id, staff_id, total_cents, reason, client_uuid, refund_number, method,
          fiscal_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        params.fiscal_status ?? 'none',
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

      await returnStockForSaleItem(client, {
        storeId: params.storeId,
        saleItemId: line.sale_item_id,
        variantId: line.variant_id,
        quantity: line.quantity,
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
