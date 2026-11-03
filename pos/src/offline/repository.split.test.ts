// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop till's side of a cart for two registers (track ДК): online only
// and refused before anything is written without a network; a timeout hands
// the key back for the idempotent re-send; a success moves the mirror's stock
// once for the cart and keeps each receipt under its own key.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleDetail, SplitSaleResult } from '../types';

const catalog = [
  { variant_id: 1, product_id: 1, product_name: 'Борщ', label: '', unit: 'шт', price_cents: 12000, quantity: 10, tag_ids: [] },
  { variant_id: 2, product_id: 2, product_name: 'Горілка 50 мл', label: '', unit: 'шт', price_cents: 6000, quantity: 10, tag_ids: [] },
];
const catalogPut = vi.fn(async (..._a: unknown[]) => undefined);
const salesPut = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock('./db', () => ({
  db: {
    catalog: {
      toArray: vi.fn(async () => catalog),
      get: vi.fn(async (id: number) => catalog.find((c) => c.variant_id === id)),
      put: (...a: unknown[]) => catalogPut(...a),
    },
    customers: { get: vi.fn(async () => undefined), toArray: vi.fn(async () => []) },
    sales: { get: vi.fn(async () => undefined), put: (...a: unknown[]) => salesPut(...a) },
    outbox: { add: vi.fn(async () => undefined) },
    transaction: vi.fn(async (_mode: string, ..._args: unknown[]) => {
      const fn = _args[_args.length - 1] as () => Promise<void>;
      await fn();
    }),
  },
  getMeta: vi.fn(async () => undefined),
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
  api: {
    loadAuth: vi.fn(),
    hasLiveJwt: vi.fn(() => true),
    completeSplitSale: vi.fn(),
    getCatalog: vi.fn(async () => []),
    getTags: vi.fn(async () => []),
    listCustomers: vi.fn(async () => []),
  },
  isNetworkError: vi.fn(() => false),
}));

const { api, isNetworkError } = await import('../services/api');
const { completeSplitSale } = await import('./repository');

const payload = {
  items: [
    { variant_id: 1, quantity: 1 },
    { variant_id: 2, quantity: 2 },
  ],
  payments: [{ method: 'cash' as const, amount_cents: 30000 }],
};

function sale(id: number, register: number, uuid: string): SaleDetail {
  return {
    id,
    receipt_number: `R-${id}`,
    client_uuid: uuid,
    fiscal_register: register,
    status: 'completed',
    subtotal_cents: 0,
    total_cents: 0,
    created_at: '2026-11-03T18:00:00Z',
    staff_name: 'Олена',
    items: [],
    payments: [],
    refunds: [],
  } as unknown as SaleDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vi.mocked(api.hasLiveJwt).mockReturnValue(true);
  vi.mocked(isNetworkError).mockReturnValue(false);
});

describe('completeSplitSale on the desktop', () => {
  it('refuses without a network and writes nothing', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await expect(completeSplitSale(payload)).rejects.toMatchObject({ name: 'OfflineFiscalError' });
    expect(api.completeSplitSale).not.toHaveBeenCalled();
    expect(catalogPut).not.toHaveBeenCalled();
    expect(salesPut).not.toHaveBeenCalled();
  });

  it('hands the key back on a timeout so the same request can be re-sent', async () => {
    vi.mocked(api.completeSplitSale).mockRejectedValue(new Error('timeout'));
    vi.mocked(isNetworkError).mockReturnValue(true);
    await expect(completeSplitSale(payload, { clientUuid: 'k-1' })).rejects.toMatchObject({
      name: 'FiscalSaleUnknownError',
      clientUuid: 'k-1',
    });
    expect(catalogPut).not.toHaveBeenCalled();
  });

  it('keeps each receipt under its own key and moves the stock once', async () => {
    const result: SplitSaleResult = {
      split: true,
      warning: null,
      parts: [
        { register_no: 1, sale: sale(101, 1, 'k-2') },
        { register_no: 2, sale: sale(102, 2, 'k-2-r2') },
      ],
    };
    vi.mocked(api.completeSplitSale).mockResolvedValue(result);

    await expect(completeSplitSale(payload, { clientUuid: 'k-2' })).resolves.toBe(result);
    expect(vi.mocked(api.completeSplitSale).mock.calls[0][0]).toMatchObject({ client_uuid: 'k-2' });
    expect(catalogPut).toHaveBeenCalledTimes(2);
    expect(catalogPut).toHaveBeenCalledWith(expect.objectContaining({ variant_id: 2, quantity: 8 }));
    const keys = salesPut.mock.calls.map((call) => (call[0] as { client_uuid?: string }).client_uuid);
    expect(keys).toEqual(['k-2', 'k-2-r2']);
  });
});
