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
