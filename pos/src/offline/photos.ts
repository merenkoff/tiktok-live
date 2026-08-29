// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CatalogItem } from '../types';
import { assetUrl } from '../lib/urls';

const CACHE_NAME = 'pos-catalog-images';
const objectUrls = new Map<string, string>();

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

export async function cacheCatalogImages(items: CatalogItem[]): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  const urls = [
    ...new Set(
      items
        .map((item) => assetUrl(item.image_url))
        .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
    ),
  ];

  const batch = 6;
  for (let i = 0; i < urls.length; i += batch) {
    const slice = urls.slice(i, i + batch);
    await Promise.all(
      slice.map(async (url) => {
        try {
          if (await cache.match(url)) return;
          await cache.add(url);
        } catch {
          /* tile falls back to placeholder */
        }
      })
    );
  }
}

/** Pre-cache the store's static QR image so the checkout QR step works offline. */
export async function cacheQrImage(src: string | null | undefined): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  const url = assetUrl(src);
  if (!url || !/^https?:\/\//i.test(url)) return;
  try {
    if (await cache.match(url)) return;
    await cache.add(url);
  } catch {
    /* falls back to the remote URL when online */
  }
}

export async function displayImageUrl(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (/^(blob:|data:)/i.test(src)) return src;
  const abs = assetUrl(src);
  if (!abs) return null;
  if (navigator.onLine) return abs;

  const memo = objectUrls.get(abs);
  if (memo) return memo;

  const cache = await openCache();
  if (!cache) return abs;
  try {
    const hit = await cache.match(abs);
    if (!hit) return abs;
    const blob = await hit.blob();
    const obj = URL.createObjectURL(blob);
    objectUrls.set(abs, obj);
    return obj;
  } catch {
    return abs;
  }
}

export async function withCachedImages(items: CatalogItem[]): Promise<CatalogItem[]> {
  if (navigator.onLine) return items;
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      image_url: await displayImageUrl(item.image_url),
    }))
  );
}
