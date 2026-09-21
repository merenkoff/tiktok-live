// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/tables.routes.ts — halls and tables (phase К4a).
//
// Core rather than a module, for the reason `registerKitchenRoutes` gives:
// the `tables` module that draws the hall map opts in through
// `pos_stores.module_remotes`, not `enabled_modules`, so `ensureModule` has
// nothing to check. The module's presence IS the "restaurant" switch — there
// is no `pos_stores.service_mode` column and there is not going to be one
// (TechDocs/POS_TABLES.md §4.11, §8.4).
//
// Reading the map is `ensurePosAuth`: the waiter with a tablet is a seller,
// and §4.7 says everyone sees every table. Changing the furniture is
// `ensurePosOwner` — a floor plan is not a shift-time decision.
//
// Answers are the shapes the rest of this backend uses: 400 in the service's
// own words for input that cannot be right, 404 (never 403) for a hall or
// table belonging to another store, 409 for a delete that would take a
// recorded evening with it.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import * as tables from '../tables.service.js';
import { errorMessage } from './_shared.js';

function idOf(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Map a service error onto its status. Anything else is a real 500. */
function sendError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof tables.TablesNotFound) {
    return reply.code(404).send({ error: errorMessage(error) });
  }
  if (error instanceof tables.TablesConflict) {
    return reply.code(409).send({ error: errorMessage(error) });
  }
  if (error instanceof tables.TablesError) {
    return reply.code(400).send({ error: errorMessage(error) });
  }
  throw error;
}

function readPositions(body: unknown): tables.TablePosition[] {
  const rows = (body as { positions?: unknown })?.positions;
  if (!Array.isArray(rows)) {
    throw new tables.TablesError('positions має бути масивом');
  }
  return rows.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) throw new tables.TablesNotFound('Стіл не знайдено');
    const position: tables.TablePosition = {
      id,
      pos_x: Number(item.pos_x),
      pos_y: Number(item.pos_y),
      width: Number(item.width),
      height: Number(item.height),
    };
    if (item.hall_id !== undefined) position.hall_id = Number(item.hall_id);
    return position;
  });
}

export function registerTablesRoutes(fastify: FastifyInstance): void {
  // The hall map. A store with no halls gets an empty list, not a 409: that
  // store is exactly the one whose owner is about to create the first hall.
  // The endpoints that need a room to exist are the bill ones (К4b).
  fastify.get('/halls', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return { halls: await tables.listHalls(auth.storeId) };
  });

  fastify.post('/halls', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return await tables.createHall(auth.storeId, (request.body ?? {}) as tables.HallInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/halls/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Зал не знайдено' });
    try {
      return await tables.updateHall(auth.storeId, id, (request.body ?? {}) as tables.HallInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/halls/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Зал не знайдено' });
    try {
      await tables.deleteHall(auth.storeId, id);
      return { ok: true };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/tables', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return await tables.createTable(auth.storeId, (request.body ?? {}) as tables.TableInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // The whole layout at once, after the owner lets go of a table. One
  // transaction, one round-trip — N PATCHes mid-drag is the anti-pattern the
  // design doc's speed budget is against (§6).
  fastify.patch('/tables/positions', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return { tables: await tables.moveTables(auth.storeId, readPositions(request.body)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/tables/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Стіл не знайдено' });
    try {
      return await tables.updateTable(auth.storeId, id, (request.body ?? {}) as tables.TableInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/tables/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Стіл не знайдено' });
    try {
      await tables.deleteTable(auth.storeId, id);
      return { ok: true };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
