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
  // A café card with its answers, and the milk one of them takes.
  {
    variant_id: 12,
    product_id: 2,
    product_name: 'Латте',
    label: 'M',
    unit: 'шт',
    price_cents: 6500,
    compare_at_cents: null,
    quantity: 50,
    barcode: null,
    photo_url: null,
    tag_ids: [],
    modifier_groups: [
      {
        id: 1,
        name: 'Молоко',
        min_select: 1,
        max_select: 1,
        modifiers: [
          { id: 101, name: 'звичайне', price_delta_cents: 0, is_default: true, component_variant_id: 13, component_quantity: 200 },
          { id: 102, name: 'вівсяне', price_delta_cents: 1500, is_default: false, component_variant_id: 14, component_quantity: 200 },
        ],
      },
    ],
  },
  {
    variant_id: 14,
    product_id: 3,
    product_name: 'Молоко вівсяне',
    label: '',
    unit: 'мл',
    price_cents: 0,
    compare_at_cents: null,
    quantity: 5000,
    barcode: null,
    photo_url: null,
    tag_ids: [],
    sellable: false,
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
const { db, getMeta, setMeta } = await import('./db');
const { deviceLocalDay } = await import('../lib/localOrderNo');
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

describe('completeSale — a line with modifiers, offline', () => {
  beforeEach(() => {
    vi.mocked(api.loadAuth).mockReturnValue({
      staff: { display_name: 'Марта' },
      store: { fiscal: { enabled: false } },
    } as never);
  });

  it('prices, captions and snapshots the answers the way the server will', async () => {
    const sale = await completeSale({
      items: [{ variant_id: 12, quantity: 2, modifiers: [102], note: 'гарячіше' }],
      payments: [{ method: 'cash', amount_cents: 16000 }],
    });

    expect(sale.items[0]).toMatchObject({
      unit_price_cents: 8000,
      line_total_cents: 16000,
      variant_label: 'M · вівсяне',
      note: 'гарячіше',
      modifiers: [{ modifier_id: 102, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 }],
    });
    expect(sale.subtotal_cents).toBe(16000);
    // The queue carries the ids and the note as sent, for the server to price.
    expect((outbox[0].payload as OutboxSalePayload).items[0]).toEqual({
      variant_id: 12,
      quantity: 2,
      modifiers: [102],
      note: 'гарячіше',
    });
  });

  it("takes the oat milk off the mirror's shelf along with the latte", async () => {
    await completeSale({
      items: [{ variant_id: 12, quantity: 2, modifiers: [102] }],
      payments: [{ method: 'cash', amount_cents: 16000 }],
    });

    const puts = vi.mocked(db.catalog.put).mock.calls.map(([row]) => row as { variant_id: number; quantity: number });
    expect(puts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variant_id: 12, quantity: 48 }),
        expect.objectContaining({ variant_id: 14, quantity: 4600 }),
      ])
    );
  });

  it('prices a plain line exactly as before when no answers are named', async () => {
    const sale = await completeSale({
      items: [{ variant_id: 12, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 6500 }],
    });
    expect(sale.items[0]).toMatchObject({ unit_price_cents: 6500, variant_label: 'M' });
    expect(sale.items[0].modifiers).toBeUndefined();
  });
});

describe("completeSale — the till's own order number, offline (К3d)", () => {
  let counter: unknown;

  beforeEach(() => {
    counter = undefined;
    vi.mocked(api.loadAuth).mockReturnValue({
      staff: { display_name: 'Марта' },
      store: { fiscal: { enabled: false } },
    } as never);
    vi.mocked(getMeta).mockImplementation(async (key: string) =>
      key === 'localOrderCounter' ? counter : undefined
    );
    vi.mocked(setMeta).mockImplementation(async (key: string, value: unknown) => {
      if (key === 'localOrderCounter') counter = value;
    });
  });

  it('numbers the day’s first queued sale «1» and the next «2», and never touches order_no', async () => {
    const first = await completeSale(payload);
    expect(first.local_order_no).toBe(1);
    expect(first.order_no).toBeUndefined();
    expect(first.receipt_number).toMatch(/^OFF-/);
    expect(counter).toEqual({ day: deviceLocalDay(), next: 2 });

    const second = await completeSale(payload);
    expect(second.local_order_no).toBe(2);
    // The queue carries no number at all — the server hands out its own.
    for (const row of outbox) {
      expect(row.payload).not.toHaveProperty('local_order_no');
      expect(row.payload).not.toHaveProperty('order_no');
    }
  });

  it('starts over on a new device day', async () => {
    counter = { day: '2000-01-01', next: 9 };
    const sale = await completeSale(payload);
    expect(sale.local_order_no).toBe(1);
    expect(counter).toEqual({ day: deviceLocalDay(), next: 2 });
  });

  it('spends no number on a sale the till may not queue', async () => {
    vi.mocked(api.loadAuth).mockReturnValue({
      staff: { display_name: 'Марта' },
      store: { fiscal: { enabled: true, offline_mode: true } },
    } as never);
    vi.mocked(takeStamp).mockRejectedValue(new OfflineFiscalError('no_reserve', 'x'));
    await expect(completeSale(payload)).rejects.toBeInstanceOf(OfflineFiscalError);
    expect(counter).toBeUndefined();
  });

  it('gives an online sale the server’s number and no local one', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.mocked(api.hasLiveJwt).mockReturnValue(true);
    vi.mocked(api.completeSale).mockResolvedValue({
      id: 5,
      receipt_number: 'ЧК-000005',
      order_no: 7,
      status: 'completed',
      subtotal_cents: 45000,
      total_cents: 45000,
      refunded_cents: 0,
      staff_name: 'Марта',
      customer_id: null,
      created_at: '2026-09-21T08:00:00.000Z',
      items: [],
      payments: [],
      refunds: [],
    } as never);

    const sale = await completeSale(payload);
    expect(sale.order_no).toBe(7);
    expect(sale.local_order_no).toBeUndefined();
    expect(counter).toBeUndefined();
    expect(outbox).toHaveLength(0);
  });
});
