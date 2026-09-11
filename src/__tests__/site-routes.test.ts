// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/site-routes.test.ts
//
// The marketing site's not-found behaviour: unknown site paths get an HTML 404
// (the prerendered page when site/dist exists, an inline fallback otherwise),
// while anything under /api keeps Fastify's JSON 404 so clients can still
// branch on `statusCode`. No database involved.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../api.js';

describe('site routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers unknown site paths with an HTML 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('Сторінку не знайдено');
  });

  it('keeps the JSON 404 shape under /api', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toMatchObject({ error: 'Not Found', statusCode: 404 });
  });

  it('keeps the JSON 404 for non-GET methods', async () => {
    const res = await app.inject({ method: 'POST', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found', statusCode: 404 });
  });

  it('rejects dovidka slugs that are not plain kebab-case', async () => {
    const res = await app.inject({ method: 'GET', url: '/dovidka/..%2Fsecret' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
