// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the till does with a sale rung while it has no network, in a store that
// fiscalises (TechDocs/POS_FISCAL_OFFLINE.md, фаза 3, шаг 3).
//
// The receipt handed to the customer is the whole point of these: it has to
// carry a real tax-office number, the till's own date and a scannable QR the
// moment it is printed, because there is no second chance to hand it over.
// Dexie is mocked — the shapes written are what matters, not the storage.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxRow, OutboxSalePayload } from './db';
import type { FiscalOfflineStamp } from '../types';

const outbox: OutboxRow[] = [];
const catalog = [
  {
    variant_id: 11,
    product_id: 1,
    product_name: 'Футболка',
    color: 'Синій',
    size: 'M',
    price_cents: 45000,
    compare_at_cents: null,
    quantity: 5,
    barcode: null,
    photo_url: null,
    tag_ids: [],
  },
];

vi.mock('./db', () => ({
  db: {
    outbox: { add: vi.fn(async (row: OutboxRow) => void outbox.push(row)) },
    catalog: {
      toArray: vi.fn(async () => catalog),
      get: vi.fn(async (id: number) => catalog.find((c) => c.variant_id === id)),
      put: vi.fn(async () => undefined),
    },
    customers: { get: vi.fn(async () => undefined), toArray: vi.fn(async () => []) },
    sales: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
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
  api: { loadAuth: vi.fn(), hasLiveJwt: vi.fn(() => false), completeSale: vi.fn() },
  isNetworkError: vi.fn(() => false),
}));

const { api } = await import('../services/api');
const { takeStamp } = await import('./lease');
const { completeSale } = await import('./repository');
const { OfflineFiscalError } = await import('./errors');

const STAMP: FiscalOfflineStamp = {
  client_session_id: 'stretch-1',
  seq: 1,
  fiscal_code: 'OFF-0007',
  fiscal_date: '2026-09-12T09:30:00.000Z',
};

const payload = {
  items: [{ variant_id: 11, quantity: 1 }],
  payments: [{ method: 'cash' as const, amount_cents: 45000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  outbox.length = 0;
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  vi.mocked(api.loadAuth).mockReturnValue({
    staff: { display_name: 'Олена' },
    store: { fiscal: { enabled: true, offline_mode: true } },
  } as never);
  vi.mocked(takeStamp).mockResolvedValue({ stamp: STAMP, registerFiscalNumber: '4001118166' });
});

describe('completeSale — offline in a fiscalising store', () => {
  it('hands the customer a receipt with a tax-office number, a date and a QR', async () => {
    const sale = await completeSale(payload);

    expect(sale.fiscal_status).toBe('pending');
    expect(sale.fiscal).toMatchObject({
      status: 'pending',
      mode: 'offline',
      fiscal_code: 'OFF-0007',
      fiscal_date: STAMP.fiscal_date,
      // The ПРРО mints it on replay; until then the receipt says so.
      control_number: null,
    });
    expect(sale.fiscal?.tax_url).toContain('id=OFF-0007');
    expect(sale.fiscal?.tax_url).toContain('fn=4001118166');
    expect(sale.fiscal?.tax_url).toContain('sm=450.00');
  });

  it('queues the stamp with the sale so the server files the same document', async () => {
    await completeSale(payload);
    expect(outbox).toHaveLength(1);
    expect((outbox[0].payload as OutboxSalePayload).fiscal_offline).toEqual(STAMP);
  });

  it('prints no QR before the register number is known', async () => {
    // A link without `fn` points at no document — better a printed line saying
    // the QR is coming than one that opens an error page.
    vi.mocked(takeStamp).mockResolvedValue({ stamp: STAMP, registerFiscalNumber: null });
    const sale = await completeSale(payload);
    expect(sale.fiscal?.tax_url).toBeNull();
    expect(sale.fiscal?.fiscal_code).toBe('OFF-0007');
  });

  it('writes nothing at all when the till may not stamp', async () => {
    vi.mocked(takeStamp).mockRejectedValue(new OfflineFiscalError('no_lease', 'Закінчились коди'));
    await expect(completeSale(payload)).rejects.toBeInstanceOf(OfflineFiscalError);
    // No outbox row, and no stock decremented for a sale that never happened.
    expect(outbox).toHaveLength(0);
  });

  it('leaves a non-fiscal store exactly as it was', async () => {
    vi.mocked(api.loadAuth).mockReturnValue({
      staff: { display_name: 'Олена' },
      store: { fiscal: { enabled: false } },
    } as never);
    const sale = await completeSale(payload);
    expect(takeStamp).not.toHaveBeenCalled();
    expect(sale.fiscal).toBeNull();
    expect(sale.fiscal_status).toBe('none');
    expect((outbox[0].payload as OutboxSalePayload).fiscal_offline).toBeUndefined();
  });
});
