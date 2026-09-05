// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { importWithRetry } from './lazyWithRetry';

describe('importWithRetry', () => {
  it('resolves without retrying when the factory succeeds first time', async () => {
    const factory = vi.fn().mockResolvedValue('ok');
    await expect(importWithRetry(factory, { backoffMs: 1 })).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and then resolves', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip 1'))
      .mockRejectedValueOnce(new Error('blip 2'))
      .mockResolvedValue('recovered');

    await expect(importWithRetry(factory, { retries: 2, backoffMs: 1 })).resolves.toBe('recovered');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('rejects with the last error once retries are exhausted', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('still down'));

    await expect(importWithRetry(factory, { retries: 2, backoffMs: 1 })).rejects.toThrow('still down');
    expect(factory).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
