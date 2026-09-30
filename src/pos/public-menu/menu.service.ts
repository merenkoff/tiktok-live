// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/menu.service.ts — the guest's menu (TechDocs/POS_QR_MENU.md).
//
// A page a customer opens by scanning a QR, with no login. Three rules decide
// the shape of everything here:
//
// 1. A PROJECTION, not `GET /catalog`. The till's answer carries the stock
//    figure (for a derived drink, `MIN(floor(leaf_stock / qty))` — a number
//    that spells out how much milk is left), the recipe, SKUs, barcodes and
//    the write-off behind each modifier. None of that is a guest's business,
//    so `PublicMenu` names what leaves, field by field, and everything else
//    stays behind by default. `getCatalog` is still the one place that knows
//    what «available» means — it is reused, then narrowed.
//
// 2. Keyed on a TOKEN, never the slug. The slug is the store half of the
//    till's PIN login, so it must not be printed on a table.
//
// 3. Cheap under a crowd. Every scan is an unauthenticated read that would
//    otherwise walk stock arithmetic over the store's whole menu, and the
//    pool it shares with the tills is small. A short in-process cache
//    answers repeat scans; `invalidatePublicMenu` (called by the stop-list
//    toggle and by the owner's own switches) makes the change the person at
//    the counter just made visible at once. The cache is per process — fine
//    while there is one API instance, and the place to look if that changes.

import crypto from 'crypto';
import { pool } from '../../db.js';
import { getCatalog } from '../products.service.js';
import { listTagsFlat, type PosTag } from '../tags.service.js';
import { storeClock } from '../core/storeClock.js';
import { verticalOrDefault } from '../verticals/index.js';
import { issuePrintLink } from './table-keys.js';
import type { CatalogItem } from '../types.js';

/** What a URL token looks like. Checked before any query, so junk never reaches the database. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** How long a built menu is reused. The stop-list bypasses it (see `invalidatePublicMenu`). */
const CACHE_TTL_MS = 15_000;

const DESCRIPTION_MAX = 600;

/** The word for a size that has no caption, when the drink has more than one. */
const DEFAULT_SIZE_LABEL = 'Стандарт';

export interface PublicMenuVariant {
  id: number;
  label: string;
  price_cents: number;
  available: boolean;
}

export interface PublicMenuModifier {
  /** What a guest's request names an answer by; the waiter's accept re-resolves it against the live groups. */
  id: number;
  name: string;
  price_delta_cents: number;
  is_default: boolean;
}

export interface PublicMenuGroup {
  id: number;
  name: string;
  min_select: number;
  max_select: number;
  modifiers: PublicMenuModifier[];
}

export interface PublicMenuProduct {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  /** On the day's stop-list. Wins over «немає» in what the guest reads. */
  stopped: boolean;
  /** At least one size can be had today. */
  available: boolean;
  from_price_cents: number;
  variants: PublicMenuVariant[];
  modifier_groups: PublicMenuGroup[];
}

export interface PublicMenuCategory {
  /** The tag's id; null for the trailing «Інше». */
  id: number | null;
  name: string;
  products: PublicMenuProduct[];
}

export interface PublicMenu {
  store: { name: string };
  /** The store-local `YYYY-MM-DD`: the page reloads itself when this rolls over. */
  store_day: string;
  generated_at: string;
  categories: PublicMenuCategory[];
}

/** The public face of a store row — no secrets, no settings, nothing but what the page needs. */
interface MenuStore {
  id: number;
  name: string;
  /** The owner lets a guest read their own table's bill (phase Q5). */
  billEnabled: boolean;
  /** The owner lets a guest send dishes to a waiter for acceptance (phase Q6). */
  orderingEnabled: boolean;
}

/** A table, as far as a guest is told: what the QR on it says, and which room it is in. */
export interface MenuTable {
  id: number;
  name: string;
  hall: string;
}

export class PublicMenuError extends Error {}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || 'https://the-live.shop').replace(/\/+$/, '');
}

export function menuUrl(token: string): string {
  return `${publicBaseUrl()}/m/${token}`;
}

/**
 * The address a table's QR carries: the menu, plus which table asked. Without
 * a key it only captions the page; with the table's key (`?k=`) the guest may
 * also read that table's bill.
 */
export function tableMenuUrl(token: string, tableId: number, key?: string): string {
  return `${menuUrl(token)}?t=${tableId}${key ? `&k=${key}` : ''}`;
}

// ── tables ──────────────────────────────────────────────────────────

/** A table id as it comes in a query string: plain digits, and short enough to be an exact JS number. */
export const TABLE_ID_RE = /^[1-9]\d{0,14}$/;

/**
 * The table a `?t=` names — or null for anything that is not one of THIS
 * store's live tables: a foreign id, a retired table, a retired room, junk.
 * Null is not an error: a QR on a table that was later deleted must still
 * open the menu, just without a table's name on it. The row is looked up by
 * `store_id` as well as by id (ids are one sequence for every store, so a
 * guest counting upward would otherwise read other restaurants' tables), and
 * only the name and the room ever leave.
 */
export async function findMenuTable(storeId: number, raw: unknown): Promise<MenuTable | null> {
  if (typeof raw !== 'string' || !TABLE_ID_RE.test(raw)) return null;
  const result = await pool.query(
    `SELECT t.id, t.name, h.name AS hall
     FROM pos_tables t
     JOIN pos_halls h ON h.id = t.hall_id
     WHERE t.id = $1::bigint AND t.store_id = $2 AND t.is_active = TRUE AND h.is_active = TRUE`,
    [raw, storeId]
  );
  const row = result.rows[0];
  return row ? { id: Number(row.id), name: String(row.name), hall: String(row.hall) } : null;
}

/** Every live table of the store, room by room, in the order a person reads them («2» before «10»). */
export async function listMenuTables(storeId: number): Promise<MenuTable[]> {
  const result = await pool.query(
    `SELECT t.id, t.name, h.name AS hall
     FROM pos_tables t
     JOIN pos_halls h ON h.id = t.hall_id
     WHERE t.store_id = $1 AND t.is_active = TRUE AND h.is_active = TRUE
     ORDER BY h.sort_order ASC, h.id ASC`,
    [storeId]
  );
  // SQL orders the rooms; within a room the names sort as numbers do.
  const rooms = new Map<string, MenuTable[]>();
  for (const row of result.rows) {
    const table = { id: Number(row.id), name: String(row.name), hall: String(row.hall) };
    rooms.set(table.hall, [...(rooms.get(table.hall) ?? []), table]);
  }
  return [...rooms.values()].flatMap((tables) =>
    tables.sort((a, b) => a.name.localeCompare(b.name, 'uk', { numeric: true }))
  );
}

async function countMenuTables(storeId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM pos_tables t
     JOIN pos_halls h ON h.id = t.hall_id
     WHERE t.store_id = $1 AND t.is_active = TRUE AND h.is_active = TRUE`,
    [storeId]
  );
  return Number(result.rows[0]?.n ?? 0);
}

// ── projection ──────────────────────────────────────────────────────

/**
 * A picture the guest's browser may be told to load. The value is whatever
 * the owner (or a GTIN lookup) put in `image_url`: a site-relative upload or
 * demo path, an https URL — and, in principle, `javascript:` or a `data:`
 * blob. Only the first two go out.
 */
export function safeImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https:\/\//i.test(value)) return value;
  return null;
}

/** The nearest tag at or above `tagId` that is a tab on the till's bar, if any. */
function barTagFor(tagId: number, byId: Map<number, PosTag>): PosTag | null {
  const seen = new Set<number>();
  let cursor = byId.get(tagId);
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.show_in_catalog_bar) return cursor;
    seen.add(cursor.id);
    cursor = cursor.parent_id == null ? undefined : byId.get(cursor.parent_id);
  }
  return null;
}

function projectProduct(rows: CatalogItem[], description: string): PublicMenuProduct {
  const first = rows[0]!;
  const stopped = first.stop_listed;
  const sorted = [...rows].sort((a, b) => a.price_cents - b.price_cents || a.variant_id - b.variant_id);
  const sized = sorted.length > 1;
  const variants: PublicMenuVariant[] = sorted.map((row) => ({
    id: row.variant_id,
    label: row.label || (sized ? DEFAULT_SIZE_LABEL : ''),
    price_cents: row.price_cents,
    // «Stopped» is a fact about the dish, «quantity» about the size: the till
    // greys a size chip that is out even while the others sell.
    available: !stopped && row.quantity > 0,
  }));
  const groups = (first.modifier_groups ?? [])
    .map((group) => ({
      id: group.id,
      name: group.name,
      min_select: group.min_select,
      max_select: group.max_select,
      // Written out field by field: the till's group also carries the
      // ingredient each answer writes off, and that stays behind.
      modifiers: group.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        price_delta_cents: m.price_delta_cents,
        is_default: m.is_default,
      })),
    }))
    .filter((group) => group.modifiers.length > 0);
  return {
    id: first.product_id,
    name: first.product_name,
    description,
    image_url: safeImageUrl(first.image_url),
    stopped,
    available: variants.some((v) => v.available),
    from_price_cents: Math.min(...variants.map((v) => v.price_cents)),
    variants,
    modifier_groups: groups,
  };
}

/**
 * Categories the way the till's bar has them: the tags flagged
 * `show_in_catalog_bar`, in the tag order. A product sits in ONE of them (the
 * till repeats it in every tab; on one scrolling page a repeat is noise): the
 * first, in that order, of the bar tags its own tags resolve to. What has no
 * bar tag lands in a trailing «Інше», and a tab with nothing to show — the
 * ingredient shelf included, which is never sellable anyway — is dropped.
 */
export function groupIntoCategories(
  products: Array<{ product: PublicMenuProduct; tagIds: number[] }>,
  tags: PosTag[]
): PublicMenuCategory[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const bar = tags.filter((tag) => tag.show_in_catalog_bar);
  const rank = new Map(bar.map((tag, index) => [tag.id, index]));
  const buckets = new Map<number | null, PublicMenuProduct[]>();
  for (const { product, tagIds } of products) {
    let home: PosTag | null = null;
    for (const tagId of tagIds) {
      const candidate = barTagFor(tagId, byId);
      if (candidate && (!home || rank.get(candidate.id)! < rank.get(home.id)!)) home = candidate;
    }
    const key = home ? home.id : null;
    buckets.set(key, [...(buckets.get(key) ?? []), product]);
  }
  const categories: PublicMenuCategory[] = [];
  for (const tag of bar) {
    const items = buckets.get(tag.id);
    if (items?.length) categories.push({ id: tag.id, name: tag.name, products: items });
  }
  const rest = buckets.get(null);
  if (rest?.length) categories.push({ id: null, name: 'Інше', products: rest });
  return categories;
}

async function buildPublicMenu(store: MenuStore): Promise<PublicMenu> {
  const clock = await storeClock(pool, store.id);
  // `snapshot`: without it the query stops at 200 rows, alphabetically — a
  // big menu would silently lose its last letters.
  const rows = await getCatalog(store.id, { snapshot: true, vertical: clock.vertical });
  const byProduct = new Map<number, CatalogItem[]>();
  for (const row of rows) {
    byProduct.set(row.product_id, [...(byProduct.get(row.product_id) ?? []), row]);
  }
  const ids = [...byProduct.keys()];
  const descriptions = new Map<number, string>();
  if (ids.length > 0) {
    const result = await pool.query(
      `SELECT id, description FROM pos_products WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [store.id, ids]
    );
    for (const row of result.rows) {
      const text = typeof row.description === 'string' ? row.description.trim() : '';
      descriptions.set(Number(row.id), text.slice(0, DESCRIPTION_MAX));
    }
  }
  const products = [...byProduct.entries()].map(([id, group]) => ({
    product: projectProduct(group, descriptions.get(id) ?? ''),
    tagIds: group[0]!.tag_ids ?? [],
  }));
  const tags = await listTagsFlat(store.id);
  return {
    store: { name: store.name },
    store_day: clock.today,
    generated_at: new Date().toISOString(),
    categories: groupIntoCategories(products, tags),
  };
}

// ── cache and lookup ────────────────────────────────────────────────

interface Cached<T> {
  value: T;
  expires: number;
}

const storeByToken = new Map<string, Cached<MenuStore>>();
const menuByStore = new Map<number, Cached<PublicMenu>>();
const inflight = new Map<number, Promise<PublicMenu>>();
/** Bumped by every invalidation: a build that started before one must not be cached after it. */
const generation = new Map<number, number>();

/**
 * Forget what is cached for a store. Called by the stop-list toggle (a dish
 * the barista just stopped should grey on the guest's phone within one poll,
 * not fifteen seconds and a poll later) and by the owner's switches.
 */
export function invalidatePublicMenu(storeId: number): void {
  generation.set(storeId, (generation.get(storeId) ?? 0) + 1);
  menuByStore.delete(storeId);
  inflight.delete(storeId);
  for (const [token, entry] of storeByToken) {
    if (entry.value.id === storeId) storeByToken.delete(token);
  }
}

/** Test seam: start from an empty cache. */
export function resetPublicMenuCache(): void {
  storeByToken.clear();
  menuByStore.clear();
  inflight.clear();
  generation.clear();
}

/**
 * The store behind a token, or null — for a malformed token, an unknown one,
 * a rotated one and a switched-off menu alike. The caller answers all four
 * with the same page, so the response never says which slugs or tokens exist.
 * A store whose vertical has no kitchen (the owner changed it, or the super
 * admin did) stops publishing too: the menu is a café's.
 */
export async function findMenuStore(token: string): Promise<MenuStore | null> {
  if (!TOKEN_RE.test(token)) return null;
  const hit = storeByToken.get(token);
  if (hit && hit.expires > Date.now()) return hit.value;
  const result = await pool.query(
    `SELECT id, name, vertical, public_menu_enabled, public_menu_bill, public_menu_ordering
     FROM pos_stores
     WHERE public_menu_token = $1`,
    [token]
  );
  const row = result.rows[0];
  if (!row || row.public_menu_enabled !== true) return null;
  if (!verticalOrDefault(row.vertical as string | undefined).kitchen) return null;
  const store: MenuStore = {
    id: Number(row.id),
    name: String(row.name),
    billEnabled: row.public_menu_bill === true,
    orderingEnabled: row.public_menu_ordering === true,
  };
  storeByToken.set(token, { value: store, expires: Date.now() + CACHE_TTL_MS });
  return store;
}

/** The published menu behind a token, or null (see `findMenuStore`). */
export async function loadPublicMenu(token: string): Promise<{ store: MenuStore; menu: PublicMenu } | null> {
  const store = await findMenuStore(token);
  if (!store) return null;
  const cached = menuByStore.get(store.id);
  if (cached && cached.expires > Date.now()) return { store, menu: cached.value };
  let pending = inflight.get(store.id);
  if (!pending) {
    const startedAt = generation.get(store.id) ?? 0;
    pending = buildPublicMenu(store)
      .then((menu) => {
        if ((generation.get(store.id) ?? 0) === startedAt) {
          menuByStore.set(store.id, { value: menu, expires: Date.now() + CACHE_TTL_MS });
        }
        return menu;
      })
      .finally(() => {
        if (inflight.get(store.id) === pending) inflight.delete(store.id);
      });
    inflight.set(store.id, pending);
  }
  return { store, menu: await pending };
}

// ── the owner's switch ──────────────────────────────────────────────

export interface PublicMenuSettings {
  /** This kind of store can publish a menu at all (its vertical has a kitchen). */
  available: boolean;
  enabled: boolean;
  token: string | null;
  url: string | null;
  /**
   * How many live tables the store has: the owner's card offers «QR для всіх
   * столів» only when there is something to print. Zero for a café with no
   * halls, which is most of them.
   */
  tables: number;
  /** A guest may read the bill of their own table (their QR carries the table's key). */
  bill_enabled: boolean;
  /**
   * A guest may send dishes to a waiter, who accepts them. Only meaningful
   * once the waiters' screens show the requests; off until the owner says so.
   */
  ordering_enabled: boolean;
  /**
   * A short-lived signed suffix (`?p=`) for the print pages: without it
   * `/m/<token>/qr` and `/tables` print QR codes with no table key in them,
   * because the store token is visible to every guest. Null until there is a
   * token. Only ever sent to the owner.
   */
  print: string | null;
}

const NOT_AVAILABLE = 'Меню за QR доступне для кав’ярні й ресторану';

function newToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

function toSettings(row: Record<string, unknown> | undefined, tables = 0, print: string | null = null): PublicMenuSettings {
  const token = typeof row?.public_menu_token === 'string' ? row.public_menu_token : null;
  return {
    available: verticalOrDefault(row?.vertical as string | undefined).kitchen,
    enabled: row?.public_menu_enabled === true,
    token,
    url: token ? menuUrl(token) : null,
    tables,
    bill_enabled: row?.public_menu_bill === true,
    ordering_enabled: row?.public_menu_ordering === true,
    print: token ? print : null,
  };
}

/** The settings as the owner's screen reads them: the row, the table count, a fresh print link. */
async function settingsFor(storeId: number, row: Record<string, unknown>): Promise<PublicMenuSettings> {
  const token = typeof row.public_menu_token === 'string';
  return toSettings(row, await countMenuTables(storeId), token ? await issuePrintLink(storeId) : null);
}

async function readRow(storeId: number): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `SELECT vertical, public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  const row = result.rows[0];
  if (!row) throw new PublicMenuError('Магазин не знайдено');
  return row;
}

export async function getPublicMenuSettings(storeId: number): Promise<PublicMenuSettings> {
  return settingsFor(storeId, await readRow(storeId));
}

/**
 * Switch the guest menu on or off. The first switch-on issues the token;
 * switching off keeps it, so turning the menu back on revives the QR codes
 * already standing on the tables (rotate to retire them instead).
 */
export async function setPublicMenuEnabled(storeId: number, enabled: boolean): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (enabled && !toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
  const hasToken = typeof row.public_menu_token === 'string';
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await pool.query(
        `UPDATE pos_stores
         SET public_menu_enabled = $2,
             public_menu_token = COALESCE(public_menu_token, $3),
             updated_at = NOW()
         WHERE id = $1
         RETURNING vertical, public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering`,
        [storeId, enabled, enabled && !hasToken ? newToken() : null]
      );
      invalidatePublicMenu(storeId);
      return settingsFor(storeId, result.rows[0]);
    } catch (error) {
      // A 144-bit collision is not going to happen; the retry is for the
      // principle that a unique index can always say no.
      if (!isUniqueViolation(error) || attempt >= 2) throw error;
    }
  }
}

/** Issue a new token: every printed QR stops working. Whether the menu is on is untouched. */
export async function rotatePublicMenuToken(storeId: number): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (!toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await pool.query(
        // The print-link secret goes with the token: a link the owner's screen
        // holds for the old address must not open the print pages of the new one.
        `UPDATE pos_stores
         SET public_menu_token = $2, public_menu_secret = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING vertical, public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering`,
        [storeId, newToken()]
      );
      invalidatePublicMenu(storeId);
      return settingsFor(storeId, result.rows[0]);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 2) throw error;
    }
  }
}

/**
 * Let guests read the bill of their own table, or stop. Independent of the
 * menu's own switch — it only ever has an effect while the menu is published —
 * so an owner can decide it before or after switching the menu on.
 */
export async function setPublicMenuBill(storeId: number, enabled: boolean): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (enabled && !toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_bill = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING vertical, public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering`,
    [storeId, enabled]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}

/**
 * Let guests send dishes to a waiter, or stop. Like the bill switch it is
 * independent of the menu's own and only has an effect while the menu is
 * published. Requests already waiting are left as they are — a waiter can
 * still answer them.
 */
export async function setPublicMenuOrdering(storeId: number, enabled: boolean): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (enabled && !toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_ordering = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING vertical, public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering`,
    [storeId, enabled]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}
