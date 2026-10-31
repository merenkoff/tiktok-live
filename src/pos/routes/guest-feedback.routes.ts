// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/guest-feedback.routes.ts — the OWNER's side of what guests
// wrote from the QR menu (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F4). The
// guest's side — sending one — is in `public-menu.routes.ts`.
//
// Owner-only (`ensurePosOwner`): the rows carry the guest's call-back phone,
// which a waiter has no business with. Core rather than a module: the guest
// menu is the café's, and that store opts in through `module_remotes`, so
// there is no `enabled_modules` entry to gate on. A store with no feedback
// simply reads an empty list; the page says how to switch it on.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import {
  LIST_LIMIT_MAX,
  feedbackSummary,
  listFeedback,
  setFeedbackHandled,
  type FeedbackListQuery,
} from '../guest-feedback.service.js';
import { badRange } from './analytics.routes.js';

export function registerGuestFeedbackRoutes(fastify: FastifyInstance): void {
  // A WAITER's «Бачу» on a low score from a table (phase F6): the card leaves
  // the hall map, and the owner sees the feedback handled under that waiter's
  // name — walking over to the table is handling it. Idempotent.
  fastify.post('/feedback/:id/seen', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(404).send({ error: 'Відгук не знайдено' });
    const row = await setFeedbackHandled(auth.storeId, id, auth.staffId, true);
    if (!row) return reply.code(404).send({ error: 'Відгук не знайдено' });
    return { seen: true, handled_at: row.handled_at };
  });

  fastify.get('/feedback', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as Record<string, string | undefined>;
    const bad = badRange(q);
    if (bad) return reply.code(400).send({ error: bad });
    const query: FeedbackListQuery = { from: q.from, to: q.to };
    if (q.score !== undefined) {
      const score = Number(q.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) return reply.code(400).send({ error: 'score має бути від 1 до 5' });
      query.score = score;
    }
    if (q.handled !== undefined) {
      if (q.handled !== 'true' && q.handled !== 'false') return reply.code(400).send({ error: 'handled має бути true або false' });
      query.handled = q.handled === 'true';
    }
    if (q.limit !== undefined) {
      const limit = Number(q.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > LIST_LIMIT_MAX) {
        return reply.code(400).send({ error: `limit має бути від 1 до ${LIST_LIMIT_MAX}` });
      }
      query.limit = limit;
    }
    if (q.offset !== undefined) {
      const offset = Number(q.offset);
      if (!Number.isInteger(offset) || offset < 0) return reply.code(400).send({ error: 'offset має бути цілим числом' });
      query.offset = offset;
    }
    return listFeedback(auth.storeId, query);
  });

  fastify.get('/feedback/summary', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as { from?: string; to?: string };
    const bad = badRange(q);
    if (bad) return reply.code(400).send({ error: bad });
    return feedbackSummary(auth.storeId, q);
  });

  // «Опрацьовано», or back to waiting with `{ handled: false }`. Marking
  // keeps the first stamp: a second owner's tap does not rewrite who did it.
  fastify.post('/feedback/:id/handled', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'Некоректний id' });
    const body = (request.body ?? {}) as { handled?: unknown };
    if (body.handled !== undefined && typeof body.handled !== 'boolean') {
      return reply.code(400).send({ error: 'handled має бути true або false' });
    }
    const row = await setFeedbackHandled(auth.storeId, id, auth.staffId, body.handled !== false);
    if (!row) return reply.code(404).send({ error: 'Відгук не знайдено' });
    return row;
  });
}
