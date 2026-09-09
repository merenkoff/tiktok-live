// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Same pattern as `tiktok-live/lib/hostPlatform.test.ts` — synthetic hosts of
// different ages, loaded against a mocked `@pos/platform`. This module's
// contract is smaller: exactly one required symbol, `api.posRequest`, added
// alongside this module's own release.

import { afterEach, describe, expect, it, vi } from 'vitest';

type Shim = typeof import('./hostPlatform');

async function loadShim(platform: Record<string, unknown>): Promise<Shim> {
  vi.resetModules();
  vi.doMock('@pos/platform', () => platform);
  return import('./hostPlatform');
}

const MODERN_HOST = {
  apiOrigin: () => 'https://the-live.shop',
  api: { posRequest: vi.fn().mockResolvedValue({ ok: true }) },
  usePosShell: () => 'cashier' as const,
  POS_APP_VERSION: '1.1.0',
};

/** A shell built before `posRequest` shipped — i.e. before this module could exist. */
const OLD_HOST = {
  apiOrigin: () => 'https://the-live.shop',
  api: {},
  usePosShell: () => 'web' as const,
  POS_APP_VERSION: '1.0.9',
};

afterEach(() => {
  vi.doUnmock('@pos/platform');
  vi.resetModules();
});

describe('hostPlatform on a current host', () => {
  it('reports nothing missing and passes calls through', async () => {
    const shim = await loadShim(MODERN_HOST);
    expect(shim.missingHostApi()).toEqual([]);
    expect(shim.hostVersion()).toBe('1.1.0');
    expect(shim.apiOrigin()).toBe('https://the-live.shop');

    await expect(shim.posRequest('get', '/fiscal/status')).resolves.toEqual({ ok: true });
    expect(MODERN_HOST.api.posRequest).toHaveBeenCalledWith('get', '/fiscal/status', undefined);
  });

  it('forwards the body on write calls', async () => {
    const shim = await loadShim(MODERN_HOST);
    await shim.posRequest('post', '/fiscal/service', { amount_cents: 100 });
    expect(MODERN_HOST.api.posRequest).toHaveBeenCalledWith('post', '/fiscal/service', {
      amount_cents: 100,
    });
  });
});

describe('hostPlatform on a shell older than posRequest', () => {
  it('still loads — the whole reason for the namespace import', async () => {
    // With named imports this line is where the chunk would die with a
    // SyntaxError, before any of the graceful handling below could run.
    await expect(loadShim(OLD_HOST)).resolves.toBeDefined();
  });

  it('names exactly what the host is missing', async () => {
    const shim = await loadShim(OLD_HOST);
    expect(shim.missingHostApi()).toEqual(['api.posRequest']);
  });

  it('reports the host version, which is what makes the support code useful', async () => {
    const shim = await loadShim(OLD_HOST);
    expect(shim.hostVersion()).toBe('1.0.9');
  });

  it('rejects with HostTooOldError rather than throwing a raw TypeError', async () => {
    const shim = await loadShim(OLD_HOST);
    await expect(shim.posRequest('get', '/fiscal/status')).rejects.toBeInstanceOf(
      shim.HostTooOldError
    );
    await shim.posRequest('get', '/fiscal/status').catch((error: unknown) => {
      expect((error as InstanceType<Shim['HostTooOldError']>).missing).toEqual(['api.posRequest']);
    });
  });

  it('degrades usePosShell to the web shell rather than crashing the render', async () => {
    const shim = await loadShim({ ...OLD_HOST, usePosShell: undefined });
    expect(shim.usePosShell()).toBe('web');
  });

  it('degrades apiOrigin to an empty string — diagnostics only, never load-bearing', async () => {
    const shim = await loadShim({ ...OLD_HOST, apiOrigin: undefined });
    expect(shim.apiOrigin()).toBe('');
    // Missing `apiOrigin` on a host old enough to also lack posRequest is not
    // reported separately — it was never part of this module's REQUIRED set.
    expect(shim.missingHostApi()).toEqual(['api.posRequest']);
  });

  it('reports an unknown host version when the host predates version stamping', async () => {
    const shim = await loadShim({ ...OLD_HOST, POS_APP_VERSION: undefined });
    expect(shim.hostVersion()).toBe('unknown');
  });
});
