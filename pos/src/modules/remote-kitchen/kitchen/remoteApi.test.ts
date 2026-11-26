// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Немає» from the kitchen: the cafe's till reads the reason, so it names the dishes.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();
vi.mock('../lib/hostPlatform', () => ({ posRequest: (...a: unknown[]) => posRequest(...a) }));

const { REASON_MAX, declineDishes, missingReason } = await import('./remoteApi');

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

describe('missingReason', () => {
  it('names each dish with its size, once', () => {
    expect(
      missingReason([
        { product_name: 'Маргарита', variant_label: '50 см' },
        { product_name: 'Маргарита', variant_label: '30 см' },
        { product_name: 'Маргарита', variant_label: '50 см' },
      ])
    ).toBe('Немає: Маргарита 50 см, Маргарита 30 см');
  });

  it('cuts at a comma, never mid-name, and says how many more', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ product_name: `Піца довга назва номер ${i + 1}`, variant_label: '' }));
    const reason = missingReason(items)!;
    expect(reason.length).toBeLessThanOrEqual(REASON_MAX);
    const [, listed, rest] = /^Немає: (.*) та ще (\d+)$/.exec(reason) ?? [];
    // Every name that is there is whole, and the count makes up the rest.
    const names = listed.split(', ');
    for (const name of names) expect(name).toMatch(/^Піца довга назва номер \d+$/);
    expect(names.length + Number(rest)).toBe(12);
  });

  it('is nothing for no dish', () => {
    expect(missingReason([])).toBeUndefined();
  });
});
