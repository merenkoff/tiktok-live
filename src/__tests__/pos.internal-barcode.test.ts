// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.internal-barcode.test.ts
//
// Store-local barcodes, minted when a supplier's tag will not scan.
//
// The test that matters most here is the cache one. `pos_gtin_cache` is keyed
// by GTIN with no store_id — it is shared by every store on the deployment on
// purpose, because "barcode → name" is universal reference data. A minted code
// is a *valid* EAN-13, so without a guard the name store A gave its own code
// would be served to store B as a lookup hint. That is a cross-tenant leak plus
// simply wrong data, and it appears the moment this feature ships.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';
import {
  INTERNAL_BARCODE_MAX_PAYLOAD,
  buildInternalBarcode,
  isInternalBarcode,
} from '../pos/gtin/internal-code.js';
import { computeCheckDigit, normalizeGtin, verifyCheckDigit } from '../pos/gtin/normalize.js';
import { getGtinCache, learnFromManual } from '../pos/gtin/gtin-cache.service.js';

describe('internal barcode format', () => {
  it('mints a well-formed EAN-13 across the counter range', () => {
    for (const payload of [0, 1, 42, 999, 1_234_567_890, INTERNAL_BARCODE_MAX_PAYLOAD]) {
      const code = buildInternalBarcode(payload);
      expect(code).toHaveLength(13);
      expect(code.startsWith('29')).toBe(true);
      expect(verifyCheckDigit(code)).toBe(true);
      // The whole point of the prefix: it has to read as a real barcode.
      expect(normalizeGtin(code).ok).toBe(true);
    }
  });

  it('refuses to overflow into a 14-digit string', () => {
    // Silently emitting 14 digits would make the code read as the GTIN-14 of
    // something else entirely.
    expect(() => buildInternalBarcode(INTERNAL_BARCODE_MAX_PAYLOAD + 1)).toThrow(/exhausted/);
    expect(() => buildInternalBarcode(-1)).toThrow();
    expect(() => buildInternalBarcode(1.5)).toThrow();
  });

  it('recognises its own codes in either representation', () => {
    const code = buildInternalBarcode(17);
    expect(isInternalBarcode(code)).toBe(true);
    // The cache stores the canonical GTIN-14, where `29…` is already `029…`.
    const canonical = normalizeGtin(code);
    expect(canonical.ok && canonical.canonical).toBe(`0${code}`);
    expect(isInternalBarcode(canonical.ok ? canonical.canonical : '')).toBe(true);
  });

  it('does not claim codes that are not ours', () => {
    const realEan13 = `482027036287${computeCheckDigit('482027036287')}`;
    const ean8 = `2912345${computeCheckDigit('2912345')}`;
    expect(isInternalBarcode(realEan13)).toBe(false);
    // Starts with 29 but is an EAN-8 — a different code space entirely.
    expect(isInternalBarcode(ean8)).toBe(false);
    expect(isInternalBarcode('')).toBe(false);
    expect(isInternalBarcode(null)).toBe(false);
    expect(isInternalBarcode('не-код')).toBe(false);
    // Right shape, broken check digit — not a barcode at all.
    expect(isInternalBarcode('2900000000019')).toBe(false);
  });
});

describe.skipIf(!hasDb)('POST /variants/internal-barcode', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let productId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('intbc');
    app = await buildPosTestApp();
    const p = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Товар') RETURNING id`,
      [store.storeId]
    );
    productId = Number(p.rows[0].id);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  async function mint(token = store.ownerToken) {
    return app.inject({
      method: 'POST',
      url: '/api/pos/variants/internal-barcode',
      headers: auth(token),
    });
  }

  it('hands out a fresh code each time', async () => {
    const a = await mint();
    const b = await mint();
    expect(a.statusCode).toBe(200);
    expect(a.json().barcode).not.toBe(b.json().barcode);
    for (const res of [a, b]) {
      expect(isInternalBarcode(res.json().barcode)).toBe(true);
    }
  });

  it('produces a code that saves as a variant barcode, and only once', async () => {
    const barcode = (await mint()).json().barcode;
    const first = await app.inject({
      method: 'POST',
      url: `/api/pos/products/${productId}/variants`,
      headers: auth(store.ownerToken),
      payload: { size: 'M', color: 'Синій', price_cents: 1000, barcode },
    });
    expect(first.statusCode).toBe(201);

    // Uniqueness is the index's job, not a reservation's — and it surfaces.
    const second = await app.inject({
      method: 'POST',
      url: `/api/pos/products/${productId}/variants`,
      headers: auth(store.ownerToken),
      payload: { size: 'L', color: 'Синій', price_cents: 1000, barcode },
    });
    expect(second.statusCode).toBe(409);
  });

  it('is owner-only and behind the products module', async () => {
    expect((await mint(store.sellerToken)).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/pos/variants/internal-barcode' })).statusCode).toBe(401);

    const temp = await createTestStore('intbcoff');
    try {
      await setEnabledModules(temp.storeId, ['settings']);
      expect((await mint(temp.ownerToken)).statusCode).toBe(404);
    } finally {
      await dropTestStore(temp.storeId);
    }
  });
});

describe.skipIf(!hasDb)('store-local codes never reach the shared cache', () => {
  const code = buildInternalBarcode(987_654_321);

  // Both tables, and before as well as after: this suite asserts the *absence*
  // of rows, so a leftover from any earlier run would fail it for the wrong
  // reason and look like a regression.
  const clean = async () => {
    await pool.query(`DELETE FROM pos_gtin_cache WHERE gtin LIKE $1`, [`%${code.slice(0, 12)}%`]);
    await pool.query(`DELETE FROM pos_gtin_lookup_events WHERE gtin LIKE $1`, [
      `%${code.slice(0, 12)}%`,
    ]);
  };

  beforeAll(async () => {
    await applyPosMigrations();
    await clean();
  }, 120000);

  afterAll(async () => {
    await clean();
    await pool.end();
  });

  it('writes no cache row, and records no lookup event', async () => {
    expect(await learnFromManual({ code, name: 'Піжама магазину А' })).toBeNull();

    const rows = await pool.query(
      `SELECT 1 FROM pos_gtin_cache WHERE gtin = $1`,
      [normalizeGtin(code).ok ? (normalizeGtin(code) as { canonical: string }).canonical : '']
    );
    expect(rows.rows).toHaveLength(0);

    // Not even in the event log: nothing about a store-local code belongs in a
    // table every store can read.
    const events = await pool.query(
      `SELECT 1 FROM pos_gtin_lookup_events WHERE gtin LIKE $1`,
      [`%${code.slice(0, 12)}%`]
    );
    expect(events.rows).toHaveLength(0);
  });

  it('reads back as a miss rather than another store’s product', async () => {
    expect(await getGtinCache(code)).toBeNull();
  });
});
