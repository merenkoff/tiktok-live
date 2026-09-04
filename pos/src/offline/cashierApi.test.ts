// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSaleDetail, makeSaleListItem } from '../test/utils';

vi.mock('./enabled', () => ({ isOfflinePosEnabled: vi.fn(() => false) }));
vi.mock('./repository', () => ({
  getCatalog: vi.fn(),
  getTags: vi.fn(),
  completeSale: vi.fn(),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  listSales: vi.fn(),
  getSale: vi.fn(),
  refundSale: vi.fn(),
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
const { isOfflinePosEnabled } = await import('./enabled');
const { cashierApi, saleRowFromDetail } = await import('./cashierApi');

const offline = vi.mocked(isOfflinePosEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  offline.mockReturnValue(false);
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
    offline.mockReturnValue(true);
    vi.mocked(repo.getCatalog).mockResolvedValue([]);
    await cashierApi.getCatalog({ q: 'x' });

    expect(repo.getCatalog).toHaveBeenCalledWith({ q: 'x' });
    expect(api.getCatalog).not.toHaveBeenCalled();
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
    offline.mockReturnValue(true);
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
    offline.mockReturnValue(true);
    vi.mocked(repo[name]).mockResolvedValue([] as never);
    await call();

    expect(repo[name]).toHaveBeenCalled();
    expect(api[name]).not.toHaveBeenCalled();
  });

  it('updates a customer by id on both paths', async () => {
    vi.mocked(api.updateCustomer).mockResolvedValue({} as never);
    await cashierApi.updateCustomer(7, { name: 'Аня' });
    expect(api.updateCustomer).toHaveBeenCalledWith(7, { name: 'Аня' });

    offline.mockReturnValue(true);
    vi.mocked(repo.updateCustomer).mockResolvedValue({} as never);
    await cashierApi.updateCustomer(7, { name: 'Аня' });
    expect(repo.updateCustomer).toHaveBeenCalledWith(7, { name: 'Аня' });
  });

  it('lists sales from the local mirror on the offline cashier', async () => {
    offline.mockReturnValue(true);
    vi.mocked(repo.listSales).mockResolvedValue([]);
    await cashierApi.listSales();

    expect(repo.listSales).toHaveBeenCalledWith(50);
    expect(api.listSales).not.toHaveBeenCalled();
  });

  it('reads a sale detail from the local mirror on the offline cashier', async () => {
    offline.mockReturnValue(true);
    const row = saleRowFromDetail(makeSaleDetail());
    vi.mocked(repo.getSale).mockResolvedValue(null);
    await cashierApi.getSale(row);

    expect(repo.getSale).toHaveBeenCalledWith(row);
    expect(api.getSale).not.toHaveBeenCalled();
  });
});
