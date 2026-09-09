// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/secrets.ts
//
// Symmetric encryption for per-store third-party credentials at rest.
//
// The first user is ПРРО fiscalisation (`pos_fiscal_settings.secrets_encrypted`),
// whose secrets — a provider licence key and a cashier PIN — are enough to issue
// fiscal receipts in the store's name. `core/crypto.ts` next door is *hashing*
// (bcrypt): right for our own passwords and PINs, useless here, because these
// have to be handed back to the provider verbatim on every call.
//
// Envelope layout, stored as a single BYTEA:
//
//   [1B key version][12B IV][16B GCM tag][ciphertext]
//
// AAD is `"<storeId>:<provider>"`. That binds a row to its store: a leaked
// ciphertext copied into another store's row, or re-pointed at another provider,
// fails authentication instead of decrypting. The version byte is what makes a
// future key rotation a migration rather than a rewrite.

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Bumped only when the key material or envelope layout changes. */
export const SECRETS_KEY_VERSION = 1;

const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

/**
 * Thrown when `POS_SECRETS_KEY` is absent or malformed.
 *
 * Callers must fail loudly rather than degrade: a settings write answers 503
 * (never store a credential in plaintext) and the fiscal pre-flight throws
 * `not_configured` (never sell a receipt that cannot be fiscalised).
 */
export class SecretsKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsKeyError';
  }
}

/** Thrown when an envelope fails to authenticate or is structurally wrong. */
export class SecretsDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsDecryptError';
  }
}

/**
 * Read the key fresh on each call rather than caching it at module load.
 *
 * Tests set `process.env.POS_SECRETS_KEY` inside `beforeAll`, which runs after
 * imports are evaluated; a module-level constant would freeze the value from
 * before the suite configured it.
 */
function loadKey(): Buffer {
  const raw = process.env.POS_SECRETS_KEY?.trim();
  if (!raw) {
    throw new SecretsKeyError(
      'POS_SECRETS_KEY is not set — cannot encrypt or decrypt store credentials'
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new SecretsKeyError('POS_SECRETS_KEY is not valid base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretsKeyError(
      `POS_SECRETS_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`
    );
  }
  return key;
}

/** Is a usable key configured? Lets a route answer 503 instead of throwing. */
export function isSecretsKeyConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Generate a key for `POS_SECRETS_KEY`. Used by operators, not by the app. */
export function generateSecretsKey(): string {
  return crypto.randomBytes(KEY_BYTES).toString('base64');
}

function aad(storeId: number, provider: string): Buffer {
  return Buffer.from(`${storeId}:${provider}`, 'utf-8');
}

/** Encrypt a flat string bag into one self-describing envelope. */
export function encryptSecrets(
  storeId: number,
  provider: string,
  secrets: Record<string, string>
): Buffer {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(storeId, provider));

  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([SECRETS_KEY_VERSION]), iv, tag, ciphertext]);
}

/**
 * Decrypt an envelope written by {@link encryptSecrets}.
 *
 * `storeId` and `provider` must match the ones used to encrypt — they are the
 * AAD, so a mismatch is an authentication failure, not a wrong-looking result.
 */
export function decryptSecrets(
  storeId: number,
  provider: string,
  envelope: Buffer
): Record<string, string> {
  if (envelope.length < HEADER_BYTES) {
    throw new SecretsDecryptError('Encrypted secrets envelope is truncated');
  }
  const version = envelope[0];
  if (version !== SECRETS_KEY_VERSION) {
    throw new SecretsDecryptError(`Unsupported secrets envelope version ${version}`);
  }

  const key = loadKey();
  const iv = envelope.subarray(1, 1 + IV_BYTES);
  const tag = envelope.subarray(1 + IV_BYTES, HEADER_BYTES);
  const ciphertext = envelope.subarray(HEADER_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(aad(storeId, provider));
  decipher.setAuthTag(tag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Deliberately opaque: a tampered envelope, the wrong store, the wrong
    // provider and a rotated key are indistinguishable to the caller by design.
    throw new SecretsDecryptError('Failed to decrypt store credentials');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf-8'));
  } catch {
    throw new SecretsDecryptError('Decrypted credentials are not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SecretsDecryptError('Decrypted credentials are not an object');
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
