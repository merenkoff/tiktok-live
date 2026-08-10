// src/pos/pos.controller.ts

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from './core/auth.js';
import * as authService from './auth.service.js';
import * as productsService from './products.service.js';
import * as stockService from './stock.service.js';
import * as stockDocumentsService from './stock-documents.service.js';
import * as stockReportsService from './stock-reports.service.js';
import * as suppliersService from './suppliers.service.js';
import * as salesService from './sales.service.js';
import * as analyticsService from './analytics.service.js';
import * as tagsService from './tags.service.js';
import * as customersService from './customers.service.js';
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

  // ── Customers ─────────────────────────────────────────
  fastify.get('/customers', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const query = request.query as { q?: string };
    return customersService.listCustomers(auth.storeId, query.q);
  });

  fastify.get('/customers/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const customer = await customersService.getCustomer(auth.storeId, Number(id));
    if (!customer) return reply.code(404).send({ error: 'Customer not found' });
    return customer;
  });

  fastify.post('/customers', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const body = request.body as {
        name?: string;
        phone?: string;
        email?: string | null;
        children_birthdays?: customersService.CustomerChild[];
      };
      if (!body.name || !body.phone) {
        return reply.code(400).send({ error: 'name and phone required' });
      }
      const customer = await customersService.createCustomer(auth.storeId, {
        name: body.name,
        phone: body.phone,
        email: body.email,
        children_birthdays: body.children_birthdays,
      });
      return reply.code(201).send(customer);
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/customers/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await customersService.updateCustomer(
        auth.storeId,
        Number(id),
        request.body as {
          name?: string;
          phone?: string;
          email?: string | null;
          children_birthdays?: customersService.CustomerChild[];
        }
      );
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/customers/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await customersService.deleteCustomer(auth.storeId, Number(id));
      return { ok: true };
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

  // ── Suppliers ─────────────────────────────────────────
  fastify.get('/suppliers', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return suppliersService.listSuppliers(auth.storeId);
  });

  fastify.post('/suppliers', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const body = request.body as { name?: string; phone?: string; note?: string };
      if (!body.name) return reply.code(400).send({ error: 'name required' });
      const created = await suppliersService.createSupplier(auth.storeId, {
        name: body.name,
        phone: body.phone,
        note: body.note,
      });
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/suppliers/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await suppliersService.updateSupplier(
        auth.storeId,
        Number(id),
        request.body as { name?: string; phone?: string | null; note?: string | null; is_active?: boolean }
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Stock documents ───────────────────────────────────
  fastify.get('/stock/documents', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as {
      type?: string;
      status?: string;
      from?: string;
      to?: string;
    };
    return stockDocumentsService.listDocuments(auth.storeId, {
      type: q.type as 'receipt' | 'writeoff' | 'adjustment' | 'inventory' | undefined,
      status: q.status as 'draft' | 'posted' | 'voided' | 'reversed' | undefined,
      from: q.from,
      to: q.to,
    });
  });

  fastify.post('/stock/documents', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const body = request.body as {
        type?: 'receipt' | 'writeoff' | 'adjustment' | 'inventory';
        occurred_at?: string;
        supplier_id?: number | null;
        reason_code?: string | null;
        note?: string | null;
      };
      if (!body.type) return reply.code(400).send({ error: 'type required' });
      const doc = await stockDocumentsService.createDocument({
        storeId: auth.storeId,
        staffId: auth.staffId,
        type: body.type,
        occurredAt: body.occurred_at,
        supplierId: body.supplier_id,
        reasonCode: body.reason_code,
        note: body.note,
      });
      return reply.code(201).send(doc);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/stock/documents/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const doc = await stockDocumentsService.getDocument(auth.storeId, Number(id));
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    return doc;
  });

  fastify.patch('/stock/documents/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const body = request.body as {
        occurred_at?: string;
        supplier_id?: number | null;
        reason_code?: string | null;
        note?: string | null;
      };
      return await stockDocumentsService.updateDocumentMeta(auth.storeId, Number(id), {
        occurredAt: body.occurred_at,
        supplierId: body.supplier_id,
        reasonCode: body.reason_code,
        note: body.note,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/stock/documents/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      await stockDocumentsService.voidDraft(auth.storeId, Number(id));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/stock/documents/:id/lines', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const body = request.body as {
        variant_id?: number;
        quantity?: number;
        unit_cost_cents?: number | null;
        counted_qty?: number | null;
        target_qty?: number;
        line_note?: string | null;
      };
      if (!body.variant_id) return reply.code(400).send({ error: 'variant_id required' });
      if (typeof body.target_qty === 'number') {
        return reply.code(201).send(
          await stockDocumentsService.addAdjustmentToTarget({
            storeId: auth.storeId,
            documentId: Number(id),
            variantId: body.variant_id,
            targetQty: body.target_qty,
            lineNote: body.line_note,
          })
        );
      }
      return reply.code(201).send(
        await stockDocumentsService.addLine({
          storeId: auth.storeId,
          documentId: Number(id),
          variantId: body.variant_id,
          quantity: body.quantity,
          unitCostCents: body.unit_cost_cents,
          countedQty: body.counted_qty,
          lineNote: body.line_note,
        })
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/stock/documents/:id/lines/:lineId', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id, lineId } = request.params as { id: string; lineId: string };
    try {
      const body = request.body as {
        quantity?: number;
        unit_cost_cents?: number | null;
        counted_qty?: number | null;
        line_note?: string | null;
      };
      return await stockDocumentsService.updateLine({
        storeId: auth.storeId,
        documentId: Number(id),
        lineId: Number(lineId),
        quantity: body.quantity,
        unitCostCents: body.unit_cost_cents,
        countedQty: body.counted_qty,
        lineNote: body.line_note,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/stock/documents/:id/lines/:lineId', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id, lineId } = request.params as { id: string; lineId: string };
    try {
      await stockDocumentsService.removeLine(auth.storeId, Number(id), Number(lineId));
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/stock/documents/:id/lines/bulk', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const body = request.body as {
        tag_ids?: number[];
        product_ids?: number[];
        variant_ids?: number[];
      };
      return await stockDocumentsService.addBulkInventoryLines({
        storeId: auth.storeId,
        documentId: Number(id),
        tagIds: body.tag_ids,
        productIds: body.product_ids,
        variantIds: body.variant_ids,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/stock/documents/:id/refresh-system-qty', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await stockDocumentsService.refreshSystemQty(auth.storeId, Number(id));
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/stock/documents/:id/post', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const idempotencyKey =
        typeof request.headers['idempotency-key'] === 'string'
          ? request.headers['idempotency-key']
          : undefined;
      return await stockDocumentsService.postDocument({
        storeId: auth.storeId,
        documentId: Number(id),
        staffId: auth.staffId,
        idempotencyKey,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/stock/documents/:id/reverse', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const body = request.body as { note?: string };
      return await stockDocumentsService.reverseDocument({
        storeId: auth.storeId,
        documentId: Number(id),
        staffId: auth.staffId,
        note: body.note,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Stock reports ─────────────────────────────────────
  fastify.get('/stock/reports/on-hand', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return stockReportsService.listOnHand(auth.storeId);
  });

  fastify.get('/stock/reports/movements', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as {
      from?: string;
      to?: string;
      variant_id?: string;
      reason?: string;
    };
    return stockReportsService.listMovements(auth.storeId, {
      from: q.from,
      to: q.to,
      variantId: q.variant_id ? Number(q.variant_id) : undefined,
      reason: q.reason as import('./types.js').StockReason | undefined,
    });
  });

  fastify.get('/stock/reports/document-summary', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as { from?: string; to?: string };
    return stockReportsService.documentSummary(auth.storeId, { from: q.from, to: q.to });
  });

  fastify.get('/stock/reports/movement-summary', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as { from?: string; to?: string };
    if (!q.from || !q.to) return reply.code(400).send({ error: 'from and to required' });
    return stockReportsService.movementReport(auth.storeId, q.from, q.to);
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
        cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
        customer_id?: number | null;
      };
      const sale = await salesService.completeSale({
        storeId: auth.storeId,
        staffId: auth.staffId,
        items: body.items,
        payments: body.payments,
        note: body.note,
        cart_discount: body.cart_discount,
        customer_id: body.customer_id,
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
