// src/pos/pos.controller.ts

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from './core/auth.js';
import * as authService from './auth.service.js';
import * as productsService from './products.service.js';
import * as stockService from './stock.service.js';
import * as salesService from './sales.service.js';
import * as analyticsService from './analytics.service.js';
import * as tagsService from './tags.service.js';
import { saveProductImage } from './uploads.service.js';
import { logger } from '../logger.js';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}

export async function registerPosRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Auth ──────────────────────────────────────────────
  fastify.post('/auth/owner/login', async (request, reply) => {
    const body = request.body as { login?: string; password?: string };
    if (!body.login || !body.password) {
      return reply.code(400).send({ error: 'login and password required' });
    }
    const result = await authService.loginOwner(body.login, body.password);
    if (!result) return reply.code(401).send({ error: 'Invalid credentials' });
    return result;
  });

  fastify.post('/auth/staff/pin', async (request, reply) => {
    const body = request.body as { store_slug?: string; pin?: string };
    if (!body.store_slug || !body.pin) {
      return reply.code(400).send({ error: 'store_slug and pin required' });
    }
    const result = await authService.loginWithPin(body.store_slug, body.pin);
    if (!result) return reply.code(401).send({ error: 'Invalid PIN or store' });
    return result;
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    await authService.logout(auth.token);
    return { ok: true };
  });

  fastify.get('/me', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return authService.me(auth);
  });

  // ── Staff (owner) ─────────────────────────────────────
  fastify.get('/staff', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return authService.listStaff(auth.storeId);
  });

  fastify.post('/staff', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = request.body as { display_name?: string; pin?: string };
    try {
      if (!body.display_name || !body.pin) {
        return reply.code(400).send({ error: 'display_name and pin required' });
      }
      const created = await authService.createSeller(auth.storeId, body.display_name, body.pin);
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/staff/:id/pin', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { pin?: string };
    try {
      if (!body.pin) return reply.code(400).send({ error: 'pin required' });
      await authService.setStaffPin(auth.storeId, Number(id), body.pin);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/staff/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { is_active?: boolean };
    try {
      if (typeof body.is_active !== 'boolean') {
        return reply.code(400).send({ error: 'is_active required' });
      }
      await authService.setStaffActive(auth.storeId, Number(id), body.is_active);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Products ──────────────────────────────────────────
  fastify.get('/products', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    if (auth.role !== 'owner') return reply.code(403).send({ error: 'Owner access required' });
    return productsService.listProducts(auth.storeId);
  });

  fastify.get('/products/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const product = await productsService.getProduct(auth.storeId, Number(id));
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return product;
  });

  fastify.post('/products', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
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

  fastify.post('/products/:id/variants', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await productsService.archiveProduct(auth.storeId, Number(id));
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/variants/:id/archive', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await productsService.archiveVariant(auth.storeId, Number(id));
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.put('/products/:id/tags', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
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
    const auth = await ensurePosOwner(request, reply);
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

  // ── Catalog (cashier) ─────────────────────────────────
  fastify.get('/catalog', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const query = request.query as { q?: string; barcode?: string; tag_id?: string };
    return productsService.getCatalog(auth.storeId, {
      q: query.q,
      barcode: query.barcode,
      tag_id: query.tag_id ? Number(query.tag_id) : undefined,
    });
  });

  // ── Stock ─────────────────────────────────────────────
  fastify.post('/stock/adjust', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = request.body as { variant_id?: number; delta?: number; note?: string };
    try {
      if (!body.variant_id || typeof body.delta !== 'number') {
        return reply.code(400).send({ error: 'variant_id and delta required' });
      }
      return await stockService.adjustStock({
        storeId: auth.storeId,
        variantId: body.variant_id,
        delta: body.delta,
        staffId: auth.staffId,
        note: body.note,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/stock/low', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return stockService.listLowStock(auth.storeId);
  });

  // ── Sales ─────────────────────────────────────────────
  fastify.post('/sales/complete', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const body = request.body as {
        items: { variant_id: number; quantity: number }[];
        payments: { method: 'cash' | 'card'; amount_cents: number }[];
        note?: string;
      };
      const sale = await salesService.completeSale({
        storeId: auth.storeId,
        staffId: auth.staffId,
        items: body.items,
        payments: body.payments,
        note: body.note,
      });
      return reply.code(201).send(sale);
    } catch (error) {
      logger.error('Complete sale failed', { error: errorMessage(error) });
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/sales', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const query = request.query as { limit?: string };
    return salesService.listSales(auth.storeId, {
      limit: query.limit ? Number(query.limit) : 50,
    });
  });

  fastify.get('/sales/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const sale = await salesService.getSale(auth.storeId, Number(id));
    if (!sale) return reply.code(404).send({ error: 'Sale not found' });
    return sale;
  });

  fastify.post('/sales/:id/void', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await salesService.voidSale({
        storeId: auth.storeId,
        saleId: Number(id),
        staffId: auth.staffId,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/sales/:id/refunds', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      items: { sale_item_id: number; quantity: number }[];
      reason?: string;
    };
    try {
      return await salesService.refundSale({
        storeId: auth.storeId,
        saleId: Number(id),
        staffId: auth.staffId,
        items: body.items,
        reason: body.reason,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Analytics & store ─────────────────────────────────
  fastify.get('/analytics/today', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    if (auth.role === 'seller') {
      // Sellers can see today summary (simple)
    }
    const store = await analyticsService.getStore(auth.storeId);
    return analyticsService.getTodayAnalytics(auth.storeId, store?.timezone);
  });

  fastify.get('/store', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return analyticsService.getStore(auth.storeId);
  });

  fastify.patch('/store', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = request.body as { name?: string };
    try {
      if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
      return await analyticsService.updateStore(auth.storeId, body.name);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

}
