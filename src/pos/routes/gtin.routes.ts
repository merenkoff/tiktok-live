// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import { errorMessage } from './_shared.js';

export function registerGtinRoutes(fastify: FastifyInstance): void {
  fastify.post('/gtin/learn/batch', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as { items?: unknown };
      const { learnBatch } = await import('../gtin/learn.service.js');
      return await learnBatch({
        items: (body.items ?? []) as Parameters<typeof learnBatch>[0]['items'],
        storeId: auth.storeId,
        staffId: auth.staffId,
      });
    } catch (error) {
      const msg = errorMessage(error);
      if (msg === 'gtin lookup disabled') return reply.code(403).send({ error: msg });
      return reply.code(400).send({ error: msg });
    }
  });

  fastify.get('/gtin/learn/stats', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const { learnStats } = await import('../gtin/learn.service.js');
      return await learnStats();
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/learn/jobs', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as {
        datasets?: Array<'products' | 'food' | 'beauty'>;
        mode?: string;
        limit?: number;
      };
      const { createLearnJob } = await import('../gtin/learn-jobs.service.js');
      const job = await createLearnJob({
        datasets: body.datasets ?? ['products'],
        mode: body.mode ?? 'upsert',
        limit: body.limit,
        createdBy: auth.staffId,
      });
      return reply.code(201).send(job);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/gtin/learn/jobs/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { id } = request.params as { id: string };
      const { getLearnJob } = await import('../gtin/learn-jobs.service.js');
      const job = await getLearnJob(Number(id));
      if (!job) return reply.code(404).send({ error: 'job not found' });
      return job;
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/learn/jobs/:id/cancel', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { id } = request.params as { id: string };
      const { cancelLearnJob } = await import('../gtin/learn-jobs.service.js');
      const job = await cancelLearnJob(Number(id));
      if (!job) return reply.code(404).send({ error: 'job not found' });
      return job;
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // Owner browse/repair of the shared cache. Registered before `/gtin/:code`
  // for readability; Fastify's router prefers the static segment either way.
  fastify.get('/gtin/cache', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { isGtinLookupEnabled, listGtinCache } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const query = request.query as { q?: string; limit?: string; offset?: string; blocked?: string };
      return await listGtinCache({
        q: query.q,
        limit: query.limit == null ? undefined : Number(query.limit),
        offset: query.offset == null ? undefined : Number(query.offset),
        blockedOnly: query.blocked === '1' || query.blocked === 'true',
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/gtin/:code', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { getGtinCache, isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const { code } = request.params as { code: string };
      const hint = await getGtinCache(code);
      if (!hint) return reply.code(404).send({ found: false });
      // A tombstone answers 200, not 404: the client has to know the entry was
      // cleared on purpose so it skips the external fan-out and the quota it costs.
      if (hint.blocked) return { found: false, blocked: true, gtin: hint.gtin };
      if (!hint.name) return reply.code(404).send({ found: false });
      return { found: true, ...hint };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/gtin/:code', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { isGtinLookupEnabled, setGtinManualEntry, unblockGtin } = await import(
        '../gtin/gtin-cache.service.js'
      );
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const { code } = request.params as { code: string };
      const body = (request.body ?? {}) as {
        name?: string;
        brand?: string | null;
        image_url?: string | null;
        blocked?: boolean;
      };

      if (body.name != null && body.name.trim()) {
        const hint = await setGtinManualEntry({
          code,
          name: body.name,
          brand: body.brand ?? null,
          image_url: body.image_url ?? null,
          storeId: auth.storeId,
          staffId: auth.staffId,
        });
        return { hint };
      }
      if (body.blocked === false) {
        const hint = await unblockGtin({ code, storeId: auth.storeId, staffId: auth.staffId });
        return { hint };
      }
      return reply.code(400).send({ error: 'name or blocked:false required' });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/gtin/:code', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { blockGtin, isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const { code } = request.params as { code: string };
      const hint = await blockGtin({ code, storeId: auth.storeId, staffId: auth.staffId });
      return { hint };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/ingest', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { ingestGtinResults, isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as {
        gtin?: string;
        results?: Array<{
          source: string;
          found: boolean;
          name?: string | null;
          brand?: string | null;
          image_url?: string | null;
          raw?: unknown;
        }>;
      };
      if (!body.gtin || !Array.isArray(body.results)) {
        return reply.code(400).send({ error: 'gtin and results required' });
      }
      const hint = await ingestGtinResults({
        code: body.gtin,
        results: body.results,
        storeId: auth.storeId,
        staffId: auth.staffId,
      });
      return { found: Boolean(hint?.name), hint };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/lookup/quota-providers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'gtin-enrichment', { owner: true });
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('../gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as { gtin?: string };
      if (!body.gtin) return reply.code(400).send({ error: 'gtin required' });
      const { lookupQuotaProviders } = await import('../gtin/quota-providers.js');
      const out = await lookupQuotaProviders({
        code: body.gtin,
        storeId: auth.storeId,
        staffId: auth.staffId,
      });
      return {
        found: Boolean(out.hint?.name),
        hint: out.hint,
        results: out.results,
        skipped: out.skipped,
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Sales ─────────────────────────────────────────────
}
