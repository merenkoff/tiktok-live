// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/bottles.routes.ts — the bar's open bottles (track ДК, ДК5-Б,
// TechDocs/POS_DUAL_REGISTER.md §4.4).
//
// Core, like the kitchen board: the screen that draws it is the till's own,
// and whether a store has bottles at all is its catalogue's business
// (`pos_variants.bottle_ml`), not a module switch. Staff level for everything
// the bartender does at the counter — scan a new bottle's stamp, replace one
// that ran out early, close a broken one, note what was left — because the
// owner is not there at 23:00; the report over a period is the owner's.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import * as bottles from '../bottles.service.js';
import { ExciseError } from '../excise.js';
import { errorMessage } from './_shared.js';

function idOf(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sendError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof bottles.BottleError) {
    return reply.code(error.status).send({ error: errorMessage(error) });
  }
  // A stamp that is not one, or already sold: the bartender's sentence in `error`.
  if (error instanceof ExciseError) {
    return reply.code(error.status).send({ error: errorMessage(error), code: error.code, ...error.detail });
  }
  throw error;
}

function dayOf(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
}

export function registerBottleRoutes(fastify: FastifyInstance): void {
  fastify.get('/bottles', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return bottles.listBottles(auth.storeId);
  });

  fastify.get('/bottles/report', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const query = request.query as { from?: unknown; to?: unknown };
    const from = dayOf(query.from);
    const to = dayOf(query.to);
    if (!from || !to || to < from) {
      return reply.code(400).send({ error: 'Вкажіть період: from і to як РРРР-ММ-ДД' });
    }
    return bottles.bottleReport(auth.storeId, from, new Date(to.getTime() + 86_400_000));
  });

  // The bar scans a new bottle's stamp; `replace` when the old one ran out
  // before its count did — the difference is written off.
  fastify.post('/bottles/open', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { variant_id?: unknown; excise_label?: unknown; replace?: unknown; note?: unknown };
    const variantId = Number(body.variant_id);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      return reply.code(400).send({ error: 'Вкажіть, яку пляшку відкривають' });
    }
    try {
      const opened = await bottles.openAtBar({
        storeId: auth.storeId,
        staffId: auth.staffId,
        variantId,
        label: body.excise_label,
        replace: body.replace === true,
        note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
      });
      return reply.code(opened.replayed ? 200 : 201).send({ ...opened, ...(await bottles.listBottles(auth.storeId)) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/bottles/:id/broken', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (!id) return reply.code(404).send({ error: 'Пляшку не знайдено' });
    const body = (request.body ?? {}) as { note?: unknown };
    try {
      await bottles.closeBroken({
        storeId: auth.storeId,
        staffId: auth.staffId,
        bottleId: id,
        note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
      });
      return bottles.listBottles(auth.storeId);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/bottles/:id/leftover', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (!id) return reply.code(404).send({ error: 'Пляшку не знайдено' });
    const body = (request.body ?? {}) as { ml?: unknown };
    try {
      await bottles.recordLeftover({ storeId: auth.storeId, staffId: auth.staffId, bottleId: id, ml: body.ml });
      return bottles.listBottles(auth.storeId);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
