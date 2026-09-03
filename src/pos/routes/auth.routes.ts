// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as authService from '../auth.service.js';

export function registerAuthRoutes(fastify: FastifyInstance): void {
  fastify.post('/auth/owner/login', async (request, reply) => {
    const body = request.body as { login?: string; password?: string };
    if (!body.login || !body.password) {
      return reply.code(400).send({ error: 'login and password required' });
    }
    const result = await authService.loginOwner(body.login, body.password);
    if (!result) return reply.code(401).send({ error: 'Invalid credentials' });
    return result;
  });

  fastify.post('/auth/staff/pin', async (request, reply) => {
    const body = request.body as { store_slug?: string; pin?: string };
    if (!body.store_slug || !body.pin) {
      return reply.code(400).send({ error: 'store_slug and pin required' });
    }
    const result = await authService.loginWithPin(body.store_slug, body.pin);
    if (!result) return reply.code(401).send({ error: 'Invalid PIN or store' });
    return result;
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    await authService.logout(auth.token);
    return { ok: true };
  });

  fastify.get('/me', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return authService.me(auth);
  });

  // ── Staff (owner) ─────────────────────────────────────
}
