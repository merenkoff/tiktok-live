// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Both strips of the till's banner ask which side this store is on; one read
// of the setup answers both.

import { afterEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();
vi.mock('./hostPlatform', () => ({ posRequest: (...a: unknown[]) => posRequest(...a), currentStoreId: () => 7 }));

const { SIDES_FRESH_MS, forgetSides, readSetupShared, readSides } = await import('./sides');

afterEach(() => {
  forgetSides();
  posRequest.mockReset();
});

describe('readSides', () => {
  it('reads the setup once for both strips, and again once the answer is stale', async () => {
    posRequest.mockResolvedValue({ as_cafe: { link: {} }, as_kitchen: null });
    const [a, b] = await Promise.all([readSides(1000), readSides(1001)]);
    expect(a).toEqual({ cafe: true, kitchen: false });
    expect(b).toBe(a);
    expect(posRequest).toHaveBeenCalledTimes(1);
    await readSides(1000 + SIDES_FRESH_MS);
    expect(posRequest).toHaveBeenCalledTimes(2);
  });

  it('reads again for a caller that wants a fresher answer than the shared half minute', async () => {
    posRequest.mockResolvedValue({ as_cafe: null, as_kitchen: null });
    await readSetupShared(1000);
    await readSetupShared(1000 + 4_000, 7, 5_000);
    expect(posRequest).toHaveBeenCalledTimes(1);
    await readSetupShared(1000 + 6_000, 7, 5_000);
    expect(posRequest).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed read', async () => {
    posRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ as_cafe: null, as_kitchen: {} });
    await expect(readSides(1000)).rejects.toThrow('offline');
    expect(await readSides(1001)).toEqual({ cafe: false, kitchen: true });
  });

  it('never hands one store’s answer to another store signed in on the same till', async () => {
    posRequest.mockResolvedValueOnce({ as_cafe: { link: {} }, as_kitchen: null });
    posRequest.mockResolvedValueOnce({ as_cafe: null, as_kitchen: {} });
    expect(await readSides(1000, 7)).toEqual({ cafe: true, kitchen: false });
    expect(await readSides(1001, 8)).toEqual({ cafe: false, kitchen: true });
    expect(posRequest).toHaveBeenCalledTimes(2);
  });

  it('keeps a cafe whose link was revoked following the orders it still has', async () => {
    posRequest.mockResolvedValue({ as_cafe: null, as_kitchen: null, cafe_orders: true });
    expect(await readSides(1000)).toEqual({ cafe: true, kitchen: false });
  });

  it('reads an older server without `cafe_orders` by the link alone', async () => {
    posRequest.mockResolvedValue({ as_cafe: null, as_kitchen: null });
    expect(await readSides(1000)).toEqual({ cafe: false, kitchen: false });
  });
});
