// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Verify a module-remote before `import()` (roadmap #3).
 *
 * A remote build ships a sibling `manifest.json` + `manifest.json.sig`
 * (`scripts/sign-remote.mjs`). `verifyRemoteEntry` checks:
 *   1. the Ed25519 signature over the exact manifest bytes, against an
 *      allowlisted public key (`remoteSigningKeys.ts`);
 *   2. the sha384 of `remote-entry.js` against the signed `files` map;
 *   3. that the manifest's `moduleId` / `entry` match what we're loading.
 *
 * On any failure it throws `RemoteVerifyError`; `applyModuleRemotes` turns that
 * into a bundled-module fallback (`remote_verify_error` telemetry). Sub-chunks
 * are not fetched here — their filenames are content-hashed and listed in the
 * signed manifest, and the entry that imports them is verified.
 *
 * Dependency-free leaf. Uses WebCrypto (`crypto.subtle`); on a browser without
 * Ed25519 support the check fails closed → the module stays bundled.
 */

import { TRUSTED_REMOTE_KEYS } from './remoteSigningKeys';

export class RemoteVerifyError extends Error {
  constructor(public reason: string) {
    super(`remote verification failed: ${reason}`);
    this.name = 'RemoteVerifyError';
  }
}

interface RemoteManifest {
  schema: number;
  moduleId: string;
  version: string;
  entry: string;
  keyId: string;
  builtAt: string;
  files: Record<string, string>;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function basename(url: string): string {
  return url.split(/[?#]/)[0].split('/').pop() ?? '';
}

async function fetchOrThrow(url: string, what: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new RemoteVerifyError(`${what} fetch failed (${String(err)})`);
  }
  if (!res.ok) throw new RemoteVerifyError(`${what} HTTP ${res.status}`);
  return res;
}

/** Throws `RemoteVerifyError` unless the remote at `url` is validly signed. */
export async function verifyRemoteEntry(url: string, moduleId: string): Promise<void> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new RemoteVerifyError('WebCrypto unavailable');

  const manifestUrl = url.replace(/[^/]+$/, 'manifest.json');
  const sigUrl = `${manifestUrl}.sig`;

  const [manifestText, sigText, entryBuf] = await Promise.all([
    fetchOrThrow(manifestUrl, 'manifest', { cache: 'no-store' }).then((r) => r.text()),
    fetchOrThrow(sigUrl, 'signature', { cache: 'no-store' }).then((r) => r.text()),
    fetchOrThrow(url, 'entry').then((r) => r.arrayBuffer()),
  ]);

  let manifest: RemoteManifest;
  try {
    manifest = JSON.parse(manifestText) as RemoteManifest;
  } catch {
    throw new RemoteVerifyError('manifest is not JSON');
  }

  const pubB64 = TRUSTED_REMOTE_KEYS[manifest.keyId];
  if (!pubB64) throw new RemoteVerifyError(`untrusted keyId ${manifest.keyId}`);

  let ok = false;
  try {
    const key = await subtle.importKey(
      'raw',
      b64ToBytes(pubB64) as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    ok = await subtle.verify(
      { name: 'Ed25519' },
      key,
      b64ToBytes(sigText) as BufferSource,
      new TextEncoder().encode(manifestText) as BufferSource
    );
  } catch (err) {
    throw new RemoteVerifyError(`signature check errored (${String(err)})`);
  }
  if (!ok) throw new RemoteVerifyError('bad signature');

  if (manifest.moduleId !== moduleId) {
    throw new RemoteVerifyError(`manifest moduleId "${manifest.moduleId}" != "${moduleId}"`);
  }
  if (basename(manifest.entry) !== basename(url)) {
    throw new RemoteVerifyError(`manifest entry "${manifest.entry}" != "${basename(url)}"`);
  }

  const expected = manifest.files?.[manifest.entry];
  if (!expected) throw new RemoteVerifyError('manifest has no entry hash');
  const actual = `sha384-${bytesToB64(await subtle.digest('SHA-384', entryBuf))}`;
  if (actual !== expected) throw new RemoteVerifyError('entry hash mismatch');
}
