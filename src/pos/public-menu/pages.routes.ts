// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/pages.routes.ts — /m/<token>, /m/<token>/qr and
// /m/<token>/tables.
//
// Registered at the site's ROOT (from `registerPosPlugin`), not under
// `/api/pos`: this is the address printed on a table, and it must stay the
// address whatever answers behind it. Same-origin with `/pos-uploads/*` and
// `public/demo-*`, so the pictures need no CORS and no absolute URLs.
//
// All three answer an unusable token with the same 404 page, marked
// `no-store` so a rotated QR never lingers in a phone's cache.
//
// `?t=<table id>` (phase Q2) says which table's QR was scanned. It only ever
// changes a caption: a foreign, retired or junk id is ignored and the plain
// menu opens — a QR on a table that was deleted last month must not turn into
// an error page in front of a guest.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findMenuTable, listMenuTables, loadPublicMenu } from './menu.service.js';
import {
  MENU_PAGE_HEADERS,
  renderMenuPage,
  renderQrCard,
  renderTablesSheet,
  renderUnavailable,
} from './render.js';

function sendPage(reply: FastifyReply, status: number, html: string) {
  return reply.code(status).headers(MENU_PAGE_HEADERS).send(html);
}

const tableParam = (request: FastifyRequest): unknown => (request.query as { t?: unknown } | undefined)?.t;

export function registerPublicMenuPages(fastify: FastifyInstance): void {
  fastify.get('/m/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    const table = await findMenuTable(found.store.id, tableParam(request));
    return sendPage(reply, 200, renderMenuPage(found.menu, token, table));
  });

  fastify.get('/m/:token/qr', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    const table = await findMenuTable(found.store.id, tableParam(request));
    return sendPage(reply, 200, renderQrCard(found.store.name, token, table));
  });

  fastify.get('/m/:token/tables', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    const tables = await listMenuTables(found.store.id);
    return sendPage(reply, 200, renderTablesSheet(found.store.name, token, tables));
  });
}
