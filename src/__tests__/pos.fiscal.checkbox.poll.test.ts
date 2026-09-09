// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { delay, pollUntil } from '../pos/fiscal/providers/checkbox/poll.js';

describe('pollUntil', () => {
  it('resolves on the first already-settled value without waiting', async () => {
    const signal = new AbortController().signal;
    const fetchOnce = vi.fn().mockResolvedValue({ status: 'DONE' });
    const result = await pollUntil(signal, fetchOnce, (v) => v.status === 'DONE', 5);
    expect(result).toEqual({ status: 'DONE' });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it('keeps polling until the value settles', async () => {
    const signal = new AbortController().signal;
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce({ status: 'CREATED' })
      .mockResolvedValueOnce({ status: 'CREATED' })
      .mockResolvedValueOnce({ status: 'DONE' });
    const result = await pollUntil(signal, fetchOnce, (v) => v.status === 'DONE', 1);
    expect(result).toEqual({ status: 'DONE' });
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });

  it('rejects if the signal aborts while waiting between polls', async () => {
    const controller = new AbortController();
    const fetchOnce = vi.fn().mockResolvedValue({ status: 'CREATED' });
    const promise = pollUntil(controller.signal, fetchOnce, (v) => v.status === 'DONE', 50);
    setTimeout(() => controller.abort(new Error('budget exhausted')), 10);
    await expect(promise).rejects.toThrow('budget exhausted');
  });

  it('propagates a rejection from fetchOnce itself (e.g. an already-aborted fetch)', async () => {
    const signal = new AbortController().signal;
    const fetchOnce = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(pollUntil(signal, fetchOnce, () => true, 1)).rejects.toThrow('network down');
  });
});

describe('delay', () => {
  it('resolves after the given time', async () => {
    const signal = new AbortController().signal;
    const start = Date.now();
    await delay(5, signal);
    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already gone'));
    await expect(delay(1000, controller.signal)).rejects.toThrow('already gone');
  });
});
