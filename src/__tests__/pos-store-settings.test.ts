// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations } from './helpers/pos-fixtures.js';
import { hashPassword } from '../pos/core/crypto.js';
import { getStore, updateStore } from '../pos/analytics.service.js';
import { getAuthByToken } from '../pos/core/auth.js';
import { isGtinLookupEnabled } from '../pos/gtin/gtin-cache.service.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POS store settings', () => {
  let storeId = 0;
  let token = '';

  beforeAll(async () => {
    await applyPosMigrations();

    const slug = `set_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Settings Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);

    const pw = await hashPassword('x');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash)
       VALUES ($1, 'owner', 'Settings Owner', $2, $3) RETURNING id`,
      [storeId, `${slug}@t.local`, pw]
    );
    token = `set-token-${Date.now()}`;
    await pool.query(
      `INSERT INTO pos_sessions (store_id, staff_id, token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [storeId, Number(staff.rows[0].id), token]
    );
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.end();
  });

  it('exposes sane defaults from getStore', async () => {
    const fresh = await getStore(storeId);
    expect(fresh?.gtin_lookup_enabled).toBe(true);
    expect(fresh?.auto_print_receipt).toBe(false);
    // upc.dev is gone, and its per-store credentials left the wire with it.
    expect('gtin_api_key_set' in (fresh as Record<string, unknown>)).toBe(false);
    expect('gtin_daily_limit' in (fresh as Record<string, unknown>)).toBe(false);
  });

  it('round-trips the toggles through updateStore', async () => {
    const updated = await updateStore(storeId, {
      gtin_lookup_enabled: false,
      auto_print_receipt: true,
    });
    expect(updated.gtin_lookup_enabled).toBe(false);
    expect(updated.auto_print_receipt).toBe(true);

    const readBack = await getStore(storeId);
    expect(readBack?.gtin_lookup_enabled).toBe(false);

    const back = await updateStore(storeId, {
      gtin_lookup_enabled: true,
      auto_print_receipt: false,
    });
    expect(back.gtin_lookup_enabled).toBe(true);
    expect(back.auto_print_receipt).toBe(false);
  });

  it('round-trips the module_remotes jsonb map and leaves it on a partial patch', async () => {
    const map = { stock: 'https://cdn.example.com/stock/remote-entry.js' };
    const updated = await updateStore(storeId, { module_remotes: map });
    expect(updated.module_remotes).toEqual(map);

    const readBack = await getStore(storeId);
    expect(readBack?.module_remotes).toEqual(map);

    // A patch that doesn't mention module_remotes must not clear it.
    await updateStore(storeId, { name: 'Renamed Store' });
    expect((await getStore(storeId))?.module_remotes).toEqual(map);

    // Explicit empty object clears it.
    const cleared = await updateStore(storeId, { module_remotes: {} });
    expect(cleared.module_remotes).toEqual({});
  });

  it('leaves other settings untouched on a partial patch', async () => {
    await updateStore(storeId, {
      gtin_lookup_enabled: false,
      auto_print_receipt: true,
    });
    await updateStore(storeId, { name: 'Renamed Store' });
    const after = await getStore(storeId);
    expect(after?.name).toBe('Renamed Store');
    expect(after?.gtin_lookup_enabled).toBe(false);
    expect(after?.auto_print_receipt).toBe(true);
  });

  it('isGtinLookupEnabled tracks the column', async () => {
    await updateStore(storeId, { gtin_lookup_enabled: false });
    expect(await isGtinLookupEnabled(storeId)).toBe(false);
    await updateStore(storeId, { gtin_lookup_enabled: true });
    expect(await isGtinLookupEnabled(storeId)).toBe(true);
  });

  it('delivers auto_print_receipt on the auth context (not the gtin flags)', async () => {
    await updateStore(storeId, { auto_print_receipt: true });
    const auth = (await getAuthByToken(token)) as unknown as Record<string, unknown>;
    expect(auth.autoPrintReceipt).toBe(true);
    expect('gtinLookupEnabled' in auth).toBe(false);
    expect('gtinApiKey' in auth).toBe(false);

    await updateStore(storeId, { auto_print_receipt: false });
    const auth2 = await getAuthByToken(token);
    expect(auth2?.autoPrintReceipt).toBe(false);
  });
});
