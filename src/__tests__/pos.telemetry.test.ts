// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerTelemetryRoutes } from '../pos/routes/telemetry.routes.js';

/** Bare instance with just the client-telemetry sink, mounted like the real plugin. */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      registerTelemetryRoutes(instance);
    },
    { prefix: '/api/pos' }
  );
  await app.ready();
  return app;
}

describe('POS client-telemetry sink', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('accepts a well-formed beacon without auth', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/client-telemetry',
      payload: {
        sessionId: 's-1',
        appVersion: '1.0.4',
        event: { type: 'session_manifest', modules: [] },
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it('accepts an empty body', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/pos/client-telemetry' });
    expect(res.statusCode).toBe(204);
  });

  it('rejects an oversized body without a 500', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/client-telemetry',
      payload: { blob: 'x'.repeat(64 * 1024) },
    });
    expect(res.statusCode).toBe(413);
  });
});
