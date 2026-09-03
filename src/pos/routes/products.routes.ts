// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule, ensurePosAuth } from '../core/auth.js';
import * as productsService from '../products.service.js';
import * as tagsService from '../tags.service.js';
import { saveProductImage } from '../uploads.service.js';
import { logger } from '../../logger.js';
import { errorMessage, isUniqueViolation } from './_shared.js';

export function registerProductsRoutes(fastify: FastifyInstance): void {
  fastify.get('/products', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    return productsService.listProducts(auth.storeId);
  });

  fastify.get('/products/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const product = await productsService.getProduct(auth.storeId, Number(id));
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return product;
  });

  fastify.post('/products', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    try {
      const product = await productsService.createProduct(
        auth.storeId,
        request.body as productsService.CreateProductInput
      );
      return reply.code(201).send(product);
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      logger.error('Create product failed', { error: errorMessage(error) });
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/products/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await productsService.updateProduct(
        auth.storeId,
        Number(id),
        request.body as Parameters<typeof productsService.updateProduct>[2]
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/uploads', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
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

  fastify.post('/products/:id/variants', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const product = await productsService.addVariant(
        auth.storeId,
        Number(id),
        request.body as productsService.VariantInput
      );
      return reply.code(201).send(product);
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/variants/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await productsService.updateVariant(
        auth.storeId,
        Number(id),
        request.body as Parameters<typeof productsService.updateVariant>[2]
      );
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/products/:id/archive', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await productsService.archiveProduct(auth.storeId, Number(id));
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/variants/:id/archive', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await productsService.archiveVariant(auth.storeId, Number(id));
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.put('/products/:id/tags', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { tag_ids?: number[] };
    try {
      const tagIds = await tagsService.setProductTags(
        auth.storeId,
        Number(id),
        body.tag_ids ?? []
      );
      return { tag_ids: tagIds };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Tags ──────────────────────────────────────────────

  fastify.get('/tags', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return tagsService.listTags(auth.storeId);
  });

  fastify.post('/tags', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const body = request.body as {
      name?: string;
      parent_id?: number | null;
      sort_order?: number;
      color?: string | null;
      show_in_catalog_bar?: boolean;
    };
    try {
      if (!body.name) return reply.code(400).send({ error: 'name required' });
      const tag = await tagsService.createTag(auth.storeId, {
        name: body.name,
        parent_id: body.parent_id,
        sort_order: body.sort_order,
        color: body.color,
        show_in_catalog_bar: body.show_in_catalog_bar,
      });
      return reply.code(201).send(tag);
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/tags/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await tagsService.updateTag(
        auth.storeId,
        Number(id),
        request.body as {
          name?: string;
          sort_order?: number;
          color?: string | null;
          show_in_catalog_bar?: boolean;
        }
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/tags/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await tagsService.deleteTag(auth.storeId, Number(id));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/tags/:id/assign', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { product_ids?: number[] };
    try {
      return await tagsService.assignTagToProducts(
        auth.storeId,
        Number(id),
        body.product_ids ?? []
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Customers ─────────────────────────────────────────
}
