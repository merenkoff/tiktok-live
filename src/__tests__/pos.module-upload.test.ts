// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.module-upload.test.ts — the Module Release workflow's way
// into the closed bundle store (TechDocs/POS_OPENCORE.md §8.1, O-3): only with
// the upload secret, only a manifest signed by a trusted module key that names
// this module and version, only exactly the files it lists with their sha384,
// immutable once published — and then the delivery route serves it from the
// store, never from the public CDN.

import crypto from 'crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../api.js';
import { TRUSTED_MODULE_KEYS } from '../pos/license/moduleKeys.js';
import { manifestSignedBy } from '../pos/license/moduleUpload.js';
import { setModuleUploadKeysForTests } from '../pos/license/moduleDelivery.routes.js';

const SECRET = 'x'.repeat(40);

function ephemeralKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32);
  const keyId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return { keyId, keys: { [keyId]: raw.toString('base64') }, privateKey };
}

const sri = (buf: Buffer) => `sha384-${crypto.createHash('sha384').update(buf).digest('base64')}`;

/** A build as `sign-remote.mjs` leaves it: the `.js`/`.css`, `manifest.json`, `manifest.json.sig`. */
function build(
  key: ReturnType<typeof ephemeralKey>,
  { id = 'tables', version = '2.9.0', entry = 'export default 1' } = {}
): Record<string, Buffer> {
  const files: Record<string, Buffer> = {
    'remote-entry.js': Buffer.from(entry),
    'BillPage-abc.js': Buffer.from('export const page = 1'),
    'style.css': Buffer.from('.x{color:red}'),
  };
  const manifest = JSON.stringify(
    {
      schema: 1,
      moduleId: id,
      version,
      minHostPlatform: 23,
      entry: 'remote-entry.js',
      keyId: key.keyId,
      builtAt: '2026-11-07T00:00:00.000Z',
      files: Object.fromEntries(Object.keys(files).sort().map((n) => [n, sri(files[n])])),
    },
    null,
    2
  );
  const sig = crypto.sign(null, Buffer.from(manifest), key.privateKey).toString('base64');
  return { ...files, 'manifest.json': Buffer.from(manifest), 'manifest.json.sig': Buffer.from(`${sig}\n`) };
}

describe('trusted module key', () => {
  it('is the same PROD key every host trusts (pos/src/modules/remoteSigningKeys.ts)', () => {
    const client = readFileSync(path.join(process.cwd(), 'pos/src/modules/remoteSigningKeys.ts'), 'utf8');
    const block = /PROD_REMOTE_KEYS[^=]*=\s*\{([^}]*)\}/.exec(client)?.[1] ?? '';
    const entries = Object.fromEntries(
      [...block.matchAll(/'([0-9a-f]{16})':\s*'([A-Za-z0-9+/=]+)'/g)].map((m) => [m[1], m[2]])
    );
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    expect(TRUSTED_MODULE_KEYS).toEqual(entries);
  });

  it('a signature verifies only under its own key', () => {
    const k = ephemeralKey();
    const files = build(k);
    const sig = files['manifest.json.sig'].toString();
    expect(manifestSignedBy(files['manifest.json'], sig, k.keyId, k.keys)).toBe(true);
    expect(manifestSignedBy(files['manifest.json'], sig, k.keyId)).toBe(false); // not the PROD key
    const other = ephemeralKey();
    expect(manifestSignedBy(files['manifest.json'], sig, other.keyId, other.keys)).toBe(false);
  });
});

describe('module upload routes', () => {
  let app: FastifyInstance;
  let storeDir = '';
  const key = ephemeralKey();
  const env = { ...process.env };

  beforeAll(async () => {
    storeDir = await mkdtemp(path.join(os.tmpdir(), 'module-store-'));
    process.env.MODULE_BUNDLES_DIR = storeDir;
    process.env.MODULE_UPLOAD_SECRET = SECRET;
    // Nothing may come from the public CDN in these tests.
    process.env.LICENSE_MODULE_UPSTREAM_BASE = 'http://127.0.0.1:59995';
    setModuleUploadKeysForTests(key.keys);
    app = await createServer();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    setModuleUploadKeysForTests(null);
    await rm(storeDir, { recursive: true, force: true });
    for (const k of ['MODULE_BUNDLES_DIR', 'MODULE_UPLOAD_SECRET', 'LICENSE_MODULE_UPSTREAM_BASE']) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
  });

  afterEach(() => {
    process.env.MODULE_UPLOAD_SECRET = SECRET;
  });

  const auth = { authorization: `Bearer ${SECRET}` };

  async function upload(id: string, version: string, files: Record<string, Buffer>) {
    await app.inject({ method: 'DELETE', url: `/api/modules/upload/${id}/${version}`, headers: auth });
    for (const [name, body] of Object.entries(files)) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/modules/upload/${id}/${version}/${name}`,
        headers: { ...auth, 'content-type': 'application/octet-stream' },
        payload: body,
      });
      expect(res.statusCode, `${name}: ${res.body}`).toBe(200);
    }
    return app.inject({ method: 'POST', url: `/api/modules/upload/${id}/${version}/commit`, headers: auth });
  }

  it('without the secret upload is off; a wrong one is 401', async () => {
    delete process.env.MODULE_UPLOAD_SECRET;
    const off = await app.inject({ method: 'POST', url: '/api/modules/upload/tables/2.9.0/commit', headers: auth });
    expect(off.statusCode).toBe(503);

    process.env.MODULE_UPLOAD_SECRET = 'short';
    const weak = await app.inject({ method: 'POST', url: '/api/modules/upload/tables/2.9.0/commit', headers: auth });
    expect(weak.statusCode).toBe(503);

    process.env.MODULE_UPLOAD_SECRET = SECRET;
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/modules/upload/tables/2.9.0/commit',
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(401);
    const none = await app.inject({ method: 'POST', url: '/api/modules/upload/tables/2.9.0/commit' });
    expect(none.statusCode).toBe(401);
  });

  it('a signed build is published, then served from the store — not from the CDN', async () => {
    const files = build(key);
    const res = await upload('tables', '2.9.0', files);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'published', files: 3, entry: '/api/modules/tables/2.9.0/remote-entry.js' });
    expect(existsSync(path.join(storeDir, '.staging', 'tables', '2.9.0'))).toBe(false);

    for (const name of ['remote-entry.js', 'BillPage-abc.js', 'style.css', 'manifest.json', 'manifest.json.sig']) {
      const got = await app.inject({ method: 'GET', url: `/api/modules/tables/2.9.0/${name}` });
      expect(got.statusCode, name).toBe(200);
      expect(got.rawPayload.equals(files[name])).toBe(true);
    }
  });

  it('a version is immutable: an identical re-run is a no-op, different content a 409', async () => {
    const files = build(key, { version: '2.9.1' });
    expect((await upload('tables', '2.9.1', files)).json()).toMatchObject({ status: 'published' });
    const again = await upload('tables', '2.9.1', files);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ status: 'already' });

    const changed = await upload('tables', '2.9.1', build(key, { version: '2.9.1', entry: 'export default 2' }));
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ error: 'version_exists' });
    const served = await app.inject({ method: 'GET', url: '/api/modules/tables/2.9.1/remote-entry.js' });
    expect(served.body).toBe('export default 1');
  });

  it('refuses what does not prove itself, and publishes nothing', async () => {
    const stranger = ephemeralKey();
    const foreign = await upload('debts', '2.9.0', build(stranger, { id: 'debts' }));
    expect(foreign.statusCode).toBe(422);
    expect(foreign.json()).toMatchObject({ error: 'bad_signature' });

    const wrongModule = await upload('debts', '2.9.0', build(key, { id: 'tables' }));
    expect(wrongModule.json()).toMatchObject({ error: 'manifest_mismatch' });
    const wrongVersion = await upload('debts', '2.9.0', build(key, { id: 'debts', version: '2.9.5' }));
    expect(wrongVersion.json()).toMatchObject({ error: 'manifest_mismatch' });

    const tampered = build(key, { id: 'debts' });
    tampered['BillPage-abc.js'] = Buffer.from('export const page = "evil"');
    const hashBad = await upload('debts', '2.9.0', tampered);
    expect(hashBad.json()).toMatchObject({ error: 'hash_mismatch' });

    const extra = { ...build(key, { id: 'debts' }), 'stray.js': Buffer.from('1') };
    expect((await upload('debts', '2.9.0', extra)).json()).toMatchObject({ error: 'files_mismatch' });

    const { ['manifest.json.sig']: _sig, ...unsigned } = build(key, { id: 'debts' });
    expect((await upload('debts', '2.9.0', unsigned)).json()).toMatchObject({ error: 'manifest_missing' });

    await app.inject({ method: 'DELETE', url: '/api/modules/upload/debts/2.9.0', headers: auth });
    const empty = await app.inject({ method: 'POST', url: '/api/modules/upload/debts/2.9.0/commit', headers: auth });
    expect(empty.statusCode).toBe(409);
    expect(empty.json()).toMatchObject({ error: 'nothing_staged' });

    expect(existsSync(path.join(storeDir, 'debts', '2.9.0'))).toBe(false);
  });

  it('takes only build files as raw bytes', async () => {
    for (const name of ['notes.txt', '.hidden.js', '..%2Fx.js', 'a%2Fb.js']) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/modules/upload/tables/3.0.0/${name}`,
        headers: { ...auth, 'content-type': 'application/octet-stream' },
        payload: Buffer.from('1'),
      });
      expect(res.statusCode, name).toBe(400);
    }
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/modules/upload/BAD/3.0.0/remote-entry.js',
      headers: { ...auth, 'content-type': 'application/octet-stream' },
      payload: Buffer.from('1'),
    });
    expect(bad.statusCode).toBe(400);
    const json = await app.inject({
      method: 'PUT',
      url: '/api/modules/upload/tables/3.0.0/remote-entry.js',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: { a: 1 },
    });
    expect(json.statusCode).toBe(415);
  });
});
