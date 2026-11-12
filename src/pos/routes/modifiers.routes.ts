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
import { pool } from '../../db.js';
import { diffGroup, recordMenuChange } from '../menu-changes.js';
import { withMenuJournal } from './products.routes.js';
import type { PosAuthContext } from '../types.js';

/** A group as it stands, or null when it is gone (or cannot be read). */
async function readGroup(storeId: number, groupId: number | null): Promise<modifiers.ModifierGroup | null> {
  if (groupId == null) return null;
  try {
    return await modifiers.getGroup(storeId, groupId);
  } catch {
    return null;
  }
}

/** The group a modifier belongs to. */
async function groupOfModifier(storeId: number, modifierId: number): Promise<number | null> {
  const row = await pool.query(
    `SELECT m.group_id FROM pos_modifiers m JOIN pos_modifier_groups g ON g.id = m.group_id
     WHERE m.id = $1 AND g.store_id = $2`,
    [modifierId, storeId]
  );
  return row.rows.length === 0 ? null : Number(row.rows[0].group_id);
}

/**
 * Run a write to one modifier group and record what changed in it (migration
 * 101). `groupId` null = the write creates the group, named by its answer.
 */
async function withGroupJournal<T>(
  auth: PosAuthContext,
  groupId: number | null,
  write: () => Promise<T>,
  createdId?: (result: T) => number
): Promise<T> {
  const before = await readGroup(auth.storeId, groupId);
  const result = await write();
  const id = groupId ?? (createdId ? createdId(result) : null);
  if (id != null) {
    const after = await readGroup(auth.storeId, id);
    const { action, changes } = diffGroup(before, after);
    const name = after?.name ?? before?.name;
    if (name != null) {
      await recordMenuChange(auth, { entity: 'modifier_group', entityId: id, entityName: name, action, changes });
    }
  }
  return result;
}

export function registerModifierRoutes(fastify: FastifyInstance): void {
  fastify.get('/modifier-groups', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    return modifiers.listGroups(auth.storeId);
  });

  fastify.post('/modifier-groups', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    try {
      const group = await withGroupJournal(
        auth,
        null,
        () => modifiers.createGroup(auth.storeId, (request.body ?? {}) as modifiers.ModifierGroupInput),
        (created) => created.id
      );
      return reply.code(201).send(group);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/modifier-groups/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await withGroupJournal(auth, Number(id), () =>
        modifiers.updateGroup(auth.storeId, Number(id), (request.body ?? {}) as modifiers.ModifierGroupInput)
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/modifier-groups/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await withGroupJournal(auth, Number(id), () => modifiers.deleteGroup(auth.storeId, Number(id)));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/modifier-groups/:id/modifiers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const group = await withGroupJournal(auth, Number(id), () =>
        modifiers.createModifier(auth.storeId, Number(id), (request.body ?? {}) as modifiers.ModifierInput)
      );
      return reply.code(201).send(group);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/modifiers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await withGroupJournal(auth, await groupOfModifier(auth.storeId, Number(id)), () =>
        modifiers.updateModifier(auth.storeId, Number(id), (request.body ?? {}) as modifiers.ModifierInput)
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/modifiers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await withGroupJournal(auth, await groupOfModifier(auth.storeId, Number(id)), () =>
        modifiers.deleteModifier(auth.storeId, Number(id))
      );
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  /** Which groups a product asks, replaced wholesale and in this order. */
  fastify.put('/products/:id/modifier-groups', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { group_ids?: unknown };
    try {
      return await withMenuJournal(auth, [Number(id)], () =>
        modifiers.setProductGroups(auth.storeId, Number(id), body.group_ids ?? [])
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
