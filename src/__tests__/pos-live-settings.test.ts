// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos-live-settings.test.ts
//
// The owner-gated LIVE settings proxy (`/api/pos/live/settings`), which backs
// the `tiktok-live` module's admin surface.
//
// The reason it exists rather than the module calling LIVE's own
// `/api/settings` with a bridge token: LIVE has no role concept, and a bridge
// token's subject is the STORE's LIVE user — any seller can mint one. The 403
// case below is the whole point of the route.
//
// Needs the LIVE schema on top of the POS one — `applyLiveMigrations()`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyLiveMigrations,
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

const URL = '/api/pos/live/settings';
const REAL_TOKEN = '123456:AAH-real-bot-token';

describe.skipIf(!hasDb)('POS LIVE settings proxy', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let nickname: string;

  async function liveUserId(): Promise<number> {
    const { rows } = await pool.query(`SELECT id FROM users WHERE tiktok_username = $1`, [
      nickname,
    ]);
    return Number(rows[0].id);
  }

  async function storedSettings() {
    const { rows } = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [await liveUserId()]
    );
    return rows[0];
  }

  beforeAll(async () => {
    await applyPosMigrations();
    await applyLiveMigrations();
    store = await createTestStore('rlset');
    // `users.tiktok_username` is globally unique and outside the store cascade.
    nickname = `t_set_${store.storeId}_${Date.now()}`;
    await pool.query(`UPDATE pos_stores SET live_tiktok_username = $2 WHERE id = $1`, [
      store.storeId,
      nickname,
    ]);
    app = await buildPosTestApp();
  }, 120000);

  beforeEach(async () => {
    // Reset to a known, fully-populated state before each case.
    await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: {
        telegram_bot_token: REAL_TOKEN,
        telegram_channel_id: '-1001234567890',
        novaposhta_api_key: 'np-key',
        novaposhta_merchant_name: 'Shop',
        reservation_timeout_minutes: 5,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    if (nickname) await pool.query(`DELETE FROM users WHERE tiktok_username = $1`, [nickname]);
    await pool.end();
  });

  it('401s without a session token', async () => {
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
  });

  it('403s a seller — the reason this route exists', async () => {
    const read = await app.inject({ method: 'GET', url: URL, headers: auth(store.sellerToken) });
    expect(read.statusCode).toBe(403);

    const write = await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.sellerToken),
      payload: { telegram_bot_token: 'seller-owned-bot' },
    });
    expect(write.statusCode).toBe(403);
    // And nothing moved.
    expect((await storedSettings()).telegram_bot_token).toBe(REAL_TOKEN);
  });

  it('403s a seller on the telegram test too', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${URL}/test-telegram`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('never returns the secrets, only whether they are set', async () => {
    const res = await app.inject({ method: 'GET', url: URL, headers: auth(store.ownerToken) });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toMatchObject({
      telegram_bot_token_set: true,
      novaposhta_api_key_set: true,
      telegram_channel_id: '-1001234567890',
      novaposhta_merchant_name: 'Shop',
      reservation_timeout_minutes: 5,
    });
    expect(body).not.toHaveProperty('telegram_bot_token');
    expect(body).not.toHaveProperty('novaposhta_api_key');
    expect(res.payload).not.toContain(REAL_TOKEN);
    expect(res.payload).not.toContain('np-key');
  });

  it('keeps a stored secret when the field is omitted', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: { reservation_timeout_minutes: 30 },
    });
    expect(res.statusCode).toBe(200);

    const stored = await storedSettings();
    expect(stored.telegram_bot_token).toBe(REAL_TOKEN);
    expect(stored.reservation_timeout_minutes).toBe(30);
  });

  it('does not store the mask placeholder an older client may echo back', async () => {
    await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: { telegram_bot_token: '***', novaposhta_api_key: '***' },
    });

    const stored = await storedSettings();
    expect(stored.telegram_bot_token).toBe(REAL_TOKEN);
    expect(stored.novaposhta_api_key).toBe('np-key');
  });

  it('clears a field on explicit null', async () => {
    await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: { novaposhta_api_key: null, telegram_channel_id: null },
    });

    const stored = await storedSettings();
    expect(stored.novaposhta_api_key).toBeNull();
    expect(stored.telegram_channel_id).toBeNull();
  });

  it('rejects a malformed channel id with 400, not 500', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: { telegram_channel_id: 'not-a-number' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/must be an integer/);
  });

  it('rejects an out-of-range reservation timer with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: { reservation_timeout_minutes: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('409s when the store is not connected to a TikTok account', async () => {
    const other = await createTestStore('rlset2');
    try {
      const res = await app.inject({
        method: 'GET',
        url: URL,
        headers: auth(other.ownerToken),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('live_not_configured');
    } finally {
      await dropTestStore(other.storeId);
    }
  });

  it('works before the broadcast screen has ever been opened', async () => {
    // A store connected just now: no LIVE user row exists until something
    // resolves it. GET must create it rather than 502.
    const fresh = await createTestStore('rlset3');
    const freshNick = `t_set_fresh_${fresh.storeId}_${Date.now()}`;
    await pool.query(`UPDATE pos_stores SET live_tiktok_username = $2 WHERE id = $1`, [
      fresh.storeId,
      freshNick,
    ]);
    try {
      const res = await app.inject({
        method: 'GET',
        url: URL,
        headers: auth(fresh.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        tiktok_username: freshNick,
        telegram_bot_token_set: false,
      });
    } finally {
      await dropTestStore(fresh.storeId);
      await pool.query(`DELETE FROM users WHERE tiktok_username = $1`, [freshNick]);
    }
  });

  it('400s the telegram test when no token is stored', async () => {
    await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(store.ownerToken),
      payload: { telegram_bot_token: null },
    });

    const res = await app.inject({
      method: 'POST',
      url: `${URL}/test-telegram`,
      headers: auth(store.ownerToken),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('telegram_token_not_set');
  });
});
