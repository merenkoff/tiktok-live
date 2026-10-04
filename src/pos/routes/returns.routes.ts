// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import { isLocalDateString } from '../core/localDate.js';
import { readStoreClock } from '../core/storeClock.js';
import * as salesService from '../sales.service.js';

function optionalInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function registerReturnsRoutes(fastify: FastifyInstance): void {
  // The receipt search (clothing R3): `q` is whatever the cashier typed or
  // scanned, `from`/`to` are store-local days — the store's calendar, not the
  // server's — and `offset` is «Показати ще». The answer stays a plain array,
  // so a till built before the search still reads it.
  fastify.get('/sales', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'returns');
    if (!auth) return;
    const query = request.query as {
      limit?: string;
      offset?: string;
      q?: string;
      from?: string;
      to?: string;
    };
    const from = query.from?.trim() || undefined;
    const to = query.to?.trim() || undefined;
    if ((from && !isLocalDateString(from)) || (to && !isLocalDateString(to))) {
      return reply.code(400).send({ error: 'Дата — у форматі РРРР-ММ-ДД' });
    }
    const timezone = from || to ? (await readStoreClock(auth.storeId)).timezone : undefined;
    return salesService.listSales(auth.storeId, {
      limit: optionalInt(query.limit, 50),
      offset: optionalInt(query.offset, 0),
      q: typeof query.q === 'string' ? query.q : undefined,
      from,
      to,
      timezone,
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
