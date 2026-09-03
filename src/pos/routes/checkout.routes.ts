// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import type { PaymentMethod } from '../types.js';
import { ensurePosAuth } from '../core/auth.js';
import * as salesService from '../sales.service.js';
import { logger } from '../../logger.js';
import { errorMessage } from './_shared.js';

export function registerCheckoutRoutes(fastify: FastifyInstance): void {
  fastify.post('/sales/complete', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const body = request.body as {
        items: { variant_id: number; quantity: number }[];
        payments: { method: PaymentMethod; amount_cents: number; provider_ref?: string | null }[];
        note?: string;
        cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
        customer_id?: number | null;
        client_uuid?: string | null;
      };
      const headerKey = request.headers['idempotency-key'];
      const headerUuid =
        typeof headerKey === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          headerKey
        )
          ? headerKey
          : null;
      const clientUuid = body.client_uuid?.trim() || headerUuid;
      if (clientUuid) {
        const existing = await salesService.getSaleByClientUuid(auth.storeId, clientUuid);
        if (existing) return reply.code(200).send(existing);
      }
      const sale = await salesService.completeSale({
        storeId: auth.storeId,
        staffId: auth.staffId,
        items: body.items,
        payments: body.payments,
        note: body.note,
        cart_discount: body.cart_discount,
        customer_id: body.customer_id,
        client_uuid: clientUuid,
      });
      return reply.code(201).send(sale);
    } catch (error) {
      logger.error('Complete sale failed', { error: errorMessage(error) });
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/sales/:id/void', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await salesService.voidSale({
        storeId: auth.storeId,
        saleId: Number(id),
        staffId: auth.staffId,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/sales/:id/refunds', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      items: { sale_item_id: number; quantity: number }[];
      reason?: string;
      method?: 'cash' | 'card' | 'qr' | null;
      client_uuid?: string | null;
    };
    try {
      return await salesService.refundSale({
        storeId: auth.storeId,
        saleId: Number(id),
        staffId: auth.staffId,
        items: body.items,
        reason: body.reason,
        method: body.method ?? null,
        client_uuid: body.client_uuid ?? null,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Analytics & store ─────────────────────────────────
}
