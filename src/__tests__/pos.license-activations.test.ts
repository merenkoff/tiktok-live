// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.license-activations.test.ts — author-side licence-activation
// ingest + read (migration 095, TechDocs/POS_LICENSING.md phase 2F), through the
// real `POST /api/license/activation` receiver and `GET /api/pos/super/licenses`.
//
// The receiver uses the committed TRUSTED_LICENSE_KEYS, so route-level pings can
// only carry an absent/garbage token (verified=false) — which is itself a case
// worth recording. Verified rows (with a real instance_limit) are seeded through
// `recordActivation` with an ephemeral key, the same seam the unit tests use.

import crypto from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { createServer } from '../api.js';
import { registerPosPlugin } from '../pos/pos.plugin.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { issueSuperToken, resetSuperRateLimiter } from '../pos/core/superAuth.js';
import { signLicenseToken } from '../pos/license/token.js';
import { recordActivation, remoteIpOf, resetActivationLimits } from '../pos/license/activations.service.js';

const PASSWORD = 'correct-horse-battery-staple-lic';

/** Ephemeral Ed25519 key for signing verified tokens in-process. */
function ephemeralKey(): { kid: string; keys: Record<string, string>; priv: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12);
  const rawB64 = Buffer.from(raw).toString('base64');
  const kid = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const priv = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64');
  return { kid, keys: { [kid]: rawB64 }, priv };
}

describe.skipIf(!hasDb)('licence activations (095)', () => {
  let app: FastifyInstance;
  const instanceIds: string[] = [];
  const uuid = () => {
    const id = crypto.randomUUID();
    instanceIds.push(id);
    return id;
  };
  const superToken = () => {
    const issued = issueSuperToken();
    if (!issued) throw new Error('super not configured');
    return issued.token;
  };

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = PASSWORD;
    await applyPosMigrations();
    // createServer() mounts the root receiver (/api/license/activation); the
    // super read routes live in the POS plugin, which index.ts mounts separately.
    app = await createServer();
    await registerPosPlugin(app);
  }, 60000);

  afterAll(async () => {
    if (instanceIds.length) {
      await pool.query(`DELETE FROM pos_license_activations WHERE instance_id = ANY($1::uuid[])`, [instanceIds]);
    }
    await app?.close();
    delete process.env.POS_SUPER_PASSWORD;
    await pool.end();
  });

  beforeEach(() => {
    resetActivationLimits();
    resetSuperRateLimiter();
  });

  const ping = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/license/activation', payload });

  const rowFor = async (instanceId: string) =>
    (await pool.query(`SELECT * FROM pos_license_activations WHERE instance_id = $1`, [instanceId])).rows;

  it('records a keyless ping as unverified, under the «без ключа» group', async () => {
    const id = uuid();
    const res = await ping({ instance_id: id, pos_api_version: 2, public_base_url: 'https://shop.example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const rows = await rowFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      license_fingerprint: '',
      verified: false,
      public_base_url: 'https://shop.example.com',
      pos_api_version: 2,
      seen_count: 1,
    });
  });

  it('rejects a malformed instance id with 400 and writes nothing', async () => {
    const res = await ping({ instance_id: 'not-a-uuid', public_base_url: 'https://x.example.com' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false });
  });

  it('is idempotent per (licence, instance, origin): a repeat only bumps seen_count', async () => {
    const id = uuid();
    await ping({ instance_id: id, public_base_url: 'https://repeat.example.com' });
    await ping({ instance_id: id, public_base_url: 'https://repeat.example.com' });
    const rows = await rowFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].seen_count).toBe(2);
  });

  it('counts distinct installs and flags over-limit for a verified licence', async () => {
    const key = ephemeralKey();
    const token = signLicenseToken({ kid: key.kid, licensee: 'Acme LLC', plan: 'pro', instance_limit: 1 }, key.priv);
    const a = uuid();
    const b = uuid();
    await recordActivation({ token, instance_id: a, public_base_url: 'https://a.example.com' }, { keys: key.keys });
    await recordActivation({ token, instance_id: b, public_base_url: 'https://b.example.com' }, { keys: key.keys });

    const fp = crypto.createHash('sha256').update(token).digest('hex');
    const token2 = superToken();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/super/licenses',
      headers: { 'x-pos-super-token': token2 },
    });
    expect(res.statusCode).toBe(200);
    const lic = (res.json() as Array<Record<string, unknown>>).find((l) => l.fingerprint === fp);
    expect(lic).toMatchObject({
      verified: true,
      licensee: 'Acme LLC',
      plan: 'pro',
      instance_limit: 1,
      installs: 2,
      over_limit: true,
      cloned: false,
    });
  });

  it('flags a clone: one instance id reported from two origins', async () => {
    const key = ephemeralKey();
    const token = signLicenseToken({ kid: key.kid, licensee: 'Beta LLC' }, key.priv);
    const id = uuid();
    await recordActivation({ token, instance_id: id, public_base_url: 'https://one.example.com' }, { keys: key.keys });
    await recordActivation({ token, instance_id: id, public_base_url: 'https://two.example.com' }, { keys: key.keys });

    const fp = crypto.createHash('sha256').update(token).digest('hex');
    const res = await app.inject({
      method: 'GET',
      url: `/api/pos/super/licenses/${fp}`,
      headers: { 'x-pos-super-token': superToken() },
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json() as { cloned: boolean; installs: number; instances: Array<{ instance_id: string; cloned: boolean; origins: unknown[] }> };
    expect(detail.cloned).toBe(true);
    expect(detail.installs).toBe(1);
    const inst = detail.instances.find((i) => i.instance_id === id)!;
    expect(inst.cloned).toBe(true);
    expect(inst.origins).toHaveLength(2);
  });

  it('refuses the super read without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/super/licenses' });
    expect(res.statusCode).toBe(401);
  });

  it('404s an unknown fingerprint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/super/licenses/0000000000000000000000000000000000000000000000000000000000000000',
      headers: { 'x-pos-super-token': superToken() },
    });
    expect(res.statusCode).toBe(404);
  });

  it('the super admin forgets a licence\u2019s pings: the keyless group by «none», 404 once gone', async () => {
    const id = uuid();
    expect((await ping({ instance_id: id })).statusCode).toBe(200);
    expect(await rowFor(id)).toHaveLength(1);

    const unauthenticated = await app.inject({ method: 'DELETE', url: '/api/pos/super/licenses/none' });
    expect(unauthenticated.statusCode).toBe(401);
    expect(await rowFor(id)).toHaveLength(1);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pos/super/licenses/none',
      headers: { 'x-pos-super-token': superToken() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBeGreaterThanOrEqual(1);
    expect(await rowFor(id)).toHaveLength(0);

    const again = await app.inject({
      method: 'DELETE',
      url: '/api/pos/super/licenses/none',
      headers: { 'x-pos-super-token': superToken() },
    });
    expect(again.statusCode).toBe(404);
    const read = await app.inject({
      method: 'GET',
      url: '/api/pos/super/licenses/none',
      headers: { 'x-pos-super-token': superToken() },
    });
    expect(read.statusCode).toBe(404);
  });

  it('deleting one licence leaves the others', async () => {
    const key = ephemeralKey();
    const token = signLicenseToken({ kid: key.kid, licensee: 'Keep', instance_limit: 5 }, key.priv);
    const keep = uuid();
    const gone = uuid();
    await recordActivation({ token, instance_id: keep, public_base_url: 'https://keep.example' }, { keys: key.keys });
    await recordActivation({ instance_id: gone, public_base_url: 'https://gone.example' });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pos/super/licenses/none',
      headers: { 'x-pos-super-token': superToken() },
    });
    expect(res.statusCode).toBe(200);
    expect(await rowFor(gone)).toHaveLength(0);
    expect(await rowFor(keep)).toHaveLength(1);
  });

  it('keeps the address a ping came from — the last X-Forwarded-For entry — and shows it for a copy that named no origin', async () => {
    const id = uuid();
    const res = await app.inject({
      method: 'POST',
      url: '/api/license/activation',
      headers: { 'x-forwarded-for': '10.0.0.1, 203.0.113.7' },
      payload: { instance_id: id },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await rowFor(id);
    expect(row.public_base_url).toBe('');
    expect(row.remote_ip).toBe('203.0.113.7');

    // The LAST ping's address wins: a copy that moved is found where it is now.
    const moved = await app.inject({
      method: 'POST',
      url: '/api/license/activation',
      headers: { 'x-forwarded-for': '198.51.100.4' },
      payload: { instance_id: id },
    });
    expect(moved.statusCode).toBe(200);
    expect((await rowFor(id))[0].remote_ip).toBe('198.51.100.4');

    const detail = await app.inject({
      method: 'GET',
      url: '/api/pos/super/licenses/none',
      headers: { 'x-pos-super-token': superToken() },
    });
    const inst = detail.json().instances.find((i: { instance_id: string }) => i.instance_id === id);
    expect(inst.origins[0]).toMatchObject({ url: '', ip: '198.51.100.4' });
  });

  it('remoteIpOf reads the last forwarded entry, else the socket address, and refuses junk', () => {
    expect(remoteIpOf({ ip: '127.0.0.1', headers: { 'x-forwarded-for': 'a, b , 203.0.113.9' } })).toBe('203.0.113.9');
    expect(remoteIpOf({ ip: '127.0.0.1', headers: { 'x-forwarded-for': ['203.0.113.1', '203.0.113.2'] } })).toBe('203.0.113.2');
    expect(remoteIpOf({ ip: '127.0.0.1', headers: {} })).toBe('127.0.0.1');
    expect(remoteIpOf({ ip: '127.0.0.1', headers: { 'x-forwarded-for': 'x'.repeat(80) } })).toBe('');
  });
});
