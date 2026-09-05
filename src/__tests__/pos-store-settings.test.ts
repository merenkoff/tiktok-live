// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword } from '../pos/core/crypto.js';
import { getStore, updateStore } from '../pos/analytics.service.js';
import { getAuthByToken } from '../pos/core/auth.js';
import { isGtinLookupEnabled, getStoreGtinConfig } from '../pos/gtin/gtin-cache.service.js';
import { tryConsumeBudget } from '../pos/gtin/provider-budget.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POS store settings', () => {
  let storeId = 0;
  let token = '';

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const file of [
      '002_pos_schema.sql',
      '008_pos_gtin_cache.sql',
      '011_pos_qr_payment.sql',
      '013_pos_store_settings.sql',
      '015_pos_store_modules.sql',
      '016_pos_store_module_remotes.sql',
    ]) {
      const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
      await pool.query(sql);
    }

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
    expect(fresh?.gtin_api_key_set).toBe(false);
    expect(fresh?.gtin_daily_limit).toBeNull();
    expect(fresh?.auto_print_receipt).toBe(false);
  });

  it('round-trips all four settings through updateStore', async () => {
    const updated = await updateStore(storeId, {
      gtin_lookup_enabled: false,
      gtin_api_key: 'k_secret_123',
      gtin_daily_limit: 5,
      auto_print_receipt: true,
    });
    expect(updated.gtin_lookup_enabled).toBe(false);
    expect(updated.gtin_api_key_set).toBe(true);
    expect(updated.gtin_daily_limit).toBe(5);
    expect(updated.auto_print_receipt).toBe(true);

    const readBack = await getStore(storeId);
    expect(readBack?.gtin_api_key_set).toBe(true);
    expect(readBack?.gtin_daily_limit).toBe(5);

    const back = await updateStore(storeId, {
      gtin_lookup_enabled: true,
      auto_print_receipt: false,
      gtin_daily_limit: null,
    });
    expect(back.gtin_lookup_enabled).toBe(true);
    expect(back.auto_print_receipt).toBe(false);
    expect(back.gtin_daily_limit).toBeNull();
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

  it('never returns the raw gtin_api_key, only gtin_api_key_set', async () => {
    await updateStore(storeId, { gtin_api_key: 'top_secret' });
    const store = (await getStore(storeId)) as Record<string, unknown>;
    expect(store.gtin_api_key_set).toBe(true);
    expect('gtin_api_key' in store).toBe(false);
  });

  it('leaves other settings untouched on a partial patch', async () => {
    await updateStore(storeId, {
      gtin_lookup_enabled: false,
      auto_print_receipt: true,
      gtin_daily_limit: 9,
    });
    await updateStore(storeId, { name: 'Renamed Store' });
    const after = await getStore(storeId);
    expect(after?.name).toBe('Renamed Store');
    expect(after?.gtin_lookup_enabled).toBe(false);
    expect(after?.auto_print_receipt).toBe(true);
    expect(after?.gtin_daily_limit).toBe(9);
  });

  it('isGtinLookupEnabled tracks the column', async () => {
    await updateStore(storeId, { gtin_lookup_enabled: false });
    expect(await isGtinLookupEnabled(storeId)).toBe(false);
    await updateStore(storeId, { gtin_lookup_enabled: true });
    expect(await isGtinLookupEnabled(storeId)).toBe(true);
  });

  it('getStoreGtinConfig returns the per-store key and limit', async () => {
    await updateStore(storeId, { gtin_api_key: 'k_9', gtin_daily_limit: 3 });
    expect(await getStoreGtinConfig(storeId)).toEqual({ upcDevApiKey: 'k_9', upcDevDailyLimit: 3 });
    expect(await getStoreGtinConfig(undefined)).toEqual({
      upcDevApiKey: null,
      upcDevDailyLimit: null,
    });
    expect(await getStoreGtinConfig(999_999_999)).toEqual({
      upcDevApiKey: null,
      upcDevDailyLimit: null,
    });
  });

  it('tryConsumeBudget honours a positive limitOverride over the env default', async () => {
    await pool.query(`DELETE FROM pos_gtin_provider_budget WHERE provider = 'upc_dev'`);
    expect(await tryConsumeBudget('upc_dev', 2)).toBe(true);
    expect(await tryConsumeBudget('upc_dev', 2)).toBe(true);
    expect(await tryConsumeBudget('upc_dev', 2)).toBe(false);
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
