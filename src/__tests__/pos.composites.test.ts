// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
} from './helpers/pos-fixtures.js';
import { completeSale, refundSale, voidSale } from '../pos/sales.service.js';
import {
  createProduct,
  getCatalog,
  listProducts,
  updateProduct,
  updateVariant,
} from '../pos/products.service.js';
import { adjustStock, listLowStock } from '../pos/stock.service.js';
import {
  addLine,
  createDocument,
  postDocument,
  reverseDocument,
} from '../pos/stock-documents.service.js';
import { listOnHand } from '../pos/stock-reports.service.js';
import {
  derivedAvailability,
  flattenComponents,
  listTechCards,
  wholeShare,
} from '../pos/composites.service.js';
import { parkCart, reservedFor } from '../pos/parked-carts.service.js';
import { readMigration } from '../pos/migrations.js';
import { randomUUID } from 'node:crypto';

/**
 * A bouquet is the first product whose stock is not its own. These run against
 * the real schema because every interesting failure here is a stock arithmetic
 * one: selling a composite must move its components, refunding it must move
 * back exactly what the sale took (not what the recipe says today), and a
 * composite assembled in advance must not be written off twice.
 */
/**
 * The boot-time rebuild of migration 116 without its DDL: the `ALTER TABLE
 * pos_variants` at its top takes an exclusive lock that, inside a test's
 * transaction, deadlocks with the other files writing variants right now. On
 * a real boot the migrations run before the API, alone.
 */
function flatRebuild116(): string {
  const sql = readMigration('116_pos_recipe_yield.sql');
  const at = sql.indexOf('DELETE FROM pos_product_components_flat;');
  if (at < 0) throw new Error('116 lost its flat rebuild');
  return sql.slice(at);
}

describe.skipIf(!hasDb)('POS composite products', () => {
  let storeId = 0;
  let staffId = 0;
  let stemId = 0;
  let wrapId = 0;

  async function stockOf(variantId: number): Promise<number> {
    const result = await pool.query(
      `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
      [variantId, storeId]
    );
    return Number(result.rows[0].quantity);
  }

  async function setStock(variantId: number, quantity: number): Promise<void> {
    await pool.query(
      `UPDATE pos_stock SET quantity = $1 WHERE variant_id = $2 AND store_id = $3`,
      [quantity, variantId, storeId]
    );
  }

  /** A bouquet of 5 stems + 1 wrap, assembled when it sells. */
  async function seedDerivedBouquet(name = 'Букет «Ніжність»') {
    const product = await createProduct(storeId, {
      name,
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: { color: 'Червоний' },
          price_cents: 50000,
          quantity: 0,
          components: [
            { component_variant_id: stemId, quantity: 5 },
            { component_variant_id: wrapId, quantity: 1 },
          ],
        },
      ],
    });
    const variant = product!.variants[0] as { id: number };
    return { productId: product!.id, variantId: variant.id };
  }

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await createTestStore('comp');
    storeId = store.storeId;
    staffId = store.ownerId;
    stemId = (await seedProduct(storeId, { name: 'Троянда', quantity: 100 })).variantId;
    wrapId = (await seedProduct(storeId, { name: 'Упаковка', quantity: 40 })).variantId;
  }, 60000);

  afterAll(async () => {
    await dropTestStore(storeId);
    await pool.end();
  });

  beforeEach(async () => {
    await setStock(stemId, 100);
    await setStock(wrapId, 40);
  });

  describe('availability', () => {
    it('is what the scarcest component allows', async () => {
      const { variantId } = await seedDerivedBouquet('Букет A');
      // 100 stems / 5 = 20 bouquets; 40 wraps / 1 = 40. The stems run out first.
      expect(await derivedAvailability(pool, storeId, variantId)).toBe(20);

      await setStock(wrapId, 3);
      expect(await derivedAvailability(pool, storeId, variantId)).toBe(3);
    });

    it('rounds down — four stems do not make a fifth of a bouquet', async () => {
      const { variantId } = await seedDerivedBouquet('Букет B');
      await setStock(stemId, 14);
      expect(await derivedAvailability(pool, storeId, variantId)).toBe(2);
    });

    it('is 0 for an empty composition, never unlimited', async () => {
      // The catalogue route refuses this, so build it the only way it could
      // ever exist: a composition emptied behind the service's back.
      const { variantId } = await seedDerivedBouquet('Букет C');
      // A state the service refuses to write; reached here by raw SQL, so the
      // expanded copy (which only `setComponents` and the boot rebuild keep in
      // step) has to be emptied by hand as well.
      await pool.query(`DELETE FROM pos_product_components WHERE variant_id = $1`, [variantId]);
      await pool.query(`DELETE FROM pos_product_components_flat WHERE variant_id = $1`, [
        variantId,
      ]);
      expect(await derivedAvailability(pool, storeId, variantId)).toBe(0);
    });

    it('reaches the till through the catalog, not the variant stock row', async () => {
      const { variantId } = await seedDerivedBouquet('Букет D');
      await setStock(stemId, 12);
      const catalog = await getCatalog(storeId, { q: 'Букет D' });
      const row = catalog.find((item) => item.variant_id === variantId);
      expect(row?.quantity).toBe(2);
      expect(await stockOf(variantId)).toBe(0);
    });
  });

  describe('selling', () => {
    it('writes off the components, not the bouquet', async () => {
      const { variantId } = await seedDerivedBouquet('Букет E');
      await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 3 }],
        payments: [{ method: 'cash', amount_cents: 150000 }],
      });

      expect(await stockOf(stemId)).toBe(100 - 15);
      expect(await stockOf(wrapId)).toBe(40 - 3);
      expect(await stockOf(variantId)).toBe(0);
    });

    it('records what each line took, so a later recipe edit cannot rewrite it', async () => {
      const { variantId } = await seedDerivedBouquet('Букет F');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 50000 }],
      });

      const snapshot = await pool.query(
        `SELECT c.component_variant_id, c.quantity_per_unit
         FROM pos_sale_item_components c
         JOIN pos_sale_items i ON i.id = c.sale_item_id
         WHERE i.sale_id = $1
         ORDER BY c.sort_order`,
        [sale!.id]
      );
      expect(snapshot.rows.map((r) => [Number(r.component_variant_id), Number(r.quantity_per_unit)]))
        .toEqual([[stemId, 5], [wrapId, 1]]);
    });

    it('leaves the components alone for a composite with its own stock', async () => {
      const product = await createProduct(storeId, {
        name: 'Готовий букет',
        kind: 'composite',
        stock_mode: 'own',
        variants: [
          {
            attributes: {},
            price_cents: 60000,
            quantity: 4,
            components: [{ component_variant_id: stemId, quantity: 7 }],
          },
        ],
      });
      const variantId = (product!.variants[0] as { id: number }).id;

      await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 2 }],
        payments: [{ method: 'cash', amount_cents: 120000 }],
      });

      // The production document already took the stems; taking them again here
      // would write off the same flowers twice.
      expect(await stockOf(stemId)).toBe(100);
      expect(await stockOf(variantId)).toBe(2);
    });

    it('refuses a derived composite with nothing in it', async () => {
      const { variantId } = await seedDerivedBouquet('Букет G');
      // Raw SQL, as above: the expanded copy goes with the authored rows.
      await pool.query(`DELETE FROM pos_product_components WHERE variant_id = $1`, [variantId]);
      await pool.query(`DELETE FROM pos_product_components_flat WHERE variant_id = $1`, [
        variantId,
      ]);
      await expect(
        completeSale({
          storeId,
          staffId,
          items: [{ variant_id: variantId, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 50000 }],
        })
      ).rejects.toThrow(/no composition/i);
      expect(await stockOf(stemId)).toBe(100);
    });

    it('counts a bouquet sale in the same "sale" movements as a loose stem', async () => {
      const { variantId } = await seedDerivedBouquet('Букет H');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 50000 }],
      });
      const moves = await pool.query(
        `SELECT variant_id, delta, reason FROM pos_stock_movements
         WHERE store_id = $1 AND reference_type = 'sale' AND reference_id = $2
         ORDER BY id`,
        [storeId, sale!.id]
      );
      expect(moves.rows.map((r) => [Number(r.variant_id), Number(r.delta), r.reason])).toEqual([
        [stemId, -5, 'sale'],
        [wrapId, -1, 'sale'],
      ]);
    });
  });

  describe('giving it back', () => {
    it('returns the components on a void', async () => {
      const { variantId } = await seedDerivedBouquet('Букет I');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 2 }],
        payments: [{ method: 'cash', amount_cents: 100000 }],
      });
      await voidSale({ storeId, staffId, saleId: sale!.id });

      expect(await stockOf(stemId)).toBe(100);
      expect(await stockOf(wrapId)).toBe(40);
    });

    it('returns a partial refund proportionally', async () => {
      const { variantId } = await seedDerivedBouquet('Букет J');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 3 }],
        payments: [{ method: 'cash', amount_cents: 150000 }],
      });
      const saleItemId = Number(
        (await pool.query(`SELECT id FROM pos_sale_items WHERE sale_id = $1`, [sale!.id]))
          .rows[0].id
      );

      await refundSale({
        storeId,
        staffId,
        saleId: sale!.id,
        items: [{ sale_item_id: saleItemId, quantity: 1 }],
      });

      // Sold 3 (15 stems), returned 1 → 5 stems back, 10 still gone.
      expect(await stockOf(stemId)).toBe(100 - 10);
      expect(await stockOf(wrapId)).toBe(40 - 2);
    });

    it('gives back what the sale took, not what the recipe says today', async () => {
      const { variantId } = await seedDerivedBouquet('Букет K');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 50000 }],
      });
      expect(await stockOf(stemId)).toBe(95);

      // The florist reworks the bouquet: 9 stems from now on.
      await updateVariant(storeId, variantId, {
        components: [
          { component_variant_id: stemId, quantity: 9 },
          { component_variant_id: wrapId, quantity: 1 },
        ],
      });
      const recipe = await pool.query(
        `SELECT quantity FROM pos_product_components
         WHERE variant_id = $1 AND component_variant_id = $2`,
        [variantId, stemId]
      );
      expect(Number(recipe.rows[0].quantity)).toBe(9);

      await voidSale({ storeId, staffId, saleId: sale!.id });
      // 5 back, because 5 is what left the shop. Re-deriving would have
      // credited 9 and invented four roses.
      expect(await stockOf(stemId)).toBe(100);
    });
  });

  describe('production document', () => {
    /** A bouquet assembled in advance: 6 stems + 1 wrap, counted on its own row. */
    async function seedOwnBouquet(name: string, quantity = 0) {
      const product = await createProduct(storeId, {
        name,
        kind: 'composite',
        stock_mode: 'own',
        variants: [
          {
            attributes: {},
            price_cents: 70000,
            quantity,
            components: [
              { component_variant_id: stemId, quantity: 6 },
              { component_variant_id: wrapId, quantity: 1 },
            ],
          },
        ],
      });
      return (product!.variants[0] as { id: number }).id;
    }

    async function produce(variantId: number, quantity: number) {
      const doc = await createDocument({ storeId, staffId, type: 'production' });
      await addLine({ storeId, documentId: doc.id, variantId, quantity });
      return postDocument({ storeId, documentId: doc.id, staffId });
    }

    it('takes the components off the shelf and puts bouquets on it', async () => {
      const variantId = await seedOwnBouquet('Букет P');
      await produce(variantId, 5);

      expect(await stockOf(stemId)).toBe(100 - 30);
      expect(await stockOf(wrapId)).toBe(40 - 5);
      expect(await stockOf(variantId)).toBe(5);
    });

    it('costs the bouquet from its components, not from a typed-in number', async () => {
      const variantId = await seedOwnBouquet('Букет Q');
      // seedProduct leaves cost_cents at 0, so give the components a cost.
      await pool.query(`UPDATE pos_variants SET cost_cents = 2000 WHERE id = $1`, [stemId]);
      await pool.query(`UPDATE pos_variants SET cost_cents = 500 WHERE id = $1`, [wrapId]);

      const posted = await produce(variantId, 2);
      const expected = 6 * 2000 + 1 * 500;
      const variant = await pool.query(`SELECT cost_cents FROM pos_variants WHERE id = $1`, [
        variantId,
      ]);
      expect(Number(variant.rows[0].cost_cents)).toBe(expected);
      const line = await pool.query(
        `SELECT unit_cost_cents FROM pos_stock_document_lines WHERE document_id = $1`,
        [posted.id]
      );
      expect(Number(line.rows[0].unit_cost_cents)).toBe(expected);
      await pool.query(`UPDATE pos_variants SET cost_cents = 0 WHERE id IN ($1, $2)`, [
        stemId,
        wrapId,
      ]);
    });

    it('sells an assembled bouquet without touching the components again', async () => {
      const variantId = await seedOwnBouquet('Букет R');
      await produce(variantId, 3);
      const afterProduction = await stockOf(stemId);

      await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 70000 }],
      });

      expect(await stockOf(stemId)).toBe(afterProduction);
      expect(await stockOf(variantId)).toBe(2);
    });

    it('un-assembles on reversal', async () => {
      const variantId = await seedOwnBouquet('Букет S');
      const posted = await produce(variantId, 4);
      await reverseDocument({ storeId, documentId: posted.id, staffId });

      expect(await stockOf(stemId)).toBe(100);
      expect(await stockOf(wrapId)).toBe(40);
      expect(await stockOf(variantId)).toBe(0);
    });

    it('reverses what it produced, not what the recipe says today', async () => {
      const variantId = await seedOwnBouquet('Букет T');
      const posted = await produce(variantId, 2);
      expect(await stockOf(stemId)).toBe(100 - 12);

      await updateVariant(storeId, variantId, {
        components: [
          { component_variant_id: stemId, quantity: 15 },
          { component_variant_id: wrapId, quantity: 1 },
        ],
      });
      await reverseDocument({ storeId, documentId: posted.id, staffId });

      expect(await stockOf(stemId)).toBe(100);
    });

    it('refuses to un-assemble bouquets that already left the shop', async () => {
      const variantId = await seedOwnBouquet('Букет U');
      const posted = await produce(variantId, 2);
      await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 2 }],
        payments: [{ method: 'cash', amount_cents: 140000 }],
      });

      await expect(
        reverseDocument({ storeId, documentId: posted.id, staffId })
      ).rejects.toThrow(/insufficient stock/i);
      // The failed reversal rolled back whole — the stems stayed where they were.
      expect(await stockOf(stemId)).toBe(100 - 12);
    });

    it('refuses a line for a derived composite', async () => {
      const { variantId } = await seedDerivedBouquet('Букет V');
      const doc = await createDocument({ storeId, staffId, type: 'production' });
      await expect(
        addLine({ storeId, documentId: doc.id, variantId, quantity: 1 })
      ).rejects.toThrow(/assembled when it sells/i);
    });

    it('refuses a line for a simple product', async () => {
      const doc = await createDocument({ storeId, staffId, type: 'production' });
      await expect(
        addLine({ storeId, documentId: doc.id, variantId: stemId, quantity: 1 })
      ).rejects.toThrow(/not a composite/i);
    });
  });

  describe('a bouquet assembled at the counter', () => {
    /**
     * The catalogue card a florist rings custom work on: a derived composite
     * whose stored composition is only a default. Each sale line may carry its
     * own instead.
     */
    async function seedCustomCard(name: string) {
      const product = await createProduct(storeId, {
        name,
        kind: 'composite',
        stock_mode: 'derived',
        variants: [
          {
            attributes: {},
            price_cents: 1,
            quantity: 0,
            components: [{ component_variant_id: stemId, quantity: 1 }],
          },
        ],
      });
      return (product!.variants[0] as { id: number }).id;
    }

    it('prices itself from its stems and writes exactly them off', async () => {
      const variantId = await seedCustomCard('Букет на замовлення A');
      // seedProduct prices every variant at 10000 by default.
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          {
            variant_id: variantId,
            quantity: 1,
            components: [
              { component_variant_id: stemId, quantity: 7 },
              { component_variant_id: wrapId, quantity: 1 },
            ],
          },
        ],
        payments: [{ method: 'cash', amount_cents: 80000 }],
      });

      expect(sale!.total_cents).toBe(8 * 10000);
      expect(await stockOf(stemId)).toBe(100 - 7);
      expect(await stockOf(wrapId)).toBe(40 - 1);
      // The card's own composition was a default, not what was sold.
      expect(sale!.items[0].components).toEqual([
        expect.objectContaining({ component_variant_id: stemId, quantity_per_unit: 7 }),
        expect.objectContaining({ component_variant_id: wrapId, quantity_per_unit: 1 }),
      ]);
    });

    it('keeps two custom bouquets off one card as two lines', async () => {
      const variantId = await seedCustomCard('Букет на замовлення B');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          { variant_id: variantId, quantity: 1, components: [{ component_variant_id: stemId, quantity: 3 }] },
          { variant_id: variantId, quantity: 1, components: [{ component_variant_id: wrapId, quantity: 2 }] },
        ],
        payments: [{ method: 'cash', amount_cents: 50000 }],
      });

      // Merging them would have thrown one of the two recipes away.
      expect(sale!.items).toHaveLength(2);
      expect(sale!.items[0].components).toHaveLength(1);
      expect(sale!.items[1].components).toHaveLength(1);
      expect(await stockOf(stemId)).toBe(100 - 3);
      expect(await stockOf(wrapId)).toBe(40 - 2);
    });

    it('refunds what that very bouquet contained', async () => {
      const variantId = await seedCustomCard('Букет на замовлення C');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          {
            variant_id: variantId,
            quantity: 2,
            components: [{ component_variant_id: stemId, quantity: 4 }],
          },
        ],
        payments: [{ method: 'cash', amount_cents: 80000 }],
      });
      expect(await stockOf(stemId)).toBe(100 - 8);

      await refundSale({
        storeId,
        staffId,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      });
      expect(await stockOf(stemId)).toBe(100 - 4);
    });

    it('refuses a custom composition on a product that is not assembled at sale time', async () => {
      const product = await createProduct(storeId, {
        name: 'Готовий букет на касі',
        kind: 'composite',
        stock_mode: 'own',
        variants: [
          {
            attributes: {},
            price_cents: 1000,
            quantity: 5,
            components: [{ component_variant_id: stemId, quantity: 2 }],
          },
        ],
      });
      const variantId = (product!.variants[0] as { id: number }).id;

      await expect(
        completeSale({
          storeId,
          staffId,
          items: [
            {
              variant_id: variantId,
              quantity: 1,
              components: [{ component_variant_id: stemId, quantity: 3 }],
            },
          ],
          payments: [{ method: 'cash', amount_cents: 30000 }],
        })
      ).rejects.toThrow(/cannot be assembled at the till/i);
      expect(await stockOf(stemId)).toBe(100);
    });

    it('refuses a bouquet inside a bouquet, same as the catalogue does', async () => {
      const variantId = await seedCustomCard('Букет на замовлення D');
      const inner = await seedDerivedBouquet('Букет на замовлення E');
      await expect(
        completeSale({
          storeId,
          staffId,
          items: [
            {
              variant_id: variantId,
              quantity: 1,
              components: [{ component_variant_id: inner.variantId, quantity: 1 }],
            },
          ],
          payments: [{ method: 'cash', amount_cents: 100000 }],
        })
      ).rejects.toThrow(/itself composite/i);
    });

    it('does not disturb an ordinary line rung on the same receipt', async () => {
      const variantId = await seedCustomCard('Букет на замовлення F');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          { variant_id: stemId, quantity: 2 },
          {
            variant_id: variantId,
            quantity: 1,
            components: [{ component_variant_id: stemId, quantity: 5 }],
          },
        ],
        payments: [{ method: 'cash', amount_cents: 200000 }],
      });

      expect(sale!.total_cents).toBe(2 * 10000 + 5 * 10000);
      expect(await stockOf(stemId)).toBe(100 - 7);
    });

    it('names the line by what went in, not by the catalogue card', async () => {
      // The card is «Букет на замовлення» for every custom bouquet ever rung
      // on it; the ПРРО receipt would otherwise show the same line every time.
      const variantId = await seedCustomCard('Букет на замовлення G');
      const sale = await completeSale({
        storeId,
        staffId,
        items: [
          {
            variant_id: variantId,
            quantity: 1,
            components: [
              { component_variant_id: stemId, quantity: 9 },
              { component_variant_id: wrapId, quantity: 1 },
            ],
          },
        ],
        payments: [{ method: 'cash', amount_cents: 100000 }],
      });
      expect(sale!.items[0].variant_label).toBe('10 стебел');
    });

    it('adds the store assembly charge on top of the stems', async () => {
      const variantId = await seedCustomCard('Букет на замовлення H');
      await pool.query(`UPDATE pos_stores SET florist_labour_bps = 2500 WHERE id = $1`, [storeId]);
      try {
        const sale = await completeSale({
          storeId,
          staffId,
          items: [
            {
              variant_id: variantId,
              quantity: 1,
              components: [{ component_variant_id: stemId, quantity: 4 }],
            },
          ],
          payments: [{ method: 'cash', amount_cents: 100000 }],
        });
        // 4 × 100 ₴ = 400 ₴ of stems, +25% for the work.
        expect(sale!.total_cents).toBe(50000);
      } finally {
        await pool.query(`UPDATE pos_stores SET florist_labour_bps = 0 WHERE id = $1`, [storeId]);
      }
    });
  });

  describe('the catalog tells the till what a card is', () => {
    it('carries kind, stock mode and the recipe for a composite', async () => {
      // Without this the till cannot distinguish a bouquet card from a rose —
      // the only endpoint that used to carry it is owner-only.
      const { variantId } = await seedDerivedBouquet('Букет P');
      const catalog = await getCatalog(storeId, { snapshot: true });
      const bouquet = catalog.find((item) => item.variant_id === variantId);
      expect(bouquet?.kind).toBe('composite');
      expect(bouquet?.stock_mode).toBe('derived');
      expect(bouquet?.components).toEqual([
        expect.objectContaining({ component_variant_id: stemId, quantity: 5, unit: 'шт' }),
        expect.objectContaining({ component_variant_id: wrapId, quantity: 1 }),
      ]);
      // Resolved, not just ids: the bench shows names without a second call.
      expect(bouquet?.components?.[0].product_name).toBe('Троянда');
    });

    it('leaves a simple product without a recipe at all', async () => {
      const catalog = await getCatalog(storeId, { snapshot: true });
      const stem = catalog.find((item) => item.variant_id === stemId);
      expect(stem?.kind).toBe('simple');
      expect(stem?.stock_mode).toBe('own');
      // Absent, not empty: "no recipe" and "an empty recipe" are different
      // facts, and only the second one is a problem.
      expect(stem?.components).toBeUndefined();
    });
  });

  describe('what a derived composite is not', () => {
    it('cannot be adjusted by hand', async () => {
      const { variantId } = await seedDerivedBouquet('Букет L');
      await expect(
        adjustStock({ storeId, variantId, delta: 5, staffId })
      ).rejects.toThrow(/derived composite/i);
    });

    it('stays out of the on-hand sheet and the low-stock list', async () => {
      const { variantId } = await seedDerivedBouquet('Букет M');
      const onHand = await listOnHand(storeId);
      expect(onHand.some((row) => row.variant_id === variantId)).toBe(false);

      const low = await listLowStock(storeId, 3);
      expect(low.some((row) => row.variant_id === variantId)).toBe(false);
    });
  });

  describe('write validation', () => {
    it('refuses a derived composite with no composition', async () => {
      await expect(
        createProduct(storeId, {
          name: 'Порожній букет',
          kind: 'composite',
          stock_mode: 'derived',
          variants: [{ attributes: {}, price_cents: 1000, quantity: 0 }],
        })
      ).rejects.toThrow(/at least one component/i);
    });

    it('refuses opening stock on a derived composite', async () => {
      await expect(
        createProduct(storeId, {
          name: 'Букет із залишком',
          kind: 'composite',
          stock_mode: 'derived',
          variants: [
            {
              attributes: {},
              price_cents: 1000,
              quantity: 7,
              components: [{ component_variant_id: stemId, quantity: 1 }],
            },
          ],
        })
      ).rejects.toThrow(/quantity must be 0/i);
    });

    it('refuses components on a simple product', async () => {
      await expect(
        createProduct(storeId, {
          name: 'Проста троянда',
          variants: [
            {
              attributes: {},
              price_cents: 1000,
              components: [{ component_variant_id: stemId, quantity: 1 }],
            },
          ],
        })
      ).rejects.toThrow(/only a composite/i);
    });

    it('refuses derived stock on a simple product', async () => {
      await expect(
        createProduct(storeId, {
          name: 'Проста похідна',
          stock_mode: 'derived',
          variants: [{ attributes: {}, price_cents: 1000 }],
        })
      ).rejects.toThrow(/only a composite/i);
    });

    it('refuses a composite inside a composite', async () => {
      const inner = await seedDerivedBouquet('Букет N');
      await expect(
        createProduct(storeId, {
          name: 'Букет із букета',
          kind: 'composite',
          stock_mode: 'derived',
          variants: [
            {
              attributes: {},
              price_cents: 1000,
              components: [{ component_variant_id: inner.variantId, quantity: 1 }],
            },
          ],
        })
      ).rejects.toThrow(/itself composite/i);
    });

    it('refuses a component listed twice', async () => {
      await expect(
        createProduct(storeId, {
          name: 'Двічі троянда',
          kind: 'composite',
          stock_mode: 'derived',
          variants: [
            {
              attributes: {},
              price_cents: 1000,
              components: [
                { component_variant_id: stemId, quantity: 1 },
                { component_variant_id: stemId, quantity: 2 },
              ],
            },
          ],
        })
      ).rejects.toThrow(/listed twice/i);
    });

    it('refuses switching to derived while stock is still on the shelf', async () => {
      const product = await createProduct(storeId, {
        name: 'Букет у холодильнику',
        kind: 'composite',
        stock_mode: 'own',
        variants: [
          {
            attributes: {},
            price_cents: 1000,
            quantity: 3,
            components: [{ component_variant_id: stemId, quantity: 2 }],
          },
        ],
      });
      await expect(
        updateProduct(storeId, product!.id, { stock_mode: 'derived' })
      ).rejects.toThrow(/write off the remaining stock/i);
    });

    it('allows a reshape on a multi-component composite with no stock left', async () => {
      // A join-based version of this check counted one variant twice (once per
      // component) and refused a product that is perfectly fine.
      const product = await createProduct(storeId, {
        name: 'Букет на дві складові',
        kind: 'composite',
        stock_mode: 'own',
        variants: [
          {
            attributes: {},
            price_cents: 1000,
            quantity: 0,
            components: [
              { component_variant_id: stemId, quantity: 3 },
              { component_variant_id: wrapId, quantity: 2 },
            ],
          },
        ],
      });
      const updated = await updateProduct(storeId, product!.id, { stock_mode: 'derived' });
      expect(updated!.stock_mode).toBe('derived');
    });

    it('refuses making a composite simple while a composition still exists', async () => {
      const { productId } = await seedDerivedBouquet('Букет O');
      await expect(
        updateProduct(storeId, productId, { kind: 'simple' })
      ).rejects.toThrow(/clear the composition/i);
    });
  });
  describe('a recipe inside a recipe (café)', () => {
    // Everything here runs on a café store. Flowers and clothing keep the
    // one-level rule (`maxCompositionDepth: 1`) — the "itself composite"
    // cases above are what pin that — while a café allows dish →
    // semi-finished → semi-finished → ingredients, expanded into
    // `pos_product_components_flat` (migration 045) so that availability,
    // write-off and production never recurse.
    let cafeId = 0;
    let cafeStaff = 0;
    let beans = 0;
    let sugar = 0;
    let water = 0;
    let milk = 0;
    let cup = 0;
    /** Derived semi-finished: 5 г sugar + 5 мл water per portion. */
    let syrup = 0;
    /** Own semi-finished: 10 г sugar + 10 мл milk per portion, made in advance. */
    let sauce = 0;
    /** The dish: 18 г beans, 1 syrup portion, 1 sauce portion, 1 cup. */
    let latte = 0;

    async function ingredient(name: string, unit: string, quantity: number, cost = 0) {
      const product = await createProduct(cafeId, {
        name,
        sellable: false,
        variants: [{ attributes: {}, unit, price_cents: 100, cost_cents: cost, quantity }],
      });
      return (product!.variants[0] as { id: number }).id;
    }

    async function recipe(
      name: string,
      stockMode: 'own' | 'derived',
      components: Array<{ component_variant_id: number; quantity: number }>,
      price = 6500
    ) {
      const product = await createProduct(cafeId, {
        name,
        kind: 'composite',
        stock_mode: stockMode,
        variants: [{ attributes: {}, price_cents: price, quantity: 0, components }],
      });
      return {
        productId: product!.id,
        variantId: (product!.variants[0] as { id: number }).id,
      };
    }

    async function flatOf(variantId: number): Promise<Record<number, number>> {
      const rows = await pool.query(
        `SELECT leaf_variant_id, quantity_per_unit
         FROM pos_product_components_flat
         WHERE store_id = $1 AND variant_id = $2
         ORDER BY leaf_variant_id`,
        [cafeId, variantId]
      );
      return Object.fromEntries(
        rows.rows.map((r) => [Number(r.leaf_variant_id), Number(r.quantity_per_unit)])
      );
    }

    async function cafeStockOf(variantId: number): Promise<number> {
      const result = await pool.query(
        `SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`,
        [variantId, cafeId]
      );
      return Number(result.rows[0].quantity);
    }

    async function produce(variantId: number, quantity: number) {
      const doc = await createDocument({ storeId: cafeId, staffId: cafeStaff, type: 'production' });
      await addLine({ storeId: cafeId, documentId: doc.id, variantId, quantity });
      return postDocument({ storeId: cafeId, documentId: doc.id, staffId: cafeStaff });
    }

    async function snapshotOf(saleId: number): Promise<Record<number, number>> {
      const rows = await pool.query(
        `SELECT c.component_variant_id, c.quantity_per_unit
         FROM pos_sale_item_components c
         JOIN pos_sale_items i ON i.id = c.sale_item_id
         WHERE i.sale_id = $1`,
        [saleId]
      );
      return Object.fromEntries(
        rows.rows.map((r) => [Number(r.component_variant_id), Number(r.quantity_per_unit)])
      );
    }

    beforeAll(async () => {
      const store = await createTestStore('cafe');
      cafeId = store.storeId;
      cafeStaff = store.ownerId;
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafeId]);
      beans = await ingredient('Зерно', 'г', 1000, 100);
      sugar = await ingredient('Цукор', 'г', 1000, 5);
      water = await ingredient('Вода', 'мл', 10000, 1);
      milk = await ingredient('Молоко', 'мл', 5000, 4);
      cup = await ingredient('Стакан', 'шт', 100, 300);
      syrup = (
        await recipe('Сироп (порція)', 'derived', [
          { component_variant_id: sugar, quantity: 5 },
          { component_variant_id: water, quantity: 5 },
        ], 1000)
      ).variantId;
      sauce = (
        await recipe('Карамельний соус (порція)', 'own', [
          { component_variant_id: sugar, quantity: 10 },
          { component_variant_id: milk, quantity: 10 },
        ])
      ).variantId;
      latte = (
        await recipe('Латте карамель', 'derived', [
          { component_variant_id: beans, quantity: 18 },
          { component_variant_id: syrup, quantity: 1 },
          { component_variant_id: sauce, quantity: 1 },
          { component_variant_id: cup, quantity: 1 },
        ])
      ).variantId;
    });

    afterAll(async () => {
      if (cafeId) await dropTestStore(cafeId);
    });

    it('expands a derived semi-finished into its ingredients and keeps a made-in-advance one whole', async () => {
      expect(await flatOf(syrup)).toEqual({ [sugar]: 5, [water]: 5 });
      // An own composite has its own expansion (production reads it)…
      expect(await flatOf(sauce)).toEqual({ [sugar]: 10, [milk]: 10 });
      // …but inside the latte it is a leaf: its ingredients left with the
      // production document, and taking them again would count them twice.
      expect(await flatOf(latte)).toEqual({
        [beans]: 18,
        [sugar]: 5,
        [water]: 5,
        [sauce]: 1,
        [cup]: 1,
      });
    });

    it('counts availability over the leaves, including the sauce on its own shelf', async () => {
      // No sauce made yet → no latte, however much sugar there is.
      expect(await derivedAvailability(pool, cafeId, latte)).toBe(0);
      const before = await getCatalog(cafeId);
      expect(before.find((c) => c.variant_id === latte)?.quantity).toBe(0);
      // Ingredients are off the menu, the dish is on it.
      expect(before.some((c) => c.variant_id === sugar)).toBe(false);

      await produce(sauce, 10);
      expect(await cafeStockOf(sauce)).toBe(10);
      expect(await cafeStockOf(sugar)).toBe(1000 - 100);
      expect(await cafeStockOf(milk)).toBe(5000 - 100);
      // min(1000/18, 900/5, 10000/5, 10/1, 100/1) = 10
      expect(await derivedAvailability(pool, cafeId, latte)).toBe(10);
      const after = await getCatalog(cafeId);
      expect(after.find((c) => c.variant_id === latte)?.quantity).toBe(10);
    });

    it('writes off the leaves on a sale, snapshots exactly them, and gives them back on a refund', async () => {
      const sale = await completeSale({
        storeId: cafeId,
        staffId: cafeStaff,
        items: [{ variant_id: latte, quantity: 2 }],
        payments: [{ method: 'cash', amount_cents: 13000 }],
      });
      expect(await cafeStockOf(beans)).toBe(1000 - 36);
      expect(await cafeStockOf(sugar)).toBe(900 - 10);
      expect(await cafeStockOf(water)).toBe(10000 - 10);
      expect(await cafeStockOf(sauce)).toBe(10 - 2);
      expect(await cafeStockOf(cup)).toBe(100 - 2);
      // The syrup itself is not a shelf: nothing moved on its row, and it is
      // not in the snapshot — the snapshot is shelves only.
      expect(await cafeStockOf(syrup)).toBe(0);
      expect(await snapshotOf(sale!.id)).toEqual({
        [beans]: 18,
        [sugar]: 5,
        [water]: 5,
        [sauce]: 1,
        [cup]: 1,
      });

      await refundSale({
        storeId: cafeId,
        staffId: cafeStaff,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      });
      expect(await cafeStockOf(beans)).toBe(1000 - 18);
      expect(await cafeStockOf(sugar)).toBe(900 - 5);
      expect(await cafeStockOf(sauce)).toBe(10 - 1);
      expect(await cafeStockOf(cup)).toBe(100 - 1);
    });

    it('cascades an inner recipe edit into every dish above it, but not into what was already sold', async () => {
      const sale = await completeSale({
        storeId: cafeId,
        staffId: cafeStaff,
        items: [{ variant_id: latte, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 6500 }],
      });
      const sugarBefore = await cafeStockOf(sugar);

      // The syrup gets sweeter: 8 г of sugar per portion instead of 5.
      await updateVariant(cafeId, syrup, {
        components: [
          { component_variant_id: sugar, quantity: 8 },
          { component_variant_id: water, quantity: 5 },
        ],
      });
      expect((await flatOf(latte))[sugar]).toBe(8);
      // The sale made with the old syrup still says 5 — and returns 5.
      expect((await snapshotOf(sale!.id))[sugar]).toBe(5);
      await refundSale({
        storeId: cafeId,
        staffId: cafeStaff,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      });
      expect(await cafeStockOf(sugar)).toBe(sugarBefore + 5);
    });

    it('turns a made-in-advance semi-finished into an expansion when it becomes made-to-order', async () => {
      const paste = await recipe('Паста (порція)', 'own', [
        { component_variant_id: sugar, quantity: 3 },
        { component_variant_id: milk, quantity: 3 },
      ]);
      const dish = await recipe('Десерт', 'derived', [
        { component_variant_id: paste.variantId, quantity: 2 },
        { component_variant_id: cup, quantity: 1 },
      ]);
      expect(await flatOf(dish.variantId)).toEqual({ [paste.variantId]: 2, [cup]: 1 });

      // Nothing on its shelf, so the flip is allowed — and every dish above
      // it now takes the paste's ingredients instead of the paste.
      await updateProduct(cafeId, paste.productId, { stock_mode: 'derived' });
      expect(await flatOf(dish.variantId)).toEqual({ [sugar]: 6, [milk]: 6, [cup]: 1 });
    });

    it('refuses a cycle, even one that runs through a made-in-advance product', async () => {
      await expect(
        updateVariant(cafeId, syrup, {
          components: [
            { component_variant_id: sugar, quantity: 5 },
            { component_variant_id: latte, quantity: 1 },
          ],
        })
      ).rejects.toThrow(/contain itself/i);
      // Own↔own would not loop at sale time, but would the moment one side is
      // flipped to derived — so the authored graph is acyclic, full stop.
      await expect(
        updateVariant(cafeId, sauce, {
          components: [{ component_variant_id: latte, quantity: 1 }],
        })
      ).rejects.toThrow(/contain itself/i);
      // Nothing changed.
      expect(await flatOf(latte)).toMatchObject({ [sauce]: 1, [sugar]: 8 });
    });

    it('refuses a fourth level, whichever end of the chain is being edited', async () => {
      const d = await recipe('D', 'derived', [{ component_variant_id: sugar, quantity: 1 }]);
      const c = await recipe('C', 'derived', [{ component_variant_id: d.variantId, quantity: 1 }]);
      const b = await recipe('B', 'derived', [{ component_variant_id: c.variantId, quantity: 1 }]);
      expect(await flatOf(b.variantId)).toEqual({ [sugar]: 1 });

      // From the top: a fourth recipe over three.
      await expect(
        recipe('A', 'derived', [{ component_variant_id: b.variantId, quantity: 1 }])
      ).rejects.toThrow(/too deep/i);

      // From the bottom: putting a recipe under D makes B four deep. D itself
      // would be fine, so the message names B.
      const e = await recipe('E', 'derived', [{ component_variant_id: water, quantity: 1 }]);
      await expect(
        updateVariant(cafeId, d.variantId, {
          components: [{ component_variant_id: e.variantId, quantity: 1 }],
        })
      ).rejects.toThrow(new RegExp(`variant ${b.variantId} would be 4 levels deep`));
    });

    it('produces a semi-finished through its own inner recipe, costed from the leaves', async () => {
      // Sugar 5, water 1, milk 4 per unit (cents).
      const glaze = await recipe('Глазур (порція)', 'own', [
        { component_variant_id: syrup, quantity: 2 }, // 16 г sugar + 10 мл water
        { component_variant_id: milk, quantity: 10 },
      ]);
      const sugarBefore = await cafeStockOf(sugar);
      const waterBefore = await cafeStockOf(water);
      const milkBefore = await cafeStockOf(milk);

      await produce(glaze.variantId, 3);

      expect(await cafeStockOf(glaze.variantId)).toBe(3);
      expect(await cafeStockOf(sugar)).toBe(sugarBefore - 16 * 3);
      expect(await cafeStockOf(water)).toBe(waterBefore - 10 * 3);
      expect(await cafeStockOf(milk)).toBe(milkBefore - 10 * 3);
      const variant = await pool.query(`SELECT cost_cents FROM pos_variants WHERE id = $1`, [
        glaze.variantId,
      ]);
      expect(Number(variant.rows[0].cost_cents)).toBe(16 * 5 + 10 * 1 + 10 * 4);
    });

    it('expands a semi-finished carried on a till line the same way', async () => {
      const card = (
        await recipe('Напій на замовлення', 'derived', [
          { component_variant_id: beans, quantity: 18 },
        ], 1)
      ).variantId;
      const sugarBefore = await cafeStockOf(sugar);
      const beansBefore = await cafeStockOf(beans);

      const sale = await completeSale({
        storeId: cafeId,
        staffId: cafeStaff,
        items: [
          {
            variant_id: card,
            quantity: 1,
            components: [
              { component_variant_id: syrup, quantity: 2 },
              { component_variant_id: beans, quantity: 10 },
            ],
          },
        ],
        // Priced from the components: 2 × 1000 (syrup card) + 10 × 100 (beans).
        payments: [{ method: 'cash', amount_cents: 3000 }],
      });
      expect(sale!.items[0].unit_price_cents).toBe(3000);
      expect(await cafeStockOf(sugar)).toBe(sugarBefore - 16);
      expect(await cafeStockOf(beans)).toBe(beansBefore - 10);
      expect(await snapshotOf(sale!.id)).toEqual({ [sugar]: 16, [water]: 10, [beans]: 10 });
    });

    it('holds the leaves while the dish waits in a parked cart', async () => {
      const flat = await flatOf(latte);
      const { cart } = await parkCart({
        storeId: cafeId,
        staffId: cafeStaff,
        clientUuid: randomUUID(),
        label: 'Столик біля вікна',
        items: [{ variant_id: latte, quantity: 2 }],
      });
      expect(cart.status).toBe('open');
      expect(await reservedFor(pool, cafeId, sugar)).toBe(flat[sugar] * 2);
      expect(await reservedFor(pool, cafeId, sauce)).toBe(2);
      expect(await reservedFor(pool, cafeId, cup)).toBe(2);
      // The syrup is not a shelf, so nothing is held on it.
      expect(await reservedFor(pool, cafeId, syrup)).toBe(0);
    });

    it('matches the boot-time rebuild in migration 116, row for row', async () => {
      // The migration is what runs on every container start; the service's
      // per-store rebuild must leave exactly what it would. Run inside a
      // transaction that is rolled back: the migration rebuilds EVERY store's
      // rows, and other test files are writing recipes of their own right now.
      const client = await pool.connect();
      try {
        const read = async () =>
          (
            await client.query(
              `SELECT variant_id, leaf_variant_id, quantity_per_unit, quantity_exact
               FROM pos_product_components_flat WHERE store_id = $1
               ORDER BY variant_id, leaf_variant_id`,
              [cafeId]
            )
          ).rows.map((r) => [
            Number(r.variant_id),
            Number(r.leaf_variant_id),
            Number(r.quantity_per_unit),
            Number(r.quantity_exact),
          ]);
        await client.query('BEGIN');
        const incremental = await read();
        expect(incremental.length).toBeGreaterThan(10);
        // Without a «вихід» the exact share is the same whole number.
        for (const [, , perUnit, exact] of incremental) expect(exact).toBe(perUnit);
        // 045 no longer rebuilds once 116's column exists; 116 is the last word.
        await client.query(readMigration('045_pos_product_components_flat.sql'));
        expect(await read()).toEqual(incremental);
        await client.query(flatRebuild116());
        expect(await read()).toEqual(incremental);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });

  describe('a recipe written for a batch («вихід», migration 116)', () => {
    // A kitchen's tech card for a semi-finished is a batch: «шия 2000 г,
    // приправа 50 г, сіль 10 г, перець 5 г, цибуля 500 г — вихід 1900 г», and
    // the dish takes 125 г of it. The authored quantities stay whole; the
    // flat table carries the exact share and its whole write-off per unit.
    let yStore = 0;
    let yStaff = 0;
    const leaf: Record<string, number> = {};
    let shashlikPf = 0;
    let shashlik = 0;
    let dough = 0;
    let varenykyPf = 0;
    let varenyky = 0;

    async function ingredient(name: string, unit: string, quantity: number, cost: number) {
      const product = await createProduct(yStore, {
        name,
        sellable: false,
        variants: [{ attributes: {}, unit, price_cents: 0, cost_cents: cost, quantity }],
      });
      return (product!.variants[0] as { id: number }).id;
    }

    async function semiFinished(
      name: string,
      recipeYield: number | null,
      components: Array<{ component_variant_id: number; quantity: number }>,
      stockMode: 'own' | 'derived' = 'derived'
    ) {
      const product = await createProduct(yStore, {
        name,
        kind: 'composite',
        stock_mode: stockMode,
        sellable: false,
        variants: [
          { attributes: {}, unit: 'г', price_cents: 0, quantity: 0, recipe_yield: recipeYield, components },
        ],
      });
      return { productId: product!.id, variantId: (product!.variants[0] as { id: number }).id };
    }

    async function dish(name: string, components: Array<{ component_variant_id: number; quantity: number }>) {
      const product = await createProduct(yStore, {
        name,
        kind: 'composite',
        stock_mode: 'derived',
        variants: [{ attributes: {}, price_cents: 25000, quantity: 0, components }],
      });
      return (product!.variants[0] as { id: number }).id;
    }

    async function flat(variantId: number): Promise<Record<number, { perUnit: number; exact: number }>> {
      const rows = await pool.query(
        `SELECT leaf_variant_id, quantity_per_unit, quantity_exact
         FROM pos_product_components_flat WHERE store_id = $1 AND variant_id = $2`,
        [yStore, variantId]
      );
      return Object.fromEntries(
        rows.rows.map((r) => [
          Number(r.leaf_variant_id),
          { perUnit: Number(r.quantity_per_unit), exact: Number(r.quantity_exact) },
        ])
      );
    }

    async function stock(variantId: number): Promise<number> {
      const r = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1 AND store_id = $2`, [
        variantId,
        yStore,
      ]);
      return Number(r.rows[0].quantity);
    }

    beforeAll(async () => {
      const store = await createTestStore('yield');
      yStore = store.storeId;
      yStaff = store.ownerId;
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [yStore]);
      leaf.neck = await ingredient('Шия свинна', 'г', 100000, 30);
      leaf.seasoning = await ingredient('Приправа для м’яса', 'г', 10000, 20);
      leaf.salt = await ingredient('Сіль', 'г', 10000, 1);
      leaf.pepper = await ingredient('Перець чорний', 'г', 10000, 60);
      leaf.onion = await ingredient('Цибуля', 'г', 10000, 2);
      leaf.lavash = await ingredient('Лаваш', 'г', 10000, 8);
      leaf.flour = await ingredient('Борошно', 'г', 100000, 2);
      leaf.egg = await ingredient('Яйця', 'г', 10000, 12);
      leaf.oil = await ingredient('Олія', 'мл', 10000, 8);
      leaf.potato = await ingredient('Картопля', 'г', 100000, 2);
      leaf.sourCream = await ingredient('Сметана', 'г', 10000, 11);
      leaf.mayo = await ingredient('Майонез', 'г', 10000, 12);
      leaf.garlic = await ingredient('Часник', 'г', 10000, 16);

      shashlikPf = (
        await semiFinished('Шашлик свинний ПФ', 1900, [
          { component_variant_id: leaf.neck, quantity: 2000 },
          { component_variant_id: leaf.seasoning, quantity: 50 },
          { component_variant_id: leaf.salt, quantity: 10 },
          { component_variant_id: leaf.pepper, quantity: 5 },
          { component_variant_id: leaf.onion, quantity: 500 },
        ])
      ).variantId;
      shashlik = await dish('Шашлик свинний', [
        { component_variant_id: shashlikPf, quantity: 125 },
        { component_variant_id: leaf.lavash, quantity: 50 },
      ]);

      // Three levels: dough → dumplings → the plate.
      dough = (
        await semiFinished('Тісто ПФ', 1675, [
          { component_variant_id: leaf.flour, quantity: 1000 },
          { component_variant_id: leaf.egg, quantity: 50 },
          { component_variant_id: leaf.oil, quantity: 45 },
          { component_variant_id: leaf.salt, quantity: 30 },
        ])
      ).variantId;
      varenykyPf = (
        await semiFinished('Вареники з картоплею ПФ', 1630, [
          { component_variant_id: dough, quantity: 1000 },
          { component_variant_id: leaf.potato, quantity: 700 },
          { component_variant_id: leaf.onion, quantity: 150 },
          { component_variant_id: leaf.flour, quantity: 100 },
        ])
      ).variantId;
      varenyky = await dish('Вареники з картоплею', [
        { component_variant_id: varenykyPf, quantity: 200 },
        { component_variant_id: leaf.sourCream, quantity: 52 },
      ]);
    });

    afterAll(async () => {
      if (yStore) await dropTestStore(yStore);
    });

    it('divides a batch into the portion and rounds once, never a leaf away', async () => {
      const rows = await flat(shashlik);
      const share = (batch: number) => (125 * batch) / 1900;
      expect(rows[leaf.neck].exact).toBeCloseTo(share(2000), 5); // 131.578947
      expect(rows[leaf.neck].perUnit).toBe(132);
      expect(rows[leaf.seasoning].perUnit).toBe(3); // 3.29
      expect(rows[leaf.salt].perUnit).toBe(1); // 0.66
      expect(rows[leaf.pepper].exact).toBeCloseTo(share(5), 5); // 0.33 …
      expect(rows[leaf.pepper].perUnit).toBe(1); // … still written off
      expect(rows[leaf.onion].perUnit).toBe(33); // 32.89
      expect(rows[leaf.lavash]).toEqual({ perUnit: 50, exact: 50 });
      // The semi-finished itself, per gram: exact shares, and whole write-offs
      // nobody sells by (it is not on the menu).
      const pf = await flat(shashlikPf);
      expect(pf[leaf.neck].exact).toBeCloseTo(2000 / 1900, 9);
      expect(pf[leaf.salt].perUnit).toBe(1);
    });

    it('carries the shares through three levels', async () => {
      const rows = await flat(varenyky);
      const flour = (200 * 100) / 1630 + ((200 * 1000) / 1630) * (1000 / 1675);
      const egg = ((200 * 1000) / 1630) * (50 / 1675);
      const salt = ((200 * 1000) / 1630) * (30 / 1675);
      expect(rows[leaf.flour].exact).toBeCloseTo(flour, 5);
      expect(rows[leaf.flour].perUnit).toBe(Math.round(flour)); // 86
      expect(rows[leaf.egg].exact).toBeCloseTo(egg, 5);
      expect(rows[leaf.egg].perUnit).toBe(Math.round(egg)); // 4
      expect(rows[leaf.salt].perUnit).toBe(Math.max(1, Math.round(salt))); // 2
      expect(rows[leaf.potato].perUnit).toBe(Math.round((200 * 700) / 1630)); // 86
      expect(rows[leaf.sourCream]).toEqual({ perUnit: 52, exact: 52 });
    });

    it('sells and refunds the whole per-portion write-off', async () => {
      const before = { neck: await stock(leaf.neck), pepper: await stock(leaf.pepper), lavash: await stock(leaf.lavash) };
      const sale = await completeSale({
        storeId: yStore,
        staffId: yStaff,
        items: [{ variant_id: shashlik, quantity: 2 }],
        payments: [{ method: 'cash', amount_cents: 50000 }],
      });
      expect(await stock(leaf.neck)).toBe(before.neck - 264);
      expect(await stock(leaf.pepper)).toBe(before.pepper - 2);
      expect(await stock(leaf.lavash)).toBe(before.lavash - 100);
      await voidSale({ storeId: yStore, staffId: yStaff, saleId: sale!.id });
      expect(await stock(leaf.neck)).toBe(before.neck);
      expect(await stock(leaf.pepper)).toBe(before.pepper);
    });

    it('expands a portion of a batch that a modifier or a counter-made recipe names', async () => {
      // «Соус: 50 г ПФ» — 50 × the exact share, rounded once per leaf; never
      // 50 × the per-gram write-off (that would be 50 г of salt).
      const parts = Object.fromEntries(
        (await flattenComponents(pool, yStore, [{ component_variant_id: shashlikPf, quantity: 50 }])).map((c) => [
          c.component_variant_id,
          c.quantity,
        ])
      );
      expect(parts[leaf.neck]).toBe(Math.round((50 * 2000) / 1900)); // 53
      expect(parts[leaf.salt]).toBe(1); // 0.26
      expect(parts[leaf.onion]).toBe(Math.round((50 * 500) / 1900)); // 13
      expect(wholeShare(0.4)).toBe(1);
      expect(wholeShare(2.5)).toBe(3);
    });

    it('produces a made-in-advance batch from exactly the batch', async () => {
      const sauce = (
        await semiFinished(
          'Часниковий соус ПФ',
          905,
          [
            { component_variant_id: leaf.mayo, quantity: 700 },
            { component_variant_id: leaf.sourCream, quantity: 200 },
            { component_variant_id: leaf.garlic, quantity: 80 },
          ],
          'own'
        )
      ).variantId;
      const before = { mayo: await stock(leaf.mayo), garlic: await stock(leaf.garlic) };
      const doc = await createDocument({ storeId: yStore, staffId: yStaff, type: 'production' });
      await addLine({ storeId: yStore, documentId: doc.id, variantId: sauce, quantity: 905 });
      await postDocument({ storeId: yStore, documentId: doc.id, staffId: yStaff });
      expect(await stock(leaf.mayo)).toBe(before.mayo - 700);
      expect(await stock(leaf.garlic)).toBe(before.garlic - 80);
      expect(await stock(sauce)).toBe(905);
      // A gram of it costs (700×12 + 200×11 + 80×16) / 905 ≈ 13.127 коп — kept
      // in thousandths of a kopeck (migration 103), not rounded to 13.
      const cost = await pool.query(`SELECT cost_milli, cost_cents FROM pos_variants WHERE id = $1`, [sauce]);
      expect(Number(cost.rows[0].cost_milli)).toBe(Math.round(((700 * 12 + 200 * 11 + 80 * 16) * 1000) / 905));
      expect(Number(cost.rows[0].cost_cents)).toBe(13);
    });

    it('costs the tech card by the exact share and shows the batch', async () => {
      const rows = await listTechCards(pool, yStore);
      const pf = rows.find((r) => r.variant_id === shashlikPf)!;
      const batch = 2000 * 30 + 50 * 20 + 10 * 1 + 5 * 60 + 500 * 2;
      expect(pf.recipe_yield).toBe(1900);
      expect(pf.batch_cost_cents).toBe(batch);
      const plate = rows.find((r) => r.variant_id === shashlik)!;
      expect(plate.recipe_yield).toBeNull();
      expect(plate.batch_cost_cents).toBeNull();
      expect(plate.cost_cents).toBe(Math.round((125 * batch) / 1900 + 50 * 8));
    });

    it('counts how much of a semi-finished the shelves allow in its own grams', async () => {
      const products = await listProducts(yStore);
      const pf = products.find((p) => p.variants.some((v) => (v as { id: number }).id === shashlikPf))!;
      const variant = pf.variants[0] as { quantity: number; recipe_yield: number | null };
      expect(variant.recipe_yield).toBe(1900);
      // The tightest shelf, divided by its EXACT share per gram (onion here:
      // 500 г in 1900) — not by the per-gram write-off rounded to 1 г.
      const shares = await flat(shashlikPf);
      let expected = Number.POSITIVE_INFINITY;
      for (const [leafId, row] of Object.entries(shares)) {
        expected = Math.min(expected, Math.floor((await stock(Number(leafId))) / row.exact));
      }
      expect(expected).toBe(38000);
      expect(variant.quantity).toBe(expected);
    });

    it('rebuilds every dish above when the «вихід» changes, and refuses it where it means nothing', async () => {
      await updateVariant(yStore, shashlikPf, { recipe_yield: 1000 });
      expect((await flat(shashlik))[leaf.neck].perUnit).toBe(250);
      await updateVariant(yStore, shashlikPf, { recipe_yield: 1900 });
      expect((await flat(shashlik))[leaf.neck].perUnit).toBe(132);
      // 1 is «for one unit»: stored as null.
      await updateVariant(yStore, dough, { recipe_yield: 1 });
      expect((await pool.query(`SELECT recipe_yield FROM pos_variants WHERE id = $1`, [dough])).rows[0].recipe_yield).toBeNull();
      await updateVariant(yStore, dough, { recipe_yield: 1675 });

      await expect(updateVariant(yStore, leaf.salt, { recipe_yield: 100 })).rejects.toThrow(/лише в техкарти/);
      await expect(updateVariant(yStore, shashlikPf, { recipe_yield: 12.5 })).rejects.toThrow(/ціле число/);
      await expect(updateVariant(yStore, shashlikPf, { recipe_yield: -3 })).rejects.toThrow(/ціле число/);
    });

    it('refuses a «вихід» outside the café', async () => {
      await expect(
        createProduct(storeId, {
          name: 'Букет на вихід',
          kind: 'composite',
          stock_mode: 'derived',
          variants: [
            {
              attributes: {},
              price_cents: 100,
              quantity: 0,
              recipe_yield: 10,
              components: [{ component_variant_id: stemId, quantity: 5 }],
            },
          ],
        })
      ).rejects.toThrow(/лише для кафе/);
    });

    it('clears the «вихід» when a recipe stops being one', async () => {
      const own = await semiFinished(
        'Заготовка, що стане простою',
        500,
        [{ component_variant_id: leaf.onion, quantity: 400 }],
        'own'
      );
      await updateVariant(yStore, own.variantId, { components: [] });
      await updateProduct(yStore, own.productId, { kind: 'simple' });
      const row = await pool.query(`SELECT recipe_yield FROM pos_variants WHERE id = $1`, [own.variantId]);
      expect(row.rows[0].recipe_yield).toBeNull();
    });

    it('matches the boot-time rebuild in migration 116 with yields, row for row', async () => {
      const client = await pool.connect();
      try {
        const read = async () =>
          (
            await client.query(
              `SELECT variant_id, leaf_variant_id, quantity_per_unit, quantity_exact
               FROM pos_product_components_flat WHERE store_id = $1
               ORDER BY variant_id, leaf_variant_id`,
              [yStore]
            )
          ).rows.map((r) => [Number(r.variant_id), Number(r.leaf_variant_id), Number(r.quantity_per_unit), String(r.quantity_exact)]);
        await client.query('BEGIN');
        const incremental = await read();
        expect(incremental.length).toBeGreaterThan(15);
        await client.query(flatRebuild116());
        expect(await read()).toEqual(incremental);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});
