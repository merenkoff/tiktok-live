// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the outbox replay tells the server about a sale it is shipping late.
// Dexie and the network are mocked — the wire shape is what these pin.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxRow } from './db';

const rows: OutboxRow[] = [];
const sold = { id: 5, receipt_number: 'ЧК-000005', order_no: 3, items: [], payments: [], refunds: [] };

function table(type: string) {
  return {
    sortBy: vi.fn(async () => rows.filter((r) => r.type === type)),
    filter: () => ({ count: vi.fn(async () => 0) }),
  };
}

vi.mock('./db', () => ({
  db: {
    outbox: {
      where: () => ({ equals: (type: string) => table(type) }),
      delete: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
    customers: { filter: () => ({ first: vi.fn(async () => undefined) }) },
  },
  getDeviceId: vi.fn(async () => 'dev-1'),
}));
vi.mock('./enabled', () => ({ isOfflinePosEnabled: () => true, isOfflineReadsEnabled: () => true }));
vi.mock('../services/api', () => ({
  api: { completeSale: vi.fn(), hasLiveJwt: () => true },
  isNetworkError: () => false,
  isUnauthorized: () => false,
}));
vi.mock('./repository', () => ({
  putLocalSale: vi.fn(async () => undefined),
  refreshSalesCache: vi.fn(async () => undefined),
  refreshSnapshot: vi.fn(async () => undefined),
  replaceLocalCustomer: vi.fn(async () => undefined),
}));
vi.mock('./lease', () => ({ refreshLease: vi.fn(async () => undefined) }));
vi.mock('./moduleHooks', () => ({ syncOfflineModules: vi.fn(async () => undefined) }));
vi.mock('./status', () => {
  const state = {
    pending: 0,
    setSyncing: vi.fn(),
    setLastError: vi.fn(),
    refreshPending: vi.fn(async () => undefined),
  };
  return { useOfflineStatus: { getState: () => state } };
});

const { api } = await import('../services/api');
const { db } = await import('./db');
const { putLocalSale } = await import('./repository');
const { runSync } = await import('./sync');

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vi.mocked(api.completeSale).mockResolvedValue(sold as never);
  rows.push({
    id: 'row-1',
    type: 'sale',
    clientUuid: 'u-1',
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    payload: {
      client_uuid: 'u-1',
      items: [{ variant_id: 3, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 4500 }],
      customer_id: null,
      customer_client_uuid: null,
    },
  });
});

describe('runSync — a queued sale', () => {
  it('ships it as an offline replay, so the server files it served and skips the stop-list', async () => {
    await runSync();
    expect(api.completeSale).toHaveBeenCalledTimes(1);
    expect(api.completeSale).toHaveBeenCalledWith(
      expect.objectContaining({
        client_uuid: 'u-1',
        items: [{ variant_id: 3, quantity: 1 }],
        offline_replay: true,
        fiscal_offline: null,
      })
    );
    // The mirror row is replaced by the server's sale — its number included,
    // the till's own «К» number gone with the local detail.
    expect(putLocalSale).toHaveBeenCalledWith(sold, 'u-1', 5);
    expect(db.outbox.delete).toHaveBeenCalledWith('row-1');
  });
});
