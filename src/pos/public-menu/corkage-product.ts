// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/corkage-product.ts — the cork fee's product (migration 105).
//
// The terms the guest reads («Свій алкоголь: +100 ₴ за пляшку») and the product
// the waiter rings are one thing: `pos_stores.public_corkage_product_id` names
// the product, and its price IS the fee. These are the store-side writes that
// keep it so, always inside the caller's transaction and under its lock on the
// store row, so two saves at once cannot make two products:
//
//   · on, fee above zero → the linked product, back from the archive if it was
//     there, priced at the fee; with no link, a product the owner already made
//     whose name starts with «Корк» is linked (never a duplicate), and only
//     then is «Корковий збір» created — sold at the till, hidden from the QR
//     menu, with a counter the till never runs out of;
//   · off, or a fee of zero → the linked product goes to the archive, so a
//     waiter cannot keep ringing a fee the place no longer takes. The link
//     stays, and the next «on» brings the SAME product back.

import { pool } from '../../db.js';
import { createProductInTx } from '../products.service.js';

type DbClient = { query: typeof pool.query };

/** What the owner's card says about the product: enough to name it and open it. */
export interface CorkageProduct {
  id: number;
  name: string;
  /** The first live variant's price — what the till rings and the guest reads. */
  price_cents: number | null;
  /** False while the terms are off (the product sits in the archive). */
  active: boolean;
}

/** A counter the till never greys a service out on: a fee has no shelf. */
export const CORKAGE_STOCK = 100_000;

export const CORKAGE_PRODUCT_NAME = 'Корковий збір';

/** The product the store row links, or null — read in any state, archived included. */
export async function readCorkageProduct(client: DbClient, storeId: number): Promise<CorkageProduct | null> {
  const result = await client.query(
    `SELECT p.id, p.name, p.is_active,
            (SELECT v.price_cents FROM pos_variants v
              WHERE v.product_id = p.id AND (v.is_active OR NOT p.is_active)
              ORDER BY v.is_active DESC, v.id ASC LIMIT 1) AS price_cents
       FROM pos_stores s
       JOIN pos_products p ON p.id = s.public_corkage_product_id AND p.store_id = s.id
      WHERE s.id = $1`,
    [storeId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    price_cents: row.price_cents == null ? null : Number(row.price_cents),
    active: row.is_active === true,
  };
}

/** One the owner made by hand, as the old hint told them to — linked, never duplicated. */
async function findHandMade(client: DbClient, storeId: number): Promise<number | null> {
  const result = await client.query(
    `SELECT p.id
       FROM pos_products p
      WHERE p.store_id = $1
        AND p.kind = 'simple'
        AND (p.name ILIKE 'корк%' OR p.name ILIKE 'cork%')
        AND EXISTS (SELECT 1 FROM pos_variants v WHERE v.product_id = p.id)
      ORDER BY p.is_active DESC, p.id ASC
      LIMIT 1`,
    [storeId]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

/**
 * The fee is on and above zero: make sure the store's product exists, is on
 * sale and costs `feeCents`. Returns its id. Caller holds the store row lock.
 */
export async function ensureCorkageProduct(client: DbClient, storeId: number, feeCents: number): Promise<number> {
  const linked = await readCorkageProduct(client, storeId);
  let productId = linked?.id ?? null;

  if (productId == null) {
    productId = await findHandMade(client, storeId);
    if (productId == null) {
      const created = await createProductInTx(client, storeId, {
        name: CORKAGE_PRODUCT_NAME,
        description: 'За пляшку свого алкоголю. Ціна — та, що бачить гість у QR-меню.',
        sellable: true,
        menu_hidden: true,
        variants: [{ attributes: {}, unit: 'шт', price_cents: feeCents, quantity: CORKAGE_STOCK }],
      });
      productId = created.productId;
    }
    await client.query(`UPDATE pos_stores SET public_corkage_product_id = $2 WHERE id = $1`, [storeId, productId]);
  }

  // Back from the archive with all its variants — the mirror of `archiveCorkageProduct`.
  await client.query(
    `UPDATE pos_products SET is_active = TRUE, menu_hidden = TRUE, updated_at = NOW()
      WHERE id = $1 AND store_id = $2 AND (NOT is_active OR NOT menu_hidden)`,
    [productId, storeId]
  );
  await client.query(
    `UPDATE pos_variants SET is_active = TRUE, updated_at = NOW()
      WHERE product_id = $1 AND store_id = $2 AND NOT is_active`,
    [productId, storeId]
  );
  // The fee is the price of the product's first variant: that is the one a waiter rings.
  await client.query(
    `UPDATE pos_variants SET price_cents = $3, updated_at = NOW()
      WHERE id = (SELECT id FROM pos_variants WHERE product_id = $1 AND store_id = $2 ORDER BY id ASC LIMIT 1)
        AND price_cents <> $3`,
    [productId, storeId, feeCents]
  );
  return productId;
}

/** Off, or no fee: the product leaves the till; the link and its price stay for next time. */
export async function archiveCorkageProduct(client: DbClient, storeId: number): Promise<void> {
  const linked = await readCorkageProduct(client, storeId);
  if (!linked || !linked.active) return;
  await client.query(`UPDATE pos_products SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND store_id = $2`, [
    linked.id,
    storeId,
  ]);
  await client.query(
    `UPDATE pos_variants SET is_active = FALSE, updated_at = NOW() WHERE product_id = $1 AND store_id = $2`,
    [linked.id, storeId]
  );
}

/**
 * The terms as the guest reads them: nothing while they are off, and the fee
 * the till will ring while there is a product on sale to ring it.
 */
export function effectiveCorkage<T extends { fee_cents: number }>(
  terms: T | null,
  on: boolean,
  productPriceCents: number | null
): T | null {
  if (!on || !terms) return null;
  return productPriceCents == null ? terms : { ...terms, fee_cents: productPriceCents };
}

/** SQL: the live price of the store's cork-fee product, or NULL while there is none on sale. `s` is `pos_stores`. */
export const CORKAGE_PRICE_SQL = `(
  SELECT cv.price_cents
    FROM pos_products cp
    JOIN pos_variants cv ON cv.product_id = cp.id AND cv.is_active
   WHERE cp.id = s.public_corkage_product_id AND cp.store_id = s.id AND cp.is_active
   ORDER BY cv.id ASC
   LIMIT 1
)`;
