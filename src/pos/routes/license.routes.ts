// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensurePosOwner } from '../core/auth.js';
import { getLicenseStatusForOwner } from '../license/service.js';

/**
 * Owner-only read of the deployment's licence status
 * (TechDocs/POS_LICENSING.md, phase 2). Instance-global, not per store — a
 * licence covers the install — so any store owner may read it. Returns only
 * the cached status and the token's public claim (licensee/plan/expiry); never
 * the token itself. Read-only: the status is written by the boot/daily
 * heartbeat, never by this route.
 */
export function registerLicenseRoutes(fastify: FastifyInstance): void {
  fastify.get('/license/status', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return getLicenseStatusForOwner();
  });
}
