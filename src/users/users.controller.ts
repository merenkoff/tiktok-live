// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/users/users.controller.ts

import { FastifyInstance } from 'fastify';
import { loginUser, logoutUser, ensureAuth } from '../core/auth.js';
import * as usersService from './users.service.js';
import { logger } from '../logger.js';

export async function registerUserRoutes(fastify: FastifyInstance) {
  /**
   * Login
   */
  fastify.post<{ Body: { tiktok_username: string } }>(
    '/api/auth/login',
    async (request, reply) => {
      try {
        const { tiktok_username } = request.body;

        if (!tiktok_username || tiktok_username.length < 3) {
          reply.status(400).send({ error: 'Invalid username' });
          return;
        }

        const { token, user } = await loginUser(tiktok_username);
        reply.send({ token, user });
      } catch (error) {
        logger.error('Login error', { error });
        reply.status(500).send({ error: 'Login failed' });
      }
    }
  );

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
