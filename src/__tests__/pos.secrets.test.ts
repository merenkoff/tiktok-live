// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.secrets.test.ts
//
// `src/pos/core/secrets.ts` — AES-256-GCM at-rest encryption for per-store
// third-party credentials (first user: ПРРО provider licence keys).
//
// No database. The properties under test are the ones the fiscal design leans
// on: the ciphertext never contains the plaintext, the envelope is bound to its
// store AND provider through the AAD, and every failure mode is a throw rather
// than a plausible-looking wrong answer.

import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptSecrets,
  encryptSecrets,
  generateSecretsKey,
  isSecretsKeyConfigured,
  SECRETS_KEY_VERSION,
  SecretsDecryptError,
  SecretsKeyError,
} from '../pos/core/secrets.js';

const KEY_A = generateSecretsKey();
const KEY_B = generateSecretsKey();

const SECRETS = { licenceKey: 'lic-abc-123', cashierPin: '1234' };

/** Run `fn` with a specific `POS_SECRETS_KEY`, restoring whatever was there. */
function withKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env.POS_SECRETS_KEY;
  if (key === undefined) delete process.env.POS_SECRETS_KEY;
  else process.env.POS_SECRETS_KEY = key;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previous;
  }
}

describe('POS credential encryption', () => {
  afterEach(() => {
    delete process.env.POS_SECRETS_KEY;
  });

  it('round-trips a credential bag', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      expect(decryptSecrets(1, 'checkbox', envelope)).toEqual(SECRETS);
    });
  });

  it('never leaves the plaintext in the envelope', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      const asText = envelope.toString('binary');
      expect(asText).not.toContain('lic-abc-123');
      expect(asText).not.toContain('licenceKey');
      expect(envelope[0]).toBe(SECRETS_KEY_VERSION);
    });
  });

  it('produces a different envelope every time (random IV)', () => {
    withKey(KEY_A, () => {
      const a = encryptSecrets(1, 'checkbox', SECRETS);
      const b = encryptSecrets(1, 'checkbox', SECRETS);
      expect(a.equals(b)).toBe(false);
    });
  });

  it('refuses an envelope replayed into another store', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      expect(() => decryptSecrets(2, 'checkbox', envelope)).toThrow(SecretsDecryptError);
    });
  });

  it('refuses an envelope re-pointed at another provider', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      expect(() => decryptSecrets(1, 'vchasno', envelope)).toThrow(SecretsDecryptError);
    });
  });

  it('refuses a tampered ciphertext', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      const tampered = Buffer.from(envelope);
      tampered[tampered.length - 1] ^= 0xff;
      expect(() => decryptSecrets(1, 'checkbox', tampered)).toThrow(SecretsDecryptError);
    });
  });

  it('refuses a truncated envelope', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      expect(() => decryptSecrets(1, 'checkbox', envelope.subarray(0, 10))).toThrow(
        SecretsDecryptError
      );
    });
  });

  it('refuses an unknown envelope version', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', SECRETS);
      const bumped = Buffer.from(envelope);
      bumped[0] = 99;
      expect(() => decryptSecrets(1, 'checkbox', bumped)).toThrow(/version 99/);
    });
  });

  it('refuses to decrypt under a rotated key', () => {
    const envelope = withKey(KEY_A, () => encryptSecrets(1, 'checkbox', SECRETS));
    withKey(KEY_B, () => {
      expect(() => decryptSecrets(1, 'checkbox', envelope)).toThrow(SecretsDecryptError);
    });
  });

  it('throws SecretsKeyError when the key is missing or the wrong size', () => {
    withKey(undefined, () => {
      expect(isSecretsKeyConfigured()).toBe(false);
      expect(() => encryptSecrets(1, 'checkbox', SECRETS)).toThrow(SecretsKeyError);
    });
    withKey(Buffer.alloc(16).toString('base64'), () => {
      expect(isSecretsKeyConfigured()).toBe(false);
      expect(() => encryptSecrets(1, 'checkbox', SECRETS)).toThrow(/32 bytes/);
    });
  });

  it('reads the key at call time, not at import time', () => {
    // The settings route depends on this: tests and the 503 path both flip
    // POS_SECRETS_KEY after this module has already been imported.
    withKey(undefined, () => expect(isSecretsKeyConfigured()).toBe(false));
    withKey(KEY_A, () => expect(isSecretsKeyConfigured()).toBe(true));
  });

  it('drops non-string values rather than trusting a hand-edited row', () => {
    withKey(KEY_A, () => {
      const envelope = encryptSecrets(1, 'checkbox', {
        good: 'yes',
        // Forced past the type to simulate a bag written by an older/other build.
        bad: 42 as unknown as string,
      });
      expect(decryptSecrets(1, 'checkbox', envelope)).toEqual({ good: 'yes' });
    });
  });
});
