// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.module-delivery.test.ts — licence-gated delivery of
// online-module bundles (TechDocs/POS_OPENCORE.md §8):
//   - the delivery token (issue against a licence, verify, the 30-day window,
//     `issued` scope for an authentic expired licence);
//   - the routes: token in the PATH, the closed store before jsdelivr, the
//     gate's refusals, the journal that keeps a given version given, CORS `*`
//     and `private` caching, path validation, `/pos-uploads` never serving the
//     store;
//   - the deployment's side: the token fetched from the author's server, kept
//     in the licence row, and put into the module URLs a till receives.

import crypto from 'crypto';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../api.js';
import { pool } from '../db.js';
import { signLicenseToken } from '../pos/license/token.js';
import {
  issueModuleToken,
  licenseFingerprint,
  moduleTokenSecret,
  parseModulePath,
  signModuleToken,
  verifyModuleToken,
} from '../pos/license/moduleDelivery.js';
import { setModuleDeliveryKeysForTests } from '../pos/license/moduleDelivery.routes.js';
import {
  currentModuleToken,
  moduleRemotesForTill,
  moduleTokenForUpdate,
  refreshModuleToken,
  resetModuleTokenCacheForTests,
  withModuleToken,
  withModuleTokens,
} from '../pos/license/moduleToken.js';
import { POS_UPLOADS_DIR } from '../pos/uploads.service.js';
import { auth, buildPosTestApp, createTestStore, dropTestStore, type TestStore } from './helpers/pos-fixtures.js';

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

const SECRET = Buffer.from('test-module-token-secret');
const DAY = 24 * 60 * 60 * 1000;

describe('delivery token (pure)', () => {
  const k = ephemeralKey();
  const licence = signLicenseToken({ kid: k.kid, licensee: 'Acme', expires_at: '2027-06-01T00:00:00Z' }, k.priv);

  it('a valid licence gets an `all` token that names it by fingerprint', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    const r = issueModuleToken(licence, SECRET, { keys: k.keys, now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grant.scope).toBe('all');
    expect(r.grant.token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyModuleToken(r.grant.token, SECRET, now)).toMatchObject({
      fp: licenseFingerprint(licence),
      scope: 'all',
    });
    // 30–60 days of life.
    const life = new Date(r.grant.expires_at).getTime() - now.getTime();
    expect(life).toBeGreaterThan(30 * DAY - 1);
    expect(life).toBeLessThanOrEqual(60 * DAY);
  });

  it('is the same token for a whole 30-day window, so a desktop re-downloads monthly', () => {
    const a = issueModuleToken(licence, SECRET, { keys: k.keys, now: new Date('2026-11-07T00:00:00Z') });
    const b = issueModuleToken(licence, SECRET, { keys: k.keys, now: new Date('2026-11-08T00:00:00Z') });
    const later = issueModuleToken(licence, SECRET, { keys: k.keys, now: new Date('2027-01-20T00:00:00Z') });
    expect(a.ok && b.ok && later.ok).toBe(true);
    if (!a.ok || !b.ok || !later.ok) return;
    // 2026-11-07 and -08 share a window unless a window edge falls between them.
    const window = 30 * DAY;
    const sameWindow =
      Math.floor(Date.parse('2026-11-07T00:00:00Z') / window) === Math.floor(Date.parse('2026-11-08T00:00:00Z') / window);
    expect(a.grant.token === b.grant.token).toBe(sameWindow);
    expect(later.grant.token).not.toBe(a.grant.token);
  });

  it('an authentic EXPIRED licence gets an `issued` token with the same fingerprint (§1.12)', () => {
    const r = issueModuleToken(licence, SECRET, { keys: k.keys, now: new Date('2027-07-01T00:00:00Z') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grant.scope).toBe('issued');
    expect(verifyModuleToken(r.grant.token, SECRET, new Date('2027-07-02T00:00:00Z'))).toMatchObject({
      fp: licenseFingerprint(licence),
      scope: 'issued',
    });
  });

  it('a forged, garbled, unknown-key or absent licence gets nothing', () => {
    const attacker = ephemeralKey();
    const forged = signLicenseToken({ kid: k.kid, licensee: 'Pirate' }, attacker.priv);
    expect(issueModuleToken(forged, SECRET, { keys: k.keys })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(issueModuleToken('garbage', SECRET, { keys: k.keys })).toMatchObject({ ok: false });
    expect(issueModuleToken(undefined, SECRET, { keys: k.keys })).toEqual({ ok: false, reason: 'absent' });
    const other = signLicenseToken({ kid: attacker.kid, licensee: 'X' }, attacker.priv);
    expect(issueModuleToken(other, SECRET, { keys: k.keys })).toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('verify refuses a tampered, foreign-secret, expired or junk token', () => {
    const now = new Date('2026-11-07T00:00:00Z');
    const good = signModuleToken({ fp: 'a'.repeat(32), scope: 'issued', exp: Math.floor(now.getTime() / 1000) + 3600 }, SECRET);
    expect(verifyModuleToken(good, SECRET, now)).toMatchObject({ scope: 'issued' });

    // Turning `issued` into `all` without the secret breaks the MAC.
    const [, payload, mac] = good.split('.');
    const bytes = Buffer.from(payload, 'base64url');
    bytes.writeUInt8(1, 16);
    expect(verifyModuleToken(`v1.${bytes.toString('base64url')}.${mac}`, SECRET, now)).toBeNull();
    expect(good.length).toBeLessThanOrEqual(100); // one path segment under Fastify's maxParamLength
    expect(verifyModuleToken(good, Buffer.from('other'), now)).toBeNull();
    expect(verifyModuleToken(good, SECRET, new Date(now.getTime() + 2 * 3600 * 1000))).toBeNull();
    expect(verifyModuleToken('v1.x.y', SECRET, now)).toBeNull();
    expect(verifyModuleToken(good, null, now)).toBeNull();
    expect(verifyModuleToken(undefined, SECRET, now)).toBeNull();
  });

  it('the signing secret: MODULE_TOKEN_SECRET, else derived from AUTH_SECRET, else none', () => {
    expect(moduleTokenSecret({ MODULE_TOKEN_SECRET: 's1', AUTH_SECRET: 'a' })?.toString()).toBe('s1');
    const derived = moduleTokenSecret({ AUTH_SECRET: 'a' });
    expect(derived).not.toBeNull();
    expect(derived?.toString()).not.toBe('a');
    expect(moduleTokenSecret({})).toBeNull();
  });
});

describe('module paths (pure)', () => {
  it('accepts a bundle file and refuses anything that could reach elsewhere', () => {
    expect(parseModulePath('tables', '2.8.0', 'remote-entry.js')).toEqual({
      id: 'tables',
      version: '2.8.0',
      file: 'remote-entry.js',
    });
    expect(parseModulePath('tables', '2.8.0', 'assets/page-abc.js')).not.toBeNull();
    for (const [id, ver, file] of [
      ['tables', '2.8.0', '../x.js'],
      ['tables', '2.8.0', 'a/../../x.js'],
      ['tables', '2.8.0', '.env'],
      ['tables', '2.8.0', 'a//b.js'],
      ['tables', 'latest', 'remote-entry.js'],
      ['BAD_ID', '2.8.0', 'remote-entry.js'],
      ['tables', '2.8.0', 'x?.js'],
    ]) {
      expect(parseModulePath(id, ver, file)).toBeNull();
    }
  });
});

describe('putting the token into a till’s module URLs (pure)', () => {
  const SERVER = 'https://the-live.shop';
  const T = 'v1.payload.mac0123456789abcdefghij';

  it('rewrites a bare module URL of the licence server, string or entry', () => {
    expect(withModuleToken('https://the-live.shop/api/modules/tables/2.8.0/remote-entry.js', T, SERVER)).toBe(
      `https://the-live.shop/api/modules/t/${T}/tables/2.8.0/remote-entry.js`
    );
    const out = withModuleTokens(
      {
        tables: 'https://the-live.shop/api/modules/tables/2.8.0/remote-entry.js',
        debts: {
          url: 'https://the-live.shop/api/modules/debts/2.8.0/remote-entry.js',
          title: 'Борги',
          routePath: '/debts',
          nav: [],
        },
      },
      T,
      SERVER
    );
    expect(out.tables).toBe(`https://the-live.shop/api/modules/t/${T}/tables/2.8.0/remote-entry.js`);
    expect(out.debts).toMatchObject({
      url: `https://the-live.shop/api/modules/t/${T}/debts/2.8.0/remote-entry.js`,
      title: 'Борги',
      routePath: '/debts',
    });
  });

  it('leaves everything else alone', () => {
    const jsd = 'https://cdn.jsdelivr.net/gh/merenkoff/tiktok-live@module-tables-v2.6.5/tables/remote-entry.js';
    expect(withModuleToken(jsd, T, SERVER)).toBe(jsd);
    const foreign = 'https://evil.example/api/modules/tables/2.8.0/remote-entry.js';
    expect(withModuleToken(foreign, T, SERVER)).toBe(foreign);
    const already = `https://the-live.shop/api/modules/t/${T}/tables/2.8.0/remote-entry.js`;
    expect(withModuleToken(already, 'v1.other.mac0123456789abcdefghij', SERVER)).toBe(already);
    expect(withModuleToken('http://localhost:5009/remote-entry.js', T, SERVER)).toBe('http://localhost:5009/remote-entry.js');
    expect(withModuleToken('not a url', T, SERVER)).toBe('not a url');
    const map = { tables: 'https://the-live.shop/api/modules/tables/2.8.0/remote-entry.js' };
    expect(withModuleTokens(map, null, SERVER)).toBe(map);
  });
});

describe('module delivery routes', () => {
  let app: FastifyInstance;
  let stub: http.Server;
  let stubPaths: string[] = [];
  let stubStatus = 200;
  let storeDir = '';
  const k = ephemeralKey();
  const BUNDLE = 'export default 1 // signed bundle';
  const env = { ...process.env };

  // Delivery tokens for this licence are minted directly (`tokenFor`): the
  // `issued` one stands for the same licence after it has expired.
  const licence = signLicenseToken({ kid: k.kid, licensee: 'Acme', expires_at: '2099-01-01T00:00:00Z' }, k.priv);
  const fp = licenseFingerprint(licence);

  beforeAll(async () => {
    process.env.MODULE_TOKEN_SECRET = SECRET.toString();
    storeDir = await mkdtemp(path.join(os.tmpdir(), 'module-bundles-'));
    process.env.MODULE_BUNDLES_DIR = storeDir;
    setModuleDeliveryKeysForTests({ keys: k.keys });
    stub = http.createServer((req, res) => {
      stubPaths.push(req.url ?? '');
      res.writeHead(stubStatus, { 'content-type': 'application/javascript' });
      res.end(stubStatus === 200 ? BUNDLE : 'nope');
    });
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r()));
    const addr = stub.address();
    if (addr && typeof addr === 'object') process.env.LICENSE_MODULE_UPSTREAM_BASE = `http://127.0.0.1:${addr.port}`;
    process.env.LICENSE_MODULE_GH = 'o/r';
    app = await createServer();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => stub.close(() => r()));
    setModuleDeliveryKeysForTests(null);
    await rm(storeDir, { recursive: true, force: true });
    await pool.query(`DELETE FROM pos_module_issues WHERE license_fp = $1`, [fp]);
    for (const key of [
      'MODULE_TOKEN_SECRET',
      'MODULE_BUNDLES_DIR',
      'LICENSE_MODULE_UPSTREAM_BASE',
      'LICENSE_MODULE_GH',
      'LICENSE_MODULE_GATE',
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });

  afterEach(() => {
    delete process.env.LICENSE_MODULE_GATE;
    stubPaths = [];
    stubStatus = 200;
  });

  function tokenFor(scope: 'all' | 'issued'): string {
    return signModuleToken({ fp, scope, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  }

  it('POST /api/modules/token exchanges a licence for a delivery token', async () => {
    const ok = await app.inject({ method: 'POST', url: '/api/modules/token', headers: { 'x-license-key': licence } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ scope: 'all' });
    expect(verifyModuleToken(ok.json().token, SECRET)).toMatchObject({ fp, scope: 'all' });

    const none = await app.inject({ method: 'POST', url: '/api/modules/token' });
    expect(none.statusCode).toBe(403);
    expect(none.json()).toEqual({ entitled: false, reason: 'absent' });

    const saved = process.env.MODULE_TOKEN_SECRET;
    const savedAuth = process.env.AUTH_SECRET;
    delete process.env.MODULE_TOKEN_SECRET;
    delete process.env.AUTH_SECRET;
    const off = await app.inject({ method: 'POST', url: '/api/modules/token', headers: { 'x-license-key': licence } });
    expect(off.statusCode).toBe(503);
    process.env.MODULE_TOKEN_SECRET = saved;
    if (savedAuth !== undefined) process.env.AUTH_SECRET = savedAuth;
  });

  it('gate OFF: anonymous is a transparent proxy of the public build, CORS * and private caching', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(BUNDLE);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(stubPaths).toEqual(['/o/r@module-tables-v2.8.0/tables/remote-entry.js']);
  });

  it('serves a version from the closed store without touching the public CDN', async () => {
    await mkdir(path.join(storeDir, 'debts', '2.9.0', 'assets'), { recursive: true });
    await writeFile(path.join(storeDir, 'debts', '2.9.0', 'assets', 'page-x.js'), 'export const page = 1');
    const res = await app.inject({
      method: 'GET',
      url: `/api/modules/t/${tokenFor('all')}/debts/2.9.0/assets/page-x.js`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('export const page = 1');
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(stubPaths).toEqual([]);
  });

  it('gate ON: no token or a bad token is 403; a token in good standing is served and journaled', async () => {
    process.env.LICENSE_MODULE_GATE = 'on';
    const anon = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(anon.statusCode).toBe(403);
    expect(anon.json()).toEqual({ entitled: false, reason: 'absent' });
    expect(anon.headers['access-control-allow-origin']).toBe('*');

    const bad = await app.inject({
      method: 'GET',
      url: '/api/modules/t/v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA/tables/2.8.0/remote-entry.js',
    });
    expect(bad.statusCode).toBe(403);
    expect(bad.json()).toEqual({ entitled: false, reason: 'bad_module_token' });
    expect(stubPaths).toEqual([]);

    const ok = await app.inject({ method: 'GET', url: `/api/modules/t/${tokenFor('all')}/tables/2.8.0/remote-entry.js` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe(BUNDLE);
    const row = await pool.query(
      `SELECT 1 FROM pos_module_issues WHERE license_fp = $1 AND module_id = 'tables' AND version = '2.8.0'`,
      [fp]
    );
    expect(row.rows).toHaveLength(1);
  });

  it('an expired licence keeps what it was given and gets nothing new (§1.12)', async () => {
    process.env.LICENSE_MODULE_GATE = 'on';
    // Given while valid (journaled by the previous test or here, gate on or off).
    await app.inject({ method: 'GET', url: `/api/modules/t/${tokenFor('all')}/tables/2.8.1/remote-entry.js` });

    const kept = await app.inject({ method: 'GET', url: `/api/modules/t/${tokenFor('issued')}/tables/2.8.1/remote-entry.js` });
    expect(kept.statusCode).toBe(200);
    expect(kept.body).toBe(BUNDLE);

    const fresh = await app.inject({ method: 'GET', url: `/api/modules/t/${tokenFor('issued')}/tables/2.9.9/remote-entry.js` });
    expect(fresh.statusCode).toBe(403);
    expect(fresh.json()).toEqual({ entitled: false, reason: 'not_issued' });
  });

  it('journals a licence in good standing even while the gate is off', async () => {
    await app.inject({ method: 'GET', url: `/api/modules/t/${tokenFor('all')}/vertical-cafe/2.8.0/remote-entry.js` });
    const row = await pool.query(
      `SELECT 1 FROM pos_module_issues WHERE license_fp = $1 AND module_id = 'vertical-cafe' AND version = '2.8.0'`,
      [fp]
    );
    expect(row.rows).toHaveLength(1);
  });

  it('refuses a path that could escape the bundle shape (400, nothing fetched)', async () => {
    for (const url of [
      '/api/modules/tables/2.8.0/..%2f..%2fetc/passwd',
      '/api/modules/tables/2.8.0/.secret.js',
      '/api/modules/tables/notsemver/remote-entry.js',
      '/api/modules/BAD_ID/2.8.0/remote-entry.js',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(400);
    }
    expect(stubPaths).toEqual([]);
  });

  it('a version the CDN does not have is a 404; an unreachable CDN a 502 — never a brick', async () => {
    stubStatus = 404;
    const missing = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(missing.statusCode).toBe(404);

    const saved = process.env.LICENSE_MODULE_UPSTREAM_BASE;
    process.env.LICENSE_MODULE_UPSTREAM_BASE = 'http://127.0.0.1:59996';
    const down = await app.inject({ method: 'GET', url: '/api/modules/tables/2.8.0/remote-entry.js' });
    expect(down.statusCode).toBe(502);
    process.env.LICENSE_MODULE_UPSTREAM_BASE = saved;
  });

  it('/pos-uploads never serves a dot directory (the closed store lives on the same volume)', async () => {
    const dir = path.join(POS_UPLOADS_DIR, '.module-bundles-test');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'remote-entry.js'), BUNDLE);
    try {
      const res = await app.inject({ method: 'GET', url: '/pos-uploads/.module-bundles-test/remote-entry.js' });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('signed bundle');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the deployment’s delivery token', () => {
  let stub: http.Server;
  let base = '';
  let answer: { status: number; body: unknown } = { status: 200, body: {} };
  const env = { LICENSE_KEY: process.env.LICENSE_KEY, LICENSE_SERVER_URL: process.env.LICENSE_SERVER_URL };
  let seenKey: string | undefined;

  beforeAll(async () => {
    stub = http.createServer((req, res) => {
      seenKey = req.headers['x-license-key'] as string | undefined;
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r()));
    const addr = stub.address();
    if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
    process.env.LICENSE_SERVER_URL = base;
  });

  afterAll(async () => {
    await new Promise<void>((r) => stub.close(() => r()));
    await pool.query(`UPDATE pos_license_state SET module_token = NULL, module_token_expires_at = NULL WHERE id = 1`);
    resetModuleTokenCacheForTests();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('without a licence key there is nothing to ask for', async () => {
    delete process.env.LICENSE_KEY;
    expect(await refreshModuleToken()).toBe('no_key');
  });

  it('keeps the author server’s token across a restart and puts it into the till’s URLs', async () => {
    process.env.LICENSE_KEY = 'licence-token-of-this-copy';
    const token = 'v1.payloadpayload.mac0123456789abcdefghijk';
    answer = { status: 200, body: { token, scope: 'all', expires_at: new Date(Date.now() + 40 * DAY).toISOString() } };
    expect(await refreshModuleToken()).toBe('refreshed');
    expect(seenKey).toBe('licence-token-of-this-copy');

    resetModuleTokenCacheForTests(); // a restart: the next read comes from the row
    expect(await currentModuleToken()).toBe(token);

    const remotes = await moduleRemotesForTill({
      tables: `${base}/api/modules/tables/2.8.0/remote-entry.js`,
      stocktake: 'https://cdn.jsdelivr.net/gh/merenkoff/tiktok-live@module-stocktake-v2.6.0/stocktake/remote-entry.js',
    });
    expect(remotes.tables).toBe(`${base}/api/modules/t/${token}/tables/2.8.0/remote-entry.js`);
    expect(remotes.stocktake).toContain('cdn.jsdelivr.net');
  });

  it('an unreachable author server keeps the token; a refusal clears it', async () => {
    process.env.LICENSE_KEY = 'licence-token-of-this-copy';
    answer = { status: 500, body: {} };
    expect(await refreshModuleToken()).toBe('unreachable');
    expect(await currentModuleToken()).not.toBeNull();

    answer = { status: 403, body: { entitled: false, reason: 'bad_signature' } };
    expect(await refreshModuleToken()).toBe('refused');
    resetModuleTokenCacheForTests();
    expect(await currentModuleToken()).toBeNull();
  });

  it('the update check waits for the refresh a missing token starts, and asks the author nothing when it holds one', async () => {
    process.env.LICENSE_KEY = 'licence-token-of-this-copy';
    const token = 'v1.updatetoken01.mac0123456789abcdefghijk';
    answer = { status: 200, body: { token, scope: 'all', expires_at: new Date(Date.now() + 40 * DAY).toISOString() } };
    await pool.query(`UPDATE pos_license_state SET module_token = NULL, module_token_expires_at = NULL WHERE id = 1`);
    resetModuleTokenCacheForTests();

    // Nothing held: unlike a login, the press of «Оновити» has to get an answer.
    expect(await moduleTokenForUpdate()).toBe(token);

    seenKey = undefined;
    expect(await moduleTokenForUpdate()).toBe(token);
    expect(seenKey).toBeUndefined(); // held and fresh: the author's server is not asked again
  });

  it('the update check says null — and does not hang — when this copy has no key to ask with', async () => {
    delete process.env.LICENSE_KEY;
    await pool.query(`UPDATE pos_license_state SET module_token = NULL, module_token_expires_at = NULL WHERE id = 1`);
    resetModuleTokenCacheForTests();
    expect(await moduleTokenForUpdate()).toBeNull();
  });
});

// 2D-B: the route a till calls at the moment of pressing «Оновити».
describe('GET /api/pos/license/update-token', () => {
  let app: FastifyInstance;
  let store: TestStore;
  const env = { LICENSE_KEY: process.env.LICENSE_KEY, LICENSE_SERVER_URL: process.env.LICENSE_SERVER_URL };
  const TOKEN = 'v1.routetoken001.mac0123456789abcdefghijk';

  beforeAll(async () => {
    app = await buildPosTestApp();
    store = await createTestStore('lic_upd');
    // A key that must never come back out of the route, and a server that is not there:
    // nothing here may reach the network.
    process.env.LICENSE_KEY = 'secret-licence-key-of-this-copy';
    process.env.LICENSE_SERVER_URL = 'http://127.0.0.1:59996';
  }, 60000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await app?.close();
    await pool.query(`UPDATE pos_license_state SET module_token = NULL, module_token_expires_at = NULL WHERE id = 1`);
    resetModuleTokenCacheForTests();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('is for staff only', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/license/update-token' });
    expect(res.statusCode).toBe(401);
  });

  it('hands a seller and an owner the delivery token the copy holds — never its licence key', async () => {
    await pool.query(
      `UPDATE pos_license_state SET module_token = $1, module_token_expires_at = $2 WHERE id = 1`,
      [TOKEN, new Date(Date.now() + 40 * DAY)]
    );
    resetModuleTokenCacheForTests();
    for (const token of [store.sellerToken, store.ownerToken]) {
      const res = await app.inject({ method: 'GET', url: '/api/pos/license/update-token', headers: auth(token) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ token: TOKEN });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).not.toContain('secret-licence-key');
    }
  });

  it('answers token: null, not an error, when the copy holds none', async () => {
    await pool.query(`UPDATE pos_license_state SET module_token = NULL, module_token_expires_at = NULL WHERE id = 1`);
    resetModuleTokenCacheForTests();
    const res = await app.inject({ method: 'GET', url: '/api/pos/license/update-token', headers: auth(store.sellerToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: null });
  });
});
