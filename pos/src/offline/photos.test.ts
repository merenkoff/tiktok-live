// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the till keeps of product pictures (TechDocs/POS_CLOTHING.md «Головна
// каси й швидкість фото»): the tile's thumbnail rather than every original,
// the photo only where the thumbnail is missing, nothing a product no longer
// points at — and the payment QR in a cache of its own, which the catalog's
// pruning never touches.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '../types';

vi.mock('../lib/urls', () => ({
  assetUrl: (u: string | null | undefined) => (u ? (u.startsWith('http') ? u : `https://the-live.shop${u}`) : null),
}));

/** A Cache Storage in memory: `add` fetches through `missing` to fail on purpose. */
function fakeCaches(missing: Set<string>) {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (url: string) => store.get(url),
      add: async (url: string) => {
        if (missing.has(url)) throw new Error('404');
        store.set(url, new Response('img'));
      },
      keys: async () => [...store.keys()].map((url) => ({ url }) as Request),
      delete: async (req: Request) => store.delete(req.url),
    } as unknown as Cache;
  };
  return {
    stores,
    api: {
      open,
      match: async (url: string) => {
        for (const store of stores.values()) if (store.has(url)) return store.get(url);
        return undefined;
      },
    } as unknown as CacheStorage,
  };
}

function item(over: Partial<CatalogItem>): CatalogItem {
  return { variant_id: 1, product_id: 1, product_name: 'Боді', image_url: null, ...over } as CatalogItem;
}

const U = (path: string) => `https://the-live.shop${path}`;

describe('offline/photos', () => {
  let missing: Set<string>;
  let fake: ReturnType<typeof fakeCaches>;

  beforeEach(() => {
    vi.resetModules();
    missing = new Set();
    fake = fakeCaches(missing);
    vi.stubGlobal('caches', fake.api);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps thumbnails, the photo only where its thumbnail is missing, and drops the rest', async () => {
    const { cacheCatalogImages, cacheQrImage } = await import('./photos');
    await cacheQrImage('/pos-uploads/qr.png');
    // What an older build kept: a full original for every tile.
    await (await fake.api.open('pos-catalog-images')).add(U('/pos-uploads/old.jpg'));

    missing.add(U('/pos-uploads/b.t.webp'));
    await cacheCatalogImages([
      item({ product_id: 1, image_url: '/pos-uploads/a.jpg', thumb_url: '/pos-uploads/a.t.webp' }),
      item({ product_id: 2, image_url: '/pos-uploads/b.jpg' }),
      item({ product_id: 3, image_url: '/demo-clothing/c.svg' }),
      item({ product_id: 4, image_url: null }),
    ]);

    const kept = [...fake.stores.get('pos-catalog-images')!.keys()].sort();
    expect(kept).toEqual([U('/demo-clothing/c.svg'), U('/pos-uploads/a.t.webp'), U('/pos-uploads/b.jpg')]);
    // The QR is in its own cache and survives the prune.
    expect([...fake.stores.get('pos-qr-image')!.keys()]).toEqual([U('/pos-uploads/qr.png')]);
  });

  it('offline, points the tile at what was kept', async () => {
    const { cacheCatalogImages, withCachedImages } = await import('./photos');
    await cacheCatalogImages([item({ image_url: '/pos-uploads/a.jpg', thumb_url: '/pos-uploads/a.t.webp' })]);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const created = vi.fn(() => 'blob:thumb');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created }));
    try {
      const [shown] = await withCachedImages([item({ image_url: '/pos-uploads/a.jpg' })]);
      expect(shown.thumb_url).toBe('blob:thumb');
      // The original was not kept: the tile tries the thumbnail first anyway.
      expect(shown.image_url).toBe(U('/pos-uploads/a.jpg'));
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });
});
