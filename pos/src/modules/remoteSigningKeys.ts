// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Ed25519 public keys trusted to sign module-remote manifests (roadmap #3).
 * `verifyRemoteEntry` (`remoteVerify.ts`) accepts a remote only if its
 * `manifest.json.sig` verifies against one of these.
 *
 * - key   = keyId (first 16 hex of `sha256(rawPubKey)`)
 * - value = raw 32-byte Ed25519 public key, base64
 *
 * Must stay in sync with `TRUSTED_REMOTE_KEYS` / `DEV_REMOTE_KEY` in
 * `src-tauri/src/module_remotes.rs` — the desktop verifies in Rust.
 *
 * Dependency-free leaf — imported by `registry.ts` / `remoteVerify.ts`.
 */

/** Trusted in every build. */
const PROD_REMOTE_KEYS: Readonly<Record<string, string>> = {
  // prod — generated 2026-09-07 (`node scripts/sign-remote.mjs --gen-prod`).
  // Private half lives only as the `POS_REMOTE_SIGNING_KEY` GitHub Actions
  // secret (`.github/workflows/module-release.yml`); nothing else holds it.
  '2a73632c13044371': 'L1GE875XMdo4FDMUTmYaZjpsYxzNyXnxL3G00jrsrkk=',
};

/**
 * The **dev** key is deterministic and not secret — derived from a fixed seed
 * in `scripts/sign-remote.mjs`, it just lets locally-built `build:*-remote`
 * output load without a real signing key. Anyone can sign with it, so it is
 * trusted only under `vite dev`/vitest, or in a build made with
 * `VITE_REMOTE_ALLOW_DEV_KEY=1` for a local end-to-end run against a
 * dev-signed module. Production builds (Railway, CI) never set that.
 */
const DEV_REMOTE_KEY: Readonly<Record<string, string>> = {
  // `node scripts/sign-remote.mjs --print-dev`
  a5dae462a776005d: 'iTxt7d1E3eJAWDaCKKiOksLNjdnPwmLgayjSJVRsIYM=',
};

const allowDevKey = import.meta.env.DEV || import.meta.env.VITE_REMOTE_ALLOW_DEV_KEY === '1';

export const TRUSTED_REMOTE_KEYS: Readonly<Record<string, string>> = {
  ...(allowDevKey ? DEV_REMOTE_KEY : {}),
  ...PROD_REMOTE_KEYS,
};
