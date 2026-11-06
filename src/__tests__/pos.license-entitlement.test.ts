// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.license-entitlement.test.ts — the licence gate for the
// author's own services (TechDocs/POS_LICENSING.md phase 2D): the pure
// entitlement verdict, the `GET /api/license/entitlement` check, and the
// `GET /api/updates/latest.json` feed that proxies the upstream `latest.json`
// and, when the gate is on, refuses a request without a valid licence.
//
// The routes verify with the committed TRUSTED_LICENSE_KEYS, so a route-level
// request can only present an absent/garbage token (→ 403); the entitled=true
// path is covered purely with an ephemeral key.

import crypto from 'crypto';
import http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../api.js';
import { checkEntitlement } from '../pos/license/entitlement.js';
import { signLicenseToken } from '../pos/license/token.js';

function ephemeralKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12);
  const kid = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return {
    kid,
    keys: { [kid]: Buffer.from(raw).toString('base64') },
    priv: Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64'),
  };
}

describe('checkEntitlement (pure)', () => {
  it('entitles a valid token and surfaces its claim', () => {
    const k = ephemeralKey();
    const token = signLicenseToken({ kid: k.kid, licensee: 'Acme LLC', plan: 'pro', expires_at: '2099-01-01T00:00:00Z' }, k.priv);
    expect(checkEntitlement(token, { keys: k.keys })).toEqual({
      entitled: true,
      licensee: 'Acme LLC',
      plan: 'pro',
      expires_at: '2099-01-01T00:00:00Z',
      reason: null,
    });
  });

  it('refuses an absent, forged, or expired token with a reason', () => {
    const k = ephemeralKey();
    expect(checkEntitlement(undefined, { keys: k.keys })).toMatchObject({ entitled: false, reason: 'absent' });

    const attacker = ephemeralKey();
    const forged = signLicenseToken({ kid: k.kid, licensee: 'Pirate' }, attacker.priv);
    expect(checkEntitlement(forged, { keys: k.keys })).toMatchObject({ entitled: false, reason: 'bad_signature' });

    const expired = signLicenseToken({ kid: k.kid, licensee: 'X', expires_at: '2020-01-01T00:00:00Z' }, k.priv);
    expect(checkEntitlement(expired, { keys: k.keys })).toMatchObject({ entitled: false, reason: 'expired' });
  });
});

describe('licence gate routes', () => {
  let app: FastifyInstance;
  let upstream: http.Server;
  let upstreamUrl = '';
  const LATEST = JSON.stringify({ version: '9.9.9', notes: 'stub', platforms: {} });

  beforeAll(async () => {
    app = await createServer();
    upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(LATEST);
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const addr = upstream.address();
    if (addr && typeof addr === 'object') upstreamUrl = `http://127.0.0.1:${addr.port}/latest.json`;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => upstream.close(() => r()));
  });

  afterEach(() => {
    delete process.env.LICENSE_UPDATE_GATE;
    delete process.env.LICENSE_UPDATE_UPSTREAM;
  });

  it('entitlement: 403 without a token, 403 for a garbage token', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/license/entitlement' });
    expect(none.statusCode).toBe(403);
    expect(none.json()).toMatchObject({ entitled: false, reason: 'absent' });

    const bad = await app.inject({ method: 'GET', url: '/api/license/entitlement', headers: { 'x-license-key': 'not.atoken' } });
    expect(bad.statusCode).toBe(403);
    expect(bad.json()).toMatchObject({ entitled: false });
  });

  it('updates: gate OFF proxies the upstream body verbatim, even with no token', async () => {
    process.env.LICENSE_UPDATE_UPSTREAM = upstreamUrl;
    const res = await app.inject({ method: 'GET', url: '/api/updates/latest.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toBe(LATEST);
  });

  it('updates: gate ON refuses a request without a valid licence', async () => {
    process.env.LICENSE_UPDATE_GATE = 'on';
    process.env.LICENSE_UPDATE_UPSTREAM = upstreamUrl;
    const res = await app.inject({ method: 'GET', url: '/api/updates/latest.json' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ entitled: false });
  });

  it('updates: a 502 upstream never bricks (gate off, unreachable upstream)', async () => {
    process.env.LICENSE_UPDATE_UPSTREAM = 'http://127.0.0.1:59997/latest.json';
    const res = await app.inject({ method: 'GET', url: '/api/updates/latest.json' });
    expect(res.statusCode).toBe(502);
  });
});

describe('module delivery gate (POS_OPENCORE §8)', () => {
  let app: FastifyInstance;
  let stub: http.Server;
  let seenPath = '';
  const MOD = 'export default 1 // signed bundle';

  beforeAll(async () => {
    app = await createServer();
    stub = http.createServer((req, res) => {
      seenPath = req.url ?? '';
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(MOD);
    });
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r()));
    const addr = stub.address();
    if (addr && typeof addr === 'object') process.env.LICENSE_MODULE_UPSTREAM_BASE = `http://127.0.0.1:${addr.port}`;
    process.env.LICENSE_MODULE_GH = 'o/r';
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => stub.close(() => r()));
    delete process.env.LICENSE_MODULE_UPSTREAM_BASE;
    delete process.env.LICENSE_MODULE_GH;
  });

  afterEach(() => {
    delete process.env.LICENSE_MODULE_GATE;
  });

  it('gate OFF proxies the signed bundle verbatim and composes the jsdelivr path', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(MOD);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(seenPath).toBe('/o/r@module-tables-v2.8.0/tables/remote-entry.js');
  });

  it('gate ON refuses delivery without a valid licence', async () => {
    process.env.LICENSE_MODULE_GATE = 'on';
    const res = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ entitled: false });
  });

  it('rejects a path that could escape the module-bundle shape (400, no fetch)', async () => {
    for (const url of [
      '/api/modules/tables/2.8.0/..%2f..%2fetc/passwd',
      '/api/modules/tables/notsemver/remote-entry.js',
      '/api/modules/BAD_ID/2.8.0/remote-entry.js',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(400);
    }
  });

  it('a missing upstream bundle is a 502, never a brick', async () => {
    const saved = process.env.LICENSE_MODULE_UPSTREAM_BASE;
    process.env.LICENSE_MODULE_UPSTREAM_BASE = 'http://127.0.0.1:59996';
    const res = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(res.statusCode).toBe(502);
    process.env.LICENSE_MODULE_UPSTREAM_BASE = saved;
  });
});
