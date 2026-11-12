// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensureModule, ensurePosAuth } from '../core/auth.js';
import { pool } from '../../db.js';
import { listTechCards } from '../composites.service.js';
import * as productsService from '../products.service.js';
import { invalidatePublicMenu } from '../public-menu/menu.service.js';
import * as markdownsService from '../markdowns.service.js';
import * as tagsService from '../tags.service.js';
import { saveProductImage } from '../uploads.service.js';
import { logger } from '../../logger.js';
import { errorMessage, isUniqueViolation } from './_shared.js';
import {
  MarketerFieldError,
  assertMarketerProductWrite,
  assertMarketerVariantWrite,
  catalogForMarketer,
} from '../marketer.js';
import type { PosAuthContext } from '../types.js';

/**
 * The answer as this session may read it: the marketer gets no purchase price
 * and no stock (track МР, М4); everyone else the answer as it is.
 */
function forRole<T>(auth: PosAuthContext, value: T): T {
  return auth.role === 'marketer' ? catalogForMarketer(value) : value;
}

/** A marketer's write that touched the owner's half of a card. */
export function sendMarketerRefusal(reply: FastifyReply, error: MarketerFieldError) {
  return reply.code(403).send({ error: error.message, code: error.code });
}

/** One variant as the product list reads it — what a marketer's edit is compared against. */
async function findVariant(storeId: number, variantId: number): Promise<Record<string, unknown> | null> {
  const row = await pool.query(`SELECT product_id FROM pos_variants WHERE id = $1 AND store_id = $2`, [variantId, storeId]);
  if (row.rows.length === 0) return null;
  const product = await productsService.getProduct(storeId, Number(row.rows[0].product_id));
  const variants = (product?.variants ?? []) as Array<Record<string, unknown>>;
  return variants.find((v) => Number(v.id) === variantId) ?? null;
}
import * as techCardsImport from '../techcards-import.service.js';
import { listMenuChanges, recordProductChanges, type MenuEntity } from '../menu-changes.js';

/**
 * Run a write and record what it changed on these cards (migration 101,
 * TechDocs/POS_MENU_CHANGES.md). The cards are read before and after; a read
 * that fails only costs the journal its row, never the write.
 */
export async function withMenuJournal<T>(
  auth: PosAuthContext,
  ids: readonly number[],
  write: () => Promise<T>,
  idsAfter?: (result: T) => readonly number[]
): Promise<T> {
  let before: productsService.ProductView[] | null = [];
  try {
    if (ids.length > 0) before = await productsService.listProducts(auth.storeId, ids);
  } catch (error) {
    before = null;
    logger.warn('Menu journal: card not read before the write', { error: errorMessage(error) });
  }
  const result = await write();
  if (before) {
    try {
      const after = idsAfter ? idsAfter(result) : ids;
      if (after.length > 0) {
        await recordProductChanges(auth, before, await productsService.listProducts(auth.storeId, after));
      }
    } catch (error) {
      logger.warn('Menu journal: card not read after the write', { error: errorMessage(error) });
    }
  }
  return result;
}

/** The card a variant belongs to, for the journal. */
async function productOfVariant(storeId: number, variantId: number): Promise<number[]> {
  const row = await pool.query(`SELECT product_id FROM pos_variants WHERE id = $1 AND store_id = $2`, [variantId, storeId]);
  return row.rows.length === 0 ? [] : [Number(row.rows[0].product_id)];
}

function productIdOf(result: unknown): readonly number[] {
  const id = (result as { id?: unknown } | null)?.id;
  return typeof id === 'number' ? [id] : [];
}

export function registerProductsRoutes(fastify: FastifyInstance): void {
  fastify.get('/products', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    return forRole(auth, await productsService.listProducts(auth.storeId));
  });

  /**
   * «Техкарти» — every composite with what it costs to assemble and what share
   * of its price that is. Static segment, declared BEFORE `/products/:id` so
   * it is never read as a product id.
   */
  fastify.get('/products/tech-cards', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    return listTechCards(pool, auth.storeId);
  });

  // «Імпорт техкарт» (TechDocs/POS_ONBOARDING.md, O3): the client parses the
  // owner's table and sends its rows; without `apply` the plan, with it the
  // write — all or nothing, and a plan with errors writes nothing (200 with
  // `applied: false`, the errors in it).
  fastify.post('/products/tech-cards/import', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const body = (request.body ?? {}) as { rows?: unknown; apply?: unknown };
    if (!Array.isArray(body.rows)) return reply.code(400).send({ error: 'rows required' });
    try {
      const rows = body.rows as techCardsImport.TechCardRowInput[];
      if (body.apply === true) return await techCardsImport.applyTechCardImport(auth.storeId, rows);
      return { ...(await techCardsImport.planTechCardImport(auth.storeId, rows)), applied: false };
    } catch (error) {
      if (error instanceof techCardsImport.TechCardImportError) return reply.code(400).send({ error: errorMessage(error) });
      throw error;
    }
  });

  fastify.get('/products/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const product = await productsService.getProduct(auth.storeId, Number(id));
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return forRole(auth, product);
  });

  fastify.post('/products', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    try {
      if (auth.role === 'marketer') assertMarketerProductWrite(request.body, null);
      const product = await withMenuJournal(
        auth,
        [],
        () => productsService.createProduct(auth.storeId, request.body as productsService.CreateProductInput),
        productIdOf
      );
      // A dish's description, composition and allergens are on the guest's page:
      // what an owner just wrote must not wait out the menu's 15 s cache.
      invalidatePublicMenu(auth.storeId);
      return reply.code(201).send(forRole(auth, product));
    } catch (error) {
      if (error instanceof MarketerFieldError) return sendMarketerRefusal(reply, error);
      const status = isUniqueViolation(error) ? 409 : 400;
      logger.error('Create product failed', { error: errorMessage(error) });
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/products/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      if (auth.role === 'marketer') {
        const current = await productsService.getProduct(auth.storeId, Number(id));
        if (!current) return reply.code(404).send({ error: 'Product not found' });
        assertMarketerProductWrite(request.body, current as unknown as Record<string, unknown>);
      }
      const product = await withMenuJournal(auth, [Number(id)], () =>
        productsService.updateProduct(
          auth.storeId,
          Number(id),
          request.body as Parameters<typeof productsService.updateProduct>[2]
        )
      );
      // Allergens are the one thing on that page a stale copy can hurt someone
      // over, so the change is visible at once (see `invalidatePublicMenu`).
      invalidatePublicMenu(auth.storeId);
      return forRole(auth, product);
    } catch (error) {
      if (error instanceof MarketerFieldError) return sendMarketerRefusal(reply, error);
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/uploads', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
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
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      if (auth.role === 'marketer') assertMarketerVariantWrite(request.body, null);
      const product = await withMenuJournal(auth, [Number(id)], () =>
        productsService.addVariant(auth.storeId, Number(id), request.body as productsService.VariantInput)
      );
      return reply.code(201).send(forRole(auth, product));
    } catch (error) {
      if (error instanceof MarketerFieldError) return sendMarketerRefusal(reply, error);
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  // A whole size × colour matrix in one request (TechDocs/POS_CLOTHING.md, C1):
  // all of it or nothing, and a clash says which article or barcode was taken.
  fastify.post('/products/:id/variants/batch', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { variants?: productsService.VariantInput[] };
    try {
      if (auth.role === 'marketer') for (const variant of body.variants ?? []) assertMarketerVariantWrite(variant, null);
      const product = await withMenuJournal(auth, [Number(id)], () =>
        productsService.addVariants(auth.storeId, Number(id), body.variants ?? [])
      );
      return reply.code(201).send(forRole(auth, product));
    } catch (error) {
      if (error instanceof MarketerFieldError) return sendMarketerRefusal(reply, error);
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  // Mint a store-local barcode for a tag that will not scan. Static segment,
  // so it never shadows `PATCH /variants/:id`.
  fastify.post('/variants/internal-barcode', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    try {
      return { barcode: await productsService.generateInternalBarcode(auth.storeId) };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/variants/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      if (auth.role === 'marketer') {
        const current = await findVariant(auth.storeId, Number(id));
        if (!current) return reply.code(400).send({ error: 'Variant not found' });
        assertMarketerVariantWrite(request.body, current);
      }
      return forRole(
        auth,
        await withMenuJournal(auth, await productOfVariant(auth.storeId, Number(id)), () =>
          productsService.updateVariant(
            auth.storeId,
            Number(id),
            request.body as Parameters<typeof productsService.updateVariant>[2]
          )
        )
      );
    } catch (error) {
      if (error instanceof MarketerFieldError) return sendMarketerRefusal(reply, error);
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/products/:id/archive', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return forRole(
        auth,
        await withMenuJournal(auth, [Number(id)], () => productsService.archiveProduct(auth.storeId, Number(id)))
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // The archive's way back (the list's «Архів» filter → «Повернути»).
  fastify.post('/products/:id/restore', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const product = await withMenuJournal(auth, [Number(id)], () =>
        productsService.restoreProduct(auth.storeId, Number(id))
      );
      // A restored dish is on the guest menu again at once, like any edit.
      invalidatePublicMenu(auth.storeId);
      return forRole(auth, product);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/variants/:id/archive', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return forRole(
        auth,
        await withMenuJournal(auth, await productOfVariant(auth.storeId, Number(id)), () =>
          productsService.archiveVariant(auth.storeId, Number(id))
        )
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.put('/products/:id/tags', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { tag_ids?: number[] };
    try {
      const tagIds = await withMenuJournal(auth, [Number(id)], () =>
        tagsService.setProductTags(auth.storeId, Number(id), body.tag_ids ?? [])
      );
      return { tag_ids: tagIds };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Tags ──────────────────────────────────────────────

  fastify.get('/tags', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply, { allow: 'menu.catalog' });
    if (!auth) return;
    return tagsService.listTags(auth.storeId);
  });

  fastify.post('/tags', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const body = request.body as {
      name?: string;
      parent_id?: number | null;
      sort_order?: number;
      color?: string | null;
      show_in_catalog_bar?: boolean;
      station?: string | null;
    };
    try {
      if (!body.name) return reply.code(400).send({ error: 'name required' });
      const tag = await tagsService.createTag(auth.storeId, {
        name: body.name,
        parent_id: body.parent_id,
        sort_order: body.sort_order,
        color: body.color,
        show_in_catalog_bar: body.show_in_catalog_bar,
        station: body.station,
      });
      return reply.code(201).send(tag);
    } catch (error) {
      const status = isUniqueViolation(error) ? 409 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  fastify.patch('/tags/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
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
          station?: string | null;
        }
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.delete('/tags/:id', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
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
    const auth = await ensureModule(request, reply, 'products', { owner: true, allow: 'menu.catalog' });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as { product_ids?: number[] };
    try {
      const ids = (body.product_ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      return await withMenuJournal(auth, ids, () =>
        tagsService.assignTagToProducts(auth.storeId, Number(id), body.product_ids ?? [])
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  // ── Menu change journal (migration 101) ───────────────
  // Owner only: the rows carry purchase prices and every staff member's name.
  fastify.get('/menu-changes', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const q = (request.query ?? {}) as Record<string, string | undefined>;
    const entity: MenuEntity | undefined =
      q.entity === 'product' || q.entity === 'modifier_group' ? q.entity : undefined;
    const entityId = q.entity_id != null && /^\d+$/.test(q.entity_id) ? Number(q.entity_id) : undefined;
    if (q.entity_id != null && entityId == null) return reply.code(400).send({ error: 'entity_id must be a number' });
    return listMenuChanges(auth.storeId, {
      entity,
      entityId,
      limit: q.limit != null && /^\d+$/.test(q.limit) ? Number(q.limit) : undefined,
      offset: q.offset != null && /^\d+$/.test(q.offset) ? Number(q.offset) : undefined,
    });
  });

  // ── Markdowns (одяг D2) ───────────────────────────────
  // Owner-only, like every other price write. The service drops the guest
  // menu's cache itself (no import cycle on this file, unlike products).
  fastify.get('/markdowns', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    return markdownsService.listMarkdowns(auth.storeId);
  });

  fastify.post('/markdowns/preview', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    try {
      return await markdownsService.previewMarkdown(
        auth.storeId,
        request.body as markdownsService.MarkdownInput
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/markdowns', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    try {
      return await markdownsService.createMarkdown(
        auth.storeId,
        auth.staffId,
        request.body as markdownsService.MarkdownInput
      );
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/markdowns/:id/end', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'products', { owner: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      return await markdownsService.endMarkdown(auth.storeId, Number(id), auth.staffId, 'manual');
    } catch (error) {
      const status = error instanceof markdownsService.MarkdownNotFound ? 404 : 400;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });

  // ── Customers ─────────────────────────────────────────
}
