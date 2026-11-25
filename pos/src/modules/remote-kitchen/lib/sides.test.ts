// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Both strips of the till's banner ask which side this store is on; one read
// of the setup answers both.

import { afterEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();
vi.mock('./hostPlatform', () => ({ posRequest: (...a: unknown[]) => posRequest(...a) }));

const { SIDES_FRESH_MS, forgetSides, readSides } = await import('./sides');

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

  it('does not remember a failed read', async () => {
    posRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ as_cafe: null, as_kitchen: {} });
    await expect(readSides(1000)).rejects.toThrow('offline');
    expect(await readSides(1001)).toEqual({ cafe: false, kitchen: true });
  });
});
