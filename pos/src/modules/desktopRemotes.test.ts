// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkModuleRemoteUpdates,
  createCacheFirstSync,
  startModuleRemoteUpdateChecks,
  useModuleRemoteUpdates,
} from './desktopRemotes';
import { setAppliedRemotes } from './appliedRemotes';
import { remoteModules, type RemoteModuleDescriptor } from './registry';
import type { ModuleSyncResult } from '../lib/moduleRemotes';

const URL = 'https://cdn.example.test/live/remote-entry.js';
const urlFor = (id: string, file = 'remote-entry.js') => `liveshopmodule://localhost/${id}/${file}`;

const result = (status: ModuleSyncResult['status'], active: string | null): ModuleSyncResult => ({
  status,
  active,
});

afterEach(() => {
  setAppliedRemotes(new Map());
  remoteModules.length = 0;
  useModuleRemoteUpdates.setState({ ready: [], dismissed: false });
  vi.useRealTimers();
});

describe('createCacheFirstSync', () => {
  it('imports from the cache without touching the network when the cache is intact', async () => {
    const sync = vi.fn().mockResolvedValue(result('current', '1.0.6'));
    const syncRemote = createCacheFirstSync(sync, urlFor);

    await expect(syncRemote('tiktok-live', URL)).resolves.toEqual({
      importUrl: 'liveshopmodule://localhost/tiktok-live/remote-entry.js',
      styleUrl: 'liveshopmodule://localhost/tiktok-live/style.css',
    });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith('tiktok-live', URL, { cachedOnly: true });
  });

  it('falls through to the network download when nothing is cached (first run)', async () => {
    const sync = vi
      .fn()
      .mockResolvedValueOnce(result('offline', null))
      .mockResolvedValueOnce(result('updated', '1.0.6'));

    await expect(createCacheFirstSync(sync, urlFor)('tiktok-live', URL)).resolves.toMatchObject({
      importUrl: 'liveshopmodule://localhost/tiktok-live/remote-entry.js',
    });
    expect(sync).toHaveBeenNthCalledWith(2, 'tiktok-live', URL);
  });

  it('resolves null when neither the cache nor the network has it (cold offline)', async () => {
    const sync = vi
      .fn()
      .mockResolvedValueOnce(result('offline', null))
      .mockRejectedValueOnce(new Error('no route to host'));
    await expect(createCacheFirstSync(sync, urlFor)('tiktok-live', URL)).resolves.toBeNull();
  });
});

describe('checkModuleRemoteUpdates', () => {
  it('marks a module whose newer version just landed, by title', async () => {
    setAppliedRemotes(new Map([['tiktok-live', { url: URL }]]));
    remoteModules.push({
      id: 'tiktok-live',
      title: 'Прямий ефір',
      shells: ['cashier'],
      alwaysEnabled: true,
      routes: [],
      nav: [],
    } as RemoteModuleDescriptor);

    await checkModuleRemoteUpdates(vi.fn().mockResolvedValue(result('updated', '1.0.7')));
    expect(useModuleRemoteUpdates.getState().ready).toEqual(['Прямий ефір']);
  });

  it('marks a boot-time placeholder once its first download exists', async () => {
    setAppliedRemotes(new Map([['loyalty', { url: URL }]]));
    remoteModules.push({
      id: 'loyalty',
      title: 'Бонуси',
      shells: ['cashier'],
      alwaysEnabled: true,
      pending: true,
      routes: [],
      nav: [],
    } as RemoteModuleDescriptor);

    // Rust reports the cache state even on an `offline` answer.
    await checkModuleRemoteUpdates(vi.fn().mockResolvedValue(result('offline', '1.0.0')));
    expect(useModuleRemoteUpdates.getState().ready).toEqual(['Бонуси']);
  });

  it('stays quiet for a current module, a still-missing placeholder, or a failed sync', async () => {
    setAppliedRemotes(
      new Map([
        ['a', { url: URL }],
        ['b', { url: URL }],
        ['c', { url: URL }],
      ])
    );
    remoteModules.push({
      id: 'b',
      title: 'B',
      shells: ['cashier'],
      alwaysEnabled: true,
      pending: true,
      routes: [],
      nav: [],
    } as RemoteModuleDescriptor);
    const sync = vi.fn(async (id: string) => {
      if (id === 'a') return result('current', '1.0.0');
      if (id === 'b') return result('offline', null);
      throw new Error('bad signature');
    });

    await expect(checkModuleRemoteUpdates(sync)).resolves.toBeUndefined();
    expect(useModuleRemoteUpdates.getState().ready).toEqual([]);
  });

  it('does not list the same module twice and un-dismisses on a new arrival', () => {
    const { markReady, dismiss } = useModuleRemoteUpdates.getState();
    markReady('X');
    dismiss();
    markReady('X');
    expect(useModuleRemoteUpdates.getState()).toMatchObject({ ready: ['X'], dismissed: true });
    markReady('Y');
    expect(useModuleRemoteUpdates.getState()).toMatchObject({ ready: ['X', 'Y'], dismissed: false });
  });
});

describe('startModuleRemoteUpdateChecks', () => {
  it('is a no-op when the store names no remotes', () => {
    const sync = vi.fn();
    startModuleRemoteUpdateChecks(sync)();
    expect(sync).not.toHaveBeenCalled();
  });

  it('checks now, again when the network returns, and on the interval — until stopped', async () => {
    vi.useFakeTimers();
    setAppliedRemotes(new Map([['tiktok-live', { url: URL }]]));
    const sync = vi.fn().mockResolvedValue(result('current', '1.0.6'));

    const stop = startModuleRemoteUpdateChecks(sync, 1000);
    expect(sync).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('online'));
    expect(sync).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).toHaveBeenCalledTimes(3);

    stop();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(sync).toHaveBeenCalledTimes(3);
  });
});
