// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Owner's surface for modifier groups and their attachment to products
// (migration 046, TechDocs/POS_CAFE.md). Under the `products` module, owner
// only — the till reads modifiers off the catalog, never from here.

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as modifiers from '../modifiers.service.js';
import { errorMessage } from './_shared.js';

export function registerModifierRoutes(fastify: FastifyInstance): void {
  fastify.get('/modifier-groups', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    return modifiers.listGroups(auth.storeId);
  });

  fastify.post('/modifier-groups', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    try {
      const group = await modifiers.createGroup(
        auth.storeId,
        (request.body ?? {}) as modifiers.ModifierGroupInput
      );
      return reply.code(201).send(group);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/modifier-groups/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await modifiers.updateGroup(
        auth.storeId,
        Number(id),
        (request.body ?? {}) as modifiers.ModifierGroupInput
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/modifier-groups/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await modifiers.deleteGroup(auth.storeId, Number(id));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/modifier-groups/:id/modifiers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const group = await modifiers.createModifier(
        auth.storeId,
        Number(id),
        (request.body ?? {}) as modifiers.ModifierInput
      );
      return reply.code(201).send(group);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/modifiers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await modifiers.updateModifier(
        auth.storeId,
        Number(id),
        (request.body ?? {}) as modifiers.ModifierInput
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/modifiers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await modifiers.deleteModifier(auth.storeId, Number(id));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  /** Which groups a product asks, replaced wholesale and in this order. */
  fastify.put('/products/:id/modifier-groups', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { group_ids?: unknown };
    try {
      return await modifiers.setProductGroups(auth.storeId, Number(id), body.group_ids ?? []);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
