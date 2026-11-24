// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/serving.routes.ts — «Роздача» (TechDocs/POS_PASS.md).
//
// The waiter's screen of what the kitchen's rounds still have to carry, and
// the taps «Несу» / «Повернути». A core group like the tables' own: the `pass`
// module opts in through `module_remotes`, so there is nothing for
// `ensureModule` to check; the gate is a staff session (the marketer is
// refused by default) and the owner may close the section per seller.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as serving from '../serving.service.js';
import { errorMessage } from './_shared.js';

function sendServingError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof serving.ServingNotFound) {
    return reply.code(404).send({ error: errorMessage(error) });
  }
  if (error instanceof serving.ServingConflict) {
    return reply.code(409).send({ error: errorMessage(error), code: error.code, ...error.detail });
  }
  if (error instanceof serving.ServingError) {
    return reply.code(400).send({ error: errorMessage(error) });
  }
  throw error;
}

export function registerServingRoutes(fastify: FastifyInstance): void {
  fastify.get('/serving', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return serving.listServingFeed(auth.storeId);
  });

  fastify.get('/serving/bills/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const billId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(billId) || billId <= 0) {
      return reply.code(404).send({ error: 'Рахунок не знайдено' });
    }
    try {
      return await serving.getServingBill({
        storeId: auth.storeId,
        staffId: auth.staffId,
        role: auth.role,
        billId,
      });
    } catch (error) {
      return sendServingError(reply, error);
    }
  });

  fastify.post('/serving/serve', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { client_uuid?: unknown; items?: unknown };
    try {
      return await serving.serveItems({
        storeId: auth.storeId,
        staffId: auth.staffId,
        clientUuid: body.client_uuid,
        items: body.items,
      });
    } catch (error) {
      return sendServingError(reply, error);
    }
  });

  fastify.post('/serving/undo', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { event_ids?: unknown };
    try {
      return await serving.undoServes({
        storeId: auth.storeId,
        staffId: auth.staffId,
        role: auth.role,
        eventIds: body.event_ids,
      });
    } catch (error) {
      return sendServingError(reply, error);
    }
  });
}
