// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as productsService from '../products.service.js';

export function registerCatalogRoutes(fastify: FastifyInstance): void {
  fastify.get('/catalog', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const query = request.query as {
      q?: string;
      barcode?: string;
      tag_id?: string;
      all?: string;
      snapshot?: string;
    };
    return productsService.getCatalog(auth.storeId, {
      q: query.q,
      barcode: query.barcode,
      tag_id: query.tag_id ? Number(query.tag_id) : undefined,
      snapshot: query.all === '1' || query.snapshot === '1',
    });
  });

  // ── Stock ─────────────────────────────────────────────
}
