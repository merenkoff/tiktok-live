// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/remote-kitchen.routes.ts — «Віддалена кухня» (migration 117,
// TechDocs/POS_REMOTE_KITCHEN.md §11).
//
// Core, like `guest-orders.routes.ts`: the till and kitchen screens arrive as
// online modules through `module_remotes`, so there is no `enabled_modules`
// entry to gate on. The gate is the LINK itself: a store with no link gets a
// 404 from every order route, and a link is written only by the super-admin.
//
// Three audiences:
//   the cafe till and the kitchen screen — `ensurePosAuth` (a cook and a
//   cashier are both sellers); the service checks which side of an order the
//   caller's store is on;
//   the cafe owner — `ensurePosOwner`, the link's settings and which dishes
//   are cooked in the kitchen;
//   the super-admin — `ensureSuper`, creating and revoking links.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import { ensureSuper } from '../core/superAuth.js';
import * as rk from '../remote-kitchen.service.js';
import * as rkPrint from '../remote-kitchen-print.service.js';
import { readDeviceId } from './_shared.js';

function idOf(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sendError(reply: FastifyReply, error: unknown): unknown {
  if (error instanceof rk.RemoteKitchenLineProblem) {
    return reply
      .code(409)
      .send({ error: error.message, cafe_variant_id: error.cafeVariantId, problem: error.problem });
  }
  if (error instanceof rk.RemoteKitchenPaused) {
    return reply.code(409).send({ error: error.message, paused: true, kitchen_phone: error.kitchenPhone });
  }
  if (error instanceof rk.RemoteKitchenNotFound) return reply.code(404).send({ error: error.message });
  if (error instanceof rk.RemoteKitchenConflict) return reply.code(409).send({ error: error.message });
  if (error instanceof rk.RemoteKitchenError) return reply.code(400).send({ error: error.message });
  throw error;
}

/** What a cafe screen may know about its link: no internal ids of the kitchen's staff, nothing of its catalogue. */
function cafeLinkView(link: rk.KitchenLink) {
  return {
    id: link.id,
    status: link.status,
    kitchen_title: link.kitchen_title,
    kitchen_phone: link.kitchen_phone,
    transit_minutes: link.transit_minutes,
    answer_seconds: link.answer_seconds,
    quote_ttl_seconds: link.quote_ttl_seconds,
    auto_confirm_max_min: link.auto_confirm_max_min,
  };
}

type Body = Record<string, unknown>;

export function registerRemoteKitchenRoutes(fastify: FastifyInstance): void {
  // Everything a screen needs to know before the first order: am I a cafe with
  // a kitchen (and which of my dishes go there), am I a kitchen (and is it
  // accepting). Both null = the feature is not set up for this store.
  fastify.get('/remote-kitchen/setup', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    const asCafe = link
      ? {
          link: cafeLinkView(link),
          kitchen: await rk.getKitchenStatus(link.kitchen_store_id),
          items: (await rk.listLinkItems(link.id)).map((item) => ({
            cafe_variant_id: item.cafe_variant_id,
            prep_minutes: item.prep_minutes,
          })),
        }
      : null;
    const kitchenLinks = await rk.listLinksForKitchen(auth.storeId);
    const asKitchen =
      kitchenLinks.length > 0
        ? {
            status: await rk.getKitchenStatus(auth.storeId),
            cafes: kitchenLinks.map((l) => ({ link_id: l.id, cafe_store_id: l.cafe_store_id, status: l.status })),
          }
        : null;
    return { as_cafe: asCafe, as_kitchen: asKitchen };
  });

  // The kitchen's «Пауза прийому» and «Черга зараз». Any of the kitchen's people.
  fastify.put('/remote-kitchen/status', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    if ((await rk.listLinksForKitchen(auth.storeId)).length === 0) {
      return reply.code(404).send({ error: 'Цей магазин не є кухнею для кафе' });
    }
    try {
      return await rk.setKitchenStatus(
        { storeId: auth.storeId, staffId: auth.staffId },
        (request.body ?? {}) as rk.KitchenStatusInput
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // ── orders ──────────────────────────────────────────────────────

  fastify.get('/remote-kitchen/orders', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const side = (request.query as { side?: unknown }).side;
    if (side !== 'cafe' && side !== 'kitchen') return reply.code(400).send({ error: 'side: cafe або kitchen' });
    // `now`: the kitchen's strip counts down to the cafe's deadline on the
    // server's clock, not the tablet's.
    return { orders: await rk.listOrders(auth.storeId, side), now: new Date().toISOString() };
  });

  fastify.get('/remote-kitchen/orders/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Замовлення кухні не знайдено' });
    try {
      return await rk.getOrder(auth.storeId, id);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/remote-kitchen/orders/:id/events', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Замовлення кухні не знайдено' });
    try {
      return { events: await rk.listEvents(auth.storeId, id) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // The till asks. 201 for a new request, 200 when the uuid was seen before.
  fastify.post('/remote-kitchen/orders', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as rk.CreateRemoteOrderInput;
    try {
      const { order, created } = await rk.createOrder({ storeId: auth.storeId, staffId: auth.staffId }, body);
      return reply.code(created ? 201 : 200).send(order);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // One handler per step: each takes the order id and the body, and names the side in the service.
  const steps: Array<{
    path: string;
    method: 'POST' | 'PUT';
    run: (actor: rk.Actor, id: number, body: Body) => Promise<rk.RemoteOrderView>;
  }> = [
    // the cafe
    { path: 'items', method: 'PUT', run: (a, id, b) => rk.reviseOrder(a, id, b) },
    { path: 'phone-quote', method: 'POST', run: (a, id, b) => rk.recordPhoneQuote(a, id, b) },
    { path: 'guest-declined', method: 'POST', run: (a, id) => rk.guestDeclined(a, id) },
    { path: 'paid', method: 'POST', run: (a, id, b) => rk.markPaid(a, id, b) },
    { path: 'arrived', method: 'POST', run: (a, id) => rk.markArrived(a, id) },
    { path: 'handed', method: 'POST', run: (a, id) => rk.markHandedOver(a, id) },
    // the kitchen
    { path: 'quote', method: 'POST', run: (a, id, b) => rk.kitchenQuote(a, id, b) },
    { path: 'decline', method: 'POST', run: (a, id, b) => rk.kitchenDecline(a, id, b) },
    { path: 'ready', method: 'POST', run: (a, id) => rk.markReady(a, id) },
    { path: 'dispatched', method: 'POST', run: (a, id) => rk.markDispatched(a, id) },
    { path: 'delay', method: 'POST', run: (a, id, b) => rk.delayOrder(a, id, b) },
    // either side
    { path: 'cancel', method: 'POST', run: (a, id, b) => rk.cancelPaid(a, id, b) },
  ];
  for (const step of steps) {
    fastify.route({
      method: step.method,
      url: `/remote-kitchen/orders/:id/${step.path}`,
      handler: async (request, reply) => {
        const auth = await ensurePosAuth(request, reply);
        if (!auth) return;
        const id = idOf((request.params as { id: string }).id);
        if (id == null) return reply.code(404).send({ error: 'Замовлення кухні не знайдено' });
        try {
          return await step.run({ storeId: auth.storeId, staffId: auth.staffId }, id, (request.body ?? {}) as Body);
        } catch (error) {
          return sendError(reply, error);
        }
      },
    });
  }

  // ── the kitchen's printer (РК3) ─────────────────────────────────

  // The kitchen's desktop takes the tickets of paid orders, as it takes a
  // table's rounds from `/kitchen/print-queue`. A store that is no kitchen
  // simply has none.
  fastify.get('/remote-kitchen/print-queue', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = readDeviceId(request);
    if (!deviceId) {
      return reply.code(400).send({
        error: 'device_id_required',
        message: 'Потрібен заголовок X-POS-Device-ID (касовий застосунок)',
      });
    }
    const rawKinds = String((request.query as { kinds?: unknown }).kinds ?? '').trim();
    const kinds = rawKinds ? rawKinds.split(',').map((s) => s.trim()) : ['fire', 'cancel'];
    if (!kinds.every(rkPrint.isRemotePrintKind)) {
      return reply.code(400).send({ error: 'Вид тікета — «fire» або «cancel»' });
    }
    return {
      jobs: await rkPrint.claimRemotePrintJobs(auth.storeId, deviceId, [
        ...new Set(kinds as rkPrint.RemotePrintKind[]),
      ]),
    };
  });

  fastify.post('/remote-kitchen/print-queue/:orderId/printed', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const orderId = idOf((request.params as { orderId: string }).orderId);
    const kind = (request.query as { kind?: unknown }).kind ?? 'fire';
    if (orderId == null || !rkPrint.isRemotePrintKind(kind)) {
      return reply.code(404).send({ error: 'Тікет не знайдено' });
    }
    if (!(await rkPrint.markRemotePrinted(auth.storeId, orderId, kind))) {
      return reply.code(404).send({ error: 'Тікет не знайдено' });
    }
    return { ok: true };
  });

  // The kitchen's «Точки»: its cafes and which of its own dishes each sells.
  fastify.get('/remote-kitchen/kitchen/cafes', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const cafes = await rk.listCafesForKitchen(auth.storeId);
    if (cafes.length === 0) return reply.code(404).send({ error: 'Цей магазин не є кухнею для кафе' });
    return { cafes, status: await rk.getKitchenStatus(auth.storeId) };
  });

  // ── the cafe owner's settings (§11 «Налаштування зв'язки») ────────

  fastify.patch('/remote-kitchen/link', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    if (!link) return reply.code(404).send({ error: 'У цього магазину немає віддаленої кухні' });
    try {
      const updated = await rk.updateLink(link.id, (request.body ?? {}) as rk.LinkSettingsInput, {
        cafeStoreId: auth.storeId,
      });
      return cafeLinkView(updated);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/remote-kitchen/link/items', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    if (!link) return reply.code(404).send({ error: 'У цього магазину немає віддаленої кухні' });
    return { items: await rk.listLinkItems(link.id) };
  });

  // What the owner picks from: the kitchen's dishes, names and times only.
  fastify.get('/remote-kitchen/link/dishes', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    if (!link) return reply.code(404).send({ error: 'У цього магазину немає віддаленої кухні' });
    return { dishes: await rk.listKitchenDishes(link) };
  });

  fastify.put('/remote-kitchen/link/items/:variantId', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    if (!link) return reply.code(404).send({ error: 'У цього магазину немає віддаленої кухні' });
    const cafeVariantId = idOf((request.params as { variantId: string }).variantId);
    const kitchenVariantId = idOf(((request.body ?? {}) as Body).kitchen_variant_id);
    if (cafeVariantId == null || kitchenVariantId == null) {
      return reply.code(400).send({ error: 'Вкажіть страву кафе і страву кухні' });
    }
    try {
      await rk.setLinkItem(link, cafeVariantId, kitchenVariantId);
      return { items: await rk.listLinkItems(link.id) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // «Імпорт меню кухні»: the picked dishes become the cafe's cards, each at
  // the cafe's own price, and are marked at once.
  fastify.post('/remote-kitchen/link/import', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    if (!link) return reply.code(404).send({ error: 'У цього магазину немає віддаленої кухні' });
    try {
      const result = await rk.importKitchenDishes(link, ((request.body ?? {}) as Body).dishes);
      return { ...result, items: await rk.listLinkItems(link.id) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/remote-kitchen/link/items/:variantId', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const link = await rk.findLinkForCafe(auth.storeId);
    if (!link) return reply.code(404).send({ error: 'У цього магазину немає віддаленої кухні' });
    const cafeVariantId = idOf((request.params as { variantId: string }).variantId);
    if (cafeVariantId == null) return reply.code(400).send({ error: 'Некоректна страва' });
    await rk.removeLinkItem(link, cafeVariantId);
    return { items: await rk.listLinkItems(link.id) };
  });

  // ── super-admin: who may ask whom ────────────────────────────────

  fastify.post('/super/remote-kitchen/links', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    try {
      const link = await rk.createLink((request.body ?? {}) as rk.CreateLinkInput);
      return reply.code(201).send(link);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Both ends of every link a store has, for its card in the super-admin.
  fastify.get('/super/remote-kitchen/links', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const storeId = idOf((request.query as { store_id?: string }).store_id);
    if (storeId == null) return reply.code(400).send({ error: 'Вкажіть магазин' });
    return { links: await rk.listLinksForStore(storeId) };
  });

  fastify.patch('/super/remote-kitchen/links/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Зв’язку з кухнею не знайдено' });
    try {
      return await rk.updateLink(id, (request.body ?? {}) as rk.LinkSettingsInput, { allowRevoke: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
