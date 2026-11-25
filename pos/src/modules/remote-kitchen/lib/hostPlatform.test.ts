// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Whether the till is online, as the remote kitchen's tile words read it. The
// offline store moves only where a runtime keeps it (desktop, tablet); the web
// shell has the browser's word alone — and the store's other updates (pending
// counts after every sale) must not wake anyone.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = { on: false };
const listeners = new Set<() => void>();
const status = { online: true, pending: 0 };

vi.mock('@pos/platform', () => ({
  isOfflineReadsEnabled: () => runtime.on,
  useOfflineStatus: {
    getState: () => status,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  },
}));

const { isOnline, onOnlineChange } = await import('./hostPlatform');

function setStatus(patch: Partial<typeof status>) {
  Object.assign(status, patch);
  listeners.forEach((l) => l());
}

function setBrowser(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

beforeEach(() => {
  runtime.on = false;
  status.online = true;
  status.pending = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('isOnline', () => {
  it('on the web shell (no runtime) follows the browser, not the never-moving store', () => {
    status.online = false; // seeded once at load, never updated there
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(isOnline()).toBe(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isOnline()).toBe(false);
  });

  it('where a runtime keeps the store current, follows the store', () => {
    runtime.on = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    status.online = false;
    expect(isOnline()).toBe(false);
  });
});

describe('onOnlineChange', () => {
  it('wakes the listener on a change only — never for the store’s other updates', () => {
    runtime.on = true;
    const listener = vi.fn();
    const stop = onOnlineChange(listener);
    setStatus({ pending: 3 });
    setStatus({ pending: 4 });
    expect(listener).not.toHaveBeenCalled();
    setStatus({ online: false });
    expect(listener).toHaveBeenCalledTimes(1);
    setStatus({ online: false, pending: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setStatus({ online: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('on the web shell hears the browser’s own online/offline events', () => {
    const listener = vi.fn();
    const stop = onOnlineChange(listener);
    setBrowser(false);
    expect(listener).toHaveBeenCalledTimes(1);
    setBrowser(true);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setBrowser(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
