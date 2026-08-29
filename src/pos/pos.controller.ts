// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/pos.controller.ts

import type { FastifyInstance } from 'fastify';
import type { PaymentMethod } from './types.js';
import { ensurePosAuth, ensurePosOwner } from './core/auth.js';
import * as authService from './auth.service.js';
import * as productsService from './products.service.js';
import * as stockService from './stock.service.js';
import * as stockDocumentsService from './stock-documents.service.js';
import * as stockReportsService from './stock-reports.service.js';
import * as suppliersService from './suppliers.service.js';
import * as salesService from './sales.service.js';
import * as analyticsService from './analytics.service.js';
import * as qrService from './qr.service.js';
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
    const query = request.query as { q?: string; all?: string; snapshot?: string };
    return customersService.listCustomers(
      auth.storeId,
      query.q,
      query.all === '1' || query.snapshot === '1'
    );
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
        client_uuid?: string | null;
      };
      if (!body.name || !body.phone) {
        return reply.code(400).send({ error: 'name and phone required' });
      }
      const customer = await customersService.createCustomer(auth.storeId, {
        name: body.name,
        phone: body.phone,
        email: body.email,
        children_birthdays: body.children_birthdays,
        client_uuid: body.client_uuid,
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
          client_uuid?: string | null;
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
    const query = request.query as {
      q?: string;
      barcode?: string;
      tag_id?: string;
      all?: string;
      snapshot?: string;
    };
    return productsService.getCatalog(auth.storeId, {
      q: query.q,
      barcode: query.barcode,
      tag_id: query.tag_id ? Number(query.tag_id) : undefined,
      snapshot: query.all === '1' || query.snapshot === '1',
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

  fastify.post('/stock/documents/:id/lines/placeholder', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const body = request.body as {
        name?: string;
        quantity?: number;
        unit_cost_cents?: number | null;
        price_cents?: number;
        size?: string;
        color?: string;
        barcode?: string | null;
        line_note?: string | null;
      };
      if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
      if (body.price_cents == null) return reply.code(400).send({ error: 'price_cents required' });
      if (!body.quantity || body.quantity <= 0) {
        return reply.code(400).send({ error: 'quantity must be positive' });
      }
      const line = await stockDocumentsService.addPlaceholderLine({
        storeId: auth.storeId,
        documentId: Number(id),
        name: body.name,
        quantity: body.quantity,
        priceCents: body.price_cents,
        unitCostCents: body.unit_cost_cents,
        size: body.size,
        color: body.color,
        barcode: body.barcode,
        lineNote: body.line_note,
      });
      const suggestions = await stockDocumentsService.suggestSimilarProducts(
        auth.storeId,
        body.name
      );
      return reply.code(201).send({ ...line, similar_products: suggestions });
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
        placeholder_name?: string;
        placeholder_size?: string;
        placeholder_color?: string;
        placeholder_barcode?: string | null;
        placeholder_price_cents?: number;
      };
      return await stockDocumentsService.updateLine({
        storeId: auth.storeId,
        documentId: Number(id),
        lineId: Number(lineId),
        quantity: body.quantity,
        unitCostCents: body.unit_cost_cents,
        countedQty: body.counted_qty,
        lineNote: body.line_note,
        placeholderName: body.placeholder_name,
        placeholderSize: body.placeholder_size,
        placeholderColor: body.placeholder_color,
        placeholderBarcode: body.placeholder_barcode,
        placeholderPriceCents: body.placeholder_price_cents,
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

  // ── GTIN enrichment ───────────────────────────────────
  fastify.post('/gtin/learn/batch', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('./gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as { items?: unknown };
      const { learnBatch } = await import('./gtin/learn.service.js');
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
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('./gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const { learnStats } = await import('./gtin/learn.service.js');
      return await learnStats();
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/learn/jobs', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('./gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as {
        datasets?: Array<'products' | 'food' | 'beauty'>;
        mode?: string;
        limit?: number;
      };
      const { createLearnJob } = await import('./gtin/learn-jobs.service.js');
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
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { id } = request.params as { id: string };
      const { getLearnJob } = await import('./gtin/learn-jobs.service.js');
      const job = await getLearnJob(Number(id));
      if (!job) return reply.code(404).send({ error: 'job not found' });
      return job;
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/learn/jobs/:id/cancel', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { id } = request.params as { id: string };
      const { cancelLearnJob } = await import('./gtin/learn-jobs.service.js');
      const job = await cancelLearnJob(Number(id));
      if (!job) return reply.code(404).send({ error: 'job not found' });
      return job;
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.get('/gtin/:code', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { getGtinCache, isGtinLookupEnabled } = await import('./gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const { code } = request.params as { code: string };
      const hint = await getGtinCache(code);
      if (!hint) return reply.code(404).send({ found: false });
      return { found: true, ...hint };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/gtin/ingest', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { ingestGtinResults, isGtinLookupEnabled } = await import('./gtin/gtin-cache.service.js');
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
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      const { isGtinLookupEnabled } = await import('./gtin/gtin-cache.service.js');
      if (!(await isGtinLookupEnabled(auth.storeId))) {
        return reply.code(403).send({ error: 'gtin lookup disabled' });
      }
      const body = request.body as { gtin?: string };
      if (!body.gtin) return reply.code(400).send({ error: 'gtin required' });
      const { lookupQuotaProviders } = await import('./gtin/quota-providers.js');
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
  fastify.post('/sales/complete', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const body = request.body as {
        items: { variant_id: number; quantity: number }[];
        payments: { method: PaymentMethod; amount_cents: number; provider_ref?: string | null }[];
        note?: string;
        cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
        customer_id?: number | null;
        client_uuid?: string | null;
      };
      const headerKey = request.headers['idempotency-key'];
      const headerUuid =
        typeof headerKey === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          headerKey
        )
          ? headerKey
          : null;
      const clientUuid = body.client_uuid?.trim() || headerUuid;
      if (clientUuid) {
        const existing = await salesService.getSaleByClientUuid(auth.storeId, clientUuid);
        if (existing) return reply.code(200).send(existing);
      }
      const sale = await salesService.completeSale({
        storeId: auth.storeId,
        staffId: auth.staffId,
        items: body.items,
        payments: body.payments,
        note: body.note,
        cart_discount: body.cart_discount,
        customer_id: body.customer_id,
        client_uuid: clientUuid,
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

  // Generate a dynamic NBU QR (exact amount) for the current checkout via
  // Opendatabot. Billed per call — the cashier UI only hits this on the QR step
  // and caches the result per sale draft. A small per-store rate limit caps cost.
  const qrInvoiceHits = new Map<number, number[]>();
  fastify.post('/qr/invoice', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = request.body as { amount_cents?: number; sale_ref?: string };
    const amountCents = Number(body.amount_cents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return reply.code(400).send({ error: 'amount_cents must be a positive integer' });
    }

    const store = await analyticsService.getStore(auth.storeId);
    if (!store?.qr_payment_enabled || store.qr_payment_mode !== 'dynamic') {
      return reply.code(400).send({ error: 'dynamic QR payment is not enabled for this store' });
    }

    const now = Date.now();
    const recent = (qrInvoiceHits.get(auth.storeId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 20) {
      return reply.code(429).send({ error: 'too many QR requests, retry shortly' });
    }
    recent.push(now);
    qrInvoiceHits.set(auth.storeId, recent);

    try {
      const invoice = await qrService.createInvoice({
        storeId: auth.storeId,
        amountCents,
        saleRef: typeof body.sale_ref === 'string' ? body.sale_ref : '',
      });
      return {
        qrcode_data_uri: invoice.qrcode,
        url: invoice.url,
        invoice_id: invoice.invoiceId,
      };
    } catch (error) {
      if (error instanceof qrService.QrProviderError) {
        const status = error.code === 'qr_not_configured' ? 400 : 502;
        return reply.code(status).send({ error: error.code });
      }
      logger.error('QR invoice failed', { error: errorMessage(error) });
      return reply.code(502).send({ error: 'qr_provider_unavailable' });
    }
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
  fastify.get('/analytics/summary', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;

    const q = request.query as { from?: string; to?: string };
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (q.from && !DATE_RE.test(q.from)) {
      return reply.code(400).send({ error: 'from must be YYYY-MM-DD' });
    }
    if (q.to && !DATE_RE.test(q.to)) {
      return reply.code(400).send({ error: 'to must be YYYY-MM-DD' });
    }
    if (q.from && q.to) {
      if (q.from > q.to) return reply.code(400).send({ error: 'from must be <= to' });
      const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
      if (days > 366) return reply.code(400).send({ error: 'range too large (max 366 days)' });
    }

    const store = await analyticsService.getStore(auth.storeId);
    return analyticsService.getSalesSummary(auth.storeId, {
      from: q.from,
      to: q.to,
      timezone: store?.timezone,
    });
  });

  fastify.get('/store', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return analyticsService.getStore(auth.storeId);
  });

  fastify.patch('/store', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = request.body as {
      name?: string;
      qr_payment_enabled?: boolean;
      qr_payment_mode?: string;
      qr_static_image_url?: string | null;
      qr_purpose_template?: string | null;
      qr_iban?: string | null;
      qr_edrpou?: string | null;
      qr_recipient?: string | null;
    };
    try {
      const patch: analyticsService.StorePatch = {};
      if (body.name !== undefined) {
        if (!body.name.trim()) return reply.code(400).send({ error: 'name required' });
        patch.name = body.name;
      }
      if (body.qr_payment_mode !== undefined) {
        if (body.qr_payment_mode !== 'static' && body.qr_payment_mode !== 'dynamic') {
          return reply.code(400).send({ error: 'qr_payment_mode must be static or dynamic' });
        }
        patch.qr_payment_mode = body.qr_payment_mode;
      }
      if (body.qr_payment_enabled !== undefined) patch.qr_payment_enabled = Boolean(body.qr_payment_enabled);
      if (body.qr_static_image_url !== undefined) patch.qr_static_image_url = body.qr_static_image_url;
      if (body.qr_purpose_template !== undefined) patch.qr_purpose_template = body.qr_purpose_template;
      if (body.qr_iban !== undefined) patch.qr_iban = body.qr_iban;
      if (body.qr_edrpou !== undefined) patch.qr_edrpou = body.qr_edrpou;
      if (body.qr_recipient !== undefined) patch.qr_recipient = body.qr_recipient;
      return await analyticsService.updateStore(auth.storeId, patch);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

}
