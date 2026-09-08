// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/live.routes.ts — the POS → TikTok-LIVE auth bridge.
//
// LAYERING NOTE. The POS plugin does not otherwise reach into the LIVE
// automation core; this file is the one deliberate, localised exception. Its
// imports from that core (`loginUser`, and the settings service below) are the
// entire surface. It exists so the `tiktok-live` feature module can run the
// broadcast and configure it from inside the POS shell without making the
// operator log into a second system.
//
// Both route trees are registered into the same Fastify instance (`src/api.ts`)
// and share one `AUTH_SECRET` and one `pool`, so these are in-process calls. If
// the POS backend is ever split out, they become HTTP calls to the LIVE service
// and nothing else changes.
//
// TWO ACCESS LEVELS, deliberately:
//
//   POST /live/session-token   any authenticated staff (`ensurePosAuth`)
//   GET|PUT /live/settings     owner only (`ensurePosOwner`)
//   POST /live/settings/test-telegram   owner only
//
// The operator running the broadcast is a seller, so minting a session token
// cannot be owner-gated. Configuration is a different act: the Telegram bot
// token decides where the store's orders go. It sits with the sibling setting
// it belongs to — `pos_stores.live_tiktok_username`, owner-only via
// `PATCH /api/pos/store`.
//
// This is also why the settings routes proxy rather than letting the module
// call LIVE's own `/api/settings` with a bridge token. LIVE has no role concept
// at all (`ensureAuth` returns a user, never a role), and a bridge token's
// subject is the STORE's LIVE user — it carries nothing about which employee
// minted it. A bridge token is structurally incapable of expressing "owner", so
// a settings screen built on one would be gated by nothing but a React route.
//
// KNOWN GAP: `POST /api/auth/login` on the LIVE side still mints a token from a
// nickname alone, so the owner gate here is not yet a complete authorisation
// story. Closing that is tracked separately.
//
// Consequence worth knowing: one LIVE user per store means one shared session.
// `sessionManager` is keyed by LIVE `user_id`, so every staff member who mints
// a token drives the same broadcast, and anyone's "stop" stops it for all.
//
// See TechDocs/POS_LIVE_SELLING_MODULE.md.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import { pool } from '../../db.js';
import { loginUser } from '../../core/auth.js';
import * as usersService from '../../users/users.service.js';
import { toSettingsView } from '../../users/settings.controller.js';
import { errorMessage } from './_shared.js';

/** Mirrors `TOKEN_TTL_MS` in `src/core/auth.ts` — advisory, for the client's pre-emptive re-mint. */
const LIVE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The store's connected TikTok nickname, or null. */
async function storeNickname(storeId: number): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT live_tiktok_username FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  return (rows[0]?.live_tiktok_username as string | null)?.trim() || null;
}

function notConnected(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'live_not_configured',
    message: 'Магазин не під’єднано до TikTok LIVE. Вкажіть нікнейм у Налаштуваннях.',
  });
}

/**
 * The LIVE user behind a store, creating it on first use.
 *
 * `loginUser` is idempotent and also guarantees a `user_settings` row exists,
 * so the settings routes work before the broadcast screen has ever been opened.
 * The token it mints is discarded here — these routes are already authorised by
 * the POS session.
 */
async function resolveLiveUserId(storeId: number): Promise<number | null> {
  const nickname = await storeNickname(storeId);
  if (!nickname) return null;
  const { user } = await loginUser(nickname);
  return Number(user.id);
}

export function registerLiveRoutes(fastify: FastifyInstance): void {
  fastify.post('/live/session-token', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;

    const nickname = await storeNickname(auth.storeId);
    if (!nickname) return notConnected(reply);

    try {
      // Idempotent: creates the LIVE user + default settings on first use,
      // returns the existing ones afterwards. No server-side token store —
      // `verifyToken` is a stateless HMAC check — so minting per module mount
      // is cheap and the client just caches what it gets back.
      const { token, user } = await loginUser(nickname);
      return {
        token,
        user: { id: Number(user.id), tiktok_username: user.tiktok_username as string },
        expiresAt: new Date(Date.now() + LIVE_TOKEN_TTL_MS).toISOString(),
      };
    } catch (error) {
      return reply.code(502).send({ error: 'live_login_failed', message: errorMessage(error) });
    }
  });

  // ── Broadcast settings — owner only ─────────────────────────────────────
  // Backs the `tiktok-live` module's admin surface. Secrets are never returned;
  // `toSettingsView` reports presence as `*_set` instead.

  fastify.get('/live/settings', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;

    try {
      const userId = await resolveLiveUserId(auth.storeId);
      if (userId === null) return notConnected(reply);

      const settings = await usersService.getUserSettings(userId);
      if (!settings) return reply.code(502).send({ error: 'live_settings_missing' });
      return toSettingsView(settings);
    } catch (error) {
      return reply.code(502).send({ error: 'live_settings_failed', message: errorMessage(error) });
    }
  });

  fastify.put('/live/settings', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;

    try {
      const userId = await resolveLiveUserId(auth.storeId);
      if (userId === null) return notConnected(reply);

      const body = request.body as usersService.UserSettingsPatch;
      const saved = await usersService.saveUserSettings(userId, body ?? {});
      return toSettingsView(saved);
    } catch (error) {
      const message = errorMessage(error);
      // Field-level validation from `saveUserSettings` is the caller's fault.
      if (message.includes('must be')) return reply.code(400).send({ error: message });
      return reply.code(502).send({ error: 'live_settings_failed', message });
    }
  });

  fastify.post('/live/settings/test-telegram', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;

    try {
      const userId = await resolveLiveUserId(auth.storeId);
      if (userId === null) return notConnected(reply);

      const settings = await usersService.getUserSettings(userId);
      if (!settings?.telegram_bot_token) {
        return reply.code(400).send({ ok: false, error: 'telegram_token_not_set' });
      }

      const res = await fetch(
        `https://api.telegram.org/bot${settings.telegram_bot_token}/getMe`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) {
        return reply.code(400).send({ ok: false, error: 'telegram_token_invalid' });
      }
      const json = (await res.json()) as { result?: { username?: string } };
      return { ok: true, username: json.result?.username ?? null };
    } catch (error) {
      return reply.code(502).send({ ok: false, error: errorMessage(error) });
    }
  });
}
