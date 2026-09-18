// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Bouquets ordered now for a day that has not happened yet
// (`TechDocs/POS_FLORIST_BENCH.md` §14, migration 043).
//
// Two of these rules are the OPPOSITE of a parked cart's, which is the whole
// reason pre-orders are their own table: an order holds no stock, and it is not
// paid until it is handed over. The third — the price lock — is the one that
// could quietly become the freely settable line price §3.5 refuses, so most of
// what follows is about where the number comes from.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import {
  cancelPreorder,
  createPreorder,
  getPreorder,
  listPreorders,
  markAssembled,
  type PreorderItemInput,
} from '../pos/preorders.service.js';
import { createProduct, getCatalog } from '../pos/products.service.js';
import { completeSale } from '../pos/sales.service.js';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(!hasDb)('POS pre-orders', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let storeId = 0;
  let staffId = 0;
  let roseId = 0;
  let eucalyptusId = 0;
  let bouquetId = 0;

  const order = (items: PreorderItemInput[], over: Record<string, unknown> = {}) =>
    createPreorder({
      storeId,
      staffId,
      clientUuid: randomUUID(),
      dueAt: inDays(7),
      items,
      ...over,
    });

  async function offered(variantId: number): Promise<number> {
    const catalog = await getCatalog(storeId, { snapshot: true });
    return catalog.find((item) => item.variant_id === variantId)?.quantity ?? -1;
  }

  const onShelf = async (variantId: number) =>
    Number(
      (
        await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`, [
          variantId,
          storeId,
        ])
      ).rows[0].quantity
    );

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('preord');
    storeId = store.storeId;
    staffId = store.sellerId;
    await pool.query(`UPDATE pos_stores SET florist_labour_bps = 2500 WHERE id = $1`, [storeId]);

    roseId = (await seedProduct(storeId, { name: 'Троянда', priceCents: 9000, quantity: 500 }))
      .variantId;
    eucalyptusId = (
      await seedProduct(storeId, { name: 'Евкаліпт', priceCents: 5500, quantity: 500 })
    ).variantId;

    const bouquet = await createProduct(storeId, {
      name: 'Букет «Весняний»',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: 120000,
          quantity: 0,
          components: [{ component_variant_id: roseId, quantity: 9 }],
        },
      ],
    });
    bouquetId = (bouquet!.variants[0] as { id: number }).id;
  }, 60000);

  beforeEach(async () => {
    await pool.query(`DELETE FROM pos_preorders WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM pos_sales WHERE store_id = $1`, [storeId]);
    await pool.query(`UPDATE pos_stock SET quantity = 500 WHERE store_id = $1`, [storeId]);
    await pool.query(`UPDATE pos_variants SET price_cents = 9000 WHERE id = $1`, [roseId]);
  });

  afterAll(async () => {
    await app.close();
    await dropTestStore(storeId);
    await pool.end();
  });

  // ── It holds no stock ─────────────────────────────────────────────────────

  it('holds nothing — an order for next week must not empty today’s fridge', async () => {
    // The rule that is the exact opposite of a parked cart's. Those roses have
    // not been delivered yet; reserving them would take them off the tiles for
    // the customer standing in the shop right now.
    await order([{ variant_id: roseId, quantity: 100 }]);

    expect(await offered(roseId)).toBe(500);
    expect(await onShelf(roseId)).toBe(500);
  });

  it('moves stock only when it is handed over', async () => {
    const { preorder } = await order([
      { variant_id: bouquetId, quantity: 1, components: [{ component_variant_id: roseId, quantity: 9 }] },
    ]);
    expect(await onShelf(roseId)).toBe(500);

    await completeSale({
      storeId,
      staffId,
      items: [],
      payments: [{ method: 'cash', amount_cents: preorder.quoted_total_cents }],
      preorder_id: preorder.id,
    });

    expect(await onShelf(roseId)).toBe(491);
  });

  // ── The price lock ────────────────────────────────────────────────────────

  it('quotes at today’s prices, through the same function checkout uses', async () => {
    // 9 roses at 90.00 plus the shop's 25% assembly charge.
    const { preorder } = await order([
      { variant_id: bouquetId, quantity: 1, components: [{ component_variant_id: roseId, quantity: 9 }] },
    ]);

    expect(preorder.quoted_total_cents).toBe(101250);
    expect(preorder.items[0].unit_price_cents).toBe(101250);
  });

  it('honours the quote when stems cost more by the due date', async () => {
    // The whole point of the lock. The shop promised a number three weeks ago;
    // roses have gone up since, and the customer must not pay for that.
    const { preorder } = await order([
      { variant_id: bouquetId, quantity: 1, components: [{ component_variant_id: roseId, quantity: 9 }] },
    ]);
    await pool.query(`UPDATE pos_variants SET price_cents = 15000 WHERE id = $1`, [roseId]);

    const sale = await completeSale({
      storeId,
      staffId,
      items: [],
      payments: [{ method: 'cash', amount_cents: 101250 }],
      preorder_id: preorder.id,
    });

    expect(sale?.total_cents).toBe(101250);
  });

  it('the client cannot name the price — only the order id', async () => {
    // What keeps the lock from being the hole §3.5 refuses: the number comes
    // out of a table the server wrote, and there is nowhere on the wire to put
    // a different one. A forged line for the same variant is an ordinary line,
    // priced at today's card.
    const { preorder } = await order([{ variant_id: roseId, quantity: 1 }]);
    await pool.query(`UPDATE pos_variants SET price_cents = 15000 WHERE id = $1`, [roseId]);

    const sale = await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: roseId, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 24000 }],
      preorder_id: preorder.id,
    });

    // 90.00 promised + 150.00 at the counter, not 180.00 and not 300.00.
    expect(sale?.total_cents).toBe(9000 + 15000);
    expect(sale?.items).toHaveLength(2);
  });

  it('shows what honouring the quote costs today, without changing it', async () => {
    const { preorder } = await order([{ variant_id: roseId, quantity: 2 }]);
    await pool.query(`UPDATE pos_variants SET price_cents = 15000 WHERE id = $1`, [roseId]);

    const now = await getPreorder(storeId, preorder.id);

    expect(now?.quoted_total_cents).toBe(18000);
    expect(now?.current_total_cents).toBe(30000);
  });

  it('says nothing rather than a wrong total when a stem is delisted', async () => {
    // The reachable case — a variant is deactivated, never deleted (the FK on
    // `pos_preorder_items` refuses that). A stem the shop no longer stocks has
    // no price today, and a total quietly computed as if the line were free
    // would be worse than no total. The promise itself is untouched.
    const { preorder } = await order([{ variant_id: eucalyptusId, quantity: 3 }]);
    expect((await getPreorder(storeId, preorder.id))?.current_total_cents).toBe(16500);

    await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [eucalyptusId]);
    try {
      const now = await getPreorder(storeId, preorder.id);
      expect(now?.current_total_cents).toBeNull();
      expect(now?.items[0].current_unit_price_cents).toBeNull();
      expect(now?.quoted_total_cents).toBe(16500);
    } finally {
      await pool.query(`UPDATE pos_variants SET is_active = TRUE WHERE id = $1`, [eucalyptusId]);
    }
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  it('goes new → assembled → handed over', async () => {
    const { preorder } = await order([{ variant_id: roseId, quantity: 1 }]);
    expect(preorder.status).toBe('new');

    expect((await markAssembled({ storeId, preorderId: preorder.id, staffId })).status).toBe(
      'assembled'
    );

    await completeSale({
      storeId,
      staffId,
      items: [],
      payments: [{ method: 'cash', amount_cents: 9000 }],
      preorder_id: preorder.id,
    });

    expect((await getPreorder(storeId, preorder.id))?.status).toBe('handed_over');
  });

  it('only one till hands over an order two reached for', async () => {
    const { preorder } = await order([{ variant_id: roseId, quantity: 1 }]);

    const first = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [],
        payments: [{ method: 'cash', amount_cents: 9000 }],
        preorder_id: preorder.id,
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [],
        payments: [{ method: 'cash', amount_cents: 9000 }],
        preorder_id: preorder.id,
      },
    });
    expect(second.statusCode).toBe(409);
  });

  it('a cancelled order cannot be handed over', async () => {
    const { preorder } = await order([{ variant_id: roseId, quantity: 1 }]);
    expect(await cancelPreorder({ storeId, preorderId: preorder.id, staffId })).toEqual({
      cancelled: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [],
        payments: [{ method: 'cash', amount_cents: 9000 }],
        preorder_id: preorder.id,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('a double tap takes one order, not two', async () => {
    const uuid = randomUUID();
    const first = await createPreorder({
      storeId,
      staffId,
      clientUuid: uuid,
      dueAt: inDays(3),
      items: [{ variant_id: roseId, quantity: 5 }],
    });
    const again = await createPreorder({
      storeId,
      staffId,
      clientUuid: uuid,
      dueAt: inDays(3),
      items: [{ variant_id: roseId, quantity: 5 }],
    });

    expect(again.created).toBe(false);
    expect(again.preorder.id).toBe(first.preorder.id);
  });

  // ── Who it is for ─────────────────────────────────────────────────────────

  it('keeps the recipient apart from the buyer', async () => {
    // The florist's case: the person who pays and the person who opens the door
    // are different, and the courier needs the second phone number.
    const { preorder } = await order([{ variant_id: roseId, quantity: 9 }], {
      fulfilment: 'delivery',
      address: 'вул. Хрещатик, 1, кв. 5',
      recipientName: 'Оксана',
      recipientPhone: '+380671234567',
      cardMessage: 'З днем народження!',
    });

    expect(preorder).toMatchObject({
      fulfilment: 'delivery',
      recipient_name: 'Оксана',
      recipient_phone: '+380671234567',
      card_message: 'З днем народження!',
      address: 'вул. Хрещатик, 1, кв. 5',
    });
  });

  it('refuses a delivery with nowhere to deliver to', async () => {
    // The courier would find out at the worst possible moment.
    await expect(
      order([{ variant_id: roseId, quantity: 1 }], { fulfilment: 'delivery' })
    ).rejects.toThrow(/адреса/);
  });

  it('refuses an empty order and a due date that is not one', async () => {
    await expect(order([])).rejects.toThrow(/порожн/);
    await expect(
      order([{ variant_id: roseId, quantity: 1 }], { dueAt: 'не дата' })
    ).rejects.toThrow(/час готовності/);
  });

  // ── The morning list ──────────────────────────────────────────────────────

  it('lists what is open, soonest first', async () => {
    await order([{ variant_id: roseId, quantity: 1 }], { dueAt: inDays(5), note: 'пізніше' });
    await order([{ variant_id: roseId, quantity: 1 }], { dueAt: inDays(1), note: 'раніше' });

    const open = await listPreorders(storeId);
    expect(open.map((p) => p.note)).toEqual(['раніше', 'пізніше']);
  });

  it('keeps an overdue order in the list rather than letting it fall off', async () => {
    // Exactly the thing that must not disappear quietly: somebody is waiting
    // for a bouquet that was due yesterday.
    const { preorder } = await order([{ variant_id: roseId, quantity: 1 }]);
    await pool.query(`UPDATE pos_preorders SET due_at = NOW() - interval '1 day' WHERE id = $1`, [
      preorder.id,
    ]);

    expect((await listPreorders(storeId)).map((p) => p.id)).toContain(preorder.id);
  });

  it('drops the handed-over and the cancelled from the open list', async () => {
    const { preorder } = await order([{ variant_id: roseId, quantity: 1 }]);
    await cancelPreorder({ storeId, preorderId: preorder.id, staffId });

    expect(await listPreorders(storeId)).toHaveLength(0);
    expect((await listPreorders(storeId, { status: 'cancelled' })).map((p) => p.id)).toContain(
      preorder.id
    );
  });

  // ── Over HTTP ─────────────────────────────────────────────────────────────

  it('takes, lists and assembles an order at staff level', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/pos/preorders',
      headers: auth(store.sellerToken),
      payload: {
        client_uuid: randomUUID(),
        due_at: inDays(2),
        fulfilment: 'pickup',
        recipient_name: 'Ірина',
        items: [{ variant_id: roseId, quantity: 11 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect(created.json().quoted_total_cents).toBe(99000);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/pos/preorders',
      headers: auth(store.sellerToken),
    });
    expect(listed.json().preorders.map((p: { id: number }) => p.id)).toContain(id);

    const assembled = await app.inject({
      method: 'POST',
      url: `/api/pos/preorders/${id}/assembled`,
      headers: auth(store.sellerToken),
    });
    expect(assembled.statusCode).toBe(200);
    expect(assembled.json().status).toBe('assembled');
  });

  it('refuses an unauthenticated order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/preorders',
      payload: { client_uuid: randomUUID(), due_at: inDays(1), items: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});
