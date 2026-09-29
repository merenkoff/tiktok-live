// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the floor plan makes of the owner's guest-menu settings: a link when
// there is a published menu, one sentence when it is switched off, and
// silence for everything else — never an error on a screen that is about tables.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { loadPublicMenu, tableQrUrl, tablesSheetUrl } = await import('./publicMenu');

// Braces on purpose: an arrow that RETURNS the mock is read by vitest as a
// teardown function and called after the test — which rejected, unhandled.
beforeEach(() => {
  posRequest.mockReset();
});

describe('loadPublicMenu', () => {
  it('reads the owner’s endpoint through the host client', async () => {
    posRequest.mockResolvedValue({ available: true, enabled: false, url: null });
    await loadPublicMenu();
    expect(posRequest).toHaveBeenCalledWith('get', '/store/public-menu', undefined);
  });

  it('is «on» with the address of a published menu, minus a trailing slash', async () => {
    posRequest.mockResolvedValue({ available: true, enabled: true, url: 'https://the-live.shop/m/tok_ABC/' });
    expect(await loadPublicMenu()).toEqual({ kind: 'on', url: 'https://the-live.shop/m/tok_ABC' });
  });

  it('is «off» when the menu exists but is switched off — the one case worth a sentence', async () => {
    posRequest.mockResolvedValue({ available: true, enabled: false, url: 'https://the-live.shop/m/tok_ABC' });
    expect(await loadPublicMenu()).toEqual({ kind: 'off' });
  });

  it('is «none» for a store with no kitchen, so the plan says nothing about a feature the shop cannot have', async () => {
    posRequest.mockResolvedValue({ available: false, enabled: false, token: null, url: null });
    expect(await loadPublicMenu()).toEqual({ kind: 'none' });
  });

  it.each([
    ['a seller (403)', () => ({ response: { status: 403 } })],
    ['a backend older than the guest menu (404)', () => ({ response: { status: 404 } })],
    ['a network failure', () => new Error('network')],
  ])('is «none» for %s', async (_name, failure) => {
    posRequest.mockImplementation(() => Promise.reject(failure()));
    expect(await loadPublicMenu()).toEqual({ kind: 'none' });
  });

  it('never links to anything that is not a web address', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/m/x', '/m/relative', 42, null]) {
      posRequest.mockReset();
      posRequest.mockResolvedValue({ available: true, enabled: true, url });
      expect(await loadPublicMenu()).toEqual({ kind: 'off' });
    }
  });

  it('survives an answer that is not an object', async () => {
    posRequest.mockResolvedValue(null);
    expect(await loadPublicMenu()).toEqual({ kind: 'none' });
  });
});

describe('the addresses the server draws', () => {
  it('names one table by its id, not its name (the owner can rename a table)', () => {
    expect(tableQrUrl('https://the-live.shop/m/tok_ABC', 42)).toBe('https://the-live.shop/m/tok_ABC/qr?t=42');
  });

  it('names the sheet of every table', () => {
    expect(tablesSheetUrl('https://the-live.shop/m/tok_ABC')).toBe('https://the-live.shop/m/tok_ABC/tables');
  });
});
