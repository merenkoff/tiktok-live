// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSaleDetail, makeSaleListItem } from '../test/utils';

vi.mock('./enabled', () => ({
  isOfflinePosEnabled: vi.fn(() => false),
  isOfflineReadsEnabled: vi.fn(() => false),
}));
const statusState = { online: true };
vi.mock('./status', () => ({ useOfflineStatus: { getState: () => statusState } }));
vi.mock('./repository', () => ({
  getCatalog: vi.fn(),
  getTags: vi.fn(),
  refreshSnapshot: vi.fn(),
  completeSale: vi.fn(),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  listSales: vi.fn(),
  getSale: vi.fn(),
  refundSale: vi.fn(),
  discardQueuedSale: vi.fn(),
}));
vi.mock('../services/api', () => ({
  api: {
    getCatalog: vi.fn(),
    getTags: vi.fn(),
    completeSale: vi.fn(),
    listCustomers: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    listSales: vi.fn(),
    getSale: vi.fn(),
    refundSale: vi.fn(),
  },
}));

const { api } = await import('../services/api');
const repo = await import('./repository');
const { isOfflinePosEnabled, isOfflineReadsEnabled } = await import('./enabled');
const { cashierApi, saleRowFromDetail } = await import('./cashierApi');

const offline = vi.mocked(isOfflinePosEnabled);
const reads = vi.mocked(isOfflineReadsEnabled);

/** The desktop till: reads AND writes go to the local mirror. */
function tillMode() {
  offline.mockReturnValue(true);
  reads.mockReturnValue(true);
}

/** The tablet PWA: reads go to the mirror, writes to the server or nowhere. */
function tabletMode() {
  offline.mockReturnValue(false);
  reads.mockReturnValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  offline.mockReturnValue(false);
  reads.mockReturnValue(false);
  statusState.online = true;
});

describe('saleRowFromDetail', () => {
  it('maps a server sale onto a local row', () => {
    const detail = makeSaleDetail({ client_uuid: 'uuid-1', refunded_cents: 100 });
    expect(saleRowFromDetail(detail)).toEqual({
      client_uuid: 'uuid-1',
      server_id: 10,
      receipt_number: 'RC-00010',
      status: 'completed',
      total_cents: 45000,
      refunded_cents: 100,
      staff_name: 'Олена',
      customer_name: null,
      created_at: '2026-01-01T12:00:00.000Z',
      detail,
    });
  });

  it('synthesises a client_uuid for sales that never had one', () => {
    expect(saleRowFromDetail(makeSaleDetail({ client_uuid: null })).client_uuid).toBe('srv:10');
  });

  it('keeps server_id null for an unsynced offline receipt', () => {
    // Offline receipts carry a negative placeholder id until they sync.
    expect(saleRowFromDetail(makeSaleDetail({ id: -3 })).server_id).toBeNull();
  });
});

describe('cashierApi delegation', () => {
  it('reads the catalog from the API when the local mirror is off', async () => {
    vi.mocked(api.getCatalog).mockResolvedValue([]);
    await cashierApi.getCatalog({ q: 'x' });

    expect(api.getCatalog).toHaveBeenCalledWith({ q: 'x' });
    expect(repo.getCatalog).not.toHaveBeenCalled();
  });

  it('reads the catalog from the local mirror on the offline cashier', async () => {
    tillMode();
    vi.mocked(repo.getCatalog).mockResolvedValue([]);
    await cashierApi.getCatalog({ q: 'x' });

    expect(repo.getCatalog).toHaveBeenCalledWith({ q: 'x' });
    expect(api.getCatalog).not.toHaveBeenCalled();
  });

  it('re-reads the mirror on the desktop, and has nothing to re-read on the web', async () => {
    vi.mocked(repo.refreshSnapshot).mockResolvedValue(undefined);
    await cashierApi.refreshCatalog();
    expect(repo.refreshSnapshot).not.toHaveBeenCalled();

    tillMode();
    await cashierApi.refreshCatalog();
    expect(repo.refreshSnapshot).toHaveBeenCalledTimes(1);
  });

  it("passes the stock count's include_unsellable flag through to the mirror", async () => {
    tillMode();
    vi.mocked(repo.getCatalog).mockResolvedValue([]);
    await cashierApi.getCatalog({ barcode: '4820', include_unsellable: true });

    expect(repo.getCatalog).toHaveBeenCalledWith({ barcode: '4820', include_unsellable: true });
  });

  it('maps the server sales list onto local rows', async () => {
    vi.mocked(api.listSales).mockResolvedValue([
      makeSaleListItem({ id: 5, client_uuid: null, receipt_number: 'RC-00005' }),
    ]);
    const rows = await cashierApi.listSales(10);

    expect(api.listSales).toHaveBeenCalledWith(10);
    expect(rows).toEqual([
      {
        client_uuid: 'srv:5',
        server_id: 5,
        receipt_number: 'RC-00005',
        status: 'completed',
        total_cents: 45000,
        refunded_cents: 0,
        staff_name: 'Олена',
        customer_name: null,
        created_at: '2026-01-01T12:00:00.000Z',
      },
    ]);
  });

  it('fetches a sale detail by server id, and gives up without one', async () => {
    const detail = makeSaleDetail();
    vi.mocked(api.getSale).mockResolvedValue(detail);

    expect(await cashierApi.getSale(saleRowFromDetail(detail))).toBe(detail);
    expect(api.getSale).toHaveBeenCalledWith(10);

    expect(await cashierApi.getSale(saleRowFromDetail(makeSaleDetail({ id: -1 })))).toBeNull();
  });

  it('sends an idempotency key with every online refund', async () => {
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'refund-uuid' });
    const row = saleRowFromDetail(makeSaleDetail());
    const refunded = makeSaleDetail({ status: 'refunded', refunded_cents: 22500 });
    vi.mocked(api.refundSale).mockResolvedValue(refunded);

    const next = await cashierApi.refundSale(row, [{ sale_item_id: 100, quantity: 1 }], {
      method: 'cash',
    });

    expect(api.refundSale).toHaveBeenCalledWith(10, [{ sale_item_id: 100, quantity: 1 }], {
      method: 'cash',
      client_uuid: 'refund-uuid',
    });
    expect(next).toMatchObject({ status: 'refunded', refunded_cents: 22500, detail: refunded });
  });

  it('refuses to refund a receipt that never reached the server', async () => {
    const row = saleRowFromDetail(makeSaleDetail({ id: -1 }));
    await expect(cashierApi.refundSale(row, [])).rejects.toThrow('Sale has no server id');
    expect(api.refundSale).not.toHaveBeenCalled();
  });

  it('routes refunds through the local queue on the offline cashier', async () => {
    tillMode();
    const row = saleRowFromDetail(makeSaleDetail({ id: -1 }));
    vi.mocked(repo.refundSale).mockResolvedValue(row);

    await cashierApi.refundSale(row, [{ sale_item_id: 100, quantity: 1 }]);

    expect(repo.refundSale).toHaveBeenCalledWith(row, [{ sale_item_id: 100, quantity: 1 }], {});
    expect(api.refundSale).not.toHaveBeenCalled();
  });
});

describe('cashierApi passthrough methods', () => {
  const cases = [
    ['getTags', () => cashierApi.getTags(), undefined] as const,
    ['listCustomers', () => cashierApi.listCustomers('ан'), 'ан'] as const,
    [
      'completeSale',
      () => cashierApi.completeSale({ items: [], payments: [] }),
      { items: [], payments: [] },
    ] as const,
    [
      'createCustomer',
      () => cashierApi.createCustomer({ name: 'Аня', phone: '+380' }),
      { name: 'Аня', phone: '+380' },
    ] as const,
  ];

  it.each(cases)('%s goes to the API while the local mirror is off', async (name, call, arg) => {
    vi.mocked(api[name]).mockResolvedValue([] as never);
    await call();

    if (arg === undefined) expect(api[name]).toHaveBeenCalled();
    else expect(api[name]).toHaveBeenCalledWith(arg);
    expect(repo[name]).not.toHaveBeenCalled();
  });

  it.each(cases)('%s goes to the local mirror on the offline cashier', async (name, call) => {
    tillMode();
    vi.mocked(repo[name]).mockResolvedValue([] as never);
    await call();

    expect(repo[name]).toHaveBeenCalled();
    expect(api[name]).not.toHaveBeenCalled();
  });

  it('updates a customer by id on both paths', async () => {
    vi.mocked(api.updateCustomer).mockResolvedValue({} as never);
    await cashierApi.updateCustomer(7, { name: 'Аня' });
    expect(api.updateCustomer).toHaveBeenCalledWith(7, { name: 'Аня' });

    tillMode();
    vi.mocked(repo.updateCustomer).mockResolvedValue({} as never);
    await cashierApi.updateCustomer(7, { name: 'Аня' });
    expect(repo.updateCustomer).toHaveBeenCalledWith(7, { name: 'Аня' });
  });

  it('lists sales from the local mirror on the offline cashier', async () => {
    tillMode();
    vi.mocked(repo.listSales).mockResolvedValue([]);
    await cashierApi.listSales();

    expect(repo.listSales).toHaveBeenCalledWith(50);
    expect(api.listSales).not.toHaveBeenCalled();
  });

  it('reads a sale detail from the local mirror on the offline cashier', async () => {
    tillMode();
    const row = saleRowFromDetail(makeSaleDetail());
    vi.mocked(repo.getSale).mockResolvedValue(null);
    await cashierApi.getSale(row);

    expect(repo.getSale).toHaveBeenCalledWith(row);
    expect(api.getSale).not.toHaveBeenCalled();
  });
});

describe('fiscal state passthrough', () => {
  it('carries fiscal_status onto the local row shape', () => {
    // Without this the receipts list shows nothing on a fiscalising store,
    // because the till renders from `LocalSaleRow`, not `SaleDetail`.
    const row = saleRowFromDetail(makeSaleDetail({ id: 3, fiscal_status: 'failed' }));
    expect(row.fiscal_status).toBe('failed');
  });

  it('leaves fiscal_status absent for a store that does not fiscalise', () => {
    expect(saleRowFromDetail(makeSaleDetail({ id: 4 })).fiscal_status).toBeUndefined();
  });

  it('keeps the refund fiscal result off the stored sale', () => {
    // `putLocalSale` persists `detail` wholesale, so folding the refund's
    // document into the sale would leave a refund's fiscal code masquerading
    // as the sale's in the offline mirror.
    const detail = makeSaleDetail({
      id: 5,
      fiscal_status: 'done',
      refund_fiscal: {
        status: 'failed',
        fiscal_code: null,
        fiscal_date: null,
        tax_url: null,
        qr_payload: null,
        receipt_text: null,
        error_code: 'unavailable',
        message: 'Немає звʼязку',
      },
    });
    vi.mocked(api.refundSale).mockResolvedValue(detail);

    return cashierApi
      .refundSale(saleRowFromDetail(makeSaleDetail({ id: 5 })), [
        { sale_item_id: 1, quantity: 1 },
      ])
      .then((row) => {
        expect(row.refund_fiscal).toMatchObject({ status: 'failed' });
        expect(row.detail?.refund_fiscal).toBeUndefined();
        expect(row.fiscal_status).toBe('done');
      });
  });
});

describe('discardQueuedSale', () => {
  it('delegates to the repository on the cashier shell', async () => {
    tillMode();
    await cashierApi.discardQueuedSale('uuid-1');
    expect(repo.discardQueuedSale).toHaveBeenCalledWith('uuid-1');
  });

  it('refuses on the web build, which has no outbox at all', async () => {
    offline.mockReturnValue(false);
    await expect(cashierApi.discardQueuedSale('uuid-1')).rejects.toThrow(/каси/);
    expect(repo.discardQueuedSale).not.toHaveBeenCalled();
  });

  it('refuses on the tablet too — reads have a mirror, writes have no queue', async () => {
    tabletMode();
    await expect(cashierApi.discardQueuedSale('uuid-1')).rejects.toThrow(/каси/);
    expect(repo.discardQueuedSale).not.toHaveBeenCalled();
  });
});

describe('the tablet: reads from the mirror, writes to the server or nowhere', () => {
  beforeEach(() => tabletMode());

  it('reads the catalog, tags, customers and sales from the mirror', async () => {
    vi.mocked(repo.getCatalog).mockResolvedValue([]);
    vi.mocked(repo.getTags).mockResolvedValue([]);
    vi.mocked(repo.listCustomers).mockResolvedValue([]);
    vi.mocked(repo.listSales).mockResolvedValue([]);
    await cashierApi.getCatalog({ q: 'x' });
    await cashierApi.getTags();
    await cashierApi.listCustomers('ан');
    await cashierApi.listSales(5);
    await cashierApi.refreshCatalog();

    expect(repo.getCatalog).toHaveBeenCalledWith({ q: 'x' });
    expect(repo.getTags).toHaveBeenCalled();
    expect(repo.listCustomers).toHaveBeenCalledWith('ан');
    expect(repo.listSales).toHaveBeenCalledWith(5);
    expect(repo.refreshSnapshot).toHaveBeenCalled();
    expect(api.getCatalog).not.toHaveBeenCalled();
    expect(api.listSales).not.toHaveBeenCalled();
  });

  it('sends every write straight to the server while online', async () => {
    vi.mocked(api.completeSale).mockResolvedValue(makeSaleDetail());
    vi.mocked(api.createCustomer).mockResolvedValue({} as never);
    vi.mocked(api.updateCustomer).mockResolvedValue({} as never);

    await cashierApi.completeSale({ items: [], payments: [] }, { clientUuid: 'u-1' });
    await cashierApi.createCustomer({ name: 'Аня', phone: '+380' });
    await cashierApi.updateCustomer(7, { name: 'Аня' });

    expect(api.completeSale).toHaveBeenCalledWith({ items: [], payments: [], client_uuid: 'u-1' });
    expect(api.createCustomer).toHaveBeenCalledWith({ name: 'Аня', phone: '+380' });
    expect(api.updateCustomer).toHaveBeenCalledWith(7, { name: 'Аня' });
    expect(repo.completeSale).not.toHaveBeenCalled();
    expect(repo.createCustomer).not.toHaveBeenCalled();
    expect(repo.updateCustomer).not.toHaveBeenCalled();
  });

  it('refuses every write on the spot without a network — nothing is queued', async () => {
    statusState.online = false;
    const row = saleRowFromDetail(makeSaleDetail());

    await expect(cashierApi.completeSale({ items: [], payments: [] })).rejects.toMatchObject({
      name: 'OfflineWriteError',
    });
    await expect(cashierApi.createCustomer({ name: 'Аня', phone: '+380' })).rejects.toMatchObject({
      name: 'OfflineWriteError',
    });
    await expect(cashierApi.updateCustomer(7, { name: 'Аня' })).rejects.toMatchObject({
      name: 'OfflineWriteError',
    });
    await expect(cashierApi.refundSale(row, [])).rejects.toMatchObject({ name: 'OfflineWriteError' });

    expect(api.completeSale).not.toHaveBeenCalled();
    expect(api.createCustomer).not.toHaveBeenCalled();
    expect(api.updateCustomer).not.toHaveBeenCalled();
    expect(api.refundSale).not.toHaveBeenCalled();
    expect(repo.completeSale).not.toHaveBeenCalled();
    expect(repo.createCustomer).not.toHaveBeenCalled();
    expect(repo.refundSale).not.toHaveBeenCalled();
  });

  it('never refuses a write on the web shell for a stale online flag', async () => {
    // The web shell installs no connectivity listeners, so `online` there is
    // whatever `navigator.onLine` said at load — not something to refuse on.
    reads.mockReturnValue(false);
    statusState.online = false;
    vi.mocked(api.createCustomer).mockResolvedValue({} as never);
    await cashierApi.createCustomer({ name: 'Аня', phone: '+380' });
    expect(api.createCustomer).toHaveBeenCalled();
  });
});
