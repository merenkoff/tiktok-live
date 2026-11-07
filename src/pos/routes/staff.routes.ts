// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as authService from '../auth.service.js';
import { clearPinMisses, getPinLockStatus } from '../pin-attempts.js';
import { errorMessage } from './_shared.js';

/** A staff write's refusal: the owner's words and their status, or a plain 400. */
function sendStaffError(reply: FastifyReply, error: unknown) {
  if (error instanceof authService.StaffError) return reply.code(error.status).send({ error: error.message });
  return reply.code(400).send({ error: errorMessage(error) });
}

export function registerStaffRoutes(fastify: FastifyInstance): void {
  fastify.get('/staff', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    return authService.listStaff(auth.storeId);
  });

  fastify.post('/staff', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    const body = (request.body ?? {}) as { display_name?: string; pin?: string; role?: unknown };
    try {
      if (!body.display_name || !body.pin) {
        return reply.code(400).send({ error: 'display_name and pin required' });
      }
      // `role` is the seller unless the owner picks a role the vertical offers
      // (track МР: the café's marketer).
      const created = await authService.createStaff(auth.storeId, {
        displayName: body.display_name,
        pin: body.pin,
        role: body.role,
      });
      return reply.code(201).send(created);
    } catch (error) {
      return sendStaffError(reply, error);
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
      return sendStaffError(reply, error);
    }
  });

  // Wrong PINs at the till (`pin-attempts.ts`): how many, and whether PIN
  // login is closed. «Розблокувати» reopens it; a new PIN for anyone does too.
  fastify.get('/staff/pin-lock', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    return getPinLockStatus(auth.storeId);
  });

  fastify.post('/staff/pin-lock/reset', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    await clearPinMisses(auth.storeId);
    return getPinLockStatus(auth.storeId);
  });

  fastify.patch('/staff/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'staff', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { is_active?: boolean; role?: unknown; pin?: unknown };
    try {
      if (typeof body.is_active !== 'boolean' && body.role === undefined) {
        return reply.code(400).send({ error: 'is_active or role required' });
      }
      // A seller ↔ marketer switch (track МР, М9), a new PIN with it when needed.
      if (body.role !== undefined) await authService.setStaffRole(auth.storeId, Number(id), { role: body.role, pin: body.pin });
      if (typeof body.is_active === 'boolean') await authService.setStaffActive(auth.storeId, Number(id), body.is_active);
      return { ok: true };
    } catch (error) {
      return sendStaffError(reply, error);
    }
  });

  // ── Products ──────────────────────────────────────────
}
