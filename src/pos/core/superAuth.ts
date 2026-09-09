// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/superAuth.ts
//
// The super admin (`/super`, TechDocs/POS_SUPER_ADMIN.md): one password from
// the environment — `POS_SUPER_PASSWORD`, an infrastructure secret like
// `POS_SECRETS_KEY` — that opens a read/write view over EVERY store's module
// configuration. No user row, no session table:
//
//  - the password is compared through SHA-256 + `timingSafeEqual`, so neither
//    its length nor a prefix match leaks through timing;
//  - a successful login mints a stateless token `<expMs>.<hmac>` signed with a
//    key derived from `AUTH_SECRET` + the password. Rotating either one
//    invalidates every outstanding token at once — the emergency switch;
//  - the token travels in its own header (`X-POS-Super-Token`), never in
//    `Authorization`, so it can never be mistaken for (or looked up as) a
//    store session by `getAuthByToken`;
//  - failed logins are rate-limited per IP in memory. One API instance today;
//    move the counter to Redis before scaling out.

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SUPER_TOKEN_HEADER = 'x-pos-super-token';

/** Shorter than this and the variable is treated as unset — a typo, not a password. */
export const SUPER_PASSWORD_MIN_LENGTH = 12;
export const SUPER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

function configuredPassword(): string | null {
  const raw = process.env.POS_SUPER_PASSWORD ?? '';
  return raw.length >= SUPER_PASSWORD_MIN_LENGTH ? raw : null;
}

export function isSuperConfigured(): boolean {
  return configuredPassword() !== null;
}

function sha256(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

/** Constant-time check against `POS_SUPER_PASSWORD`. False when not configured. */
export function verifySuperPassword(input: string): boolean {
  const configured = configuredPassword();
  if (!configured || typeof input !== 'string') return false;
  return timingSafeEqual(sha256(input), sha256(configured));
}

function signingKey(): Buffer | null {
  const configured = configuredPassword();
  if (!configured) return null;
  return sha256(`${process.env.AUTH_SECRET ?? ''}|${configured}`);
}

function sign(expMs: string, key: Buffer): string {
  return createHmac('sha256', key).update(expMs).digest('base64url');
}

export function issueSuperToken(now = Date.now()): { token: string; expiresAt: Date } | null {
  const key = signingKey();
  if (!key) return null;
  const expMs = String(now + SUPER_TOKEN_TTL_MS);
  return { token: `${expMs}.${sign(expMs, key)}`, expiresAt: new Date(Number(expMs)) };
}

export function verifySuperToken(token: string, now = Date.now()): boolean {
  const key = signingKey();
  if (!key || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expMs = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d{1,16}$/.test(expMs) || Number(expMs) <= now) return false;
  const expected = Buffer.from(sign(expMs, key));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---- login rate limiting (per IP, in memory) --------------------------------

const failures = new Map<string, { count: number; lockedUntil: number }>();

export function loginAttemptAllowed(
  ip: string,
  now = Date.now()
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const entry = failures.get(ip);
  if (!entry || entry.lockedUntil <= now) return { allowed: true };
  return { allowed: false, retryAfterMs: entry.lockedUntil - now };
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  const entry = failures.get(ip) ?? { count: 0, lockedUntil: 0 };
  const count = entry.lockedUntil > now ? entry.count : entry.count + 1;
  const lockedUntil = count >= MAX_FAILURES ? now + LOCK_MS : entry.lockedUntil;
  failures.set(ip, { count: count >= MAX_FAILURES ? 0 : count, lockedUntil });
}

export function recordLoginSuccess(ip: string): void {
  failures.delete(ip);
}

/** Test-only. */
export function resetSuperRateLimiter(): void {
  failures.clear();
}

// ---- request gate -----------------------------------------------------------

/**
 * 401 unless the request carries a valid, unexpired super token. Returns
 * `true` when the handler may proceed. Not configured ⇒ nothing verifies ⇒ 401.
 */
export async function ensureSuper(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const header = request.headers[SUPER_TOKEN_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || !verifySuperToken(token.trim())) {
    await reply.code(401).send({ error: 'Super access required' });
    return false;
  }
  return true;
}
