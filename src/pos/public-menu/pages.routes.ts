// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/pages.routes.ts — /m/<token> and /m/<token>/qr.
//
// Registered at the site's ROOT (from `registerPosPlugin`), not under
// `/api/pos`: this is the address printed on a table, and it must stay the
// address whatever answers behind it. Same-origin with `/pos-uploads/*` and
// `public/demo-*`, so the pictures need no CORS and no absolute URLs.
//
// Both routes answer an unusable token with the same 404 page, marked
// `no-store` so a rotated QR never lingers in a phone's cache.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { loadPublicMenu } from './menu.service.js';
import { MENU_PAGE_HEADERS, renderMenuPage, renderQrCard, renderUnavailable } from './render.js';

function sendPage(reply: FastifyReply, status: number, html: string) {
  return reply.code(status).headers(MENU_PAGE_HEADERS).send(html);
}

export function registerPublicMenuPages(fastify: FastifyInstance): void {
  fastify.get('/m/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    return sendPage(reply, 200, renderMenuPage(found.menu, token));
  });

  fastify.get('/m/:token/qr', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    return sendPage(reply, 200, renderQrCard(found.store.name, token));
  });
}
