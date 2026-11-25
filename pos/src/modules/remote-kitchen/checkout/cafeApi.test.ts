// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The setup read on the cafe's till (РК5, §8): what the till kept stands in
// when the read got no answer at all — even while the till still thinks it is
// online, a router with no internet at opening — but never over an answer.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();
const net = { online: true };
vi.mock('../lib/hostPlatform', () => ({
  posRequest: (...a: unknown[]) => posRequest(...a),
  currentStoreId: () => 7,
  isOnline: () => net.online,
}));

import { loadSetup } from './cafeApi';
import { rememberSetup } from '../lib/setupMemory';

const raw = {
  as_cafe: {
    link: { id: 1, status: 'active', kitchen_title: 'Кухня', kitchen_phone: '+380671112233' },
    kitchen: { accepting: true },
    items: [{ cafe_variant_id: 10 }],
  },
  as_kitchen: null,
};

beforeEach(() => {
  localStorage.clear();
  posRequest.mockReset();
  net.online = true;
  rememberSetup(raw, 7);
});

describe('loadSetup', () => {
  it('reads what the till kept when the read got no answer, though the till still says online', async () => {
    posRequest.mockRejectedValue(new Error('timeout of 15000ms exceeded'));
    const setup = await loadSetup();
    expect(setup?.fromMemory).toBe(true);
    expect([...(setup?.variantIds ?? [])]).toEqual([10]);
  });

  it('never over an answer that said no', async () => {
    posRequest.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 500 } }));
    await expect(loadSetup()).rejects.toThrow('Request failed');
  });

  it('keeps a fresh answer for the next time there is none', async () => {
    localStorage.clear();
    posRequest.mockResolvedValue(raw);
    const fresh = await loadSetup();
    expect(fresh?.fromMemory).toBeUndefined();
    posRequest.mockRejectedValue(new Error('Network Error'));
    net.online = false;
    expect((await loadSetup())?.fromMemory).toBe(true);
  });
});
