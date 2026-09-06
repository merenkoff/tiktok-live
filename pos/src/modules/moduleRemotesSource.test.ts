// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveModuleRemotes } from './moduleRemotesSource';

const KNOWN = new Set(['stock', 'products', 'returns']);

function setCachedAuth(moduleRemotes: unknown) {
  localStorage.setItem('pos_auth', JSON.stringify({ store: { module_remotes: moduleRemotes } }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('resolveModuleRemotes', () => {
  it('parses VITE_MODULE_REMOTES and lets it win over the cached auth', () => {
    vi.stubEnv('VITE_MODULE_REMOTES', 'stock@http://localhost:5002/remote-entry.js');
    setCachedAuth({ products: 'https://cdn/p.js' });

    const out = resolveModuleRemotes(KNOWN);
    expect([...out]).toEqual([['stock', { url: 'http://localhost:5002/remote-entry.js' }]]);
  });

  it('falls back to store.module_remotes from the cached auth when no env', () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    setCachedAuth({ stock: 'https://cdn/stock.js', products: '/remotes/p.js' });

    const out = resolveModuleRemotes(KNOWN);
    expect(out.get('stock')).toEqual({ url: 'https://cdn/stock.js' });
    expect(out.get('products')).toEqual({ url: '/remotes/p.js' });
  });

  it('drops unknown ids and disallowed URLs from either source', () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    setCachedAuth({
      stock: 'http://evil.com/x.js',
      nope: 'https://cdn/x.js',
      returns: 'https://cdn/returns.js',
    });

    expect([...resolveModuleRemotes(KNOWN)]).toEqual([
      ['returns', { url: 'https://cdn/returns.js' }],
    ]);
  });

  it('parses an object entry (online-only module) with its presentation, id not in KNOWN', () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    const entry = {
      url: 'https://cdn/loyalty/remote-entry.js',
      title: 'Бонуси',
      routePath: '/loyalty',
      nav: [{ label: 'Бонуси', location: 'cashier-primary', order: 80, match: '/loyalty' }],
      icon: 'Gift',
    };
    setCachedAuth({ loyalty: entry });

    const out = resolveModuleRemotes(KNOWN);
    expect(out.get('loyalty')).toEqual({
      url: 'https://cdn/loyalty/remote-entry.js',
      presentation: {
        title: 'Бонуси',
        routePath: '/loyalty',
        nav: [{ label: 'Бонуси', location: 'cashier-primary', order: 80, match: '/loyalty' }],
        icon: 'Gift',
      },
    });
  });

  it('drops a malformed object entry (bad routePath / nav / url)', () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    const ok = {
      url: 'https://cdn/x/remote-entry.js',
      title: 'X',
      routePath: '/x',
      nav: [{ label: 'X', location: 'cashier-primary', order: 1 }],
    };
    setCachedAuth({
      a: { ...ok, routePath: 'x' },
      b: { ...ok, nav: [] },
      c: { ...ok, url: 'http://evil.com/x.js' },
      d: { ...ok, nav: [{ label: 'X', location: 'nope', order: 1 }] },
    });
    expect(resolveModuleRemotes(KNOWN).size).toBe(0);
  });

  it('returns an empty map for missing / malformed cached auth', () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    expect(resolveModuleRemotes(KNOWN).size).toBe(0);

    localStorage.setItem('pos_auth', '{not json');
    expect(resolveModuleRemotes(KNOWN).size).toBe(0);

    setCachedAuth(['stock@https://x']);
    expect(resolveModuleRemotes(KNOWN).size).toBe(0);
  });
});
