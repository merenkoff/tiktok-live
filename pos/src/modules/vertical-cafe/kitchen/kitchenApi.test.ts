// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which route a tap goes to. The board carries two kinds of ticket stamped in
// two different tables (К4c), so this is the one line where getting it wrong
// costs a cook a 404 while the ticket is in front of them.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('../lib/hostPlatform', () => ({
  posRequest: (...a: unknown[]) => posRequest(...a),
}));

const { listOrders, setPrep, setStopListed } = await import('./kitchenApi');

beforeEach(() => {
  vi.clearAllMocks();
  posRequest.mockResolvedValue({});
});

describe('kitchenApi.setPrep', () => {
  it('stamps a counter sale through the sales route', async () => {
    await setPrep({ id: 7, kind: 'sale' }, 'ready');
    expect(posRequest).toHaveBeenCalledWith('patch', '/sales/7/prep', { prep_status: 'ready' });
  });

  it("stamps a table's round through the kitchen's own route", async () => {
    await setPrep({ id: 7, kind: 'round' }, 'ready');
    expect(posRequest).toHaveBeenCalledWith('patch', '/kitchen/rounds/7/prep', {
      prep_status: 'ready',
    });
  });

  it('treats an order from a pre-К4 server as a sale', async () => {
    await setPrep({ id: 7 }, 'served');
    expect(posRequest).toHaveBeenCalledWith('patch', '/sales/7/prep', { prep_status: 'served' });
  });
});

describe('kitchenApi', () => {
  it('reads the board and toggles the stop-list where the server expects', async () => {
    await listOrders();
    expect(posRequest).toHaveBeenLastCalledWith('get', '/kitchen/orders');

    await setStopListed(42, true);
    expect(posRequest).toHaveBeenLastCalledWith('post', '/kitchen/stop-list/42', {
      stop_listed: true,
    });
  });
});
