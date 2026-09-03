// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as stockService from '../stock.service.js';
import * as stockDocumentsService from '../stock-documents.service.js';
import * as stockReportsService from '../stock-reports.service.js';
import * as suppliersService from '../suppliers.service.js';
import { errorMessage } from './_shared.js';

export function registerStockRoutes(fastify: FastifyInstance): void {
  fastify.post('/stock/adjust', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    return stockService.listLowStock(auth.storeId);
  });

  // ── Suppliers ─────────────────────────────────────────

  fastify.get('/suppliers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    return suppliersService.listSuppliers(auth.storeId);
  });

  fastify.post('/suppliers', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const doc = await stockDocumentsService.getDocument(auth.storeId, Number(id));
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    return doc;
  });

  fastify.patch('/stock/documents/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await stockDocumentsService.refreshSystemQty(auth.storeId, Number(id));
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/stock/documents/:id/post', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    return stockReportsService.listOnHand(auth.storeId);
  });

  fastify.get('/stock/reports/movements', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
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
      reason: q.reason as import('../types.js').StockReason | undefined,
    });
  });

  fastify.get('/stock/reports/document-summary', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    const q = request.query as { from?: string; to?: string };
    return stockReportsService.documentSummary(auth.storeId, { from: q.from, to: q.to });
  });

  fastify.get('/stock/reports/movement-summary', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'stock', { owner: true });
    if (!auth) return;
    const q = request.query as { from?: string; to?: string };
    if (!q.from || !q.to) return reply.code(400).send({ error: 'from and to required' });
    return stockReportsService.movementReport(auth.storeId, q.from, q.to);
  });

  // ── GTIN enrichment ───────────────────────────────────
}
