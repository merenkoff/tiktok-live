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
//
// `&k=<table key>` (phase Q5) is what lets that guest read the table's bill.
// A missing, wrong or foreign key is the same as no key: the menu opens with
// the caption and no bill bar. The key is written into a QR only by the print
// pages, and only when the request carries the owner's signed `?p=` link —
// the store token in the path is visible to every guest, so it cannot be what
// hands table keys out.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findMenuTable, listMenuTables, loadPublicMenu } from './menu.service.js';
import { getTableKeys, verifyPrintLink, verifyTableKey } from './table-keys.js';
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

const queryParam = (request: FastifyRequest, name: 't' | 'k' | 'p'): unknown =>
  (request.query as Record<string, unknown> | undefined)?.[name];

export function registerPublicMenuPages(fastify: FastifyInstance): void {
  fastify.get('/m/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    const table = await findMenuTable(found.store.id, queryParam(request, 't'));
    const bill =
      found.store.billEnabled && table !== null && (await verifyTableKey(found.store.id, table.id, queryParam(request, 'k')));
    return sendPage(reply, 200, renderMenuPage(found.menu, token, table, { bill }));
  });

  fastify.get('/m/:token/qr', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    const table = await findMenuTable(found.store.id, queryParam(request, 't'));
    const keyed = table !== null && (await verifyPrintLink(found.store.id, queryParam(request, 'p')));
    const key = keyed && table ? (await getTableKeys(found.store.id)).get(table.id) : undefined;
    return sendPage(
      reply,
      200,
      renderQrCard(found.store.name, token, table, { key, missingKey: found.store.billEnabled && !keyed })
    );
  });

  fastify.get('/m/:token/tables', async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = await loadPublicMenu(token);
    if (!found) return sendPage(reply, 404, renderUnavailable());
    const tables = await listMenuTables(found.store.id);
    const keyed = tables.length > 0 && (await verifyPrintLink(found.store.id, queryParam(request, 'p')));
    const keys = keyed ? await getTableKeys(found.store.id) : undefined;
    return sendPage(
      reply,
      200,
      renderTablesSheet(found.store.name, token, tables, { keys, missingKey: found.store.billEnabled && !keyed })
    );
  });
}
