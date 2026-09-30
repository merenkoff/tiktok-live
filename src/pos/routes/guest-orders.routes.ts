// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/guest-orders.routes.ts — the WAITER's side of a guest's
// request for dishes (TechDocs/POS_QR_MENU.md, phase Q6): what is waiting,
// accept, reject. The guest's side (create, look, cancel) is in
// `public-menu.routes.ts`, behind the store token and the table's key.
//
// Core, like `tables.routes.ts` and `kitchen.routes.ts`: the `tables` module
// that will show these requests opts in through `module_remotes`, so there is
// no `enabled_modules` entry to gate on. `ensurePosAuth` — a waiter is a
// seller, and «everyone sees every table» (POS_TABLES.md §4.7) covers what
// the guests of every table are asking for too.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as bills from '../bills.service.js';
import * as modifiers from '../modifiers.service.js';
import {
  GuestOrderConflict,
  GuestOrderError,
  GuestOrderLineProblem,
  GuestOrderNotFound,
  acceptGuestOrder,
  listWaitingGuestOrders,
  rejectGuestOrder,
} from '../guest-orders.service.js';

function idOf(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sendError(reply: FastifyReply, error: unknown): unknown {
  // One line cannot be accepted (ran out, taken off the menu): name it, so the
  // screen can offer «Прийняти без цієї».
  if (error instanceof GuestOrderLineProblem) {
    return reply.code(409).send({ error: error.message, item_id: error.itemId });
  }
  if (error instanceof GuestOrderNotFound || error instanceof bills.BillNotFound) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof GuestOrderConflict || error instanceof bills.BillConflict) {
    return reply.code(409).send({ error: error.message });
  }
  if (error instanceof GuestOrderError || error instanceof bills.BillError || error instanceof modifiers.ModifierError) {
    return reply.code(400).send({ error: error.message });
  }
  throw error;
}

export function registerGuestOrdersRoutes(fastify: FastifyInstance): void {
  // Everything waiting for a waiter, or one table's. Requests older than their
  // time-to-live are dropped here, as they are wherever they are read.
  fastify.get('/guest-orders', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const raw = (request.query as { table_id?: unknown }).table_id;
    const tableId = raw === undefined ? undefined : idOf(raw);
    if (raw !== undefined && tableId == null) return reply.code(400).send({ error: 'Некоректний стіл' });
    return { orders: await listWaitingGuestOrders(auth.storeId, tableId ?? undefined) };
  });

  // Accept: the lines go into the table's bill (opened if there is none) under
  // THIS waiter's name. A second tap on an accepted request answers with the
  // bill and `already: true` and does nothing again.
  fastify.post('/guest-orders/:id/accept', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Запит не знайдено' });
    const body = (request.body ?? {}) as { exclude_item_ids?: unknown; guests?: unknown };
    let exclude: number[] | undefined;
    if (body.exclude_item_ids !== undefined) {
      if (!Array.isArray(body.exclude_item_ids) || body.exclude_item_ids.some((v) => idOf(v) == null)) {
        return reply.code(400).send({ error: 'exclude_item_ids має бути списком id' });
      }
      exclude = (body.exclude_item_ids as unknown[]).map((v) => idOf(v) as number);
    }
    try {
      return await acceptGuestOrder({
        storeId: auth.storeId,
        staffId: auth.staffId,
        orderId: id,
        excludeItemIds: exclude,
        guests: body.guests,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/guest-orders/:id/reject', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Запит не знайдено' });
    try {
      return await rejectGuestOrder({
        storeId: auth.storeId,
        staffId: auth.staffId,
        orderId: id,
        reason: (request.body as { reason?: unknown } | undefined)?.reason,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
