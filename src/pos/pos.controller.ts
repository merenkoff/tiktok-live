// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/pos.controller.ts
// Thin aggregator: the route surface lives in ./routes/*.routes.ts and is
// listed in ./pos.routes.ts. Every group is always registered; per-request
// module gating is done inside each handler via `ensureModule`.

import type { FastifyInstance } from 'fastify';
import { POS_ROUTE_GROUPS } from './pos.routes.js';

export async function registerPosRoutes(fastify: FastifyInstance): Promise<void> {
  for (const group of POS_ROUTE_GROUPS) {
    await group.register(fastify);
  }
}
