// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.license.test.ts
//
// Disclosed licence activation (TechDocs/POS_LICENSING.md, phase 2).
//
// No database. Two pure units are pinned here:
//   · verifyLicenseToken — fails CLOSED on anything but a genuinely signed,
//     unexpired token from a trusted key, and never throws;
//   · computeStatus — the cached verdict the owner reads, which must NEVER be
//     able to say 'licensed' without a valid token, yet must never disable the
//     POS (that property lives in service.ts / the route, not here).
//
// The signing shape is exercised through `signLicenseToken` (the same helper
// `scripts/license-key.mjs` mirrors), so a drift between sign and verify fails
// this file.

import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  verifyLicenseToken,
  signLicenseToken,
  type LicenseClaim,
} from '../pos/license/token.js';
import { computeStatus, reportedOrigin, runBootHeartbeat, type HeartbeatResult } from '../pos/license/service.js';

/** Mint an ephemeral Ed25519 keypair and return the raw-pubkey map + private key. */
function ephemeralKey(): { kid: string; keys: Record<string, string>; privateKeyPkcs8B64: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = spkiDer.subarray(12); // strip the 12-byte Ed25519 SPKI prefix
  const rawB64 = Buffer.from(raw).toString('base64');
  const kid = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const privateKeyPkcs8B64 = Buffer.from(
    privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer
  ).toString('base64');
  return { kid, keys: { [kid]: rawB64 }, privateKeyPkcs8B64 };
}

describe('verifyLicenseToken', () => {
  it('accepts a genuinely signed, unexpired token from a trusted key', () => {
    const k = ephemeralKey();
    const claim: LicenseClaim = { kid: k.kid, licensee: 'Acme LLC', plan: 'pro' };
    const token = signLicenseToken(claim, k.privateKeyPkcs8B64);

    const verdict = verifyLicenseToken(token, { keys: k.keys });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.claim.licensee).toBe('Acme LLC');
      expect(verdict.claim.plan).toBe('pro');
    }
  });

  it('is absent for an empty / missing token', () => {
    for (const t of [undefined, null, '', '   ']) {
      const v = verifyLicenseToken(t, { keys: ephemeralKey().keys });
      expect(v).toEqual({ ok: false, reason: 'absent' });
    }
  });

  it('is malformed for a token without two non-empty segments', () => {
    const keys = ephemeralKey().keys;
    for (const t of ['nodot', 'a.', '.b', 'a.b.c']) {
      expect(verifyLicenseToken(t, { keys }).ok).toBe(false);
      expect((verifyLicenseToken(t, { keys }) as { reason: string }).reason).toBe('malformed');
    }
  });

  it('is malformed when the claim JSON is not an object with kid+licensee', () => {
    const k = ephemeralKey();
    // Hand-roll a token whose first segment is valid base64url but not a claim.
    const badSeg = Buffer.from('"just a string"').toString('base64url');
    const key = crypto.createPrivateKey({
      key: Buffer.from(k.privateKeyPkcs8B64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    const sig = crypto.sign(null, Buffer.from(badSeg), key).toString('base64url');
    const v = verifyLicenseToken(`${badSeg}.${sig}`, { keys: k.keys });
    expect(v).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects an unknown key id', () => {
    const signer = ephemeralKey();
    const other = ephemeralKey(); // a different trusted set, not the signer's
    const token = signLicenseToken({ kid: signer.kid, licensee: 'X' }, signer.privateKeyPkcs8B64);
    const v = verifyLicenseToken(token, { keys: other.keys });
    expect(v).toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('rejects a tampered claim (signature no longer matches)', () => {
    const k = ephemeralKey();
    const token = signLicenseToken({ kid: k.kid, licensee: 'Acme LLC' }, k.privateKeyPkcs8B64);
    const [, sig] = token.split('.');
    // Re-encode a claim that upgrades the plan, keep the old signature.
    const forgedSeg = Buffer.from(
      JSON.stringify({ kid: k.kid, licensee: 'Acme LLC', plan: 'enterprise' })
    ).toString('base64url');
    const v = verifyLicenseToken(`${forgedSeg}.${sig}`, { keys: k.keys });
    expect(v).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a signature made with the wrong private key (forgery)', () => {
    const trusted = ephemeralKey();
    const attacker = ephemeralKey();
    // Attacker signs a claim that names the trusted kid, with their own key.
    const token = signLicenseToken({ kid: trusted.kid, licensee: 'Pirate' }, attacker.privateKeyPkcs8B64);
    const v = verifyLicenseToken(token, { keys: trusted.keys });
    expect(v).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an expired token but accepts one before expiry', () => {
    const k = ephemeralKey();
    const token = signLicenseToken(
      { kid: k.kid, licensee: 'Acme LLC', expires_at: '2026-06-01T00:00:00.000Z' },
      k.privateKeyPkcs8B64
    );
    expect(verifyLicenseToken(token, { keys: k.keys, now: new Date('2026-05-31T00:00:00Z') }).ok).toBe(true);
    const v = verifyLicenseToken(token, { keys: k.keys, now: new Date('2026-06-02T00:00:00Z') });
    expect(v).toEqual({ ok: false, reason: 'expired' });
  });

  it('a token with no expiry is perpetual', () => {
    const k = ephemeralKey();
    const token = signLicenseToken({ kid: k.kid, licensee: 'Acme LLC' }, k.privateKeyPkcs8B64);
    expect(verifyLicenseToken(token, { keys: k.keys, now: new Date('2099-01-01T00:00:00Z') }).ok).toBe(true);
  });
});

describe('computeStatus', () => {
  const okVerdict = { ok: true as const, claim: { kid: 'k', licensee: 'X' } };
  const badVerdict = { ok: false as const, reason: 'absent' as const };
  const now = new Date('2026-11-06T12:00:00Z');

  it('is unlicensed whenever the token is not valid, regardless of pings', () => {
    expect(computeStatus(badVerdict, now, now)).toBe('unlicensed');
    expect(computeStatus(badVerdict, null, now)).toBe('unlicensed');
  });

  it('is licensed when the token is valid and a ping succeeded inside the grace', () => {
    const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(computeStatus(okVerdict, recent, now)).toBe('licensed');
  });

  it('is unreachable when the token is valid but the server has not answered in the grace', () => {
    const stale = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days ago (> 14)
    expect(computeStatus(okVerdict, stale, now)).toBe('unreachable');
    expect(computeStatus(okVerdict, null, now)).toBe('unreachable');
  });

  it('treats the grace boundary as still licensed', () => {
    const exactly14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    expect(computeStatus(okVerdict, exactly14, now)).toBe('licensed');
  });
});

describe('runBootHeartbeat', () => {
  it('stops at the first ping the server took', async () => {
    const run = vi
      .fn<() => Promise<HeartbeatResult>>()
      .mockResolvedValueOnce({ status: 'licensed', server_ok: false })
      .mockResolvedValueOnce({ status: 'licensed', server_ok: true });
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const result = await runBootHeartbeat({ attempts: 3, retryDelayMs: 1234, run, sleep });
    expect(result).toEqual({ status: 'licensed', server_ok: true });
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1234);
  });

  it('gives up after the last attempt without sleeping again, and survives a throw', async () => {
    const run = vi
      .fn<() => Promise<HeartbeatResult>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'unreachable', server_ok: false })
      .mockResolvedValueOnce({ status: 'unreachable', server_ok: false });
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const result = await runBootHeartbeat({ attempts: 3, run, sleep });
    expect(result).toEqual({ status: 'unreachable', server_ok: false });
    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('a single attempt never sleeps', async () => {
    const run = vi.fn<() => Promise<HeartbeatResult>>().mockResolvedValue({ status: 'unlicensed', server_ok: false });
    const sleep = vi.fn<(ms: number) => Promise<void>>();
    await runBootHeartbeat({ attempts: 1, run, sleep });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('reportedOrigin', () => {
  it('never reads PUBLIC_BASE_URL — a variable set to be reported is the easiest to set falsely', () => {
    expect(reportedOrigin({ PUBLIC_BASE_URL: 'https://shop.example' })).toBeNull();
    expect(
      reportedOrigin({ PUBLIC_BASE_URL: 'https://shop.example', RAILWAY_PUBLIC_DOMAIN: 'x.up.railway.app' })
    ).toBe('https://x.up.railway.app');
  });

  it("takes Railway's own public domain, with https in front of a bare host", () => {
    expect(reportedOrigin({ RAILWAY_PUBLIC_DOMAIN: 'api.up.railway.app' })).toBe('https://api.up.railway.app');
    expect(reportedOrigin({ RAILWAY_PUBLIC_DOMAIN: 'http://api.local' })).toBe('http://api.local');
  });

  it('then to the first http(s) origin of CORS_ORIGINS, skipping junk', () => {
    expect(reportedOrigin({ CORS_ORIGINS: ' , tauri://localhost, https://pos.shop.example, https://b' })).toBe(
      'https://pos.shop.example'
    );
    expect(reportedOrigin({ EXTRA_CORS_ORIGINS: 'https://old.shop.example' })).toBe('https://old.shop.example');
  });

  it('is null when nothing names the deployment — never a guess at the author', () => {
    expect(reportedOrigin({})).toBeNull();
    expect(reportedOrigin({ CORS_ORIGINS: 'tauri://localhost' })).toBeNull();
  });
});
