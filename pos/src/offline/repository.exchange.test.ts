// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's side of an exchange (clothing R1): online only, one request, and
// then the mirror moves the way the server did — the returned goods back on
// the shelf unless they were «Брак», the new goods off it, both receipts kept
// under their own keys. Dexie is mocked; the shapes written are what matters.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExchangeInput, ExchangeResult, SaleDetail } from '../types';

const catalog = [
  { variant_id: 11, product_id: 1, product_name: 'Пальто', label: 'Синій · M', unit: 'шт', price_cents: 45000, compare_at_cents: null, quantity: 5, barcode: null, photo_url: null, tag_ids: [] },
  { variant_id: 5, product_id: 2, product_name: 'Пальто', label: 'Синій · L', unit: 'шт', price_cents: 70000, compare_at_cents: null, quantity: 3, barcode: null, photo_url: null, tag_ids: [] },
];
const catalogPut = vi.fn(async () => undefined);
const salesPut = vi.fn(async () => undefined);
const salesRows = new Map<string, { server_id: number | null }>();

vi.mock('./db', () => ({
  db: {
    catalog: {
      toArray: vi.fn(async () => catalog),
      get: vi.fn(async (id: number) => catalog.find((c) => c.variant_id === id)),
      put: (...a: unknown[]) => catalogPut(...(a as [])),
    },
    customers: { get: vi.fn(async () => undefined), toArray: vi.fn(async () => []) },
    sales: {
      get: vi.fn(async (key: string) => salesRows.get(key)),
      put: (...a: unknown[]) => salesPut(...(a as [])),
    },
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
const runSync = vi.fn(async () => {
  salesRows.set('u7', { server_id: 77 });
});
vi.mock('./sync', () => ({ runSync: (...a: unknown[]) => runSync(...(a as [])) }));
vi.mock('../services/api', () => ({
  api: {
    loadAuth: vi.fn(),
    hasLiveJwt: vi.fn(() => true),
    exchangeSale: vi.fn(),
    getCatalog: vi.fn(async () => []),
    getTags: vi.fn(async () => []),
    listCustomers: vi.fn(async () => []),
  },
  isNetworkError: vi.fn(() => false),
}));

const { api, isNetworkError } = await import('../services/api');
const { exchangeSale } = await import('./repository');

function sale(over: Partial<SaleDetail>): SaleDetail {
  return {
    id: 7,
    receipt_number: 'R-00042',
    status: 'completed',
    subtotal_cents: 45000,
    total_cents: 45000,
    refunded_cents: 0,
    staff_name: 'Касирка',
    created_at: '2026-10-04T10:00:00Z',
    items: [
      { id: 1, variant_id: 11, product_name: 'Пальто', variant_label: 'Синій · M', quantity: 1, unit_price_cents: 45000, line_total_cents: 45000, refunded_quantity: 0 },
    ],
    payments: [{ id: 1, method: 'card', amount_cents: 45000 }],
    refunds: [],
    ...over,
  } as SaleDetail;
}

function result(): ExchangeResult {
  return {
    refund: {
      ...sale({ status: 'refunded', refunded_cents: 45000 }),
      refund_id: 9,
      refund_fiscal: { status: 'done', fiscal_code: 'ФН-9' } as never,
    },
    sale: sale({ id: 50, receipt_number: 'R-00050', total_cents: 70000, subtotal_cents: 70000, items: [
      { id: 2, variant_id: 5, product_name: 'Пальто', variant_label: 'Синій · L', quantity: 1, unit_price_cents: 70000, line_total_cents: 70000, refunded_quantity: 0 },
    ] }),
    difference_cents: 25000,
  };
}

function input(reason: ExchangeInput['refund']['reason_code'] = 'size'): ExchangeInput {
  return {
    refund: {
      items: [{ sale_item_id: 1, quantity: 1 }],
      method: 'card',
      reason_code: reason,
      reason: null,
      buyer_name: null,
      buyer_document: null,
      client_uuid: 'rf-uuid',
    },
    sale: {
      items: [{ variant_id: 5, quantity: 1 }],
      payments: [{ method: 'card', amount_cents: 70000 }],
      client_uuid: 'sale-uuid',
    },
  };
}

/** The quantity each catalog row was written with, by variant. */
function written(): Map<number, number> {
  const out = new Map<number, number>();
  for (const call of catalogPut.mock.calls) {
    const row = call[0] as { variant_id: number; quantity: number };
    out.set(row.variant_id, row.quantity);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  salesRows.clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vi.mocked(api.hasLiveJwt).mockReturnValue(true);
  vi.mocked(isNetworkError).mockReturnValue(false);
  vi.mocked(api.exchangeSale).mockResolvedValue(result());
});

describe('repository.exchangeSale', () => {
  it('refuses without a connection, before anything is written', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await expect(exchangeSale(7, 'u7', input())).rejects.toMatchObject({ name: 'OfflineExchangeError' });
    expect(api.exchangeSale).not.toHaveBeenCalled();
    expect(catalogPut).not.toHaveBeenCalled();
  });

  it('sends both halves once and moves the mirror the way the server did', async () => {
    const out = await exchangeSale(7, 'u7', input());

    expect(api.exchangeSale).toHaveBeenCalledWith(7, input());
    // The coat that came back is on the shelf again; the one that left is not.
    expect(written().get(11)).toBe(6);
    expect(written().get(5)).toBe(2);
    // Both receipts in the mirror, each under its own key, the refund's
    // fiscal result kept off the original sale's row.
    const keys = salesPut.mock.calls.map((c) => (c[0] as { client_uuid: string }).client_uuid);
    expect(keys).toEqual(['u7', 'sale-uuid']);
    const originalRow = salesPut.mock.calls[0][0] as { detail: Record<string, unknown>; server_id: number };
    expect(originalRow.server_id).toBe(7);
    expect(originalRow.detail).not.toHaveProperty('refund_fiscal');
    expect(originalRow.detail).not.toHaveProperty('refund_id');
    expect(out.refund.refund_id).toBe(9);
    expect(out.refund.refund_fiscal).toMatchObject({ fiscal_code: 'ФН-9' });
    expect(out.sale.client_uuid).toBe('sale-uuid');
  });

  it('does not put a defective return back on the shelf — the server wrote it off', async () => {
    await exchangeSale(7, 'u7', input('defect'));
    expect(written().has(11)).toBe(false);
    expect(written().get(5)).toBe(2);
  });

  it('hands a request that got no answer back as an unknown state, with the new receipt’s key', async () => {
    vi.mocked(api.exchangeSale).mockRejectedValue(new Error('timeout'));
    vi.mocked(isNetworkError).mockReturnValue(true);
    await expect(exchangeSale(7, 'u7', input())).rejects.toMatchObject({
      name: 'FiscalSaleUnknownError',
      clientUuid: 'sale-uuid',
    });
    expect(catalogPut).not.toHaveBeenCalled();
  });

  it('syncs a receipt the till rang offline before exchanging against it', async () => {
    salesRows.set('u7', { server_id: null });
    await exchangeSale(0, 'u7', input());
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(api.exchangeSale).toHaveBeenCalledWith(77, input());
  });

  it('gives up in words when the receipt still has no server id after a sync', async () => {
    runSync.mockImplementationOnce(async () => undefined);
    salesRows.set('u7', { server_id: null });
    await expect(exchangeSale(0, 'u7', input())).rejects.toThrow('Чек ще не синхронізовано');
    expect(api.exchangeSale).not.toHaveBeenCalled();
  });
});
