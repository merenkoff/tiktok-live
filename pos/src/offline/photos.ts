// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Product pictures kept on the till so a tile draws without a network
// (TechDocs/POS_CLOTHING.md «Головна каси й швидкість фото»).
//
// What is kept is the TILE's picture — the 264 px thumbnail where the server
// made one (`lib/productThumb.ts`), the photo only where it did not — never
// every original: a shop with a few hundred photographed products used to
// pull hundreds of megabytes here. Entries of products the snapshot no longer
// holds are dropped after each sync. Online the tiles load from the network,
// where `/pos-uploads` is served immutable for a year, so the webview's own
// HTTP cache answers a second draw without asking the server.
//
// The store's static payment QR lives in a cache of its own, so pruning the
// catalog's never takes it away.

import type { CatalogItem } from '../types';
import { assetUrl } from '../lib/urls';
import { thumbOf, tilePictureOf } from '../lib/productThumb';

const CACHE_NAME = 'pos-catalog-images';
const QR_CACHE_NAME = 'pos-qr-image';
const objectUrls = new Map<string, string>();

async function openCache(name: string = CACHE_NAME): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
}

const remote = (u: string | null): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

/** Fetch into the cache unless it is there already; false when the server had nothing. */
async function keep(cache: Cache, url: string): Promise<boolean> {
  try {
    if (await cache.match(url)) return true;
    await cache.add(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Keep the tile picture of every item of a fresh snapshot, six at a time, and
 * drop what no item points at any more. A thumbnail the server does not have
 * (made later, an old upload) falls back to keeping the photo itself.
 */
export async function cacheCatalogImages(items: CatalogItem[]): Promise<void> {
  const cache = await openCache();
  if (!cache) return;

  const wanted = new Map<string, string | null>(); // tile picture → the photo to fall back on
  for (const item of items) {
    const picture = assetUrl(tilePictureOf(item));
    if (!remote(picture) || wanted.has(picture)) continue;
    const photo = assetUrl(item.image_url);
    wanted.set(picture, remote(photo) && photo !== picture ? photo : null);
  }

  const kept = new Set<string>();
  const entries = [...wanted.entries()];
  const batch = 6;
  for (let i = 0; i < entries.length; i += batch) {
    await Promise.all(
      entries.slice(i, i + batch).map(async ([picture, photo]) => {
        if (await keep(cache, picture)) kept.add(picture);
        else if (photo && (await keep(cache, photo))) kept.add(photo);
      })
    );
  }

  // Everything else goes: products taken off, photos replaced, and the full
  // originals an older build kept for every tile.
  try {
    for (const request of await cache.keys()) {
      if (!kept.has(request.url)) await cache.delete(request);
    }
  } catch {
    /* a failed prune costs disk, never a tile */
  }
}

/** Pre-cache the store's static QR image so the checkout QR step works offline. */
export async function cacheQrImage(src: string | null | undefined): Promise<void> {
  const cache = await openCache(QR_CACHE_NAME);
  if (!cache) return;
  const url = assetUrl(src);
  if (!remote(url)) return;
  await keep(cache, url);
}

/** Offline, the kept copy as a `blob:` URL; online — or with none kept — the address itself. */
export async function displayImageUrl(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (/^(blob:|data:)/i.test(src)) return src;
  const abs = assetUrl(src);
  if (!abs) return null;
  if (navigator.onLine) return abs;

  const memo = objectUrls.get(abs);
  if (memo) return memo;

  if (typeof caches === 'undefined') return abs;
  try {
    // Any of the till's caches: the catalog's or the QR's.
    const hit = await caches.match(abs);
    if (!hit) return abs;
    const obj = URL.createObjectURL(await hit.blob());
    objectUrls.set(abs, obj);
    return obj;
  } catch {
    return abs;
  }
}

/** Offline, point each item's tile pictures at what the till kept. */
export async function withCachedImages(items: CatalogItem[]): Promise<CatalogItem[]> {
  if (navigator.onLine) return items;
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      thumb_url: await displayImageUrl(item.thumb_url ?? thumbOf(item.image_url)),
      image_url: await displayImageUrl(item.image_url),
    }))
  );
}
