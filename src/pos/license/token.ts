// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Verify a licence token (TechDocs/POS_LICENSING.md, phase 2). Pure, no DB, no
// network — the only crypto primitive this adds to the backend is Ed25519
// verification (the rest of `src/` is HMAC/AES). A token is
//   base64url(claimJSON) "." base64url(signature)
// and the signature is Ed25519 over the FIRST segment's bytes (the encoded
// claim), the same "sign the encoded part" shape as a JWT. The author's site
// signs with the private half of one of TRUSTED_LICENSE_KEYS; we only verify.

import crypto from 'crypto';
import { TRUSTED_LICENSE_KEYS } from './keys.js';

export interface LicenseClaim {
  /** keyId naming which trusted public key signed this (see keys.ts). */
  kid: string;
  /** Who the licence is for — a name/id, shown to the owner, never a secret. */
  licensee: string;
  plan?: string;
  issued_at?: string;
  /** ISO timestamp; a token past it is `expired`. Omitted = perpetual. */
  expires_at?: string;
  instance_limit?: number;
  nonce?: string;
}

export type LicenseVerdict =
  | { ok: true; claim: LicenseClaim }
  | {
      ok: false;
      reason: 'absent' | 'malformed' | 'unknown_key' | 'bad_signature' | 'expired';
    };

/** The 12-byte SPKI DER prefix for an Ed25519 public key, before its 32 bytes. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function publicKeyFromRaw(rawB64: string): crypto.KeyObject {
  const raw = Buffer.from(rawB64, 'base64');
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export interface VerifyOptions {
  /** Trusted keyId → raw base64 public key. Defaults to TRUSTED_LICENSE_KEYS. */
  keys?: Readonly<Record<string, string>>;
  /** "Now" for the expiry check; defaults to the current time. */
  now?: Date;
}

/**
 * Verify a licence token and return its claim, or why it is not valid. Fails
 * CLOSED on anything unexpected. Never throws.
 */
export function verifyLicenseToken(
  token: string | null | undefined,
  options: VerifyOptions = {}
): LicenseVerdict {
  const keys = options.keys ?? TRUSTED_LICENSE_KEYS;
  const now = options.now ?? new Date();

  if (!token || !token.trim()) return { ok: false, reason: 'absent' };
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [seg, sigSeg] = parts;

  let claim: LicenseClaim;
  try {
    claim = JSON.parse(Buffer.from(seg, 'base64url').toString('utf-8')) as LicenseClaim;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!claim || typeof claim.kid !== 'string' || typeof claim.licensee !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  const pub = keys[claim.kid];
  if (!pub) return { ok: false, reason: 'unknown_key' };

  let valid = false;
  try {
    valid = crypto.verify(
      null,
      Buffer.from(seg),
      publicKeyFromRaw(pub),
      Buffer.from(sigSeg, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };

  if (claim.expires_at) {
    const exp = Date.parse(claim.expires_at);
    if (Number.isFinite(exp) && exp < now.getTime()) return { ok: false, reason: 'expired' };
  }

  return { ok: true, claim };
}

/**
 * Sign a claim into a token with a raw Ed25519 private key (PKCS8 base64). Used
 * ONLY by `scripts/license-key.mjs --sign` and the tests — the running backend
 * never signs, it only verifies. Kept here so the encode/sign shape lives next
 * to the verify shape and the two cannot drift.
 */
export function signLicenseToken(claim: LicenseClaim, privateKeyPkcs8B64: string): string {
  const seg = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const key = crypto.createPrivateKey({
    key: Buffer.from(privateKeyPkcs8B64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = crypto.sign(null, Buffer.from(seg), key).toString('base64url');
  return `${seg}.${sig}`;
}
