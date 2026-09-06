// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.products.service.test.ts
//
// products.service is the catalog write path. The parts that actually bite:
// the price/compare-at invariants, the fact that creating a product must also
// create its stock rows and a seed movement inside one transaction, and
// getCatalog's query builder (barcode wins over q, tag filter, snapshot mode).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as products from '../pos/products.service.js';
import * as tags from '../pos/tags.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS products service', () => {
  let store: TestStore;
  let other: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('prod');
    other = await createTestStore('prodx');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  describe('createProduct', () => {
    it('creates the product, its variants, stock rows and a seed movement', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Hoodie',
        description: 'Warm',
        variants: [
          { size: 'S', color: 'black', price_cents: 45000, quantity: 3 },
          { size: 'M', color: 'black', price_cents: 45000, quantity: 0 },
        ],
      });

      expect(created?.name).toBe('Hoodie');
      expect(created?.variants).toHaveLength(2);
      expect(created?.variants.map((v) => (v as { quantity: number }).quantity).sort()).toEqual([
        0, 3,
      ]);

      const movements = await pool.query(
        `SELECT delta, reason FROM pos_stock_movements
         WHERE store_id = $1 AND variant_id = ANY($2::bigint[])`,
        [store.storeId, created?.variants.map((v) => (v as { id: number }).id)]
      );
      // Only the qty>0 variant gets a seed movement; the qty=0 one just gets a stock row.
      expect(movements.rows).toHaveLength(1);
      expect(Number(movements.rows[0].delta)).toBe(3);
      expect(movements.rows[0].reason).toBe('seed');
    });

    it('trims the name and nulls out blank description/image', async () => {
      const created = await products.createProduct(store.storeId, {
        name: '  Spaced  ',
        description: '   ',
        image_url: '',
        variants: [{ price_cents: 1000 }],
      });
      expect(created?.name).toBe('Spaced');
      expect(created?.description).toBeNull();
      expect(created?.image_url).toBeNull();
    });

    it('requires a name', async () => {
      await expect(
        products.createProduct(store.storeId, { name: '  ', variants: [{ price_cents: 100 }] })
      ).rejects.toThrow('Product name is required');
    });

    it('requires at least one variant', async () => {
      await expect(
        products.createProduct(store.storeId, { name: 'No variants', variants: [] })
      ).rejects.toThrow('At least one variant is required');
    });

    it('rejects a negative price', async () => {
      await expect(
        products.createProduct(store.storeId, {
          name: 'Negative',
          variants: [{ price_cents: -1 }],
        })
      ).rejects.toThrow('Variant price must be >= 0');
    });

    it('rejects a negative quantity', async () => {
      await expect(
        products.createProduct(store.storeId, {
          name: 'Negative qty',
          variants: [{ price_cents: 100, quantity: -5 }],
        })
      ).rejects.toThrow('Quantity must be >= 0');
    });

    it('rejects a compare_at that is not above the price', async () => {
      await expect(
        products.createProduct(store.storeId, {
          name: 'Bad discount',
          variants: [{ price_cents: 1000, compare_at_cents: 1000 }],
        })
      ).rejects.toThrow('compare_at_cents must be greater than price_cents');
    });

    it('rolls back the whole product when a later variant is invalid', async () => {
      const before = (await products.listProducts(store.storeId)).length;
      await expect(
        products.createProduct(store.storeId, {
          name: 'Half-valid',
          variants: [
            { size: 'S', price_cents: 1000, quantity: 1 },
            { size: 'M', price_cents: -1 },
          ],
        })
      ).rejects.toThrow('Variant price must be >= 0');

      const after = await products.listProducts(store.storeId);
      expect(after).toHaveLength(before);
      expect(after.map((p) => p.name)).not.toContain('Half-valid');
    });
  });

  describe('getProduct / listProducts', () => {
    it('returns null for a product owned by another store', async () => {
      const mine = await products.createProduct(store.storeId, {
        name: 'Not yours',
        variants: [{ price_cents: 100 }],
      });
      expect(await products.getProduct(other.storeId, mine!.id)).toBeNull();
    });

    it('returns null for an id that does not exist', async () => {
      expect(await products.getProduct(store.storeId, 999_999_999)).toBeNull();
    });

    it('reports quantity 0 for a variant with no stock row', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Stockless',
        variants: [{ price_cents: 500 }],
      });
      const variantId = (created!.variants[0] as { id: number }).id;
      await pool.query(`DELETE FROM pos_stock WHERE variant_id = $1`, [variantId]);

      const reread = await products.getProduct(store.storeId, created!.id);
      expect((reread!.variants[0] as { quantity: number }).quantity).toBe(0);
    });

    it('exposes assigned tag ids', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Tagged',
        variants: [{ price_cents: 700 }],
      });
      const tag = await tags.createTag(store.storeId, { name: `t-${Date.now()}` });
      await tags.setProductTags(store.storeId, created!.id, [tag.id]);

      const reread = await products.getProduct(store.storeId, created!.id);
      expect(reread!.tag_ids).toEqual([tag.id]);
    });
  });

  describe('updateProduct', () => {
    it('clears needs_review on the first meaningful edit', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'From document',
        needs_review: true,
        variants: [{ price_cents: 100 }],
      });
      expect(created?.needs_review).toBe(true);

      const updated = await products.updateProduct(store.storeId, created!.id, {
        name: 'Reviewed name',
      });
      expect(updated?.needs_review).toBe(false);
    });

    it('leaves needs_review alone when only is_active changes', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Still unreviewed',
        needs_review: true,
        variants: [{ price_cents: 100 }],
      });
      const updated = await products.updateProduct(store.storeId, created!.id, {
        is_active: false,
      });
      expect(updated?.needs_review).toBe(true);
    });

    it('honours an explicit needs_review over the implicit clear', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Explicit flag',
        needs_review: true,
        variants: [{ price_cents: 100 }],
      });
      const updated = await products.updateProduct(store.storeId, created!.id, {
        name: 'Renamed but still flagged',
        needs_review: true,
      });
      expect(updated?.needs_review).toBe(true);
    });

    it('refuses to update another store product', async () => {
      const mine = await products.createProduct(store.storeId, {
        name: 'Mine only',
        variants: [{ price_cents: 100 }],
      });
      await expect(
        products.updateProduct(other.storeId, mine!.id, { name: 'Stolen' })
      ).rejects.toThrow('Product not found');
    });
  });

  describe('addVariant', () => {
    it('adds a variant with its stock row and seed movement', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Growing',
        variants: [{ size: 'S', price_cents: 100 }],
      });
      const withVariant = await products.addVariant(store.storeId, created!.id, {
        size: 'L',
        price_cents: 12000,
        quantity: 7,
      });

      expect(withVariant?.variants).toHaveLength(2);
      const added = withVariant!.variants.find(
        (v) => (v as { size: string }).size === 'L'
      ) as { id: number; quantity: number };
      expect(added.quantity).toBe(7);

      const movements = await pool.query(
        `SELECT delta FROM pos_stock_movements WHERE variant_id = $1`,
        [added.id]
      );
      expect(movements.rows).toHaveLength(1);
      expect(Number(movements.rows[0].delta)).toBe(7);
    });

    it('refuses to add to a product from another store', async () => {
      const mine = await products.createProduct(store.storeId, {
        name: 'Guarded',
        variants: [{ price_cents: 100 }],
      });
      await expect(
        products.addVariant(other.storeId, mine!.id, { price_cents: 100 })
      ).rejects.toThrow('Product not found');
    });

    it('rejects a negative price', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Price guard',
        variants: [{ price_cents: 100 }],
      });
      await expect(
        products.addVariant(store.storeId, created!.id, { price_cents: -10 })
      ).rejects.toThrow('Variant price must be >= 0');
    });
  });

  describe('updateVariant', () => {
    it('rejects a price raise that would leave compare_at below it', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Discounted',
        variants: [{ price_cents: 1000, compare_at_cents: 1500 }],
      });
      const variantId = (created!.variants[0] as { id: number }).id;

      await expect(
        products.updateVariant(store.storeId, variantId, { price_cents: 2000 })
      ).rejects.toThrow('compare_at_cents must be greater than price_cents');
    });

    it('allows raising the price together with a new compare_at', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Repriced',
        variants: [{ price_cents: 1000, compare_at_cents: 1500 }],
      });
      const variantId = (created!.variants[0] as { id: number }).id;

      const updated = await products.updateVariant(store.storeId, variantId, {
        price_cents: 2000,
        compare_at_cents: 2500,
      });
      const variant = updated!.variants[0] as {
        price_cents: number;
        compare_at_cents: number | null;
      };
      expect(variant.price_cents).toBe(2000);
      expect(variant.compare_at_cents).toBe(2500);
    });

    it('drops the discount when compare_at is set to null', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Undiscounted',
        variants: [{ price_cents: 1000, compare_at_cents: 1500 }],
      });
      const variantId = (created!.variants[0] as { id: number }).id;

      const updated = await products.updateVariant(store.storeId, variantId, {
        compare_at_cents: null,
      });
      expect((updated!.variants[0] as { compare_at_cents: number | null }).compare_at_cents)
        .toBeNull();
    });

    it('reports a missing variant', async () => {
      await expect(
        products.updateVariant(store.storeId, 999_999_999, { price_cents: 1 })
      ).rejects.toThrow('Variant not found');
    });

    it('clears a SKU when passed an empty string', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Clearable sku',
        variants: [{ price_cents: 100, sku: 'SKU-1' }],
      });
      const variantId = (created!.variants[0] as { id: number }).id;

      const updated = await products.updateVariant(store.storeId, variantId, { sku: '' });
      expect((updated!.variants[0] as { sku: string | null }).sku).toBeNull();
    });

    it('clears a barcode when passed null', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Clearable barcode',
        variants: [{ price_cents: 100, barcode: `484${Date.now()}`.slice(0, 13) }],
      });
      const variantId = (created!.variants[0] as { id: number }).id;

      const updated = await products.updateVariant(store.storeId, variantId, { barcode: null });
      expect((updated!.variants[0] as { barcode: string | null }).barcode).toBeNull();
    });

    it('leaves untouched fields alone', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Partial variant edit',
        variants: [
          { size: 'S', color: 'red', price_cents: 100, cost_cents: 40, sku: 'KEEP-1' },
        ],
      });
      const variantId = (created!.variants[0] as { id: number }).id;

      const updated = await products.updateVariant(store.storeId, variantId, {
        price_cents: 200,
      });
      const variant = updated!.variants[0] as {
        size: string;
        color: string;
        sku: string | null;
        cost_cents: number;
        price_cents: number;
        is_active: boolean;
      };
      expect(variant.price_cents).toBe(200);
      expect(variant.size).toBe('S');
      expect(variant.color).toBe('red');
      expect(variant.sku).toBe('KEEP-1');
      expect(variant.cost_cents).toBe(40);
      expect(variant.is_active).toBe(true);
    });
  });

  describe('archiving', () => {
    it('archives a product and every one of its variants', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'To archive',
        variants: [
          { size: 'S', price_cents: 100 },
          { size: 'M', price_cents: 100 },
        ],
      });
      const archived = await products.archiveProduct(store.storeId, created!.id);
      expect(archived?.is_active).toBe(false);
      expect(
        archived!.variants.every((v) => (v as { is_active: boolean }).is_active === false)
      ).toBe(true);
    });

    it('archives a single variant without touching the product', async () => {
      const created = await products.createProduct(store.storeId, {
        name: 'Partial archive',
        variants: [
          { size: 'S', price_cents: 100 },
          { size: 'M', price_cents: 100 },
        ],
      });
      const variantId = (created!.variants[0] as { id: number }).id;
      const after = await products.archiveVariant(store.storeId, variantId);

      expect(after?.is_active).toBe(true);
      const archivedVariant = after!.variants.find(
        (v) => (v as { id: number }).id === variantId
      ) as { is_active: boolean };
      expect(archivedVariant.is_active).toBe(false);
    });

    it('reports a missing product / variant', async () => {
      await expect(products.archiveProduct(store.storeId, 999_999_999)).rejects.toThrow(
        'Product not found'
      );
      await expect(products.archiveVariant(store.storeId, 999_999_999)).rejects.toThrow(
        'Variant not found'
      );
    });
  });

  describe('getCatalog', () => {
    let catalogStore: TestStore;

    beforeAll(async () => {
      catalogStore = await createTestStore('cat');
      await products.createProduct(catalogStore.storeId, {
        name: 'Blue Jeans',
        variants: [
          { size: '30', color: 'blue', price_cents: 90000, barcode: '4820001112223', sku: 'BJ-30' },
          { size: '32', color: 'blue', price_cents: 90000 },
        ],
      });
      await products.createProduct(catalogStore.storeId, {
        name: 'Red Scarf',
        variants: [{ color: 'red', price_cents: 25000, sku: 'RS-1' }],
      });
    }, 60000);

    afterAll(async () => {
      await dropTestStore(catalogStore?.storeId);
    });

    it('returns one row per active variant', async () => {
      const catalog = await products.getCatalog(catalogStore.storeId);
      expect(catalog).toHaveLength(3);
      expect(catalog.every((c) => typeof c.variant_id === 'number')).toBe(true);
    });

    it('hides an archived product', async () => {
      const doomed = await products.createProduct(catalogStore.storeId, {
        name: 'Archived Coat',
        variants: [{ price_cents: 50000 }],
      });
      expect((await products.getCatalog(catalogStore.storeId)).map((c) => c.product_name))
        .toContain('Archived Coat');

      await products.archiveProduct(catalogStore.storeId, doomed!.id);
      expect((await products.getCatalog(catalogStore.storeId)).map((c) => c.product_name))
        .not.toContain('Archived Coat');
    });

    it('hides a single archived variant but keeps its siblings', async () => {
      const jeans = (await products.listProducts(catalogStore.storeId)).find(
        (p) => p.name === 'Blue Jeans'
      )!;
      const extra = await products.addVariant(catalogStore.storeId, jeans.id, {
        size: '34',
        color: 'blue',
        price_cents: 90000,
      });
      const extraId = (extra!.variants.find((v) => (v as { size: string }).size === '34') as {
        id: number;
      }).id;

      await products.archiveVariant(catalogStore.storeId, extraId);
      const catalog = await products.getCatalog(catalogStore.storeId);
      expect(catalog.map((c) => c.variant_id)).not.toContain(extraId);
      expect(catalog.filter((c) => c.product_name === 'Blue Jeans')).toHaveLength(2);
    });

    it('matches a barcode exactly', async () => {
      const found = await products.getCatalog(catalogStore.storeId, {
        barcode: '4820001112223',
      });
      expect(found).toHaveLength(1);
      expect(found[0].size).toBe('30');
    });

    it('returns nothing for an unknown barcode instead of falling back to a search', async () => {
      const found = await products.getCatalog(catalogStore.storeId, { barcode: '0000000000000' });
      expect(found).toEqual([]);
    });

    it('lets barcode win when both barcode and q are supplied', async () => {
      const found = await products.getCatalog(catalogStore.storeId, {
        barcode: '4820001112223',
        q: 'Scarf',
      });
      expect(found).toHaveLength(1);
      expect(found[0].product_name).toBe('Blue Jeans');
    });

    it('searches product name, sku, size and colour case-insensitively', async () => {
      expect(await products.getCatalog(catalogStore.storeId, { q: 'JEANS' })).toHaveLength(2);
      expect(await products.getCatalog(catalogStore.storeId, { q: 'bj-30' })).toHaveLength(1);
      expect(await products.getCatalog(catalogStore.storeId, { q: 'red' })).toHaveLength(1);
    });

    it('ignores q and barcode in snapshot mode — the cashier caches everything', async () => {
      const snapshot = await products.getCatalog(catalogStore.storeId, {
        q: 'nothing-matches-this',
        snapshot: true,
      });
      expect(snapshot).toHaveLength(3);
    });

    it('filters by tag', async () => {
      const tag = await tags.createTag(catalogStore.storeId, { name: `cat-${Date.now()}` });
      const jeans = (await products.listProducts(catalogStore.storeId)).find(
        (p) => p.name === 'Blue Jeans'
      )!;
      await tags.setProductTags(catalogStore.storeId, jeans.id, [tag.id]);

      const filtered = await products.getCatalog(catalogStore.storeId, { tag_id: tag.id });
      expect(filtered).toHaveLength(2);
      expect(filtered.every((c) => c.product_name === 'Blue Jeans')).toBe(true);
      expect(filtered[0].tag_ids).toContain(tag.id);
    });

    it('never leaks another store catalog', async () => {
      const foreign = await products.getCatalog(store.storeId);
      expect(foreign.map((c) => c.product_name)).not.toContain('Blue Jeans');
    });
  });
});
