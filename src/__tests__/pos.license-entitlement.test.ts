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
import { signModuleToken } from '../pos/license/moduleDelivery.js';
import { signLicenseToken } from '../pos/license/token.js';
import { checkUpdateEntitlement } from '../pos/license/updateGate.js';

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

// 2D-B: the desktop cashier presents the DELIVERY token its deployment already
// holds, not the licence key (which never reaches a till — 2D-C, rule 2).
describe('checkUpdateEntitlement (pure)', () => {
  const secret = Buffer.from('update-gate-test-secret');
  const fp = 'ab'.repeat(16);
  const inAnHour = Math.floor(Date.now() / 1000) + 3600;
  const delivery = (scope: 'all' | 'issued', exp = inAnHour, key = secret) =>
    signModuleToken({ fp, scope, exp }, key);

  it('opens for a delivery token of scope all', () => {
    expect(checkUpdateEntitlement({ deliveryToken: delivery('all') }, { secret })).toEqual({ ok: true, via: 'delivery' });
  });

  it('opens for a valid licence token, as it did before the desktop sent anything', () => {
    const k = ephemeralKey();
    const licence = signLicenseToken({ kid: k.kid, licensee: 'Acme LLC' }, k.priv);
    expect(checkUpdateEntitlement({ licenseToken: licence }, { secret, verify: { keys: k.keys } })).toEqual({
      ok: true,
      via: 'licence',
    });
  });

  it('refuses a delivery token of scope issued: a new desktop version was never handed to an expired licence', () => {
    expect(checkUpdateEntitlement({ deliveryToken: delivery('issued') }, { secret })).toEqual({
      ok: false,
      reason: 'delivery_token_issued_only',
    });
  });

  it('refuses an expired, forged or garbled delivery token', () => {
    expect(checkUpdateEntitlement({ deliveryToken: delivery('all', Math.floor(Date.now() / 1000) - 10) }, { secret })).toEqual({
      ok: false,
      reason: 'bad_delivery_token',
    });
    expect(
      checkUpdateEntitlement({ deliveryToken: delivery('all', inAnHour, Buffer.from('another-secret')) }, { secret })
    ).toEqual({ ok: false, reason: 'bad_delivery_token' });
    expect(checkUpdateEntitlement({ deliveryToken: 'not-a-token' }, { secret })).toEqual({
      ok: false,
      reason: 'bad_delivery_token',
    });
  });

  it('refuses everything when this server has no secret to verify with, and when nothing is presented', () => {
    expect(checkUpdateEntitlement({ deliveryToken: delivery('all') }, { secret: null })).toMatchObject({ ok: false });
    expect(checkUpdateEntitlement({}, { secret })).toEqual({ ok: false, reason: 'absent' });
    expect(checkUpdateEntitlement({ licenseToken: '  ', deliveryToken: '' }, { secret })).toEqual({ ok: false, reason: 'absent' });
  });

  it('a bad licence token does not shadow a good delivery token, and says why when neither works', () => {
    expect(checkUpdateEntitlement({ licenseToken: 'junk', deliveryToken: delivery('all') }, { secret })).toEqual({
      ok: true,
      via: 'delivery',
    });
    const both = checkUpdateEntitlement({ licenseToken: 'junk', deliveryToken: 'junk' }, { secret });
    expect(both.ok).toBe(false);
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

  it('updates: gate ON serves a desktop that presents its deployment’s delivery token, verbatim', async () => {
    const savedSecret = process.env.MODULE_TOKEN_SECRET;
    process.env.MODULE_TOKEN_SECRET = 'route-level-secret';
    try {
      process.env.LICENSE_UPDATE_GATE = 'on';
      process.env.LICENSE_UPDATE_UPSTREAM = upstreamUrl;
      const secret = Buffer.from('route-level-secret');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const fp = 'cd'.repeat(16);

      const ok = await app.inject({
        method: 'GET',
        url: '/api/updates/latest.json',
        headers: { 'x-delivery-token': signModuleToken({ fp, scope: 'all', exp }, secret) },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.body).toBe(LATEST);

      const issued = await app.inject({
        method: 'GET',
        url: '/api/updates/latest.json',
        headers: { 'x-delivery-token': signModuleToken({ fp, scope: 'issued', exp }, secret) },
      });
      expect(issued.statusCode).toBe(403);
      expect(issued.json()).toEqual({ entitled: false, reason: 'delivery_token_issued_only' });

      const forged = await app.inject({
        method: 'GET',
        url: '/api/updates/latest.json',
        headers: { 'x-delivery-token': signModuleToken({ fp, scope: 'all', exp }, Buffer.from('not-our-secret')) },
      });
      expect(forged.statusCode).toBe(403);
      expect(forged.json()).toEqual({ entitled: false, reason: 'bad_delivery_token' });

      // A delivery token in the query string is not read: URLs end up in logs.
      const viaQuery = await app.inject({
        method: 'GET',
        url: `/api/updates/latest.json?key=${signModuleToken({ fp, scope: 'all', exp }, secret)}`,
      });
      expect(viaQuery.statusCode).toBe(403);
    } finally {
      if (savedSecret === undefined) delete process.env.MODULE_TOKEN_SECRET;
      else process.env.MODULE_TOKEN_SECRET = savedSecret;
    }
  });

  it('updates: a 502 upstream never bricks (gate off, unreachable upstream)', async () => {
    process.env.LICENSE_UPDATE_UPSTREAM = 'http://127.0.0.1:59997/latest.json';
    const res = await app.inject({ method: 'GET', url: '/api/updates/latest.json' });
    expect(res.statusCode).toBe(502);
  });
});
