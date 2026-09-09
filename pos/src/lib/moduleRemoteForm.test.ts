// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { parseVersionFromUrl, remoteUrlOf, shortUrl, validateRemoteEntryInput } from './moduleRemoteForm';

const base = {
  id: 'loyalty',
  title: 'Бонуси',
  url: 'https://cdn.example.com/loyalty/remote-entry.js',
  routePath: '/loyalty',
  order: '80',
  takenIds: new Set(['returns', 'tiktok-live']),
};

describe('validateRemoteEntryInput', () => {
  it('builds an entry with one cashier nav item, icon on both levels when given', () => {
    const res = validateRemoteEntryInput({ ...base, icon: 'Gift' });
    expect(res).toEqual({
      ok: true,
      id: 'loyalty',
      entry: {
        url: base.url,
        title: 'Бонуси',
        routePath: '/loyalty',
        icon: 'Gift',
        nav: [{ label: 'Бонуси', location: 'cashier-primary', order: 80, match: '/loyalty', icon: 'Gift' }],
      },
    });
  });

  it.each([
    [{ id: 'Loyalty' }, /Ідентифікатор/],
    [{ id: 'returns' }, /вже зайнято/],
    [{ title: '' }, /Назва/],
    [{ url: 'http://evil.com/x.js' }, /Джерело/],
    [{ routePath: 'loyalty' }, /Маршрут/],
    [{ order: '1.5' }, /Порядок/],
    [{ icon: '<img>' }, /Іконка/],
  ])('rejects %o', (over, message) => {
    const res = validateRemoteEntryInput({ ...base, ...over });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(message);
  });
});

describe('url helpers', () => {
  it('reads the pinned version out of a module-release URL', () => {
    expect(
      parseVersionFromUrl(
        'https://cdn.jsdelivr.net/gh/merenkoff/tiktok-live@module-tiktok-live-v1.1.0/tiktok-live/remote-entry.js'
      )
    ).toBe('1.1.0');
    expect(parseVersionFromUrl('http://localhost:5004/remote-entry.js')).toBeNull();
  });

  it('takes the URL from either module_remotes form', () => {
    expect(remoteUrlOf('https://a/b.js')).toBe('https://a/b.js');
    expect(remoteUrlOf({ url: 'https://a/c.js', title: 'x', routePath: '/x', nav: [] })).toBe('https://a/c.js');
  });

  it('shortens long URLs to host + tail and leaves short ones alone', () => {
    expect(shortUrl('https://cdn.jsdelivr.net/gh/merenkoff/tiktok-live@module-tiktok-live-v1.1.0/tiktok-live/remote-entry.js')).toMatch(
      /^cdn\.jsdelivr\.net…/
    );
    expect(shortUrl('/remotes/returns/remote-entry.js')).toBe('/remotes/returns/remote-entry.js');
  });
});
