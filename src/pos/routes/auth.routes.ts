// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as authService from '../auth.service.js';
import { pinLockMessage, type PinLock } from '../pin-attempts.js';

/**
 * A closed PIN login, in the cashier's words (`pin-attempts.ts`): 429 while it
 * is one of the waits, 423 once the last miss has blocked it. `error` is the
 * whole sentence, because every till already prints a non-401 `error` as is.
 */
function sendPinLock(reply: FastifyReply, lock: PinLock, justMissed: boolean) {
  const retryAfter = Math.max(1, Math.ceil((lock.until.getTime() - Date.now()) / 1000));
  return reply
    .code(lock.blocked ? 423 : 429)
    .header('Retry-After', String(retryAfter))
    .send({
      error: pinLockMessage(lock, Date.now(), justMissed),
      retry_after_s: retryAfter,
      blocked: lock.blocked,
    });
}

export function registerAuthRoutes(fastify: FastifyInstance): void {
  fastify.post('/auth/owner/login', async (request, reply) => {
    const body = request.body as { login?: string; password?: string; store_slug?: unknown };
    if (!body.login || !body.password) {
      return reply.code(400).send({ error: 'login and password required' });
    }
    // Optional: a desktop till released before the form asked for the store
    // code still signs in without it.
    const storeSlug = typeof body.store_slug === 'string' ? body.store_slug : null;
    const result = await authService.loginOwner(body.login, body.password, storeSlug);
    if (!result) return reply.code(401).send({ error: 'Invalid credentials' });
    return result;
  });

  fastify.post('/auth/staff/pin', async (request, reply) => {
    const body = request.body as { store_slug?: string; pin?: string };
    if (!body.store_slug || !body.pin) {
      return reply.code(400).send({ error: 'store_slug and pin required' });
    }
    const outcome = await authService.attemptPinLogin(body.store_slug, body.pin);
    if (outcome.kind === 'ok') return outcome.auth;
    if (outcome.kind === 'locked') return sendPinLock(reply, outcome.lock, false);
    // A miss that earned a wait says so at once — the next tap would hear it anyway.
    if (outcome.lock) return sendPinLock(reply, outcome.lock, true);
    return reply.code(401).send({ error: 'Invalid PIN or store' });
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    await authService.logout(auth.token);
    return { ok: true };
  });

  fastify.get('/me', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return authService.me(auth);
  });

  // ── Staff (owner) ─────────────────────────────────────
}
