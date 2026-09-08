// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/users/users.controller.ts

import { FastifyInstance } from 'fastify';
import { logoutUser, ensureAuth } from '../core/auth.js';
import * as usersService from './users.service.js';
import { logger } from '../logger.js';

export async function registerUserRoutes(fastify: FastifyInstance) {
  // `POST /api/auth/login` was removed (2026-09-09).
  //
  // It minted a 7-day token from a `tiktok_username` alone — no password, no
  // secret, and the nickname is public by definition, being the handle the shop
  // broadcasts under. Anyone who knew it could repoint the store's Telegram bot
  // and start or stop its broadcast. `maskSettings` hid the token from reads but
  // nothing stopped a write.
  //
  // The only way to obtain a LIVE token is now `POST /api/pos/live/session-token`
  // (`src/pos/routes/live.routes.ts`), which requires an authenticated POS
  // session, and settings live behind the owner-gated proxy beside it. The
  // standalone LIVE admin SPA under `admin/` is retired accordingly — its login
  // screen now says so.
  //
  // `loginUser` itself stays: the bridge calls it in-process.

  /**
   * Logout
   */
  fastify.post(
    '/api/auth/logout',
    async (request, reply) => {
      try {
        const token = request.headers.authorization?.substring(7);
        if (token) {
          logoutUser(token);
        }
        reply.send({ ok: true });
      } catch (error) {
        logger.error('Logout error', { error });
        reply.status(500).send({ error: 'Logout failed' });
      }
    }
  );

  /**
   * Get current user
   */
  fastify.get(
    '/api/auth/me',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);
        const user = await usersService.getUserById(userId);
        reply.send(user);
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );
}
