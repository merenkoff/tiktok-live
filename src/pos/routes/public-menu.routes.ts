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
//   /store/public-menu — the OWNER's switch. PATCH, because the till's client
//     reaches it through `posRequest`, which has no PUT, and it is a partial
//     update anyway. A dedicated endpoint rather than a field on `PATCH
//     /store`, which copies each column by hand (a forgotten line there once
//     made the florist's charge a silent no-op) — and because turning a menu
//     on also issues the token, a side effect a plain column write would not
//     have.
//
// Core, not a module: the till that owns the kitchen board opts in through
// `module_remotes`, so there is no `enabled_modules` entry to gate on. The
// owner's gate is `ensurePosOwner` plus a 409 for a store that has no kitchen.
// The HTML pages live in `public-menu/pages.routes.ts`, at the site's root.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ensurePosOwner } from '../core/auth.js';
import {
  GuestOrderConflict,
  GuestOrderError,
  GuestOrderNotFound,
  GuestOrderTooMany,
  cancelOwnGuestOrder,
  createGuestOrder,
  listOwnGuestOrders,
} from '../guest-orders.service.js';
import { loadGuestBill } from '../public-menu/guest-bill.js';
import {
  PublicMenuError,
  findMenuTable,
  getPublicMenuSettings,
  loadPublicMenu,
  rotatePublicMenuToken,
  setPublicMenuBill,
  setPublicMenuEnabled,
  setPublicMenuOrdering,
  type MenuTable,
} from '../public-menu/menu.service.js';
import { MENU_PAGE_HEADERS } from '../public-menu/render.js';
import { verifyTableKey } from '../public-menu/table-keys.js';

/** A guest's request for dishes answers with these statuses; anything else is a real 500. */
function sendGuestOrderError(reply: FastifyReply, error: unknown): unknown {
  if (error instanceof GuestOrderNotFound) return reply.code(404).send({ error: error.message });
  if (error instanceof GuestOrderTooMany) return reply.code(429).send({ error: error.message });
  if (error instanceof GuestOrderConflict) return reply.code(409).send({ error: error.message });
  if (error instanceof GuestOrderError) return reply.code(400).send({ error: error.message });
  throw error;
}

export function registerPublicMenuRoutes(fastify: FastifyInstance): void {
  /**
   * The store behind the token, the table behind `t`, and proof that this QR is
   * that table's (`k`) — or null after ONE 404 for every way of failing,
   * including the owner's ordering switch being off, so the response never says
   * which tokens, tables or switches exist.
   */
  async function guestContext(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const query = (request.query ?? {}) as { t?: unknown; k?: unknown };
    const found = await loadPublicMenu(token);
    const table: MenuTable | null =
      found && found.store.orderingEnabled ? await findMenuTable(found.store.id, query.t) : null;
    if (!found || !table || !(await verifyTableKey(found.store.id, table.id, query.k))) {
      reply.code(404).send({ error: 'Замовлення недоступне' });
      return null;
    }
    return { found, table };
  }

  fastify.get('/public/menu/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const found = await loadPublicMenu(token);
    if (!found) return reply.code(404).send({ error: 'Меню недоступне' });
    return found.menu;
  });

  // The bill of the guest's own table (phase Q5). Behind three checks that all
  // answer with the SAME 404 — a wrong or rotated token, a bill switch that is
  // off, a table or key that does not match — so the response never says which
  // tokens or tables exist. `t` and `k` are the two halves of what the table's
  // QR carries.
  fastify.get('/public/menu/:token/bill', async (request, reply) => {
    const { token } = request.params as { token: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const query = (request.query ?? {}) as { t?: unknown; k?: unknown };
    const found = await loadPublicMenu(token);
    const table = found && found.store.billEnabled ? await findMenuTable(found.store.id, query.t) : null;
    if (!found || !table || !(await verifyTableKey(found.store.id, table.id, query.k))) {
      return reply.code(404).send({ error: 'Рахунок недоступний' });
    }
    return loadGuestBill(found.store.id, table);
  });

  // A guest asks for dishes (phase Q6). Nothing here touches the bill: the
  // request waits for a waiter (`guest-orders.service.ts`). The body is capped
  // well under what thirty lines need, because this is unauthenticated.
  fastify.post('/public/menu/:token/orders', { bodyLimit: 8192 }, async (request, reply) => {
    const ctx = await guestContext(request, reply);
    if (!ctx) return;
    try {
      const view = await createGuestOrder(ctx.found.store.id, ctx.table, ctx.found.menu, (request.body ?? {}) as Record<string, unknown>);
      return reply.code(201).send(view);
    } catch (error) {
      return sendGuestOrderError(reply, error);
    }
  });

  fastify.get('/public/menu/:token/orders', async (request, reply) => {
    const ctx = await guestContext(request, reply);
    if (!ctx) return;
    const ids = (request.query as { ids?: unknown }).ids;
    return { orders: await listOwnGuestOrders(ctx.found.store.id, ctx.table, ids) };
  });

  fastify.post('/public/menu/:token/orders/:uuid/cancel', async (request, reply) => {
    const ctx = await guestContext(request, reply);
    if (!ctx) return;
    try {
      return await cancelOwnGuestOrder(ctx.found.store.id, ctx.table, (request.params as { uuid: string }).uuid);
    } catch (error) {
      return sendGuestOrderError(reply, error);
    }
  });

  fastify.get('/store/public-menu', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return getPublicMenuSettings(auth.storeId);
  });

  fastify.patch('/store/public-menu', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fields = ['enabled', 'bill_enabled', 'ordering_enabled'] as const;
    const given = fields.filter((field) => body[field] !== undefined);
    if (given.length === 0) {
      return reply.code(400).send({ error: 'Потрібне enabled, bill_enabled або ordering_enabled' });
    }
    if (given.some((field) => typeof body[field] !== 'boolean')) {
      return reply.code(400).send({ error: 'enabled, bill_enabled і ordering_enabled мають бути true або false' });
    }
    try {
      // One field per call is what the card sends; several at once apply in
      // order and the answer is the state after the last.
      let settings = null;
      if (given.includes('enabled')) settings = await setPublicMenuEnabled(auth.storeId, body.enabled as boolean);
      if (given.includes('bill_enabled')) settings = await setPublicMenuBill(auth.storeId, body.bill_enabled as boolean);
      if (given.includes('ordering_enabled')) {
        settings = await setPublicMenuOrdering(auth.storeId, body.ordering_enabled as boolean);
      }
      return settings;
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
