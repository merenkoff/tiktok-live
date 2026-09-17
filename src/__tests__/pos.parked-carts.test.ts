// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Carts put aside at one till and rung up at another
// (`TechDocs/POS_FLORIST_BENCH.md` §9, migration 042).
//
// The feature is stock arithmetic with a name on it, so these run against the
// real schema. What has to hold: what a cart holds is exactly what ringing it
// would consume, holding it lowers what the catalog offers and nothing else,
// the hold is gone the moment the cart is picked up, put back or lapses, and
// two tills racing for the same cart cannot both get it.

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
  expireParkedCarts,
  getCart,
  listOpenCarts,
  parkCart,
  pickUp,
  releaseCart,
} from '../pos/parked-carts.service.js';
import { createProduct, getCatalog } from '../pos/products.service.js';
import { listOnHand } from '../pos/stock-reports.service.js';
import { completeSale } from '../pos/sales.service.js';

describe.skipIf(!hasDb)('POS parked carts', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let storeId = 0;
  let staffId = 0;
  let roseId = 0;
  let eucalyptusId = 0;
  /** A bouquet assembled when it sells: 9 roses + 3 greens off the shelf. */
  let derivedBouquetId = 0;
  /** A bouquet assembled in advance: its stems already left with production. */
  let ownBouquetId = 0;

  async function offered(variantId: number): Promise<number> {
    const catalog = await getCatalog(storeId, { snapshot: true });
    return catalog.find((item) => item.variant_id === variantId)?.quantity ?? -1;
  }

  async function onShelf(variantId: number): Promise<number> {
    const result = await pool.query(
      `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
      [variantId, storeId]
    );
    return Number(result.rows[0].quantity);
  }

  const park = (
    items: Array<{ variant_id: number; quantity: number; components?: Array<{ component_variant_id: number; quantity: number }> }>,
    over: { label?: string; clientUuid?: string } = {}
  ) =>
    parkCart({
      storeId,
      staffId,
      clientUuid: over.clientUuid ?? randomUUID(),
      label: over.label ?? 'Оксана',
      items,
    });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('parked');
    storeId = store.storeId;
    staffId = store.sellerId;

    roseId = (await seedProduct(storeId, { name: 'Троянда', priceCents: 9000, quantity: 90 }))
      .variantId;
    eucalyptusId = (
      await seedProduct(storeId, { name: 'Евкаліпт', priceCents: 5500, quantity: 100 })
    ).variantId;

    const derived = await createProduct(storeId, {
      name: 'Букет «Весняний»',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: 120000,
          quantity: 0,
          components: [
            { component_variant_id: roseId, quantity: 9 },
            { component_variant_id: eucalyptusId, quantity: 3 },
          ],
        },
      ],
    });
    derivedBouquetId = (derived!.variants[0] as { id: number }).id;

    const own = await createProduct(storeId, {
      name: 'Букет «Ніжність»',
      kind: 'composite',
      stock_mode: 'own',
      variants: [
        {
          attributes: {},
          price_cents: 90000,
          quantity: 0,
          components: [{ component_variant_id: roseId, quantity: 9 }],
        },
      ],
    });
    ownBouquetId = (own!.variants[0] as { id: number }).id;
  }, 60000);

  // Every test holds flowers out of the same fridge, so without this the later
  // ones run out and fail for a reason that is not theirs.
  beforeEach(async () => {
    await pool.query(`DELETE FROM pos_parked_carts WHERE store_id = $1`, [storeId]);
    await pool.query(
      `UPDATE pos_stock SET quantity = CASE variant_id
         WHEN $2 THEN 90 WHEN $3 THEN 100 ELSE 4 END
       WHERE store_id = $1`,
      [storeId, roseId, eucalyptusId]
    );
  });

  afterAll(async () => {
    await app.close();
    await dropTestStore(storeId);
    await pool.end();
  });

  // ── What a cart holds ─────────────────────────────────────────────────────

  it('holds an ordinary product off the catalog, leaving the shelf alone', async () => {
    // The distinction the whole design rests on: a reserve is not a movement.
    // Nothing physical happened — the roses are in the fridge — but the till
    // must not offer them to the next customer.
    const { cart, created } = await park([{ variant_id: roseId, quantity: 12 }]);

    expect(created).toBe(true);
    expect(await onShelf(roseId)).toBe(90);
    expect(await offered(roseId)).toBe(78);
    expect(cart.label).toBe('Оксана');
  });

  it('holds the stems of a bouquet that is assembled when it sells', async () => {
    // A `derived` bouquet has no shelf of its own. Parking one must hold what
    // ringing it would take — the stems — and nothing else.
    await park([{ variant_id: derivedBouquetId, quantity: 1 }]);

    expect(await offered(roseId)).toBe(81);
    expect(await offered(eucalyptusId)).toBe(97);
    // 81 roses / 9 and 97 greens / 3 both still allow 9 more bouquets.
    expect(await offered(derivedBouquetId)).toBe(9);
  });

  it('holds the bouquet itself when it was assembled in advance', async () => {
    // The mirror case, and the one easy to get backwards: an `own` bouquet's
    // stems left with the production document. Holding them again would take
    // the same roses out of the fridge twice.
    await pool.query(`UPDATE pos_stock SET quantity = 3 WHERE variant_id = $1 AND store_id = $2`, [
      ownBouquetId,
      storeId,
    ]);

    await park([{ variant_id: ownBouquetId, quantity: 1 }]);

    expect(await offered(ownBouquetId)).toBe(2);
    expect(await offered(roseId)).toBe(90);
  });

  it('holds the composition a bouquet was actually assembled with, not the card’s', async () => {
    // A bouquet the florist put together at the bench off a catalogue card
    // whose stored recipe is only a default. Holding the recipe instead would
    // hold nine roses for a bouquet that has fifteen in it.
    await park([
      {
        variant_id: derivedBouquetId,
        quantity: 1,
        components: [{ component_variant_id: roseId, quantity: 15 }],
      },
    ]);

    expect(await offered(roseId)).toBe(75);
    // Nothing of the card's default greenery is held — it is not in this bouquet.
    expect(await offered(eucalyptusId)).toBe(100);
  });

  it('sums one variant across lines rather than holding it twice', async () => {
    // Loose roses and roses inside a bouquet come off the same shelf.
    await park([
      { variant_id: roseId, quantity: 5 },
      { variant_id: derivedBouquetId, quantity: 1 },
    ]);

    expect(await offered(roseId)).toBe(90 - 5 - 9);
  });

  it('never offers a negative number when the shelf is already short', async () => {
    // A sale is allowed to drive stock negative (`applyStockDelta`), so a
    // reserve on top of that would read as −6 roses on the tile. Zero is the
    // honest answer: there are none to offer.
    await pool.query(`UPDATE pos_stock SET quantity = 2 WHERE variant_id = $1 AND store_id = $2`, [
      roseId,
      storeId,
    ]);
    await park([{ variant_id: roseId, quantity: 8 }]);

    expect(await offered(roseId)).toBe(0);
  });

  // ── What a reserve must NOT do ────────────────────────────────────────────

  it('does not refuse a sale of what another cart is holding', async () => {
    // The rule the whole design rests on: a reserve changes what the catalog
    // offers, never what the till may ring. The goods left the building — a
    // refusal here loses money rather than saving flowers.
    await park([{ variant_id: roseId, quantity: 90 }]);

    const sale = await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: roseId, quantity: 5 }],
      payments: [{ method: 'cash', amount_cents: 45000 }],
    });

    expect(sale?.id).toBeTruthy();
    expect(await onShelf(roseId)).toBe(85);
  });

  it('leaves the owner’s stock sheet showing what is physically there', async () => {
    // A stocktake counts the shelf. A reserve is not a physical fact, and a
    // sheet that subtracted it would have the florist counting 78 roses into
    // a fridge holding 90.
    await park([{ variant_id: roseId, quantity: 12 }]);

    const sheet = await listOnHand(storeId);
    expect(sheet.find((row) => row.variant_id === roseId)?.quantity).toBe(90);
  });

  // ── Letting go ────────────────────────────────────────────────────────────

  it('stops holding the moment the cart is picked up', async () => {
    const { cart } = await park([{ variant_id: roseId, quantity: 12 }]);
    expect(await offered(roseId)).toBe(78);

    const taken = await pickUp({ storeId, staffId, cartId: cart.id });

    expect(taken.status).toBe('picked');
    expect(taken.items).toHaveLength(1);
    expect(taken.items[0]).toMatchObject({ variant_id: roseId, quantity: 12 });
    expect(await offered(roseId)).toBe(90);
  });

  it('hands back the composition, so the other till rings the same bouquet', async () => {
    // The point of parking at all: what comes back has to be exactly what
    // `completeSale` takes, or the second till rings a different bouquet.
    const { cart } = await park([
      {
        variant_id: derivedBouquetId,
        quantity: 1,
        components: [
          { component_variant_id: roseId, quantity: 15 },
          { component_variant_id: eucalyptusId, quantity: 2 },
        ],
      },
    ]);

    const taken = await pickUp({ storeId, staffId, cartId: cart.id });

    expect(taken.items[0].components).toEqual([
      { component_variant_id: roseId, quantity: 15 },
      { component_variant_id: eucalyptusId, quantity: 2 },
    ]);
  });

  it('puts the flowers back when the cart is released', async () => {
    const { cart } = await park([{ variant_id: roseId, quantity: 12 }]);

    expect(await releaseCart({ storeId, staffId, cartId: cart.id })).toEqual({ released: true });
    expect(await offered(roseId)).toBe(90);
    // Idempotent: a second tap on a slow connection is the state the cashier
    // already asked for, not an error.
    expect(await releaseCart({ storeId, staffId, cartId: cart.id })).toEqual({ released: false });
  });

  it('stops holding the moment it lapses, with no cron having run', async () => {
    // Expiry is a predicate, not a job. A reserve that needed a cron to
    // release it would hold the fridge all weekend if the cron died on Friday.
    const { cart } = await park([{ variant_id: roseId, quantity: 12 }]);
    await pool.query(`UPDATE pos_parked_carts SET expires_at = NOW() - interval '1 minute' WHERE id = $1`, [
      cart.id,
    ]);

    expect(await offered(roseId)).toBe(90);
    expect(await listOpenCarts(storeId)).toHaveLength(0);
    // And it is not offered for pick-up either.
    await expect(pickUp({ storeId, staffId, cartId: cart.id })).rejects.toThrow(/минув/);
  });

  it('the cron only tidies up what has already stopped counting', async () => {
    const { cart } = await park([{ variant_id: roseId, quantity: 12 }]);
    await pool.query(`UPDATE pos_parked_carts SET expires_at = NOW() - interval '1 minute' WHERE id = $1`, [
      cart.id,
    ]);

    expect(await expireParkedCarts()).toBeGreaterThanOrEqual(1);
    expect((await getCart(storeId, cart.id))?.status).toBe('expired');
    expect(await offered(roseId)).toBe(90);
  });

  it('only one till gets a cart two tills reached for', async () => {
    const { cart } = await park([{ variant_id: roseId, quantity: 12 }]);

    await pickUp({ storeId, staffId, cartId: cart.id });
    await expect(pickUp({ storeId, staffId, cartId: cart.id })).rejects.toThrow(/забрали/);
  });

  // ── Bookkeeping ───────────────────────────────────────────────────────────

  it('a double tap parks one cart, not two holds on the same flowers', async () => {
    const uuid = randomUUID();
    const first = await park([{ variant_id: roseId, quantity: 12 }], { clientUuid: uuid });
    const again = await park([{ variant_id: roseId, quantity: 12 }], { clientUuid: uuid });

    expect(again.created).toBe(false);
    expect(again.cart.id).toBe(first.cart.id);
    expect(await offered(roseId)).toBe(78);
  });

  it('refuses a cart with no name and a cart with nothing in it', async () => {
    await expect(park([{ variant_id: roseId, quantity: 1 }], { label: '  ' })).rejects.toThrow(
      /Назвіть/
    );
    await expect(park([])).rejects.toThrow(/порожній/);
  });

  it('lists what this store is holding, newest first, with who parked it', async () => {
    await park([{ variant_id: roseId, quantity: 3 }], { label: 'Перший' });
    await park([{ variant_id: roseId, quantity: 3 }], { label: 'Другий' });

    const open = await listOpenCarts(storeId);
    expect(open.map((c) => c.label)).toEqual(['Другий', 'Перший']);
    expect(open[0].staff_name).toBeTruthy();
    expect(open[0].total_cents).toBe(27000);
  });

  it('another store’s carts hold nothing here', async () => {
    const other = await createTestStore('parkedx');
    try {
      const theirRose = (
        await seedProduct(other.storeId, { name: 'Троянда', priceCents: 9000, quantity: 50 })
      ).variantId;
      await parkCart({
        storeId: other.storeId,
        staffId: other.sellerId,
        clientUuid: randomUUID(),
        label: 'Чужий',
        items: [{ variant_id: theirRose, quantity: 20 }],
      });

      expect(await offered(roseId)).toBe(90);
      expect(await listOpenCarts(storeId)).toHaveLength(0);
    } finally {
      await dropTestStore(other.storeId);
    }
  });

  // ── Over HTTP ─────────────────────────────────────────────────────────────

  it('parks, lists and picks up over the API at staff level', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/pos/parked-carts',
      headers: auth(store.sellerToken),
      payload: {
        client_uuid: randomUUID(),
        label: 'Ірина, троянди',
        items: [{ variant_id: roseId, quantity: 7 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const cartId = created.json().id;

    const listed = await app.inject({
      method: 'GET',
      url: '/api/pos/parked-carts',
      headers: auth(store.sellerToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().carts.map((c: { id: number }) => c.id)).toContain(cartId);

    const taken = await app.inject({
      method: 'POST',
      url: `/api/pos/parked-carts/${cartId}/pick-up`,
      headers: auth(store.sellerToken),
    });
    expect(taken.statusCode).toBe(200);
    expect(taken.json().items[0]).toMatchObject({ variant_id: roseId, quantity: 7 });

    // Racing for it now is a 409, not a 400: it is a conflict, not a bad ask.
    const again = await app.inject({
      method: 'POST',
      url: `/api/pos/parked-carts/${cartId}/pick-up`,
      headers: auth(store.sellerToken),
    });
    expect(again.statusCode).toBe(409);
  });

  it('refuses an unauthenticated park', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/parked-carts',
      payload: { client_uuid: randomUUID(), label: 'X', items: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});
