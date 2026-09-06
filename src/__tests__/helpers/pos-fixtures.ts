// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/helpers/pos-fixtures.ts
//
// Shared setup for the DB-backed POS tests: schema, per-test-file store
// isolation, and a Fastify instance the route tests drive through `inject()`.
//
// Isolation model: every file creates its own `pos_stores` row with a unique
// slug and drops it in `afterAll`. Every POS table is `ON DELETE CASCADE` on
// store_id, so one DELETE removes the whole fixture tree — tests never see each
// other's rows, and re-running against a dirty database is safe.

import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { pool } from '../../db.js';
import { POS_MIGRATIONS, readMigration } from '../../pos/migrations.js';
import { hashPassword, hashPin } from '../../pos/core/crypto.js';

/** DB-backed suites `describe.skipIf(!hasDb)` on this. */
export const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

/**
 * Make sure the POS schema is present.
 *
 * `vitest.global-setup.ts` already applied every migration once before any
 * worker started, so this is normally a single cheap probe. It only does the
 * real work when the schema is missing — i.e. when a file is run through a
 * vitest invocation that skipped the global setup.
 */
export async function applyPosMigrations(): Promise<void> {
  const present = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pos_stores' AND column_name = 'module_remotes'`
  );
  if (present.rows.length > 0) return;

  for (const file of POS_MIGRATIONS) {
    await pool.query(readMigration(file));
  }
}

export interface TestStore {
  storeId: number;
  slug: string;
  /** Owner: full access, passes `ensurePosOwner`. */
  ownerId: number;
  ownerToken: string;
  ownerLogin: string;
  ownerPassword: string;
  /** Seller: passes `ensurePosAuth`, 403s on owner-only routes. */
  sellerId: number;
  sellerToken: string;
  sellerPin: string;
}

let seq = 0;

/**
 * Create an isolated store with one owner and one seller, each with a live
 * session token. `prefix` keeps slugs readable when several files run at once;
 * it is truncated because `pos_stores.slug` is VARCHAR(64).
 */
export async function createTestStore(prefix: string): Promise<TestStore> {
  const slug = `${prefix}_${Date.now()}_${seq++}`.slice(0, 60);

  const store = await pool.query(
    `INSERT INTO pos_stores (name, slug) VALUES ($1, $2) RETURNING id`,
    [`Test store ${slug}`, slug]
  );
  const storeId = Number(store.rows[0].id);

  const ownerLogin = `${slug}@test.local`;
  const ownerPassword = 'owner-pw-123';
  const owner = await pool.query(
    `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash)
     VALUES ($1, 'owner', 'Test Owner', $2, $3) RETURNING id`,
    [storeId, ownerLogin, await hashPassword(ownerPassword)]
  );
  const ownerId = Number(owner.rows[0].id);

  const sellerPin = '4321';
  const seller = await pool.query(
    `INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
     VALUES ($1, 'seller', 'Test Seller', $2) RETURNING id`,
    [storeId, await hashPin(sellerPin)]
  );
  const sellerId = Number(seller.rows[0].id);

  return {
    storeId,
    slug,
    ownerId,
    ownerToken: await issueToken(storeId, ownerId),
    ownerLogin,
    ownerPassword,
    sellerId,
    sellerToken: await issueToken(storeId, sellerId),
    sellerPin,
  };
}

/** Insert a session row directly — bypasses login so tests can pick the actor. */
export async function issueToken(
  storeId: number,
  staffId: number,
  opts: { expired?: boolean } = {}
): Promise<string> {
  const token = `test-${storeId}-${staffId}-${Date.now()}-${seq++}`;
  await pool.query(
    `INSERT INTO pos_sessions (store_id, staff_id, token, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval)`,
    [storeId, staffId, token, opts.expired ? '-1' : '24']
  );
  return token;
}

/**
 * Drop a fixture store and everything under it.
 *
 * Most POS tables cascade on store_id, but the transactional ones deliberately
 * hold their variant/staff with ON DELETE RESTRICT — a sold variant or a
 * cashier with receipts must not be deletable in production. Postgres checks
 * those restrictions while the cascade is still running, so a single
 * `DELETE FROM pos_stores` fails for any store that ever rang up a sale. Clear
 * the documents first, deepest first, then let the cascade do the rest.
 */
export async function dropTestStore(storeId: number | undefined): Promise<void> {
  if (!storeId) return;
  const ordered = [
    'DELETE FROM pos_refund_items WHERE refund_id IN (SELECT id FROM pos_refunds WHERE store_id = $1)',
    'DELETE FROM pos_refunds WHERE store_id = $1',
    'DELETE FROM pos_sale_items WHERE sale_id IN (SELECT id FROM pos_sales WHERE store_id = $1)',
    'DELETE FROM pos_sales WHERE store_id = $1',
    'DELETE FROM pos_stock_document_lines WHERE store_id = $1',
    'DELETE FROM pos_stock_documents WHERE store_id = $1',
    'DELETE FROM pos_stores WHERE id = $1',
  ];
  for (const sql of ordered) {
    await pool.query(sql, [storeId]);
  }
}

/** Overwrite the store's toggleable module set (null = fall back to defaults). */
export async function setEnabledModules(
  storeId: number,
  modules: string[] | null
): Promise<void> {
  await pool.query(`UPDATE pos_stores SET enabled_modules = $1 WHERE id = $2`, [
    modules,
    storeId,
  ]);
}

export interface TestProduct {
  productId: number;
  variantId: number;
}

/** A minimal sellable product: one variant, `quantity` units in stock. */
export async function seedProduct(
  storeId: number,
  opts: {
    name?: string;
    priceCents?: number;
    quantity?: number;
    barcode?: string | null;
    sku?: string | null;
    size?: string;
    color?: string;
  } = {}
): Promise<TestProduct> {
  const product = await pool.query(
    `INSERT INTO pos_products (store_id, name) VALUES ($1, $2) RETURNING id`,
    [storeId, opts.name ?? 'Test product']
  );
  const productId = Number(product.rows[0].id);

  const variant = await pool.query(
    `INSERT INTO pos_variants
       (store_id, product_id, size, color, sku, barcode, price_cents, cost_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0) RETURNING id`,
    [
      storeId,
      productId,
      opts.size ?? 'M',
      opts.color ?? 'black',
      opts.sku ?? null,
      opts.barcode ?? null,
      opts.priceCents ?? 10000,
    ]
  );
  const variantId = Number(variant.rows[0].id);

  await pool.query(
    `INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, $3)`,
    [variantId, storeId, opts.quantity ?? 10]
  );

  return { productId, variantId };
}

/**
 * A Fastify app carrying the real POS plugin, mounted exactly as `src/index.ts`
 * mounts it. Route tests hit it with `app.inject()` — no socket, no port.
 */
export async function buildPosTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { registerPosPlugin } = await import('../../pos/pos.plugin.js');
  await registerPosPlugin(app);
  await app.ready();
  return app;
}

/** `Authorization` header for a session token. */
export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
