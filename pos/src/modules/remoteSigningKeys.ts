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
 * The `dev` key below is **deterministic and not secret** — derived from a fixed
 * seed in `scripts/sign-remote.mjs`, it just lets locally-built `build:*-remote`
 * output load without a real signing key. Add the production keyId here when CI
 * signing (`POS_REMOTE_SIGNING_KEY`) lands; drop `dev` before shipping remotes
 * that matter.
 *
 * Dependency-free leaf — imported by `registry.ts` / `remoteVerify.ts`.
 */
export const TRUSTED_REMOTE_KEYS: Readonly<Record<string, string>> = {
  // dev (deterministic — `node scripts/sign-remote.mjs --print-dev`)
  a5dae462a776005d: 'iTxt7d1E3eJAWDaCKKiOksLNjdnPwmLgayjSJVRsIYM=',
};
