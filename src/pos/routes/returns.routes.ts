// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as salesService from '../sales.service.js';

export function registerReturnsRoutes(fastify: FastifyInstance): void {
  fastify.get('/sales', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'returns');
    if (!auth) return;
    const query = request.query as { limit?: string };
    return salesService.listSales(auth.storeId, {
      limit: query.limit ? Number(query.limit) : 50,
    });
  });

  fastify.get('/sales/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'returns');
    if (!auth) return;
    const { id } = request.params as { id: string };
    const sale = await salesService.getSale(auth.storeId, Number(id));
    if (!sale) return reply.code(404).send({ error: 'Sale not found' });
    return sale;
  });
}
