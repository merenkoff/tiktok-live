// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule, ensurePosAuth } from '../core/auth.js';
import * as customersService from '../customers.service.js';
import { errorMessage, isUniqueViolation } from './_shared.js';

const PHONE_TAKEN = 'Another customer already uses this phone';

export function registerCustomersRoutes(fastify: FastifyInstance): void {
  fastify.get('/customers', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const query = request.query as { q?: string; all?: string; snapshot?: string };
    return customersService.listCustomers(
      auth.storeId,
      query.q,
      query.all === '1' || query.snapshot === '1'
    );
  });

  fastify.get('/customers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'customers');
    if (!auth) return;
    const { id } = request.params as { id: string };
    const customer = await customersService.getCustomer(auth.storeId, Number(id));
    if (!customer) return reply.code(404).send({ error: 'Customer not found' });
    return customer;
  });

  fastify.post('/customers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'customers');
    if (!auth) return;
    try {
      const body = request.body as {
        name?: string;
        phone?: string;
        email?: string | null;
        children_birthdays?: customersService.CustomerChild[];
        client_uuid?: string | null;
      };
      if (!body.name || !body.phone) {
        return reply.code(400).send({ error: 'name and phone required' });
      }
      const customer = await customersService.createCustomer(auth.storeId, {
        name: body.name,
        phone: body.phone,
        email: body.email,
        children_birthdays: body.children_birthdays,
        client_uuid: body.client_uuid,
      });
      return reply.code(201).send(customer);
    } catch (error) {
      // A duplicate phone does not reach here: createCustomer swallows the
      // 23505 and merges into the existing row, which is what lets the offline
      // cashier replay a queued write. The 409 is left for the race that can
      // still escape it — two tills inserting the same client_uuid at once.
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: PHONE_TAKEN });
      }
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/customers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'customers');
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await customersService.updateCustomer(
        auth.storeId,
        Number(id),
        request.body as {
          name?: string;
          phone?: string;
          email?: string | null;
          children_birthdays?: customersService.CustomerChild[];
          client_uuid?: string | null;
        }
      );
    } catch (error) {
      // Moving a customer onto a phone another one already holds trips
      // idx_pos_customers_store_phone. Report it as a conflict rather than
      // forwarding the raw constraint name to the cashier's screen.
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: PHONE_TAKEN });
      }
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/customers/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'customers');
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await customersService.deleteCustomer(auth.storeId, Number(id));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Catalog (cashier) ─────────────────────────────────
}
