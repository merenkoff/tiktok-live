// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { logger } from '../logger.js';
import {
  POS_API_VERSION,
  POS_API_VERSION_HEADER,
  posApiVersionInfo,
} from './version.js';

/**
 * The `/api/pos` versioning seam. Registered once inside the `/api/pos`
 * prefix scope (see `pos.plugin.ts`), so it covers every POS route and
 * nothing on the LIVE API.
 *
 * Behaviour today (advisory):
 *  - every POS response carries `X-POS-API-Version: <n>`;
 *  - a request that declares a different `X-POS-API-Version` is logged as a
 *    skew but still served — nothing is pinned yet, the client is always
 *    assumed to be on the current version;
 *  - `POS_API_STRICT_VERSION=1` flips the skew to a `409` (dormant, off by
 *    default, no CI coverage of that path on purpose — it's the switch to
 *    throw once real version pinning lands).
 *
 * See `TechDocs/POS_API_VERSIONING.md`.
 */
export function registerPosVersioning(instance: FastifyInstance): void {
  const strict = process.env.POS_API_STRICT_VERSION === '1';

  instance.addHook('onRequest', async (request, reply) => {
    reply.header('X-POS-API-Version', String(POS_API_VERSION));

    const raw = request.headers[POS_API_VERSION_HEADER];
    if (raw == null) return;

    const got = Number(Array.isArray(raw) ? raw[0] : raw);
    if (Number.isFinite(got) && got === POS_API_VERSION) return;

    logger.warn('POS API version skew', {
      path: request.url.split('?')[0],
      got: Array.isArray(raw) ? raw[0] : raw,
      expected: POS_API_VERSION,
      strict,
    });

    if (strict) {
      return reply.code(409).send({
        error: 'pos_api_version_mismatch',
        expected: POS_API_VERSION,
        got: Number.isFinite(got) ? got : null,
      });
    }
  });

  // Public: no auth, no module gate — a module-remote loader can preflight this
  // before deciding whether its build is compatible with the live backend.
  instance.get('/version', async () => posApiVersionInfo());
}
