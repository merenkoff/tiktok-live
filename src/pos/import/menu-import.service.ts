// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/import/menu-import.service.ts — the super admin's «Імпорт з ChoiceQR»
// (TechDocs/POS_ONBOARDING.md, O2): the plan from `choiceqr.ts` written into a
// store. In chunks, because a menu of 174 dishes with their photos is longer
// than one request should take; every chunk re-reads what the store already
// has, so a chunk sent twice — or the whole import run again — creates nothing
// twice. Dishes arrive `simple` with zero stock: the owner's tech-card import
// (O3) turns the cooked ones into recipes, a first receipt fills the bottles.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import { createProductInTx } from '../products.service.js';
import { createTag } from '../tags.service.js';
import { saveImageBuffer } from '../uploads.service.js';
import { getStoreProfile, invalidatePublicMenu, updateStoreProfile } from '../public-menu/menu.service.js';
import { normalizeProfilePatch } from '../public-menu/profile.js';
import { verticalOrDefault } from '../verticals/index.js';
import {
  fetchChoiceQrMenu,
  fetchChoiceQrPhoto,
  MenuImportError,
  menuUrl,
  planMenuImport,
  productKey,
  type ChoiceQrMenu,
  type ExistingCatalog,
  type MenuImportPlan,
} from './choiceqr.js';

/** One parsed page serves a whole run of chunks; the API is one process (POS_SINGLE_INSTANCE.md). */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; menu: ChoiceQrMenu }>();
export const CHUNK_MAX = 40;

export function resetMenuImportCache(): void {
  cache.clear();
}

async function loadMenu(raw: string): Promise<ChoiceQrMenu> {
  const key = menuUrl(raw).toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.menu;
  const menu = await fetchChoiceQrMenu(key);
  cache.set(key, { at: Date.now(), menu });
  return menu;
}

async function assertKitchenStore(storeId: number): Promise<void> {
  const row = (await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId])).rows[0];
  if (!row) throw new MenuImportError('Магазин не знайдено');
  const vertical = verticalOrDefault(row.vertical as string | null);
  if (!vertical.kitchen) {
    throw new MenuImportError(`Імпорт меню — для кафе й ресторанів, а цей магазин має тип «${vertical.title}»`);
  }
}

async function readExisting(storeId: number): Promise<ExistingCatalog & { tagIds: Map<string, number> }> {
  const tags = await pool.query(
    `SELECT id, lower(name) AS name FROM pos_tags WHERE store_id = $1 AND parent_id IS NULL`,
    [storeId]
  );
  const products = await pool.query(
    `SELECT lower(t.name) AS tag, lower(p.name) AS name
       FROM pos_products p
       JOIN pos_product_tags pt ON pt.product_id = p.id
       JOIN pos_tags t ON t.id = pt.tag_id
      WHERE p.store_id = $1 AND p.is_active`,
    [storeId]
  );
  return {
    tags: new Set(tags.rows.map((r) => String(r.name))),
    tagIds: new Map(tags.rows.map((r) => [String(r.name), Number(r.id)])),
    products: new Set(products.rows.map((r) => productKey(String(r.tag), String(r.name)))),
  };
}

export async function previewChoiceQrImport(storeId: number, url: string): Promise<MenuImportPlan> {
  await assertKitchenStore(storeId);
  const menu = await loadMenu(url);
  return planMenuImport(menu, await readExisting(storeId));
}

export interface MenuImportChunkResult {
  total: number;
  next_offset: number;
  done: boolean;
  created: string[];
  skipped_existing: number;
  photos_failed: string[];
  /** Only on the first chunk: which empty profile fields the page filled. */
  profile?: string[];
}

/**
 * The guest-facing details ChoiceQR knows — logo, address, phone, hours —
 * written only where the store's own profile is still empty: an import never
 * overwrites what the owner typed.
 */
async function fillProfile(storeId: number, menu: ChoiceQrMenu): Promise<string[]> {
  const current = await getStoreProfile(storeId);
  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  if (!current.address && menu.place.address) {
    patch.address = menu.place.address;
    filled.push('адреса');
  }
  if (!current.phone && menu.place.phone) {
    patch.phone = menu.place.phone;
    filled.push('телефон');
  }
  if (!current.hours && menu.place.hours) {
    patch.hours = menu.place.hours;
    filled.push('години роботи');
  }
  if (!current.logo_url && menu.place.logoUrl) {
    try {
      patch.logo_url = (await saveImageBuffer(await fetchChoiceQrPhoto(menu.place.logoUrl))).url;
      filled.push('логотип');
    } catch (error) {
      logger.warn('menu import: logo skipped', { storeId, error: (error as Error).message });
    }
  }
  if (Object.keys(patch).length) await updateStoreProfile(storeId, normalizeProfilePatch(patch));
  return filled;
}

export async function applyChoiceQrImport(
  storeId: number,
  url: string,
  range: { offset?: unknown; limit?: unknown }
): Promise<MenuImportChunkResult> {
  await assertKitchenStore(storeId);
  const offset = Math.max(0, Math.floor(Number(range.offset) || 0));
  const limit = Math.min(CHUNK_MAX, Math.max(1, Math.floor(Number(range.limit) || 20)));
  const menu = await loadMenu(url);
  const existing = await readExisting(storeId);
  const plan = planMenuImport(menu, existing);

  // Every chunk makes sure its tags exist — cheap, and a chunk never depends on
  // an earlier one having run.
  const tagIds = new Map(existing.tagIds);
  for (const [i, tag] of plan.tags.entries()) {
    if (tagIds.has(tag.name.toLowerCase())) continue;
    try {
      const created = await createTag(storeId, { name: tag.name, sort_order: i, show_in_catalog_bar: true, station: tag.station });
      tagIds.set(tag.name.toLowerCase(), created.id);
    } catch (error) {
      // Another chunk got there first: the unique index answers, the row is there.
      const again = await readExisting(storeId);
      const id = again.tagIds.get(tag.name.toLowerCase());
      if (id == null) throw error;
      tagIds.set(tag.name.toLowerCase(), id);
    }
  }

  const result: MenuImportChunkResult = {
    total: plan.products.length,
    next_offset: Math.min(plan.products.length, offset + limit),
    done: offset + limit >= plan.products.length,
    created: [],
    skipped_existing: 0,
    photos_failed: [],
  };
  if (offset === 0) result.profile = await fillProfile(storeId, menu);

  for (const product of plan.products.slice(offset, offset + limit)) {
    if (product.exists) {
      result.skipped_existing += 1;
      continue;
    }
    let imageUrl: string | null = null;
    if (product.photo_url) {
      try {
        imageUrl = (await saveImageBuffer(await fetchChoiceQrPhoto(product.photo_url))).url;
      } catch {
        result.photos_failed.push(product.name);
      }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { productId } = await createProductInTx(client, storeId, {
        name: product.name,
        description: product.description,
        image_url: imageUrl,
        menu_labels: product.labels,
        variants: product.variants.map((v) => ({
          attributes: v.size ? { size: v.size } : {},
          unit: 'шт',
          price_cents: v.price_cents,
          quantity: 0,
        })),
      });
      await client.query(`INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
        productId,
        tagIds.get(product.tag.toLowerCase()),
      ]);
      await client.query('COMMIT');
      result.created.push(product.name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new MenuImportError(`«${product.name}» не імпортовано: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  invalidatePublicMenu(storeId);
  logger.info('menu import: chunk applied', {
    storeId,
    offset,
    created: result.created.length,
    skipped: result.skipped_existing,
    photosFailed: result.photos_failed.length,
  });
  return result;
}
