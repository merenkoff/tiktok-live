// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pre-orders: a bouquet ordered now for a day that has not happened yet.
// TechDocs/POS_FLORIST_BENCH.md §14 (phase B6), service in
// `src/pos/preorders.service.ts`.
//
// Core rather than a module, and staff level, for the same reason parked carts
// are: taking an order is part of selling, and the florist who quotes the
// bouquet is the one who writes it down.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as preorders from '../preorders.service.js';
import { errorMessage } from './_shared.js';

export function registerPreorderRoutes(fastify: FastifyInstance): void {
  fastify.get('/preorders', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const q = request.query as { status?: string; until?: string };
    try {
      const status = q.status as preorders.PreorderStatus | 'open' | undefined;
      return { preorders: await preorders.listPreorders(auth.storeId, { status, until: q.until }) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/preorders', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = request.body as {
      client_uuid?: string;
      due_at?: string;
      due_window_minutes?: number | null;
      fulfilment?: string;
      address?: string | null;
      customer_id?: number | null;
      recipient_name?: string | null;
      recipient_phone?: string | null;
      card_message?: string | null;
      note?: string | null;
      items?: Array<{
        variant_id?: number;
        quantity?: number;
        components?: Array<{ component_variant_id?: number; quantity?: number }>;
      }>;
    };
    try {
      const result = await preorders.createPreorder({
        storeId: auth.storeId,
        staffId: auth.staffId,
        clientUuid: String(body.client_uuid ?? ''),
        dueAt: String(body.due_at ?? ''),
        dueWindowMinutes: body.due_window_minutes ?? null,
        fulfilment: body.fulfilment === 'delivery' ? 'delivery' : 'pickup',
        address: body.address ?? null,
        customerId: body.customer_id ?? null,
        recipientName: body.recipient_name ?? null,
        recipientPhone: body.recipient_phone ?? null,
        cardMessage: body.card_message ?? null,
        note: body.note ?? null,
        items: (body.items ?? []).map((item) => ({
          variant_id: Number(item?.variant_id),
          quantity: Number(item?.quantity),
          components: item?.components?.length
            ? item.components.map((c) => ({
                component_variant_id: Number(c?.component_variant_id),
                quantity: Number(c?.quantity),
              }))
            : undefined,
        })),
      });
      return reply.code(result.created ? 201 : 200).send(result.preorder);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/preorders/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const preorder = await preorders.getPreorder(auth.storeId, Number(id));
    if (!preorder) return reply.code(404).send({ error: 'not_found' });
    return preorder;
  });

  // Built ahead of the due time and standing in the fridge. A state change and
  // nothing else: no stock moves, because the components left the shelf when
  // the florist assembled it through the ordinary bench path.
  fastify.post('/preorders/:id/assembled', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await preorders.markAssembled({
        storeId: auth.storeId,
        preorderId: Number(id),
        staffId: auth.staffId,
      });
    } catch (error) {
      return reply.code(409).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/preorders/:id/cancel', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    // Idempotent: an order already cancelled is the state the caller wanted.
    return preorders.cancelPreorder({
      storeId: auth.storeId,
      preorderId: Number(id),
      staffId: auth.staffId,
    });
  });
}
