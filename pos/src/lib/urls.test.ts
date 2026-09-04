// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { apiOrigin, assetUrl, posApiBase } from './urls';

describe('apiOrigin / posApiBase', () => {
  it('falls back to a same-origin relative base', () => {
    vi.stubEnv('VITE_API_BASE', '');
    expect(apiOrigin()).toBe('');
    expect(posApiBase()).toBe('/api/pos');
  });

  it('uses the configured origin for a cross-domain deploy', () => {
    vi.stubEnv('VITE_API_BASE', 'https://the-live.shop');
    expect(apiOrigin()).toBe('https://the-live.shop');
    expect(posApiBase()).toBe('https://the-live.shop/api/pos');
  });

  it('strips a trailing slash so paths never double up', () => {
    vi.stubEnv('VITE_API_BASE', 'https://the-live.shop/');
    expect(posApiBase()).toBe('https://the-live.shop/api/pos');
  });
});

describe('assetUrl', () => {
  it('returns null for a missing path', () => {
    vi.stubEnv('VITE_API_BASE', 'https://the-live.shop');
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl(undefined)).toBeNull();
    expect(assetUrl('')).toBeNull();
  });

  it('leaves already-resolvable URLs alone', () => {
    vi.stubEnv('VITE_API_BASE', 'https://the-live.shop');
    expect(assetUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
    expect(assetUrl('blob:abc')).toBe('blob:abc');
    expect(assetUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('resolves an upload path against the API host', () => {
    vi.stubEnv('VITE_API_BASE', 'https://the-live.shop');
    expect(assetUrl('/pos-uploads/1.jpg')).toBe('https://the-live.shop/pos-uploads/1.jpg');
    expect(assetUrl('pos-uploads/1.jpg')).toBe('https://the-live.shop/pos-uploads/1.jpg');
  });

  it('keeps the path relative when POS is served from the API origin', () => {
    vi.stubEnv('VITE_API_BASE', '');
    expect(assetUrl('pos-uploads/1.jpg')).toBe('/pos-uploads/1.jpg');
  });
});
