// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/site-static.test.ts
//
// The three @fastify/static mounts (public/, site/dist/assets, and the POS
// upload volume) had no test that actually pulled a byte through them —
// site-routes.test.ts covers routing and the 404 shape, not file serving. That
// gap surfaced while validating the @fastify/static 9 -> 10 major: nothing in
// the suite would have caught a regression in how files are served.
//
// Needs `site/dist` to exist, which `npm run build` in site/ produces and the
// backend CI job deliberately does not — hence the skip rather than a fixture.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../api.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assetsDir = path.join(repoRoot, 'site', 'dist', 'assets');
const builtAsset = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).find((f) => f.endsWith('.js'))
  : undefined;

describe.skipIf(!builtAsset)('site static mounts', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a built asset through the /assets/ mount', async () => {
    const res = await app.inject({ method: 'GET', url: `/assets/${builtAsset}` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('serves the prerendered index as HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('refuses to climb out of the static root', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/../../package.json' });
    expect(res.statusCode).not.toBe(200);
  });
});
