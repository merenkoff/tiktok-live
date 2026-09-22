// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as analyticsService from '../analytics.service.js';
import { getFlowerAnalytics } from '../flowers-analytics.service.js';
import { getCafeAnalytics } from '../cafe-analytics.service.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar date, not merely a digit-shaped one.
 *
 * The regexp alone accepts `2026-13-40`, which sails past every check here and
 * dies in Postgres as a 500 on `$2::date`. Round-tripping through `Date` is
 * what rejects a thirteenth month and a 30th of February — the latter would
 * otherwise silently become the 2nd of March.
 */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * What is wrong with the window, in the client's words, or null.
 *
 * One helper rather than a copy per vertical: two analytics routes now take
 * the same `from`/`to`, and a second inline copy is how the day comes that
 * one of them quietly accepts a decade.
 */
function badRange(q: { from?: string; to?: string }): string | null {
  if (q.from && !isRealDate(q.from)) return 'from must be YYYY-MM-DD';
  if (q.to && !isRealDate(q.to)) return 'to must be YYYY-MM-DD';
  if (q.from && q.to) {
    if (q.from > q.to) return 'from must be <= to';
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (days > 366) return 'range too large (max 366 days)';
  }
  return null;
}

export function registerAnalyticsRoutes(fastify: FastifyInstance): void {
  fastify.get('/analytics/summary', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'analytics');
    if (!auth) return;

    const q = request.query as { from?: string; to?: string };
    const bad = badRange(q);
    if (bad) return reply.code(400).send({ error: bad });

    const store = await analyticsService.getStore(auth.storeId);
    return analyticsService.getSalesSummary(auth.storeId, {
      from: q.from,
      to: q.to,
      timezone: store?.timezone,
    });
  });

  /**
   * The florist's own numbers (TechDocs/POS_FLORIST_BENCH.md §13).
   *
   * Under `analytics` like the summary above, and owner-only: a shop that
   * turned analytics off should not have a second way in. Refused for a store
   * whose vertical is not flowers — every number here is about stems and
   * bouquets, and answering with zeroes would read as «нічого не списали»
   * rather than «це питання не про цей магазин».
   */
  fastify.get('/analytics/flowers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'analytics', { owner: true });
    if (!auth) return;

    const q = request.query as { from?: string; to?: string };
    const bad = badRange(q);
    if (bad) return reply.code(400).send({ error: bad });

    const store = await analyticsService.getStore(auth.storeId);
    // `getStore` already resolved it through `verticalOrDefault`, so a column
    // value this build does not know reads as clothing here rather than
    // throwing — the same degradation every other reader gets.
    if (store?.vertical?.id !== 'flowers') {
      return reply.code(409).send({ error: 'not_a_flower_shop' });
    }

    return getFlowerAnalytics(auth.storeId, {
      from: q.from,
      to: q.to,
      timezone: store?.timezone,
    });
  });

  /**
   * The café's own numbers (TechDocs/POS_CAFE.md §10, phase К6).
   *
   * Same shape and same guards as `/analytics/flowers` above, for the same
   * reasons: owner-only under `analytics`, and 409 for a store whose vertical
   * is not café — food cost and a menu matrix answered with zeroes would read
   * as «нічого не продали» rather than «це питання не про цей магазин».
   *
   * Restaurant figures live in the same answer rather than their own endpoint:
   * a restaurant IS a café store with the `tables` module, one screen shows
   * both, and `tables: null` already says «не про цей магазин» inside it.
   */
  fastify.get('/analytics/cafe', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'analytics', { owner: true });
    if (!auth) return;

    const q = request.query as { from?: string; to?: string };
    const bad = badRange(q);
    if (bad) return reply.code(400).send({ error: bad });

    const store = await analyticsService.getStore(auth.storeId);
    if (store?.vertical?.id !== 'cafe') {
      return reply.code(409).send({ error: 'not_a_cafe' });
    }

    return getCafeAnalytics(auth.storeId, {
      from: q.from,
      to: q.to,
      timezone: store?.timezone,
    });
  });
}
