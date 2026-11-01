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
// 2. Keyed on a TOKEN, not the slug. The slug is the store half of the
//    till's PIN login, so it is never printed on a table — unless the owner
//    asks for exactly that: «Коротка адреса» (migration 080) makes the menu
//    answer at `/m/<slug>` too, for a link in a social-network bio.
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
import { COMPOSITION_MAX, allergenLabels, type Allergen } from '../allergens.js';
import { menuLabelItems, type MenuLabel } from '../menu-labels.js';
import {
  groupHours,
  hoursTodayText,
  normalizeGoogleUrl,
  readCorkage,
  readHours,
  type Corkage,
  type HoursRow,
  type ProfilePatch,
  type WeekHours,
} from './profile.js';
import type { CatalogItem } from '../types.js';

/**
 * What `/m/<key>` may carry: a token, or — where the owner ticked «Коротка
 * адреса» (migration 080) — the store's slug, which can be as short as three
 * characters (`shablya` is seven, under a token's eight). Checked before any
 * query, so junk never reaches the database. The addresses themselves live in
 * `urls.ts` (pure), because the login and the bill print one of them too
 * (phase F7) and must not pull this module along; re-exported here for the
 * routes and the renderer that always read them from this file.
 */
export { MENU_KEY_RE, dishUrl, dishUrlBase, menuUrl, publicBaseUrl, tableMenuUrl } from './urls.js';
import { MENU_KEY_RE, menuUrl, slugKey } from './urls.js';
import { thumbUrlOf } from '../uploads.service.js';

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
  /** What the answer costs on the dish's first (cheapest) size. */
  price_delta_cents: number;
  /**
   * Only when the answer costs differently by size (migration 066 — the crust
   * that is dearer on the 50 см pizza): what it costs on each size, keyed by
   * variant id. Absent otherwise, so a menu with no such answer is unchanged.
   */
  price_delta_by_variant?: Record<string, number>;
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
  /** What is in it, in the owner's words (phase Q3b); empty when they have not said. NOT the recipe. */
  composition: string;
  /** The allergens the owner ticked, in canonical order; empty means «not said», never «none». */
  allergens: Allergen[];
  /** The chips under the name — «Гостре», «Хіт», … (phase F9), in canonical order; empty = none. */
  labels: MenuLabel[];
  /**
   * The facts line's numbers (phase F14, migration 087), each null for «not
   * said»: the calories of the portion as served, the strength in tenths of
   * a percent (45 = 4,5 %), the time in minutes. The page prints them as
   * words («420 ккал · міцність 4,5 % · готується ≈ 25 хв»).
   */
  kcal: number | null;
  strength_tenths: number | null;
  prep_minutes: number | null;
  image_url: string | null;
  /** The 264×264 WebP the card loads instead of the photo (F10), or null — then the card loads `image_url`. The sheet always loads `image_url`. */
  thumb_url: string | null;
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

/** What the page says about the place itself (phase Q3a). Every field but the name may be absent. */
export interface PublicMenuStore {
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  /** «08:00–22:00» or «зачинено» for today in the store's zone; null when the owner gave no hours. */
  hours_today: string | null;
  /** The week, neighbouring days with the same hours folded into one row; empty when no hours. */
  hours: HoursRow[];
  /** Phase F1: a contact email, the HANDLES of three networks (the page builds the links) and the place's Google card. */
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  google_url: string | null;
  /** Phase F2: the place's own-alcohol terms, or null when it shows none. */
  corkage: Corkage | null;
  /** Phase F3: the owner takes feedback from guests — the page draws the sheet and the buttons. */
  feedback_enabled: boolean;
}

export interface PublicMenu {
  store: PublicMenuStore;
  /**
   * A short hash of everything on the page the script does not patch by itself
   * (names, texts, allergens, prices, the place's details): an open page whose
   * `rev` no longer matches reloads, so an allergen the owner just corrected
   * does not stay wrong on a phone for the rest of the evening.
   */
  rev: string;
  /** The store-local `YYYY-MM-DD`: the page reloads itself when this rolls over. */
  store_day: string;
  generated_at: string;
  categories: PublicMenuCategory[];
}

/** The public face of a store row — no secrets, no settings, nothing but what the page needs. */
interface MenuStore {
  id: number;
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  hours: WeekHours | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  googleUrl: string | null;
  corkage: Corkage | null;
  /** The owner takes feedback from guests (phase F3), from any QR. */
  feedbackEnabled: boolean;
  /** The owner lets a guest read their own table's bill (phase Q5). */
  billEnabled: boolean;
  /** The owner lets a guest send dishes to a waiter for acceptance (phase Q6). */
  orderingEnabled: boolean;
  /** The owner lets a guest call a waiter or ask for the bill (phase Q8). */
  callEnabled: boolean;
  /** Whether a guest order goes straight to the kitchen instead of waiting (phase Q9). */
  autoKitchen: AutoKitchenMode;
  /** An order dearer than this waits for a waiter whatever `autoKitchen` says. */
  autoLimitCents: number;
}

/**
 * Q9. `off` — every guest order waits for a waiter (Q6); `reorders` — straight
 * to the kitchen when a waiter has already opened the table's bill; `all` —
 * always, the bill opening by itself.
 */
export type AutoKitchenMode = 'off' | 'reorders' | 'all';
export const AUTO_KITCHEN_MODES: readonly AutoKitchenMode[] = ['off', 'reorders', 'all'];
/** The owner's limit, in kopecks: 1 ₴ … 100 000 ₴ (the CHECK in migration 068). */
export const AUTO_LIMIT_MIN_CENTS = 100;
export const AUTO_LIMIT_MAX_CENTS = 10_000_000;

function autoModeOf(value: unknown): AutoKitchenMode {
  return value === 'reorders' || value === 'all' ? value : 'off';
}

/** A table, as far as a guest is told: what the QR on it says, and which room it is in. */
export interface MenuTable {
  id: number;
  name: string;
  hall: string;
}

export class PublicMenuError extends Error {}

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

/** The texts of a dish as the guest may read them — already blank for a card nobody has reviewed. */
interface DishTexts {
  description: string;
  composition: string;
  allergens: Allergen[];
  /** The owner's own ticks, so a card nobody has reviewed keeps them (unlike its texts). */
  labels: MenuLabel[];
  /** The owner's own numbers (F14) — kept on an unreviewed card for the same reason as the labels. */
  kcal: number | null;
  strength_tenths: number | null;
  prep_minutes: number | null;
}

const NO_TEXTS: DishTexts = {
  description: '',
  composition: '',
  allergens: [],
  labels: [],
  kcal: null,
  strength_tenths: null,
  prep_minutes: null,
};

function projectProduct(rows: CatalogItem[], texts: DishTexts): PublicMenuProduct {
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
  // Each catalog row carries what the answers cost on ITS size (066); the
  // groups themselves are the product's and the same on every row.
  const deltaOn = new Map<number, Map<number, number>>();
  for (const row of sorted) {
    const byModifier = new Map<number, number>();
    for (const group of row.modifier_groups ?? []) {
      for (const m of group.modifiers) byModifier.set(m.id, m.price_delta_cents);
    }
    deltaOn.set(row.variant_id, byModifier);
  }
  const groups = (sorted[0]!.modifier_groups ?? [])
    .map((group) => ({
      id: group.id,
      name: group.name,
      min_select: group.min_select,
      max_select: group.max_select,
      // Written out field by field: the till's group also carries the
      // ingredient each answer writes off, and that stays behind.
      modifiers: group.modifiers.map((m) => {
        const bySize = sorted.map((row) => [row.variant_id, deltaOn.get(row.variant_id)?.get(m.id) ?? m.price_delta_cents] as const);
        const varies = bySize.some(([, cents]) => cents !== m.price_delta_cents);
        return {
          id: m.id,
          name: m.name,
          price_delta_cents: m.price_delta_cents,
          ...(varies
            ? { price_delta_by_variant: Object.fromEntries(bySize.map(([id, cents]) => [String(id), cents])) }
            : {}),
          is_default: m.is_default,
        };
      }),
    }))
    .filter((group) => group.modifiers.length > 0);
  return {
    id: first.product_id,
    name: first.product_name,
    description: texts.description,
    composition: texts.composition,
    allergens: texts.allergens,
    labels: texts.labels,
    kcal: texts.kcal,
    strength_tenths: texts.strength_tenths,
    prep_minutes: texts.prep_minutes,
    image_url: safeImageUrl(first.image_url),
    thumb_url: thumbUrlOf(first.image_url),
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
  const texts = new Map<number, DishTexts>();
  // Sold at the till, never listed to a guest (migration 083): the cork fee
  // the waiter rings, a bag, a deposit. Left out here and nowhere else.
  const hidden = new Set<number>();
  if (ids.length > 0) {
    const result = await pool.query(
      `SELECT id, description, composition, allergens, menu_labels, kcal, strength_tenths, prep_minutes,
              needs_review, menu_hidden
       FROM pos_products WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [store.id, ids]
    );
    for (const row of result.rows) {
      if (row.menu_hidden === true) {
        hidden.add(Number(row.id));
        continue;
      }
      // The chips (F9) are the owner's own ticks, so they stay on a card
      // nobody has reviewed — unlike its texts, below.
      const labels = menuLabelItems(Array.isArray(row.menu_labels) ? (row.menu_labels as string[]) : []);
      // The numbers (F14) are the owner's own too; the CHECKs in 087 keep
      // them in range, so a stored value is printed as it is.
      const numbers = {
        kcal: row.kcal == null ? null : Number(row.kcal),
        strength_tenths: row.strength_tenths == null ? null : Number(row.strength_tenths),
        prep_minutes: row.prep_minutes == null ? null : Number(row.prep_minutes),
      };
      // A card nobody has reviewed yet (made from a receiving document or at the
      // bench) carries INTERNAL text — «Створено з приходу ПР-12» — in the very
      // field the guest reads. It stays off the page until the owner edits the
      // card, which clears the flag; the dish itself is still listed.
      if (row.needs_review === true) {
        texts.set(Number(row.id), { ...NO_TEXTS, labels, ...numbers });
        continue;
      }
      const description = typeof row.description === 'string' ? row.description.trim() : '';
      const composition = typeof row.composition === 'string' ? row.composition.trim() : '';
      texts.set(Number(row.id), {
        description: description.slice(0, DESCRIPTION_MAX),
        composition: composition.slice(0, COMPOSITION_MAX),
        allergens: allergenLabels(Array.isArray(row.allergens) ? (row.allergens as string[]) : []),
        labels,
        ...numbers,
      });
    }
  }
  const products = [...byProduct.entries()]
    .filter(([id]) => !hidden.has(id))
    .map(([id, group]) => ({
    product: projectProduct(group, texts.get(id) ?? NO_TEXTS),
    tagIds: group[0]!.tag_ids ?? [],
  }));
  const tags = await listTagsFlat(store.id);
  const categories = groupIntoCategories(products, tags);
  const publicStore: PublicMenuStore = {
    name: store.name,
    // The same gate every picture goes through: an owner-typed URL that is
    // not a site path or https never reaches an `<img>`.
    logo_url: safeImageUrl(store.logoUrl),
    address: store.address,
    phone: store.phone,
    hours_today: hoursTodayText(store.hours, new Date(), clock.timezone),
    hours: groupHours(store.hours),
    email: store.email,
    instagram: store.instagram,
    facebook: store.facebook,
    tiktok: store.tiktok,
    // Checked on the way in (https, a Google host); read back through the
    // same check, so a row written by hand can never put a `javascript:` link
    // on the page.
    google_url: readGoogleUrl(store.googleUrl),
    corkage: store.corkage,
    feedback_enabled: store.feedbackEnabled,
  };
  return {
    store: publicStore,
    rev: contentRev(publicStore, categories),
    store_day: clock.today,
    generated_at: new Date().toISOString(),
    categories,
  };
}

/**
 * The menu's content fingerprint. What the page's script already patches on its
 * own — a dish's «стоп»/«немає», a size being out — is left out, or every stop
 * would reload every phone; the day's hours are left out because the day rolling
 * over reloads the page anyway. Everything else, allergens included, goes in.
 */
function contentRev(store: PublicMenuStore, categories: PublicMenuCategory[]): string {
  const stable = {
    store: { ...store, hours_today: null },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: category.products.map(({ stopped: _stopped, available: _available, variants, ...rest }) => ({
        ...rest,
        variants: variants.map(({ available: _open, ...variant }) => variant),
      })),
    })),
  };
  return crypto.createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 12);
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
 *
 * The key may also be the store's slug, but only for a store whose owner
 * switched the short address on (`public_menu_slug_enabled`, migration 080):
 * the slug is the store half of the till's PIN login, so it is never an
 * address by default. A slug is matched case-blind (the till's login lower-
 * cases it too, and a bio link gets typed by hand); a token wins over a slug
 * if the two ever spell the same, which `setPublicMenuSlug` refuses to create.
 */
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** A stored Google link that no longer passes the check reads as none, never as a link. */
function readGoogleUrl(value: string | null): string | null {
  try {
    return normalizeGoogleUrl(value);
  } catch {
    return null;
  }
}

export async function findMenuStore(token: string): Promise<MenuStore | null> {
  if (!MENU_KEY_RE.test(token)) return null;
  const hit = storeByToken.get(token);
  if (hit && hit.expires > Date.now()) return hit.value;
  const result = await pool.query(
    `SELECT id, name, vertical, public_menu_enabled, public_menu_bill, public_menu_ordering,
            public_menu_call, public_menu_auto_kitchen, public_menu_auto_limit_cents, public_menu_feedback,
            public_logo_url, public_address, public_phone, public_hours,
            public_email, public_instagram, public_facebook, public_tiktok, public_google_url, public_corkage
     FROM pos_stores
     WHERE public_menu_token = $1
        OR (public_menu_slug_enabled AND slug = lower($1))
     ORDER BY (public_menu_token IS NOT DISTINCT FROM $1) DESC
     LIMIT 1`,
    [token]
  );
  const row = result.rows[0];
  if (!row || row.public_menu_enabled !== true) return null;
  if (!verticalOrDefault(row.vertical as string | undefined).kitchen) return null;
  const store: MenuStore = {
    id: Number(row.id),
    name: String(row.name),
    logoUrl: typeof row.public_logo_url === 'string' ? row.public_logo_url : null,
    address: typeof row.public_address === 'string' ? row.public_address : null,
    phone: typeof row.public_phone === 'string' ? row.public_phone : null,
    hours: readHours(row.public_hours),
    email: textOrNull(row.public_email),
    instagram: textOrNull(row.public_instagram),
    facebook: textOrNull(row.public_facebook),
    tiktok: textOrNull(row.public_tiktok),
    googleUrl: textOrNull(row.public_google_url),
    corkage: readCorkage(row.public_corkage),
    feedbackEnabled: row.public_menu_feedback === true,
    billEnabled: row.public_menu_bill === true,
    orderingEnabled: row.public_menu_ordering === true,
    callEnabled: row.public_menu_call === true,
    // Auto-sending is a way of ordering: with ordering off there is nothing to send.
    autoKitchen: row.public_menu_ordering === true ? autoModeOf(row.public_menu_auto_kitchen) : 'off',
    autoLimitCents: Number(row.public_menu_auto_limit_cents ?? 0),
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
  /** A guest may call a waiter or ask for the bill from their table (phase Q8). */
  call_enabled: boolean;
  /** Guests may leave feedback from any QR (phase F3). */
  feedback_enabled: boolean;
  /** Whether a guest order goes straight to the kitchen (phase Q9); always `off` while ordering is. */
  auto_kitchen: AutoKitchenMode;
  /** An order dearer than this, in kopecks, waits for a waiter. */
  auto_limit_cents: number;
  /** When the owner last confirmed the risks of auto-sending, or null if never. */
  auto_ack_at: string | null;
  /**
   * The menu also answers at `/m/<slug>` — the store code the till logs in
   * with — for a link in a social-network bio (migration 080). Off by
   * default: it hands out half of the till's login.
   */
  slug_enabled: boolean;
  /**
   * What that short address is (or would be once switched on), so the owner
   * sees it before ticking the box. Null for a slug that cannot be a URL.
   */
  slug_url: string | null;
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

/** Every column the owner's card reads — one list, so a setter cannot forget one in its RETURNING. */
const SETTINGS_COLUMNS = `vertical, slug, public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering,
  public_menu_call, public_menu_auto_kitchen, public_menu_auto_limit_cents, public_menu_auto_ack_at,
  public_menu_slug_enabled, public_menu_feedback`;

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
    call_enabled: row?.public_menu_call === true,
    feedback_enabled: row?.public_menu_feedback === true,
    auto_kitchen: autoModeOf(row?.public_menu_auto_kitchen),
    auto_limit_cents: Number(row?.public_menu_auto_limit_cents ?? 200000),
    auto_ack_at:
      row?.public_menu_auto_ack_at == null ? null : new Date(row.public_menu_auto_ack_at as string).toISOString(),
    slug_enabled: row?.public_menu_slug_enabled === true,
    slug_url: slugKey(row) ? menuUrl(slugKey(row) as string) : null,
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
    `SELECT ${SETTINGS_COLUMNS} FROM pos_stores WHERE id = $1`,
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
         RETURNING ${SETTINGS_COLUMNS}`,
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
         RETURNING ${SETTINGS_COLUMNS}`,
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
 * Let the menu answer at `/m/<slug>` too, or stop. For a link in a social-
 * network bio, where `the-live.shop/m/shablya` reads and `…/m/tbJbbIZX…` does
 * not. The token address and every printed QR keep working either way, and
 * rotating the token does not touch this address — switching it off does.
 * Like the bill switch it only has an effect while the menu is published.
 *
 * Refused for a slug some store's token already spells (the demo menus carry
 * readable tokens such as `demo-cafe-menu`): the token would win, and the
 * owner's short link would open someone else's menu.
 */
export async function setPublicMenuSlug(storeId: number, enabled: boolean): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (enabled) {
    if (!toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
    const slug = slugKey(row);
    if (!slug) throw new PublicMenuError('Код цього магазину не годиться для адреси меню');
    const taken = await pool.query(`SELECT 1 FROM pos_stores WHERE public_menu_token = $1 AND id <> $2`, [
      slug,
      storeId,
    ]);
    if (taken.rows.length > 0) throw new PublicMenuError('Ця коротка адреса вже зайнята іншим меню');
  }
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_slug_enabled = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [storeId, enabled]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
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
     RETURNING ${SETTINGS_COLUMNS}`,
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
    // Switching ordering off switches auto-sending off with it: switching
    // ordering back on later must not quietly revive a mode the owner had
    // confirmed for a different evening.
    `UPDATE pos_stores
     SET public_menu_ordering = $2,
         public_menu_auto_kitchen = CASE WHEN $2 THEN public_menu_auto_kitchen ELSE 'off' END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [storeId, enabled]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}

/**
 * Let guests call a waiter or ask for the bill (phase Q8), or stop. Like the
 * other switches it only has an effect while the menu is published, and only
 * on a table's QR — a call names a table. Calls already waiting stay waiting.
 */
export async function setPublicMenuCall(storeId: number, enabled: boolean): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (enabled && !toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_call = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [storeId, enabled]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}

/** Take feedback from guests, or stop (phase F3). Needs no tables: it works from the venue's QR. */
export async function setPublicMenuFeedback(storeId: number, enabled: boolean): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  if (enabled && !toSettings(row).available) throw new PublicMenuError(NOT_AVAILABLE);
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_feedback = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [storeId, enabled]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}

/** A value the owner can fix (400), as opposed to a state the store is in (409). */
export class PublicMenuBadRequest extends PublicMenuError {}
/** Raised when an owner raises auto-sending without confirming its risks. */
export class AutoKitchenAckRequired extends PublicMenuBadRequest {}

const AUTO_RANK: Record<AutoKitchenMode, number> = { off: 0, reorders: 1, all: 2 };

/**
 * Send guest orders straight to the kitchen (phase Q9), or stop. Raising the
 * mode — `off` → `reorders`, anything → `all` — needs the owner's explicit
 * «I understand the risks» (`ack`), which is recorded with who and when;
 * lowering it never does, because a safer setting must always be one tap away.
 * Only with ordering on: auto-sending is a way of ordering.
 */
export async function setPublicMenuAutoKitchen(
  storeId: number,
  staffId: number,
  mode: AutoKitchenMode,
  ack: boolean
): Promise<PublicMenuSettings> {
  const row = await readRow(storeId);
  const current = toSettings(row);
  if (mode !== 'off' && !current.available) throw new PublicMenuError(NOT_AVAILABLE);
  if (mode !== 'off' && !current.ordering_enabled) {
    throw new PublicMenuError('Спершу увімкніть замовлення гостей з телефону');
  }
  const raising = AUTO_RANK[mode] > AUTO_RANK[current.auto_kitchen];
  if (raising && !ack) {
    throw new AutoKitchenAckRequired('Підтвердіть, що ви прочитали ризики автовідправки на кухню');
  }
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_auto_kitchen = $2,
         public_menu_auto_ack_at = CASE WHEN $3 THEN NOW() ELSE public_menu_auto_ack_at END,
         public_menu_auto_ack_by = CASE WHEN $3 THEN $4::bigint ELSE public_menu_auto_ack_by END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [storeId, mode, raising, staffId]
  );
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}

/** The auto-send limit (phase Q9), in kopecks; an order dearer than this waits for a waiter. */
export async function setPublicMenuAutoLimit(storeId: number, cents: number): Promise<PublicMenuSettings> {
  if (!Number.isInteger(cents) || cents < AUTO_LIMIT_MIN_CENTS || cents > AUTO_LIMIT_MAX_CENTS) {
    throw new PublicMenuBadRequest('Ліміт має бути від 1 до 100 000 грн');
  }
  const result = await pool.query(
    `UPDATE pos_stores
     SET public_menu_auto_limit_cents = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [storeId, cents]
  );
  if (result.rows.length === 0) throw new PublicMenuError('Магазин не знайдено');
  invalidatePublicMenu(storeId);
  return settingsFor(storeId, result.rows[0]);
}

// ── the owner's profile card (phase Q3a) ────────────────────────────

/** The place's public details as the owner's card reads and edits them. */
export interface StoreProfile {
  /** This kind of store can publish a menu at all; the card hides itself when not. */
  available: boolean;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  /** Raw week for the editor: a missing day is closed; null = never said. */
  hours: WeekHours | null;
  email: string | null;
  /** Handles, as stored (no «@», no address). */
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  google_url: string | null;
  corkage: Corkage | null;
}

async function readProfile(storeId: number): Promise<StoreProfile> {
  const result = await pool.query(
    `SELECT vertical, public_logo_url, public_address, public_phone, public_hours,
            public_email, public_instagram, public_facebook, public_tiktok, public_google_url, public_corkage
       FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  const row = result.rows[0];
  if (!row) throw new PublicMenuError('Магазин не знайдено');
  return {
    available: verticalOrDefault(row.vertical as string | undefined).kitchen,
    logo_url: typeof row.public_logo_url === 'string' ? row.public_logo_url : null,
    address: typeof row.public_address === 'string' ? row.public_address : null,
    phone: typeof row.public_phone === 'string' ? row.public_phone : null,
    hours: readHours(row.public_hours),
    email: textOrNull(row.public_email),
    instagram: textOrNull(row.public_instagram),
    facebook: textOrNull(row.public_facebook),
    tiktok: textOrNull(row.public_tiktok),
    google_url: textOrNull(row.public_google_url),
    corkage: readCorkage(row.public_corkage),
  };
}

export function getStoreProfile(storeId: number): Promise<StoreProfile> {
  return readProfile(storeId);
}

/**
 * Write the fields the owner sent (already checked by `normalizeProfilePatch`)
 * and leave the rest alone, then make the change visible on the guest's page
 * at once. Refused for a store whose vertical has no kitchen: the profile has
 * no other place to appear.
 */
export async function updateStoreProfile(storeId: number, patch: ProfilePatch): Promise<StoreProfile> {
  const current = await readProfile(storeId);
  if (!current.available) throw new PublicMenuError(NOT_AVAILABLE);
  const values: unknown[] = [storeId];
  const sets: string[] = [];
  const set = (column: string, value: unknown, cast = ''): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };
  if (patch.logo_url !== undefined) set('public_logo_url', patch.logo_url);
  if (patch.address !== undefined) set('public_address', patch.address);
  if (patch.phone !== undefined) set('public_phone', patch.phone);
  if (patch.hours !== undefined) set('public_hours', patch.hours === null ? null : JSON.stringify(patch.hours), '::jsonb');
  if (patch.email !== undefined) set('public_email', patch.email);
  if (patch.instagram !== undefined) set('public_instagram', patch.instagram);
  if (patch.facebook !== undefined) set('public_facebook', patch.facebook);
  if (patch.tiktok !== undefined) set('public_tiktok', patch.tiktok);
  if (patch.google_url !== undefined) set('public_google_url', patch.google_url);
  if (patch.corkage !== undefined) {
    set('public_corkage', patch.corkage === null ? null : JSON.stringify(patch.corkage), '::jsonb');
  }
  if (sets.length > 0) {
    await pool.query(`UPDATE pos_stores SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
    invalidatePublicMenu(storeId);
  }
  return readProfile(storeId);
}
