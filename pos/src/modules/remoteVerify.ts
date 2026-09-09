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
 * `inspectRemoteManifest` exposes just the signed-manifest half: it verifies the
 * signature and returns what the manifest says about itself, without fetching or
 * running any module code. The Settings screen uses it to prefill a new
 * `module_remotes` entry from the build the owner is pointing at.
 *
 * Dependency-free leaf. Uses WebCrypto (`crypto.subtle`); on a browser without
 * Ed25519 support the check fails closed → the module stays bundled.
 */

import { TRUSTED_REMOTE_KEYS } from './remoteSigningKeys';
// Leaf import (not the barrel): the barrel re-exports the module manifests,
// which reach the registry, which imports this file.
import { PLATFORM_VERSION } from '../platform/version';

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
  /**
   * `PLATFORM_VERSION` of the checkout the remote was built from (roadmap #12
   * track 2). Absent on manifests signed before the field existed — treated
   * as 0, i.e. no requirement.
   */
  minHostPlatform?: number;
  entry: string;
  keyId: string;
  builtAt: string;
  files: Record<string, string>;
}

/** This host's platform surface is older than what the remote was built against. */
export function hostTooOld(manifest: Pick<RemoteManifest, 'minHostPlatform'>): boolean {
  return (manifest.minHostPlatform ?? 0) > PLATFORM_VERSION;
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

/**
 * A connection that a host actively refuses fails `fetch()` fast; one that
 * accepts the TCP handshake and then never answers (a firewall black-holing
 * packets, a container that's up but wedged) does not — `fetch()` has no
 * default timeout, so it hangs until the platform's own multi-minute socket
 * timeout, if that ever comes at all. `applyModuleRemotes()` runs before the
 * app's first render (`main.tsx`), so a single store with one bad
 * `module_remotes` URL would otherwise freeze the site for every visitor,
 * indefinitely, with no error to look at. `AbortSignal.timeout` turns that
 * into an ordinary, reported `remote_load_fallback` a few seconds later.
 */
const FETCH_TIMEOUT_MS = 10_000;

async function fetchOrThrow(url: string, what: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new RemoteVerifyError(`${what} fetch failed (${String(err)})`);
  }
  if (!res.ok) throw new RemoteVerifyError(`${what} HTTP ${res.status}`);
  return res;
}

/**
 * Fetch the sibling `manifest.json` + `.sig` for an entry URL and check the
 * signature against the allowlist. Does not touch the entry itself, so it is
 * safe to call on a URL nobody has vetted: nothing is executed either way.
 */
async function fetchVerifiedManifest(url: string): Promise<RemoteManifest> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new RemoteVerifyError('WebCrypto unavailable');

  const manifestUrl = url.replace(/[^/]+$/, 'manifest.json');
  const sigUrl = `${manifestUrl}.sig`;

  const [manifestText, sigText] = await Promise.all([
    fetchOrThrow(manifestUrl, 'manifest', { cache: 'no-store' }).then((r) => r.text()),
    fetchOrThrow(sigUrl, 'signature', { cache: 'no-store' }).then((r) => r.text()),
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

  if (basename(manifest.entry) !== basename(url)) {
    throw new RemoteVerifyError(`manifest entry "${manifest.entry}" != "${basename(url)}"`);
  }

  return manifest;
}

/** What a validly signed remote says about itself. */
export interface RemoteManifestInfo {
  moduleId: string;
  version: string;
  /** Host `PLATFORM_VERSION` the build needs; 0 for manifests that predate the field. */
  minHostPlatform: number;
  keyId: string;
  builtAt: string;
}

/**
 * Read a remote's signed manifest without downloading or running its code.
 *
 * The point of registering an online-only module is that its id, title, route
 * and nav have to be stored on `pos_stores.module_remotes` before the module
 * itself is ever fetched — the desktop cashier renders the nav entry from that
 * on a cold, offline first run. Retyping them by hand is what drifts. This
 * gives the Settings screen the authoritative id and version straight from the
 * build being registered, having verified the signature first.
 *
 * Throws `RemoteVerifyError` — the same reasons the loader reports.
 */
export async function inspectRemoteManifest(url: string): Promise<RemoteManifestInfo> {
  const manifest = await fetchVerifiedManifest(url);
  return {
    moduleId: manifest.moduleId,
    version: manifest.version,
    minHostPlatform: manifest.minHostPlatform ?? 0,
    keyId: manifest.keyId,
    builtAt: manifest.builtAt,
  };
}

export interface VerifiedRemote {
  /** Verified `style.css` text (roadmap #4), if the remote ships one. */
  styleCss?: string;
}

/**
 * Throws `RemoteVerifyError` unless the remote at `url` is validly signed.
 * Resolves with any verified sidecar assets (`style.css`).
 */
export async function verifyRemoteEntry(url: string, moduleId: string): Promise<VerifiedRemote> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new RemoteVerifyError('WebCrypto unavailable');

  // Start the entry download alongside the manifest check — this runs before
  // the app's first render, so the round trips are worth overlapping. The
  // no-op catch only marks the rejection handled; `await` below still throws.
  const entryPromise = fetchOrThrow(url, 'entry').then((r) => r.arrayBuffer());
  void entryPromise.catch(() => undefined);

  const manifest = await fetchVerifiedManifest(url);

  if (manifest.moduleId !== moduleId) {
    throw new RemoteVerifyError(`manifest moduleId "${manifest.moduleId}" != "${moduleId}"`);
  }
  // Before the entry hash: a remote built against a newer `@pos/platform` would
  // pass every integrity check and then fail to *link* at `import()`.
  if (hostTooOld(manifest)) {
    throw new RemoteVerifyError(
      `host too old: needs platform ${manifest.minHostPlatform}, this build is ${PLATFORM_VERSION}`
    );
  }

  const entryBuf = await entryPromise;
  const expected = manifest.files?.[manifest.entry];
  if (!expected) throw new RemoteVerifyError('manifest has no entry hash');
  const actual = `sha384-${bytesToB64(await subtle.digest('SHA-384', entryBuf))}`;
  if (actual !== expected) throw new RemoteVerifyError('entry hash mismatch');

  // Sidecar CSS (roadmap #4) — verify its bytes too, then hand the text to the
  // caller to inject as a <style>. Absent → the module has no utilities sheet.
  const styleExpected = manifest.files?.['style.css'];
  if (!styleExpected) return {};
  const styleUrl = url.replace(/[^/]+$/, 'style.css');
  const styleBuf = await fetchOrThrow(styleUrl, 'style.css').then((r) => r.arrayBuffer());
  const styleActual = `sha384-${bytesToB64(await subtle.digest('SHA-384', styleBuf))}`;
  if (styleActual !== styleExpected) throw new RemoteVerifyError('style.css hash mismatch');
  return { styleCss: new TextDecoder().decode(styleBuf) };
}
