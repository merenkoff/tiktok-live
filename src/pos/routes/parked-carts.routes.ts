// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Parked carts: put a cart aside at one till, ring it up at another.
// TechDocs/POS_FLORIST_BENCH.md §9 (phase B4), service in
// `src/pos/parked-carts.service.ts`.
//
// Core rather than a module, and gated by `ensurePosAuth` alone: parking is
// part of selling, and there is no store that can ring a cart but should not
// be able to put one down. Staff level for the same reason — the florist who
// assembled the bouquet is the one who parks it.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as parkedCarts from '../parked-carts.service.js';
import { errorMessage } from './_shared.js';
import type { CartDiscountInput } from '../types.js';

export function registerParkedCartRoutes(fastify: FastifyInstance): void {
  fastify.get('/parked-carts', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return { carts: await parkedCarts.listOpenCarts(auth.storeId) };
  });

  fastify.post('/parked-carts', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = request.body as {
      client_uuid?: string;
      label?: string;
      note?: string | null;
      customer_id?: number | null;
      cart_discount?: CartDiscountInput | null;
      items?: Array<{
        variant_id?: number;
        quantity?: number;
        components?: Array<{ component_variant_id?: number; quantity?: number }>;
        modifiers?: number[];
        note?: string;
      }>;
    };
    try {
      const result = await parkedCarts.parkCart({
        storeId: auth.storeId,
        staffId: auth.staffId,
        clientUuid: String(body.client_uuid ?? ''),
        label: String(body.label ?? ''),
        note: body.note ?? null,
        customerId: body.customer_id ?? null,
        cartDiscount: body.cart_discount ?? null,
        items: (body.items ?? []).map((item) => ({
          variant_id: Number(item?.variant_id),
          quantity: Number(item?.quantity),
          components: item?.components?.length
            ? item.components.map((c) => ({
                component_variant_id: Number(c?.component_variant_id),
                quantity: Number(c?.quantity),
              }))
            : undefined,
          // Used to be dropped here — the service's refusal never saw them
          // and a modified line went quiet (К3f, migration 051).
          modifiers: Array.isArray(item?.modifiers) ? item.modifiers.map(Number) : undefined,
          note: typeof item?.note === 'string' ? item.note : undefined,
        })),
      });
      return reply.code(result.created ? 201 : 200).send(result.cart);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/parked-carts/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const cart = await parkedCarts.getCart(auth.storeId, Number(id));
    if (!cart) return reply.code(404).send({ error: 'not_found' });
    return cart;
  });

  // Hand the cart back to a till and stop holding its stems. A 409 rather than
  // a 400 because it is a race, not a bad request: another till got there
  // first, or the cart lapsed while this one was looking at the list.
  fastify.post('/parked-carts/:id/pick-up', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await parkedCarts.pickUp({
        storeId: auth.storeId,
        staffId: auth.staffId,
        cartId: Number(id),
      });
    } catch (error) {
      return reply.code(409).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/parked-carts/:id/release', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const result = await parkedCarts.releaseCart({
      storeId: auth.storeId,
      staffId: auth.staffId,
      cartId: Number(id),
    });
    // Idempotent on purpose: a cart already put back is the state the caller
    // wanted, and a second tap on a slow connection is not an error.
    return result;
  });
}
