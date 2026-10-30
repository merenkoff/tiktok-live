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
//   /store/profile, /store/logo — the OWNER's card for the place itself: logo,
//     address, phone, opening hours (phase Q3a). Its own endpoints for the same
//     reason as the switch below, and because the logo is a file: an owner-only
//     upload that does not need the `products` module the till's `/uploads`
//     asks for — settings are core, reachable with every module switched off.
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
  GuestFeedbackError,
  GuestFeedbackTooMany,
  createFeedback,
  getOwnFeedback,
} from '../guest-feedback.service.js';
import {
  WaiterCallError,
  WaiterCallTooSoon,
  cancelOwnCall,
  createCall,
  listOwnCalls,
} from '../waiter-calls.service.js';
import {
  AUTO_KITCHEN_MODES,
  PublicMenuBadRequest,
  PublicMenuError,
  findMenuStore,
  findMenuTable,
  getPublicMenuSettings,
  getStoreProfile,
  loadPublicMenu,
  rotatePublicMenuToken,
  setPublicMenuAutoKitchen,
  setPublicMenuAutoLimit,
  setPublicMenuBill,
  setPublicMenuCall,
  setPublicMenuEnabled,
  setPublicMenuFeedback,
  setPublicMenuOrdering,
  setPublicMenuSlug,
  type AutoKitchenMode,
  updateStoreProfile,
  type MenuTable,
} from '../public-menu/menu.service.js';
import { PROFILE_FIELDS, ProfileError, normalizeProfilePatch } from '../public-menu/profile.js';
import { MENU_PAGE_HEADERS } from '../public-menu/render.js';
import { verifyTableKey } from '../public-menu/table-keys.js';
import { saveProductImage } from '../uploads.service.js';
import { errorMessage } from './_shared.js';

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

  /**
   * The same three proofs as `guestContext`, for a call (phase Q8): the store,
   * the table, the key — and the owner's CALL switch rather than the ordering
   * one, with the same single 404 for every way of failing.
   */
  async function callContext(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const query = (request.query ?? {}) as { t?: unknown; k?: unknown };
    // The store row is enough — a call needs no dishes, so the menu is not built.
    const store = await findMenuStore(token);
    const table: MenuTable | null = store && store.callEnabled ? await findMenuTable(store.id, query.t) : null;
    if (!store || !table || !(await verifyTableKey(store.id, table.id, query.k))) {
      reply.code(404).send({ error: 'Виклик недоступний' });
      return null;
    }
    return { storeId: store.id, table };
  }

  function sendCallError(reply: FastifyReply, error: unknown): unknown {
    if (error instanceof WaiterCallTooSoon) return reply.code(429).send({ error: error.message });
    if (error instanceof WaiterCallError) return reply.code(400).send({ error: error.message });
    throw error;
  }

  // A guest calls a waiter or asks for the bill (phase Q8). A second tap while
  // the call is live answers with the same call.
  fastify.post('/public/menu/:token/calls', { bodyLimit: 1024 }, async (request, reply) => {
    const ctx = await callContext(request, reply);
    if (!ctx) return;
    try {
      const view = await createCall(ctx.storeId, ctx.table, (request.body as { kind?: unknown } | undefined)?.kind);
      return reply.code(201).send(view);
    } catch (error) {
      return sendCallError(reply, error);
    }
  });

  fastify.get('/public/menu/:token/calls', async (request, reply) => {
    const ctx = await callContext(request, reply);
    if (!ctx) return;
    return { calls: await listOwnCalls(ctx.storeId, ctx.table) };
  });

  fastify.post('/public/menu/:token/calls/:kind/cancel', async (request, reply) => {
    const ctx = await callContext(request, reply);
    if (!ctx) return;
    try {
      return await cancelOwnCall(ctx.storeId, ctx.table, (request.params as { kind: string }).kind);
    } catch (error) {
      return sendCallError(reply, error);
    }
  });

  // A guest's feedback (phase F3). No key needed — it acts on nothing — but a
  // table proven by its key is attached, with its open bill. The owner's
  // switch off is the same 404 as a wrong token.
  fastify.post('/public/menu/:token/feedback', { bodyLimit: 4096 }, async (request, reply) => {
    const { token } = request.params as { token: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const store = await findMenuStore(token);
    if (!store || !store.feedbackEnabled) return reply.code(404).send({ error: 'Відгуки недоступні' });
    const query = (request.query ?? {}) as { t?: unknown; k?: unknown };
    let table: MenuTable | null = null;
    if (query.t !== undefined) {
      const found = await findMenuTable(store.id, query.t);
      if (found && (await verifyTableKey(store.id, found.id, query.k))) table = found;
    }
    try {
      const { view, created } = await createFeedback(store.id, table, request.body ?? {});
      return reply.code(created ? 201 : 200).send(view);
    } catch (error) {
      if (error instanceof GuestFeedbackTooMany) return reply.code(429).send({ error: error.message });
      if (error instanceof GuestFeedbackError) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  fastify.get('/public/menu/:token/feedback/:uuid', async (request, reply) => {
    const { token, uuid } = request.params as { token: string; uuid: string };
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', MENU_PAGE_HEADERS['X-Robots-Tag']!);
    const store = await findMenuStore(token);
    const view = store && store.feedbackEnabled ? await getOwnFeedback(store.id, uuid) : null;
    if (!view) return reply.code(404).send({ error: 'Відгук не знайдено' });
    return view;
  });

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
      const view = await createGuestOrder(
        ctx.found.store.id,
        ctx.table,
        ctx.found.menu,
        (request.body ?? {}) as Record<string, unknown>,
        // Phase Q9: the owner's auto-send, as the cached store row has it.
        { mode: ctx.found.store.autoKitchen, limitCents: ctx.found.store.autoLimitCents }
      );
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
    const switches = ['enabled', 'slug_enabled', 'bill_enabled', 'ordering_enabled', 'call_enabled', 'feedback_enabled'] as const;
    const given = switches.filter((field) => body[field] !== undefined);
    const autoGiven = body.auto_kitchen !== undefined;
    const limitGiven = body.auto_limit_cents !== undefined;
    if (given.length === 0 && !autoGiven && !limitGiven) {
      return reply.code(400).send({
        error:
          'Потрібне enabled, slug_enabled, bill_enabled, ordering_enabled, call_enabled, feedback_enabled, auto_kitchen або auto_limit_cents',
      });
    }
    if (given.some((field) => typeof body[field] !== 'boolean')) {
      return reply
        .code(400)
        .send({
          error: 'enabled, slug_enabled, bill_enabled, ordering_enabled, call_enabled і feedback_enabled мають бути true або false',
        });
    }
    if (autoGiven && !AUTO_KITCHEN_MODES.includes(body.auto_kitchen as AutoKitchenMode)) {
      return reply.code(400).send({ error: 'auto_kitchen має бути off, reorders або all' });
    }
    if (body.auto_kitchen_ack !== undefined && typeof body.auto_kitchen_ack !== 'boolean') {
      return reply.code(400).send({ error: 'auto_kitchen_ack має бути true або false' });
    }
    if (limitGiven && !Number.isInteger(body.auto_limit_cents)) {
      return reply.code(400).send({ error: 'auto_limit_cents має бути цілим числом копійок' });
    }
    try {
      // One field per call is what the card sends; several at once apply in
      // order and the answer is the state after the last. Ordering goes before
      // auto-sending, so «ordering on + reorders» in one call works, and the
      // limit before the mode, so a raised mode never runs on the old limit.
      let settings = null;
      if (given.includes('enabled')) settings = await setPublicMenuEnabled(auth.storeId, body.enabled as boolean);
      if (given.includes('slug_enabled')) settings = await setPublicMenuSlug(auth.storeId, body.slug_enabled as boolean);
      if (given.includes('bill_enabled')) settings = await setPublicMenuBill(auth.storeId, body.bill_enabled as boolean);
      if (given.includes('ordering_enabled')) {
        settings = await setPublicMenuOrdering(auth.storeId, body.ordering_enabled as boolean);
      }
      if (given.includes('call_enabled')) settings = await setPublicMenuCall(auth.storeId, body.call_enabled as boolean);
      if (given.includes('feedback_enabled')) {
        settings = await setPublicMenuFeedback(auth.storeId, body.feedback_enabled as boolean);
      }
      if (limitGiven) settings = await setPublicMenuAutoLimit(auth.storeId, body.auto_limit_cents as number);
      if (autoGiven) {
        settings = await setPublicMenuAutoKitchen(
          auth.storeId,
          auth.staffId,
          body.auto_kitchen as AutoKitchenMode,
          body.auto_kitchen_ack === true
        );
      }
      return settings;
    } catch (error) {
      // The owner skipped the risks or typed a limit out of range: something
      // to fix in the request, not a state the store is in.
      if (error instanceof PublicMenuBadRequest) return reply.code(400).send({ error: error.message });
      if (error instanceof PublicMenuError) return reply.code(409).send({ error: error.message });
      throw error;
    }
  });

  fastify.get('/store/profile', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return getStoreProfile(auth.storeId);
  });

  // A field left out is left alone; `null` clears it. Every value is checked
  // before anything is written, so a bad phone cannot half-save the hours.
  fastify.patch('/store/profile', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!PROFILE_FIELDS.some((field) => body[field] !== undefined)) {
      return reply.code(400).send({ error: 'Потрібне logo_url, address, phone або hours' });
    }
    try {
      return await updateStoreProfile(auth.storeId, normalizeProfilePatch(body));
    } catch (error) {
      if (error instanceof ProfileError) return reply.code(400).send({ error: error.message });
      if (error instanceof PublicMenuError) return reply.code(409).send({ error: error.message });
      throw error;
    }
  });

  // Only stores the file; `PATCH /store/profile` is what makes it the logo, so
  // an upload the owner abandons changes nothing on the guest's page.
  fastify.post('/store/logo', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: 'file required' });
      const saved = await saveProductImage(file);
      return reply.code(201).send(saved);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
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
