// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as analyticsService from '../analytics.service.js';

export function registerAnalyticsRoutes(fastify: FastifyInstance): void {
  fastify.get('/analytics/summary', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'analytics');
    if (!auth) return;

    const q = request.query as { from?: string; to?: string };
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (q.from && !DATE_RE.test(q.from)) {
      return reply.code(400).send({ error: 'from must be YYYY-MM-DD' });
    }
    if (q.to && !DATE_RE.test(q.to)) {
      return reply.code(400).send({ error: 'to must be YYYY-MM-DD' });
    }
    if (q.from && q.to) {
      if (q.from > q.to) return reply.code(400).send({ error: 'from must be <= to' });
      const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
      if (days > 366) return reply.code(400).send({ error: 'range too large (max 366 days)' });
    }

    const store = await analyticsService.getStore(auth.storeId);
    return analyticsService.getSalesSummary(auth.storeId, {
      from: q.from,
      to: q.to,
      timezone: store?.timezone,
    });
  });
}
