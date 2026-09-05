// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { logger } from '../../logger.js';

/**
 * Dormant sink for the POS client's module/version telemetry (roadmap #6).
 *
 * The client only posts here when a build/localStorage flag is set
 * (`pos/src/modules/telemetryBeacon.ts`) — symmetrical to
 * `POS_API_STRICT_VERSION`. No auth (the boot `session_manifest` fires on the
 * login screen, before any JWT), no module gate, no DB: it just structured-logs
 * so a version skew between the host and a runtime-loaded module-remote is
 * greppable in the API logs. Best-effort — always answers `204`.
 */
export function registerTelemetryRoutes(fastify: FastifyInstance): void {
  fastify.post(
    '/client-telemetry',
    // Small, unauthenticated body — cap it hard.
    { bodyLimit: 16 * 1024 },
    async (request, reply) => {
      const body = (request.body ?? {}) as {
        sessionId?: unknown;
        appVersion?: unknown;
        event?: { type?: unknown };
      };

      logger.info('POS client telemetry', {
        ip: request.ip,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
        appVersion: typeof body.appVersion === 'string' ? body.appVersion : undefined,
        event: body.event,
      });

      return reply.code(204).send();
    }
  );
}
