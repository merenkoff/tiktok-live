// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  modulePendingCounts,
  offlineModules,
  registerOfflineModules,
  resetOfflineModulesForTests,
  syncOfflineModules,
} from './moduleHooks';

afterEach(() => resetOfflineModulesForTests());

describe('offline module hooks (roadmap #12 track 3)', () => {
  it('registers only descriptors that declare offline hooks, in order', () => {
    const a = { pendingCount: async () => 1, sync: async () => undefined };
    registerOfflineModules([{ id: 'returns' }, { id: 'stocktake', offline: a }, { id: 'x', offline: a }]);
    expect(offlineModules().map(([id]) => id)).toEqual(['stocktake', 'x']);
  });

  it('runs every sync in order and keeps going past a hook that throws', async () => {
    const calls: string[] = [];
    const errors: string[] = [];
    registerOfflineModules([
      {
        id: 'a',
        offline: {
          pendingCount: async () => 0,
          sync: async () => {
            calls.push('a');
            throw new Error('boom');
          },
        },
      },
      { id: 'b', offline: { pendingCount: async () => 0, sync: async () => void calls.push('b') } },
    ]);
    await syncOfflineModules((id) => errors.push(id));
    expect(calls).toEqual(['a', 'b']);
    expect(errors).toEqual(['a']);
  });

  it('sums pending per module and treats a throwing counter as 0', async () => {
    registerOfflineModules([
      { id: 'a', offline: { pendingCount: async () => 2, sync: vi.fn() } },
      {
        id: 'b',
        offline: {
          pendingCount: async () => {
            throw new Error('db closed');
          },
          sync: vi.fn(),
        },
      },
    ]);
    await expect(modulePendingCounts()).resolves.toEqual({ a: 2, b: 0 });
  });
});
