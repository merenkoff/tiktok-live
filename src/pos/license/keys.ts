// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Ed25519 public keys trusted to sign a licence token (TechDocs/POS_LICENSING.md,
 * phase 2). The backend embeds ONLY the public half and verifies; the private
 * half — which SIGNS tokens — lives only in the author's secret manager and
 * nothing in this repo holds it, exactly like the module-signing key in
 * `pos/src/modules/remoteSigningKeys.ts`. So a clone of this source cannot
 * forge a licence token.
 *
 *   key   = keyId (first 16 hex of `sha256(rawPubKey)`), the token's `kid`
 *   value = raw 32-byte Ed25519 public key, base64
 *
 * Rotate with `node scripts/license-key.mjs --gen`: add the new keyId here,
 * keep issuing under both for a while, then drop the old one — the verifier
 * accepts any key in this map, so a token signed under either is valid.
 */
export const TRUSTED_LICENSE_KEYS: Readonly<Record<string, string>> = {
  // prod — the owner generated this keypair on their own machine
  // (`node scripts/license-key.mjs --gen`, 2026-11-06); the private half lives
  // only in their secret manager and is NOT in this repo.
  '07c5b2206fc251db': 'H6OPXO54epq23yGU+JB2fw5hXQEU+GbrJtPPm37wNQk=',
};
