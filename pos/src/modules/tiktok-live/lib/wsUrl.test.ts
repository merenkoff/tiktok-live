// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';

const apiOrigin = vi.fn<[], string>();

// The full host surface `hostPlatform.ts` probes — vitest's mock proxy throws
// on any name the factory omits, unlike a real ES module namespace.
vi.mock('@pos/platform', () => ({
  apiOrigin: () => apiOrigin(),
  api: { liveSessionToken: vi.fn() },
  usePosShell: () => 'web',
  POS_APP_VERSION: '1.0.6',
}));

const { liveWsUrl } = await import('./wsUrl');

describe('liveWsUrl', () => {
  it('derives ws:// from a plain-http API base (local dev)', () => {
    apiOrigin.mockReturnValue('http://localhost:3000');
    expect(liveWsUrl('abc')).toBe('ws://localhost:3000/api/sessions/logs/stream?token=abc');
  });

  it('derives wss:// from an https API base (desktop cashier, prod)', () => {
    apiOrigin.mockReturnValue('https://the-live.shop');
    expect(liveWsUrl('abc')).toBe('wss://the-live.shop/api/sessions/logs/stream?token=abc');
  });

  it('falls back to the page origin when the API is same-origin', () => {
    apiOrigin.mockReturnValue('');
    // jsdom serves the tests from http://localhost:3000 by default.
    expect(liveWsUrl('abc')).toBe(
      `ws://${window.location.host}/api/sessions/logs/stream?token=abc`
    );
  });

  it('escapes the token rather than splicing it into the query raw', () => {
    apiOrigin.mockReturnValue('https://the-live.shop');
    expect(liveWsUrl('a b&c=d')).toContain('?token=a%20b%26c%3Dd');
  });
});
