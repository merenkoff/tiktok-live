// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/import/choiceqr.ts — a ChoiceQR menu page read into our catalogue's
// shape (TechDocs/POS_ONBOARDING.md, O2). Pure apart from the two fetches at
// the bottom, which are the first requests this server makes to an address a
// person typed — hence the host allowlist, no redirects, a timeout and a size
// cap on both.
//
// A ChoiceQR menu is a Next.js page: everything the guest sees is in its
// `__NEXT_DATA__` JSON under `props.app` — `categories`, `menu` (the dishes:
// price in kopecks, `weight` + `weightType`, `media[]`, `description`) and
// `place` (name, address, logo, `workTimeAll` with JS weekdays, 0 = Sunday).

import type { WeekHours } from '../public-menu/profile.js';

export const CHOICEQR_HOST_RE = /^[a-z0-9-]+\.choiceqr\.com$/;
export const CHOICEQR_MEDIA_HOST = 'cdn-media.choiceqr.com';
const PAGE_MAX_BYTES = 3 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** Anything the import refuses, in words for the super admin → 400. */
export class MenuImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MenuImportError';
  }
}

export interface ChoiceQrCategory {
  id: string;
  name: string;
}

export interface ChoiceQrItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  /** «300 г», «0,5 л» — ChoiceQR's weight and its unit, as the guest reads them. */
  size: string | null;
  photoUrl: string | null;
  available: boolean;
}

export interface ChoiceQrPlace {
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  hours: WeekHours | null;
}

export interface ChoiceQrMenu {
  place: ChoiceQrPlace;
  categories: ChoiceQrCategory[];
  items: ChoiceQrItem[];
}

// ── The address ───────────────────────────────────────────────────────

/** A ChoiceQR menu address, or a refusal: https, a `*.choiceqr.com` host, no credentials. */
export function menuUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new MenuImportError('Це не посилання. Вставте адресу меню, напр. https://заклад.choiceqr.com/menu');
  }
  if (url.protocol !== 'https:' || !CHOICEQR_HOST_RE.test(url.hostname) || url.username || url.password || url.port) {
    throw new MenuImportError('Посилання має вести на меню ChoiceQR: https://<заклад>.choiceqr.com/menu');
  }
  url.hash = '';
  return url;
}

// ── The page ─────────────────────────────────────────────────────────

const UNIT_WORD: Record<string, string> = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт', pc: 'шт' };

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function sizeOf(weight: unknown, type: unknown): string | null {
  const amount = typeof weight === 'number' ? String(weight) : clean(weight, 20);
  if (!amount || amount === '0') return null;
  const unit = typeof type === 'string' ? UNIT_WORD[type.toLowerCase()] : undefined;
  return unit ? `${amount} ${unit}` : amount;
}

function photoOf(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  for (const m of media) {
    if (!m || typeof m !== 'object') continue;
    const entry = m as Record<string, unknown>;
    for (const key of ['medium', 'big', 'url']) {
      if (typeof entry[key] === 'string' && entry[key]) return entry[key] as string;
    }
  }
  return null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d/;

/** `workTimeAll` → our week: ISO keys ("1" Monday … "7" Sunday) from JS weekdays (0 Sunday). */
function hoursOf(workTimeAll: unknown): WeekHours | null {
  if (!Array.isArray(workTimeAll)) return null;
  const week: WeekHours = {};
  for (const day of workTimeAll) {
    if (!day || typeof day !== 'object') continue;
    const d = day as Record<string, unknown>;
    const n = Number(d.dayOfWeek);
    if (d.active === false || !Number.isInteger(n) || n < 0 || n > 6) continue;
    const open = typeof d.from === 'string' ? d.from.match(HHMM)?.[0] : undefined;
    const close = typeof d.till === 'string' ? d.till.match(HHMM)?.[0] : undefined;
    if (!open || !close || open === close) continue;
    week[(n === 0 ? '7' : String(n)) as keyof WeekHours] = { open, close };
  }
  return Object.keys(week).length ? week : null;
}

export function parseChoiceQr(html: string): ChoiceQrMenu {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new MenuImportError('На сторінці немає меню ChoiceQR — перевірте посилання');
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new MenuImportError('Меню ChoiceQR не прочиталося — сторінка змінила формат');
  }
  const app = (data as { props?: { app?: Record<string, unknown> } }).props?.app;
  if (!app || !Array.isArray(app.menu) || !Array.isArray(app.categories)) {
    throw new MenuImportError('На сторінці немає меню ChoiceQR — перевірте посилання');
  }

  const categories: ChoiceQrCategory[] = [];
  for (const c of app.categories as Array<Record<string, unknown>>) {
    const name = clean(c?.name, 80);
    if (typeof c?._id === 'string' && name) categories.push({ id: c._id, name });
  }
  const known = new Set(categories.map((c) => c.id));

  const items: ChoiceQrItem[] = [];
  for (const raw of app.menu as Array<Record<string, unknown>>) {
    const name = clean(raw?.name, 200);
    const price = Number(raw?.price);
    if (!name || typeof raw._id !== 'string' || !known.has(String(raw.category))) continue;
    if (!Number.isInteger(price) || price < 0) continue;
    items.push({
      id: raw._id,
      categoryId: String(raw.category),
      name,
      description: clean(raw.description, 1000),
      priceCents: price,
      size: sizeOf(raw.weight, raw.weightType),
      photoUrl: photoOf(raw.media),
      available: raw.available !== false,
    });
  }

  const place = (app.place ?? {}) as Record<string, unknown>;
  const contact = (place.contactInfo ?? {}) as Record<string, unknown>;
  const address = (contact.address ?? {}) as Record<string, unknown>;
  const images = (place.companyImages ?? {}) as Record<string, unknown>;
  const phoneDigits = typeof contact.phone === 'string' ? contact.phone.replace(/\D/g, '') : '';
  return {
    place: {
      name: clean(place.name, 120) ?? '',
      address: clean(address.prediction, 200),
      phone: phoneDigits.length >= 7 && phoneDigits.length <= 15 ? (contact.phone as string).trim() : null,
      logoUrl: typeof images.logo === 'string' && images.logo ? images.logo : null,
      hours: hoursOf(place.workTimeAll),
    },
    categories,
    items,
  };
}

// ── The plan ─────────────────────────────────────────────────────────

export type Station = 'kitchen' | 'bar';

/**
 * Which board a category's tickets go to. A guess from its name — a drink
 * goes to the bar, everything else to the kitchen — that the owner corrects
 * on the tag. Substrings, not `\b`: JavaScript's word boundary is ASCII-only.
 */
const BAR_STEMS = [
  'кав', 'чай', 'чаї', 'напо', 'сік', 'сок', 'вода', 'води', 'енергетик', 'горілк', 'бренді', 'коньяк', 'віскі', 'джин',
  'лікер', 'налив', 'настоян', 'вино', 'вина', 'пиво', 'коктейл', 'лимонад', 'смузі', 'фреш', 'компот', 'взвар', 'узвар',
];
const BAR_WORDS = new Set(['ром', 'бар', 'алкоголь', 'текіла']);

export function stationOf(category: string): Station {
  const name = category.toLowerCase();
  if (BAR_WORDS.has(name.trim())) return 'bar';
  return BAR_STEMS.some((stem) => name.includes(stem)) ? 'bar' : 'kitchen';
}

export interface PlannedVariant {
  size: string | null;
  price_cents: number;
}

export interface PlannedProduct {
  name: string;
  tag: string;
  description: string | null;
  photo_url: string | null;
  variants: PlannedVariant[];
  /** Already in the store under this tag — the import leaves it alone. */
  exists: boolean;
}

export interface PlannedTag {
  name: string;
  station: Station;
  exists: boolean;
  products: number;
}

export interface MenuImportPlan {
  place: { name: string; address: string | null; phone: string | null; hours: WeekHours | null; logo: boolean };
  tags: PlannedTag[];
  products: PlannedProduct[];
  warnings: string[];
  totals: { tags_new: number; products_new: number; products_existing: number; variants_new: number; photos: number };
}

/** What the store already has, lower-cased: top-level tag names and `tag\u0000product` pairs. */
export interface ExistingCatalog {
  tags: Set<string>;
  products: Set<string>;
}

/**
 * «0,33 мл», «0,5 г»: a fraction of a millilitre or a gram is a slip of the
 * unit picker on ChoiceQR (a can is 0,33 л). Said, never corrected — the
 * owner knows what the bottle holds.
 */
function isOddSize(size: string): boolean {
  const m = size.match(/^(\d+[,.]\d+) (мл|г)$/);
  return m != null && Number(m[1].replace(',', '.')) < 5;
}

export const productKey = (tag: string, name: string): string => `${tag.toLowerCase()}\u0000${name.toLowerCase()}`;
const norm = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim();
const uah = (cents: number): string => `${(cents / 100).toLocaleString('uk-UA')} ₴`;

/**
 * The menu as cards to create. One card per name within a category; the same
 * name in another size is a variant of it (взвар 1 л / 300 мл). Two entries of
 * one name and one size are either a duplicate (same price — skipped) or two
 * different dishes the owner named alike (different price — a second card
 * «Назва (2)», said out loud so it gets renamed). A card the store already has
 * under that tag is marked `exists`, which is what makes a re-run harmless.
 */
export function planMenuImport(menu: ChoiceQrMenu, existing: ExistingCatalog): MenuImportPlan {
  const warnings: string[] = [];
  const products: PlannedProduct[] = [];
  const tags: PlannedTag[] = [];
  const unavailable: string[] = [];
  const free: string[] = [];
  const oddSizes: string[] = [];

  for (const category of menu.categories) {
    const inCategory = menu.items.filter((i) => i.categoryId === category.id);
    if (!inCategory.length) continue;
    const tagProducts: PlannedProduct[] = [];
    const groups = new Map<string, ChoiceQrItem[]>();
    for (const item of inCategory) {
      const key = norm(item.name);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const group of groups.values()) {
      const cards: Array<{ product: PlannedProduct; sizes: Map<string, number> }> = [];
      for (const item of group) {
        if (!item.available) unavailable.push(item.name);
        if (item.priceCents === 0) free.push(item.name);
        if (item.size && isOddSize(item.size)) oddSizes.push(`${item.name} ${item.size}`);
        const size = item.size ?? '';
        let placed = false;
        for (const card of cards) {
          const price = card.sizes.get(size);
          if (price === undefined) {
            card.sizes.set(size, item.priceCents);
            card.product.variants.push({ size: item.size, price_cents: item.priceCents });
            card.product.photo_url ??= item.photoUrl;
            card.product.description ??= item.description;
            placed = true;
            break;
          }
          if (price === item.priceCents) {
            warnings.push(`«${item.name}»${item.size ? ` ${item.size}` : ''} у «${category.name}» двічі з тією ж ціною — друга пропущена.`);
            placed = true;
            break;
          }
        }
        if (placed) continue;
        const name = cards.length === 0 ? group[0].name : `${group[0].name} (${cards.length + 1})`;
        if (cards.length > 0) {
          warnings.push(
            `«${group[0].name}»${item.size ? ` ${item.size}` : ''} у «${category.name}» двічі з різною ціною (${uah(cards[0].sizes.get(size) ?? 0)} / ${uah(item.priceCents)}) — друга стане «${name}», перейменуйте.`
          );
        }
        const product: PlannedProduct = {
          name,
          tag: category.name,
          description: item.description,
          photo_url: item.photoUrl,
          variants: [{ size: item.size, price_cents: item.priceCents }],
          exists: existing.products.has(productKey(category.name, name)),
        };
        cards.push({ product, sizes: new Map([[size, item.priceCents]]) });
        tagProducts.push(product);
      }
    }
    products.push(...tagProducts);
    tags.push({
      name: category.name,
      station: stationOf(category.name),
      exists: existing.tags.has(category.name.toLowerCase()),
      products: tagProducts.length,
    });
  }

  if (unavailable.length) warnings.push(`Недоступні на ChoiceQR, імпортуються як звичайні: ${unavailable.join(', ')}.`);
  if (free.length) warnings.push(`Ціна 0 ₴: ${free.join(', ')} — перевірте.`);
  if (oddSizes.length) warnings.push(`Схоже на описку в одиниці: ${oddSizes.join(', ')} — імпортуються як є, виправте в картці.`);

  const fresh = products.filter((p) => !p.exists);
  return {
    place: {
      name: menu.place.name,
      address: menu.place.address,
      phone: menu.place.phone,
      hours: menu.place.hours,
      logo: Boolean(menu.place.logoUrl),
    },
    tags,
    products,
    warnings,
    totals: {
      tags_new: tags.filter((t) => !t.exists).length,
      products_new: fresh.length,
      products_existing: products.length - fresh.length,
      variants_new: fresh.reduce((n, p) => n + p.variants.length, 0),
      photos: fresh.filter((p) => p.photo_url).length,
    },
  };
}

// ── The two fetches ─────────────────────────────────────────────────

async function readCapped(response: Response, maxBytes: number, what: string): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new MenuImportError(`${what} завелика`);
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new MenuImportError(`${what} завелика`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchOnce(url: URL, maxBytes: number, what: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'TheLiveShop-MenuImport/1.0 (+https://the-live.shop)' },
    });
  } catch {
    throw new MenuImportError(`${what}: немає відповіді від ChoiceQR`);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new MenuImportError(`${what}: ChoiceQR відповів переадресацією — вставте пряме посилання на меню`);
  }
  if (!response.ok) throw new MenuImportError(`${what}: ChoiceQR відповів ${response.status}`);
  return readCapped(response, maxBytes, what);
}

/** The menu page, read and parsed. */
export async function fetchChoiceQrMenu(raw: string): Promise<ChoiceQrMenu> {
  const url = menuUrl(raw);
  const page = await fetchOnce(url, PAGE_MAX_BYTES, 'Сторінка меню');
  return parseChoiceQr(page.toString('utf8'));
}

/** A dish photo or the logo — only from ChoiceQR's own media host. */
export async function fetchChoiceQrPhoto(raw: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MenuImportError('Фото: непридатне посилання');
  }
  if (url.protocol !== 'https:' || url.hostname !== CHOICEQR_MEDIA_HOST || url.username || url.port) {
    throw new MenuImportError(`Фото не з ${CHOICEQR_MEDIA_HOST} — пропущено`);
  }
  return fetchOnce(url, PHOTO_MAX_BYTES, 'Фото');
}
