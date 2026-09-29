// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/public-menu.routes.ts — the guest menu's API side
// (TechDocs/POS_QR_MENU.md).
//
// Two very different audiences share this file, and the split is the point:
//
//   GET /public/menu/:token — a GUEST, no session. Read-only, no-store, and it
//     answers a wrong, rotated or switched-off token exactly like a token that
//     never existed. The page's script polls it for the stop-list.
//
//   /store/public-menu — the OWNER's switch. A dedicated endpoint rather than a
//     field on `PATCH /store`, which copies each column by hand (a forgotten
//     line there once made the florist's charge a silent no-op) — and because
//     turning a menu on also issues the token, which is a side effect a plain
//     column write would not have.
//
// Core, not a module: the till that owns the kitchen board opts in through
// `module_remotes`, so there is no `enabled_modules` entry to gate on. The
// owner's gate is `ensurePosOwner` plus a 409 for a store that has no kitchen.
// The HTML pages live in `public-menu/pages.routes.ts`, at the site's root.

import type { FastifyInstance } from 'fastify';
import { ensurePosOwner } from '../core/auth.js';
import {
  PublicMenuError,
  getPublicMenuSettings,
  loadPublicMenu,
  rotatePublicMenuToken,
  setPublicMenuEnabled,
} from '../public-menu/menu.service.js';
import { MENU_PAGE_HEADERS } from '../public-menu/render.js';

export function registerPublicMenuRoutes(fastify: FastifyInstance): void {
  fastify.get('/public/menu/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const found = await loadPublicMenu(token);
    if (!found) return reply.code(404).send({ error: 'Меню недоступне' });
    return found.menu;
  });

  fastify.get('/store/public-menu', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return getPublicMenuSettings(auth.storeId);
  });

  fastify.put('/store/public-menu', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled має бути true або false' });
    }
    try {
      return await setPublicMenuEnabled(auth.storeId, body.enabled);
    } catch (error) {
      if (error instanceof PublicMenuError) return reply.code(409).send({ error: error.message });
      throw error;
    }
  });

  fastify.post('/store/public-menu/rotate', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return await rotatePublicMenuToken(auth.storeId);
    } catch (error) {
      if (error instanceof PublicMenuError) return reply.code(409).send({ error: error.message });
      throw error;
    }
  });
}
