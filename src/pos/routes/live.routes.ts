// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/live.routes.ts — the POS → TikTok-LIVE auth bridge.
//
// LAYERING NOTE. The POS plugin does not otherwise reach into the LIVE
// automation core; this file is the one deliberate, localised exception, and
// the import below (`loginUser`) is its entire surface. It exists so the
// `tiktok-live` feature module can show the live comment feed inside the POS
// shell without making the operator log into a second system: an authenticated
// POS session is exchanged for a LIVE token minted for the TikTok account the
// store owner connected in Settings (`pos_stores.live_tiktok_username`).
//
// Both route trees are registered into the same Fastify instance (`src/api.ts`)
// and share one `AUTH_SECRET` and one `pool`, so this is an in-process call. If
// the POS backend is ever split out, this handler becomes an HTTP call to the
// LIVE service's `POST /api/auth/login` and nothing else changes.
//
// Access level: any authenticated staff member, not owner-only. The operator
// running the broadcast is a seller. The sensitive act — connecting the store
// to a TikTok account at all — stays owner-only in `PATCH /api/pos/store`.
//
// Consequence worth knowing: one LIVE user per store means one shared session.
// `sessionManager` is keyed by LIVE `user_id`, so every staff member who mints
// a token drives the same broadcast, and anyone's "stop" stops it for all.
//
// See TechDocs/POS_LIVE_SELLING_MODULE.md.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import { pool } from '../../db.js';
import { loginUser } from '../../core/auth.js';
import { errorMessage } from './_shared.js';

/** Mirrors `TOKEN_TTL_MS` in `src/core/auth.ts` — advisory, for the client's pre-emptive re-mint. */
const LIVE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function registerLiveRoutes(fastify: FastifyInstance): void {
  fastify.post('/live/session-token', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;

    const { rows } = await pool.query(
      `SELECT live_tiktok_username FROM pos_stores WHERE id = $1`,
      [auth.storeId]
    );
    const nickname = (rows[0]?.live_tiktok_username as string | null)?.trim();
    if (!nickname) {
      return reply.code(409).send({
        error: 'live_not_configured',
        message: 'Магазин не під’єднано до TikTok LIVE. Вкажіть нікнейм у Налаштуваннях.',
      });
    }

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
}
