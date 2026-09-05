// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPosVersioning } from '../pos/pos.versioning.js';
import { POS_API_VERSION, posApiVersionInfo } from '../pos/version.js';

/** Bare instance with just the versioning seam, mounted like the real plugin. */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      registerPosVersioning(instance);
      instance.get('/ping', async () => ({ ok: true }));
    },
    { prefix: '/api/pos' }
  );
  await app.ready();
  return app;
}

describe('posApiVersionInfo', () => {
  it('reports the current integer version', () => {
    expect(posApiVersionInfo()).toEqual({ version: POS_API_VERSION });
    expect(Number.isInteger(POS_API_VERSION)).toBe(true);
  });
});

describe('POS API versioning hook (advisory)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.POS_API_STRICT_VERSION;
    await app?.close();
    app = undefined;
  });

  it('serves GET /api/pos/version without auth', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/pos/version' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: POS_API_VERSION });
  });

  it('stamps X-POS-API-Version on every response', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/pos/ping' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-pos-api-version']).toBe(String(POS_API_VERSION));
  });

  it('serves a request that declares a mismatched version (advisory, not strict)', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/ping',
      headers: { 'x-pos-api-version': String(POS_API_VERSION + 1) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-pos-api-version']).toBe(String(POS_API_VERSION));
  });

  it('rejects a mismatched version with 409 when POS_API_STRICT_VERSION=1', async () => {
    process.env.POS_API_STRICT_VERSION = '1';
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/ping',
      headers: { 'x-pos-api-version': String(POS_API_VERSION + 1) },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'pos_api_version_mismatch',
      expected: POS_API_VERSION,
      got: POS_API_VERSION + 1,
    });
  });

  it('allows a matching version under strict mode', async () => {
    process.env.POS_API_STRICT_VERSION = '1';
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/ping',
      headers: { 'x-pos-api-version': String(POS_API_VERSION) },
    });
    expect(res.statusCode).toBe(200);
  });
});
