// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as authService from '../auth.service.js';
import { errorMessage } from './_shared.js';

export function registerStaffRoutes(fastify: FastifyInstance): void {
  fastify.get('/staff', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    return authService.listStaff(auth.storeId);
  });

  fastify.post('/staff', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    const body = request.body as { display_name?: string; pin?: string };
    try {
      if (!body.display_name || !body.pin) {
        return reply.code(400).send({ error: 'display_name and pin required' });
      }
      const created = await authService.createSeller(auth.storeId, body.display_name, body.pin);
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/staff/:id/pin', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { pin?: string };
    try {
      if (!body.pin) return reply.code(400).send({ error: 'pin required' });
      await authService.setStaffPin(auth.storeId, Number(id), body.pin);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/staff/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { is_active?: boolean };
    try {
      if (typeof body.is_active !== 'boolean') {
        return reply.code(400).send({ error: 'is_active required' });
      }
      await authService.setStaffActive(auth.storeId, Number(id), body.is_active);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Products ──────────────────────────────────────────
}
