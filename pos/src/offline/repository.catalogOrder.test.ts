// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The offline catalogue comes out of IndexedDB by `variant_id`. The online one is
// sorted by the server; offline, only `getCatalog` puts a card's variants
// together and in size order (TechDocs/POS_CLOTHING.md, C1).

import { describe, expect, it, vi } from 'vitest';
import { makeCatalogItem } from '../test/utils';

const stored = [
  makeCatalogItem({ variant_id: 1, product_id: 20, product_name: 'Футболка', label: 'синій / XL', attributes: { color: 'синій', size: 'XL' } }),
  makeCatalogItem({ variant_id: 2, product_id: 10, product_name: 'Боді', label: 'рожевий / 100', attributes: { color: 'рожевий', size: '100' } }),
  makeCatalogItem({ variant_id: 3, product_id: 20, product_name: 'Футболка', label: 'синій / S', attributes: { color: 'синій', size: 'S' } }),
  makeCatalogItem({ variant_id: 4, product_id: 11, product_name: 'Боді', label: 'рожевий / 92', attributes: { color: 'рожевий', size: '92' } }),
  makeCatalogItem({ variant_id: 5, product_id: 10, product_name: 'Боді', label: 'рожевий / 98', attributes: { color: 'рожевий', size: '98' } }),
];

vi.mock('./db', () => ({
  db: { catalog: { toArray: vi.fn(async () => stored), count: vi.fn(async () => stored.length) } },
  getMeta: vi.fn(async (key: string) => (key === 'tagsTree' ? [] : 1)),
  setMeta: vi.fn(async () => undefined),
}));
vi.mock('./photos', () => ({
  cacheCatalogImages: vi.fn(),
  cacheQrImage: vi.fn(),
  withCachedImages: vi.fn((rows: unknown) => rows),
}));
vi.mock('./status', () => ({
  useOfflineStatus: { getState: () => ({ refreshPending: vi.fn(async () => undefined) }) },
}));
vi.mock('./lease', () => ({ takeStamp: vi.fn() }));
vi.mock('../services/api', () => ({
  api: { loadAuth: vi.fn(), hasLiveJwt: vi.fn(() => false), getTags: vi.fn() },
  isNetworkError: vi.fn(() => false),
}));

const { getCatalog } = await import('./repository');

describe('getCatalog — offline order', () => {
  it('puts each card\'s variants together and from small to large', async () => {
    const rows = await getCatalog();
    expect(rows.map((r) => r.variant_id)).toEqual([5, 2, 4, 3, 1]);
  });

  it('keeps that order under a query', async () => {
    const rows = await getCatalog({ q: 'боді 9' });
    // «9» is a short number: it finds the labels carrying it (92 and 98), in order.
    expect(rows.map((r) => r.variant_id)).toEqual([5, 4]);
  });
});
