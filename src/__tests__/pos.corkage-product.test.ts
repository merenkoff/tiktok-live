// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cork fee and the product the waiter rings for it are one thing
// (migration 105, `src/pos/public-menu/corkage-product.ts`).
//
// What these tests hold:
//   · switching the terms on gives the store ONE «Корковий збір», priced at the
//     fee, sold at the till and hidden from the QR menu — and a product the
//     owner made by hand is linked, never duplicated;
//   · the fee is one number: saved in «Свій алкоголь» it becomes the price,
//     changed on the card it moves the guest's page;
//   · switching off keeps the terms and the link and takes the product off the
//     till; switching on brings the SAME product back;
//   · the marketer does all of it, and the menu journal says who;
//   · the migration gives an existing store its product once, never twice.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import * as authService from '../pos/auth.service.js';
import { readMigration } from '../pos/migrations.js';
import { CORKAGE_STOCK } from '../pos/public-menu/corkage-product.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  issueToken,
  type TestStore,
} from './helpers/pos-fixtures.js';

const TERMS = { fee_cents: 10_000, min_food_cents: 70_000, note: 'Келихи й робота офіціанта входять.' };

describe.skipIf(!hasDb)('POS cork fee: the terms and their product', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let token = '';
  let marketerToken = '';

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, bearer: string, payload?: unknown) =>
    app.inject({ method, url: `/api/pos${url}`, headers: auth(bearer), payload: payload as object });
  const profile = async (bearer = store.ownerToken) => (await call('GET', '/store/profile', bearer)).json();
  const saveCorkage = (corkage: unknown, bearer = store.ownerToken) => call('PATCH', '/store/profile', bearer, { corkage });
  const guestCorkage = async () =>
    (await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` })).json().store.corkage;
  const corkProducts = async (storeId: number) =>
    (
      await pool.query(
        `SELECT p.id, p.is_active, p.menu_hidden, p.sellable, v.price_cents, s.quantity
           FROM pos_products p
           JOIN pos_variants v ON v.product_id = p.id
           LEFT JOIN pos_stock s ON s.variant_id = v.id
          WHERE p.store_id = $1 AND p.name ILIKE 'корк%'
          ORDER BY p.id`,
        [storeId]
      )
    ).rows;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('corkfee');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    const menu = await call('PATCH', '/store/public-menu', store.ownerToken, { enabled: true });
    expect(menu.statusCode).toBe(200);
    token = String((await pool.query(`SELECT public_menu_token FROM pos_stores WHERE id = $1`, [store.storeId])).rows[0].public_menu_token);
    const marketer = await authService.createStaff(store.storeId, { displayName: 'Оля', pin: '246813', role: 'marketer' });
    marketerToken = await issueToken(store.storeId, marketer.id);
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await app?.close();
  });

  it('switching the terms on makes one «Корковий збір» at the fee — sold at the till, hidden from the menu', async () => {
    const saved = await saveCorkage(TERMS);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      corkage: TERMS,
      corkage_on: true,
      corkage_terms: TERMS,
      corkage_product: { name: 'Корковий збір', price_cents: 10_000, active: true },
    });
    const rows = await corkProducts(store.storeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ is_active: true, menu_hidden: true, sellable: true, price_cents: 10_000 });
    expect(Number(rows[0].quantity)).toBe(CORKAGE_STOCK);
    expect(await guestCorkage()).toMatchObject({ fee_cents: 10_000, min_food_cents: 70_000 });

    // Saving again moves the same product's price — never a second one.
    await saveCorkage({ ...TERMS, fee_cents: 12_000 });
    const again = await corkProducts(store.storeId);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: rows[0].id, price_cents: 12_000 });
    expect(await guestCorkage()).toMatchObject({ fee_cents: 12_000 });
  });

  it('the price on the card is the fee on the guest’s page', async () => {
    const product = (await profile()).corkage_product;
    const card = (await call('GET', `/products/${product.id}`, store.ownerToken)).json();
    const priced = await call('PATCH', `/variants/${card.variants[0].id}`, store.ownerToken, { price_cents: 15_000 });
    expect(priced.statusCode).toBe(200);
    expect(await guestCorkage()).toMatchObject({ fee_cents: 15_000 });
    expect((await profile()).corkage).toMatchObject({ fee_cents: 15_000 });
  });

  it('off keeps the terms and the link and takes the product off the till; on brings the same one back', async () => {
    const before = (await profile()).corkage_product;
    const off = await saveCorkage(null);
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({
      corkage: null,
      corkage_on: false,
      // The fee last agreed to — the card's price — stays with the terms.
      corkage_terms: { ...TERMS, fee_cents: 15_000 },
      corkage_product: { id: before.id, active: false },
    });
    expect(await guestCorkage()).toBeNull();
    const archived = await corkProducts(store.storeId);
    expect(archived).toHaveLength(1);
    expect(archived[0].is_active).toBe(false);

    const on = await saveCorkage({ ...TERMS, fee_cents: 15_000 });
    expect(on.json().corkage_product).toMatchObject({ id: before.id, active: true, price_cents: 15_000 });
    expect(await corkProducts(store.storeId)).toHaveLength(1);
    expect(await guestCorkage()).toMatchObject({ fee_cents: 15_000 });
  });

  it('a fee of zero needs no product: the terms show «без збору» and the product leaves the till', async () => {
    const zero = await saveCorkage({ ...TERMS, fee_cents: 0 });
    expect(zero.json()).toMatchObject({ corkage_on: true, corkage: { fee_cents: 0 }, corkage_product: { active: false } });
    expect(await guestCorkage()).toMatchObject({ fee_cents: 0 });
    await saveCorkage({ ...TERMS, fee_cents: 10_000 });
    expect(await corkProducts(store.storeId)).toHaveLength(1);
  });

  it('the marketer sets the fee both ways, and the journal says she did', async () => {
    const saved = await saveCorkage({ ...TERMS, fee_cents: 11_000 }, marketerToken);
    expect(saved.statusCode).toBe(200);
    const product = saved.json().corkage_product;
    expect(product).toMatchObject({ price_cents: 11_000, active: true });

    const card = (await call('GET', `/products/${product.id}`, marketerToken)).json();
    expect((await call('PATCH', `/variants/${card.variants[0].id}`, marketerToken, { price_cents: 11_500 })).statusCode).toBe(200);
    expect(await guestCorkage()).toMatchObject({ fee_cents: 11_500 });

    const journal = (await call('GET', `/menu-changes?entity=product&entity_id=${product.id}`, store.ownerToken)).json();
    const byMarketer = journal.changes.filter((row: { staff_role: string }) => row.staff_role === 'marketer');
    expect(byMarketer.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(byMarketer)).toContain('11000');
  });

  it('links a «Корковий збір» the owner made by hand instead of making a second one', async () => {
    const other = await createTestStore('corkhand');
    try {
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [other.storeId]);
      const made = await call('POST', '/products', other.ownerToken, {
        name: 'Корковий збір',
        variants: [{ attributes: {}, price_cents: 5_000, quantity: 0 }],
      });
      expect(made.statusCode).toBe(201);
      const saved = await saveCorkage(TERMS, other.ownerToken);
      expect(saved.json().corkage_product).toMatchObject({ id: Number(made.json().id), price_cents: 10_000 });
      const rows = await corkProducts(other.storeId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ menu_hidden: true, price_cents: 10_000 });
    } finally {
      await dropTestStore(other.storeId);
    }
  });

  it('the migration gives a store with terms and no product its product once, and its own price is left alone', async () => {
    const legacy = await createTestStore('corkmig');
    try {
      // As 083 left «Шабля»: terms on, no product.
      await pool.query(
        `UPDATE pos_stores SET vertical = 'cafe', public_corkage = $2::jsonb, public_corkage_on = TRUE WHERE id = $1`,
        [legacy.storeId, JSON.stringify(TERMS)]
      );
      await pool.query(readMigration('105_pos_corkage_product.sql'));
      await pool.query(readMigration('105_pos_corkage_product.sql'));
      const rows = await corkProducts(legacy.storeId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ is_active: true, menu_hidden: true, sellable: true, price_cents: 10_000 });
      const link = (await pool.query(`SELECT public_corkage_product_id FROM pos_stores WHERE id = $1`, [legacy.storeId])).rows[0];
      expect(Number(link.public_corkage_product_id)).toBe(Number(rows[0].id));
      // What the migration made is what the API would have made.
      const view = (await call('GET', '/store/profile', legacy.ownerToken)).json();
      expect(view.corkage_product).toMatchObject({ name: 'Корковий збір', price_cents: 10_000, active: true });

      // A hand-made one with its own price is linked as it is.
      const hand = await createTestStore('corkmig2');
      try {
        await pool.query(
          `UPDATE pos_stores SET vertical = 'cafe', public_corkage = $2::jsonb, public_corkage_on = TRUE WHERE id = $1`,
          [hand.storeId, JSON.stringify(TERMS)]
        );
        await call('POST', '/products', hand.ownerToken, {
          name: 'Корковий збір',
          variants: [{ attributes: {}, price_cents: 8_000, quantity: 0 }],
        });
        await pool.query(readMigration('105_pos_corkage_product.sql'));
        const handRows = await corkProducts(hand.storeId);
        expect(handRows).toHaveLength(1);
        expect(handRows[0]).toMatchObject({ price_cents: 8_000, menu_hidden: true });
      } finally {
        await dropTestStore(hand.storeId);
      }
    } finally {
      await dropTestStore(legacy.storeId);
    }
  });
});
