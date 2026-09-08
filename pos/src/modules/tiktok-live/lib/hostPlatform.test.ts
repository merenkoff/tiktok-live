// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The point of `hostPlatform.ts` is surviving a host older than this module, so
// these tests load it against synthetic hosts of different ages.
//
// Note on fidelity: a real ES module namespace links regardless of which names
// the exporting module provides, and a missing one reads back as `undefined`
// (verified against node's ESM loader). Vitest's mock proxy is stricter — it
// throws on a name the factory never mentioned — so the "old host" factories
// below list the missing symbols explicitly as `undefined`. That is the same
// value the runtime produces; only the way of getting there differs.

import { afterEach, describe, expect, it, vi } from 'vitest';

type Shim = typeof import('./hostPlatform');

async function loadShim(platform: Record<string, unknown>): Promise<Shim> {
  vi.resetModules();
  vi.doMock('@pos/platform', () => platform);
  return import('./hostPlatform');
}

const MODERN_HOST = {
  apiOrigin: () => 'https://the-live.shop',
  api: { liveSessionToken: vi.fn().mockResolvedValue({ token: 't' }) },
  usePosShell: () => 'cashier' as const,
  POS_APP_VERSION: '1.0.6',
};

/** Ships `assetUrl`/`usePosShell` but predates the bridge — i.e. before this module landed. */
const OLD_HOST = {
  apiOrigin: undefined,
  api: {},
  usePosShell: () => 'web' as const,
  POS_APP_VERSION: '1.0.4',
};

afterEach(() => {
  vi.doUnmock('@pos/platform');
  vi.resetModules();
});

describe('hostPlatform on a current host', () => {
  it('reports nothing missing and passes calls through', async () => {
    const shim = await loadShim(MODERN_HOST);
    expect(shim.missingHostApi()).toEqual([]);
    expect(shim.apiOrigin()).toBe('https://the-live.shop');
    expect(shim.hostVersion()).toBe('1.0.6');

    await expect(shim.liveSessionToken()).resolves.toEqual({ token: 't' });
    expect(MODERN_HOST.api.liveSessionToken).toHaveBeenCalledTimes(1);
  });
});

describe('hostPlatform on a shell older than this module', () => {
  it('still loads — the whole reason for the namespace import', async () => {
    // With named imports this line is where the chunk would die with a
    // SyntaxError, before any of the graceful handling below could run.
    await expect(loadShim(OLD_HOST)).resolves.toBeDefined();
  });

  it('names exactly what the host is missing', async () => {
    const shim = await loadShim(OLD_HOST);
    expect(shim.missingHostApi()).toEqual(['apiOrigin', 'api.liveSessionToken']);
  });

  it('reports the host version, which is what makes the support code useful', async () => {
    const shim = await loadShim(OLD_HOST);
    expect(shim.hostVersion()).toBe('1.0.4');
  });

  it('falls back to a same-origin API base instead of throwing', async () => {
    const shim = await loadShim(OLD_HOST);
    expect(shim.apiOrigin()).toBe('');
  });

  it('rejects the bridge call with HostTooOldError carrying the missing list', async () => {
    const shim = await loadShim(OLD_HOST);
    await expect(shim.liveSessionToken()).rejects.toBeInstanceOf(shim.HostTooOldError);
    await shim.liveSessionToken().catch((error: unknown) => {
      expect((error as InstanceType<Shim['HostTooOldError']>).missing).toEqual([
        'apiOrigin',
        'api.liveSessionToken',
      ]);
    });
  });

  it('degrades usePosShell to the web shell rather than crashing the render', async () => {
    const shim = await loadShim({ ...OLD_HOST, usePosShell: undefined });
    expect(shim.missingHostApi()).toContain('usePosShell');
    expect(shim.usePosShell()).toBe('web');
  });

  it('reports an unknown host version when the host predates version stamping', async () => {
    const shim = await loadShim({ ...OLD_HOST, POS_APP_VERSION: undefined });
    expect(shim.hostVersion()).toBe('unknown');
  });
});

// ── The settings capability is OPTIONAL ────────────────────────────────────
// It backs the admin surface only. Requiring it would cost the till's broadcast
// screen one more shell version it can no longer run on, for a screen that
// shell's cashier cannot reach anyway.

describe('optional settings capability', () => {
  // Built per test: the global `afterEach` runs `vi.restoreAllMocks()`, which
  // strips the implementation off a `vi.fn()` shared at describe scope.
  const settingsHost = () => ({
    ...MODERN_HOST,
    api: {
      liveSessionToken: vi.fn().mockResolvedValue({ token: 't' }),
      liveSettings: vi.fn().mockResolvedValue({ user_id: 1 }),
      updateLiveSettings: vi.fn().mockResolvedValue({ user_id: 1 }),
      testLiveTelegram: vi.fn().mockResolvedValue({ ok: true, username: 'bot' }),
    },
  });

  it('stays out of the required contract', async () => {
    const shim = await loadShim(settingsHost());
    // Widening this is the thing to think twice about — see the file header.
    expect(shim.REQUIRED_HOST_API).toHaveLength(3);
    expect(shim.REQUIRED_HOST_API).not.toContain('api.liveSettings');
  });

  it('is reported present on a host that ships it', async () => {
    const shim = await loadShim(settingsHost());
    expect(shim.hasSettingsApi()).toBe(true);
    expect(shim.missingSettingsApi()).toEqual([]);
    await expect(shim.liveSettings()).resolves.toEqual({ user_id: 1 });
  });

  it('is reported absent on a host that predates it, without breaking the desk', async () => {
    const shim = await loadShim(MODERN_HOST);
    expect(shim.hasSettingsApi()).toBe(false);
    expect(shim.missingSettingsApi()).toEqual([
      'api.liveSettings',
      'api.updateLiveSettings',
      'api.testLiveTelegram',
    ]);
    // The broadcast screen's own contract is untouched.
    expect(shim.missingHostApi()).toEqual([]);
  });

  it('rejects rather than throwing synchronously when the host lacks it', async () => {
    const shim = await loadShim(MODERN_HOST);
    await expect(shim.liveSettings()).rejects.toBeInstanceOf(shim.HostTooOldError);
    await expect(shim.updateLiveSettings({})).rejects.toBeInstanceOf(shim.HostTooOldError);
    await expect(shim.testLiveTelegram()).rejects.toBeInstanceOf(shim.HostTooOldError);
  });

  it('treats a partially-updated host as unsupported', async () => {
    const shim = await loadShim({
      ...MODERN_HOST,
      api: { liveSessionToken: vi.fn(), liveSettings: vi.fn() },
    });
    expect(shim.hasSettingsApi()).toBe(false);
    expect(shim.missingSettingsApi()).toEqual(['api.updateLiveSettings', 'api.testLiveTelegram']);
  });
});
