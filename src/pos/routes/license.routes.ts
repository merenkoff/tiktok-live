// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import { getLicenseStatusForOwner } from '../license/service.js';
import { moduleTokenForUpdate } from '../license/moduleToken.js';

/**
 * The deployment's licence routes (TechDocs/POS_LICENSING.md, phase 2).
 * Instance-global, not per store — a licence covers the install.
 */
export function registerLicenseRoutes(fastify: FastifyInstance): void {
  /**
   * Owner-only read of the licence status. Returns only the cached status and
   * the token's public claim (licensee/plan/expiry); never the token itself.
   * Read-only: the status is written by the boot/daily heartbeat, never by this
   * route.
   */
  fastify.get('/license/status', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return getLicenseStatusForOwner();
  });

  /**
   * The token the desktop cashier presents to the author's update feed
   * (2D-B). Any staff member — a seller presses «Оновити» as often as the
   * owner — and it is NOT the licence key: it is the delivery token this
   * deployment already holds and already hands every till inside its module
   * URLs, so the key itself still never leaves the server. `{ token: null }`
   * when the copy has none (no key, an unreachable author server, a licence the
   * author refused): the till then asks the feed without one, which is exactly
   * what it did before this route existed. Fetched at the moment of the press
   * rather than cached on the till, because it expires after 30–60 days and a
   * login can be older than that.
   */
  fastify.get('/license/update-token', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    reply.header('cache-control', 'no-store');
    return { token: await moduleTokenForUpdate() };
  });
}
