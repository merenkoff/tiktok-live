// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos-live-session-token.test.ts
//
// The POS → TikTok-LIVE auth bridge (`POST /api/pos/live/session-token`).
//
// This is the one place the POS plugin reaches into the LIVE automation core,
// so the contract is pinned here: a valid POS session of a *connected* store
// yields a token that `verifyToken` accepts for that store's TikTok user; an
// unconnected store gets 409 and no token is minted; no session gets 401.
//
// Needs the LIVE schema (`users` / `user_settings`) on top of the POS one —
// `applyLiveMigrations()`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { verifyToken } from '../core/auth.js';
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

const URL = '/api/pos/live/session-token';

describe.skipIf(!hasDb)('POS → LIVE session-token bridge', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let nickname: string;

  beforeAll(async () => {
    await applyPosMigrations();
    await applyLiveMigrations();
    store = await createTestStore('rlive');
    // `users.tiktok_username` is globally unique and outside the store's
    // cascade, so give each run its own and clean it up below.
    nickname = `t_live_${store.storeId}_${Date.now()}`;
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    if (nickname) await pool.query(`DELETE FROM users WHERE tiktok_username = $1`, [nickname]);
    await pool.end();
  });

  it('401s without a session token', async () => {
    const res = await app.inject({ method: 'POST', url: URL });
    expect(res.statusCode).toBe(401);
  });

  it('409s with live_not_configured when the store has no TikTok account linked', async () => {
    const res = await app.inject({ method: 'POST', url: URL, headers: auth(store.sellerToken) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('live_not_configured');
  });

  describe('once the store is connected', () => {
    beforeAll(async () => {
      await pool.query(`UPDATE pos_stores SET live_tiktok_username = $1 WHERE id = $2`, [
        nickname,
        store.storeId,
      ]);
    });

    it('mints a LIVE token a seller can use, for the connected account', async () => {
      const res = await app.inject({ method: 'POST', url: URL, headers: auth(store.sellerToken) });
      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        token: string;
        user: { id: number; tiktok_username: string };
        expiresAt: string;
      };
      expect(body.user.tiktok_username).toBe(nickname);
      expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

      // The whole point: the LIVE side accepts what the POS side minted.
      const verified = verifyToken(body.token);
      expect(verified).not.toBeNull();
      expect(verified?.username).toBe(nickname);
      // `users.id` is BIGSERIAL — node-pg returns bigint columns as a string,
      // and the signed token embeds that raw value (AuthToken.userId is typed
      // `number` but is actually a string at runtime; see `src/core/auth.ts`).
      // The bridge response coerces it with `Number()` for a clean JSON
      // contract, so the two representations only agree after normalizing.
      expect(Number(verified?.userId)).toBe(body.user.id);
    });

    it('is idempotent — a second mint resolves to the same LIVE user', async () => {
      const first = await app.inject({ method: 'POST', url: URL, headers: auth(store.ownerToken) });
      const second = await app.inject({ method: 'POST', url: URL, headers: auth(store.sellerToken) });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json().user.id).toBe(first.json().user.id);

      const users = await pool.query(`SELECT id FROM users WHERE tiktok_username = $1`, [nickname]);
      expect(users.rows).toHaveLength(1);
    });

    it('creates the LIVE settings row so a session can start without visiting Settings', async () => {
      await app.inject({ method: 'POST', url: URL, headers: auth(store.sellerToken) });
      const settings = await pool.query(
        `SELECT s.id FROM user_settings s
         JOIN users u ON u.id = s.user_id
         WHERE u.tiktok_username = $1`,
        [nickname]
      );
      expect(settings.rows).toHaveLength(1);
    });
  });
});
