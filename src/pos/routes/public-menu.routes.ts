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

import type { FastifyInstance } from 'fastify';
import { ensurePosOwner } from '../core/auth.js';
import { loadGuestBill } from '../public-menu/guest-bill.js';
import {
  PublicMenuError,
  findMenuTable,
  getPublicMenuSettings,
  loadPublicMenu,
  rotatePublicMenuToken,
  setPublicMenuBill,
  setPublicMenuEnabled,
} from '../public-menu/menu.service.js';
import { MENU_PAGE_HEADERS } from '../public-menu/render.js';
import { verifyTableKey } from '../public-menu/table-keys.js';

export function registerPublicMenuRoutes(fastify: FastifyInstance): void {
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

  fastify.get('/store/public-menu', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return getPublicMenuSettings(auth.storeId);
  });

  fastify.patch('/store/public-menu', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { enabled?: unknown; bill_enabled?: unknown };
    const hasEnabled = body.enabled !== undefined;
    const hasBill = body.bill_enabled !== undefined;
    if (!hasEnabled && !hasBill) {
      return reply.code(400).send({ error: 'Потрібне enabled або bill_enabled' });
    }
    if ((hasEnabled && typeof body.enabled !== 'boolean') || (hasBill && typeof body.bill_enabled !== 'boolean')) {
      return reply.code(400).send({ error: 'enabled і bill_enabled мають бути true або false' });
    }
    try {
      // One field per call is what the card sends; both at once apply in order
      // and the answer is the state after the last.
      let settings = null;
      if (hasEnabled) settings = await setPublicMenuEnabled(auth.storeId, body.enabled as boolean);
      if (hasBill) settings = await setPublicMenuBill(auth.storeId, body.bill_enabled as boolean);
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
