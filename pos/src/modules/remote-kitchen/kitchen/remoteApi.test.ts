// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Немає» from the kitchen: the cafe's till reads the reason, so it names the dishes.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();
vi.mock('../lib/hostPlatform', () => ({ posRequest: (...a: unknown[]) => posRequest(...a) }));

const { declineDishes } = await import('./remoteApi');

beforeEach(() => {
  posRequest.mockReset();
  posRequest.mockResolvedValue({});
});

describe('declineDishes', () => {
  it('marks each missing dish and names them for the cafe', async () => {
    const items = [
      { id: 1, product_name: 'Маргарита', variant_label: '', quantity: 1, note: '' },
      { id: 2, product_name: 'Тірамісу', variant_label: '', quantity: 2, note: '' },
    ];
    await declineDishes({ id: 7, revision: 3, items }, [2]);
    expect(posRequest).toHaveBeenCalledWith('post', '/remote-kitchen/orders/7/decline', {
      reason: 'Немає: Тірамісу',
      problems: [{ item_id: 2, problem: 'unavailable' }],
      revision: 3,
    });
  });
});
