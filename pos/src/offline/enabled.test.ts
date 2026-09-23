// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fresh module per test: the flag is module state, and the whole point of
// the three modes is what each one answers to the two predicates.
async function fresh() {
  vi.resetModules();
  return import('./enabled');
}

describe('offline mode', () => {
  beforeEach(() => vi.resetModules());

  it('starts off: the web shell reads and writes the server', async () => {
    const m = await fresh();
    expect(m.offlineMode()).toBe('off');
    expect(m.isOfflinePosEnabled()).toBe(false);
    expect(m.isOfflineReadsEnabled()).toBe(false);
  });

  it('full: the desktop till reads its mirror and queues its writes', async () => {
    const m = await fresh();
    m.enableOfflinePos();
    expect(m.offlineMode()).toBe('full');
    expect(m.isOfflinePosEnabled()).toBe(true);
    expect(m.isOfflineReadsEnabled()).toBe(true);
  });

  it('reads: the tablet reads its mirror but is never a till', async () => {
    const m = await fresh();
    m.enableOfflineReads();
    expect(m.offlineMode()).toBe('reads');
    expect(m.isOfflineReadsEnabled()).toBe(true);
    // Everything keyed on this stays desktop-only: outbox, lease, device id,
    // the stocktake queue.
    expect(m.isOfflinePosEnabled()).toBe(false);
  });
});
