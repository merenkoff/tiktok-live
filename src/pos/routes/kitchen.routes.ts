// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/kitchen.routes.ts — the kitchen board (café phase К3a).
//
// Core rather than a module, for the reason `registerLiveRoutes` gives: the
// `vertical-cafe` module that draws the board opts in through
// `pos_stores.module_remotes`, not `enabled_modules`, so `ensureModule` has
// nothing to check. The per-request gate is `ensurePosAuth` — the person at
// the espresso machine is a seller — plus a 409 for a store whose vertical
// has no kitchen, as `/analytics/flowers` answers a boutique.
//
// The two taps (`PATCH /sales/:id/prep`) answer in three shapes on purpose:
// 200 with the row for a tap that lands, or for a re-tap of the state the
// row is already in (a slow connection retried it); 409 in the kitchen's
// own words for a step skipped or reversed — two screens disagree, and the
// slower one must be told; 404 for an order this store never rang.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as kitchen from '../kitchen.service.js';
import { errorMessage } from './_shared.js';

export function registerKitchenRoutes(fastify: FastifyInstance): void {
  fastify.get('/kitchen/orders', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      return await kitchen.listOpenOrders(auth.storeId);
    } catch (error) {
      if (error instanceof kitchen.KitchenError) {
        return reply.code(409).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  // Staff level, like `/stock/counts` and the florist's bench, and for the
  // same reason: this is the barista's own call to make, at 07:00, with no
  // owner in sight. The day's stop-list is a menu fact, not money.
  fastify.post('/kitchen/stop-list/:productId', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { productId } = request.params as { productId: string };
    const body = (request.body ?? {}) as { stop_listed?: unknown };
    if (typeof body.stop_listed !== 'boolean') {
      return reply.code(400).send({ error: 'stop_listed має бути true або false' });
    }
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(404).send({ error: 'Товар не знайдено' });
    }
    try {
      return await kitchen.setStopListed({
        storeId: auth.storeId,
        productId: id,
        stopListed: body.stop_listed,
      });
    } catch (error) {
      if (error instanceof kitchen.KitchenNotFound) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      if (error instanceof kitchen.KitchenError) {
        return reply.code(409).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  fastify.patch('/sales/:id/prep', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { prep_status?: unknown };
    if (body.prep_status !== 'ready' && body.prep_status !== 'served') {
      return reply.code(400).send({ error: 'prep_status має бути ready або served' });
    }
    const saleId = Number(id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      return reply.code(404).send({ error: 'Замовлення не знайдено' });
    }
    try {
      return await kitchen.setPrepStatus({
        storeId: auth.storeId,
        saleId,
        status: body.prep_status,
      });
    } catch (error) {
      if (error instanceof kitchen.KitchenNotFound) {
        return reply.code(404).send({ error: errorMessage(error) });
      }
      if (error instanceof kitchen.KitchenError) {
        return reply.code(409).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });
}
