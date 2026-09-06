// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RemoteVerifyError, verifyRemoteEntry } from './remoteVerify';
import { TRUSTED_REMOTE_KEYS } from './remoteSigningKeys';

const ENTRY_URL = 'https://cdn.example.test/stock/remote-entry.js';
const ENTRY_JS = 'export const manifest = { id: "stock" };\n';

let keyId = '';
let signManifest: (json: string) => Promise<string>;
let entrySha384 = '';

const mutableKeys = TRUSTED_REMOTE_KEYS as Record<string, string>;

function b64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64');
}

async function makeManifest(over: Partial<Record<string, unknown>> = {}): Promise<string> {
  return JSON.stringify({
    schema: 1,
    moduleId: 'stock',
    version: '9.9.9',
    entry: 'remote-entry.js',
    keyId,
    builtAt: '2026-09-06T00:00:00.000Z',
    files: { 'remote-entry.js': entrySha384 },
    ...over,
  });
}

/** fetch stub: routes by URL suffix; `manifest`/`sig` bodies come from args. */
function stubFetch(bodies: { manifest?: string | null; sig?: string | null; entry?: string }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const miss = () => ({ ok: false, status: 404 }) as Response;
      if (url.endsWith('manifest.json')) {
        if (bodies.manifest == null) return miss();
        return { ok: true, status: 200, text: async () => bodies.manifest } as Response;
      }
      if (url.endsWith('manifest.json.sig')) {
        if (bodies.sig == null) return miss();
        return { ok: true, status: 200, text: async () => bodies.sig } as Response;
      }
      const js = bodies.entry ?? ENTRY_JS;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode(js).buffer,
      } as Response;
    })
  );
}

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey);
  const idHash = await crypto.subtle.digest('SHA-256', rawPub);
  keyId = Buffer.from(idHash).toString('hex').slice(0, 16);
  mutableKeys[keyId] = b64(rawPub);
  signManifest = async (json) =>
    b64(await crypto.subtle.sign({ name: 'Ed25519' }, kp.privateKey, new TextEncoder().encode(json)));
  entrySha384 = `sha384-${b64(await crypto.subtle.digest('SHA-384', new TextEncoder().encode(ENTRY_JS).buffer))}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyRemoteEntry', () => {
  it('resolves for a validly signed manifest', async () => {
    const manifest = await makeManifest();
    stubFetch({ manifest, sig: await signManifest(manifest) });
    await expect(verifyRemoteEntry(ENTRY_URL, 'stock')).resolves.toBeUndefined();
  });

  it('rejects a bad signature', async () => {
    const manifest = await makeManifest();
    const sig = await signManifest(manifest);
    const tampered = Buffer.from(sig, 'base64');
    tampered[0] ^= 0xff;
    stubFetch({ manifest, sig: tampered.toString('base64') });
    await expect(verifyRemoteEntry(ENTRY_URL, 'stock')).rejects.toBeInstanceOf(RemoteVerifyError);
  });

  it('rejects an unknown keyId', async () => {
    const manifest = await makeManifest({ keyId: 'deadbeefdeadbeef' });
    stubFetch({ manifest, sig: await signManifest(manifest) });
    await expect(verifyRemoteEntry(ENTRY_URL, 'stock')).rejects.toThrow(/untrusted keyId/);
  });

  it('rejects when the entry hash does not match', async () => {
    const manifest = await makeManifest();
    stubFetch({ manifest, sig: await signManifest(manifest), entry: '/* swapped */\n' });
    await expect(verifyRemoteEntry(ENTRY_URL, 'stock')).rejects.toThrow(/entry hash mismatch/);
  });

  it('rejects a moduleId mismatch', async () => {
    const manifest = await makeManifest({ moduleId: 'products' });
    stubFetch({ manifest, sig: await signManifest(manifest) });
    await expect(verifyRemoteEntry(ENTRY_URL, 'stock')).rejects.toThrow(/moduleId/);
  });

  it('rejects a missing manifest', async () => {
    stubFetch({ manifest: null, sig: 'x' });
    await expect(verifyRemoteEntry(ENTRY_URL, 'stock')).rejects.toThrow(/manifest HTTP 404/);
  });
});
