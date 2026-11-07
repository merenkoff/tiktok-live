// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ed25519 public keys a module bundle's `manifest.json` must be signed with to
// enter the closed bundle store (TechDocs/POS_OPENCORE.md §8.1, O-3). The same
// PROD key every host trusts — `pos/src/modules/remoteSigningKeys.ts` and the
// Rust allowlist in `pos/src-tauri/src/module_remotes.rs`;
// `pos.module-upload.test.ts` fails if this copy drifts from the client's.
//
// The dev key is deliberately absent: what reaches the store is what tills
// will run, and no till built for production trusts the dev key.
//
//   key   = keyId (first 16 hex of sha256(rawPubKey)), the manifest's `keyId`
//   value = raw 32-byte Ed25519 public key, base64

export const TRUSTED_MODULE_KEYS: Readonly<Record<string, string>> = {
  '2a73632c13044371': 'L1GE875XMdo4FDMUTmYaZjpsYxzNyXnxL3G00jrsrkk=',
};
