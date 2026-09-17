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
import { createProduct, getCatalog, updateProduct, updateVariant } from '../pos/products.service.js';
import { adjustStock, listLowStock } from '../pos/stock.service.js';
import {
  addLine,
  createDocument,
  postDocument,
  reverseDocument,
} from '../pos/stock-documents.service.js';
import { listOnHand } from '../pos/stock-reports.service.js';
import { derivedAvailability } from '../pos/composites.service.js';

/**
 * A bouquet is the first product whose stock is not its own. These run against
 * the real schema because every interesting failure here is a stock arithmetic
 * one: selling a composite must move its components, refunding it must move
 * back exactly what the sale took (not what the recipe says today), and a
 * composite assembled in advance must not be written off twice.
 */
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
      await pool.query(`DELETE FROM pos_product_components WHERE variant_id = $1`, [variantId]);
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
      await pool.query(`DELETE FROM pos_product_components WHERE variant_id = $1`, [variantId]);
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
});
