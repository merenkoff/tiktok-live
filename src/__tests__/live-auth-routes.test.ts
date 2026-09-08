// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/live-auth-routes.test.ts
//
// `POST /api/auth/login` minted a 7-day LIVE token from a `tiktok_username`
// alone — no password, no secret — and a nickname is public by definition,
// being the handle the shop broadcasts under. Anyone who knew it could repoint
// the store's Telegram bot or stop its broadcast.
//
// It is gone. A LIVE token now comes only from `POST /api/pos/live/session-token`,
// which requires an authenticated POS session. This pins the removal: reviving
// the route would have to break this test first.
//
// No database needed — the assertion is about the route table.

import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerUserRoutes } from '../users/users.controller.js';

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
  app = Fastify();
  await registerUserRoutes(app);
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('LIVE auth routes', () => {
  it('no longer exposes a nickname-only login', async () => {
    const res = await (await buildApp()).inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { tiktok_username: 'some_public_handle' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('still answers /api/auth/me — with 401 when unauthenticated', async () => {
    const res = await (await buildApp()).inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('still accepts a logout', async () => {
    const res = await (await buildApp()).inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
  });
});
