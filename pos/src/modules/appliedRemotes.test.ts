// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it } from 'vitest';
import { getAppliedRemotes, sameRemoteMap, setAppliedRemotes } from './appliedRemotes';

afterEach(() => setAppliedRemotes(new Map()));

describe('appliedRemotes', () => {
  it('stores and returns the applied set', () => {
    const map = new Map([['stock', { url: 'https://x/stock.js' }]]);
    setAppliedRemotes(map);
    expect(getAppliedRemotes()).toBe(map);
  });

  it('sameRemoteMap matches an equal {id:url} object against the applied set', () => {
    setAppliedRemotes(new Map([['stock', { url: 'https://x/stock.js' }]]));
    expect(sameRemoteMap({ stock: 'https://x/stock.js' })).toBe(true);
    expect(sameRemoteMap({ stock: 'https://x/OTHER.js' })).toBe(false);
    expect(sameRemoteMap({})).toBe(false);
    expect(sameRemoteMap({ stock: 'https://x/stock.js', products: 'https://x/p.js' })).toBe(false);
  });

  it('treats undefined / empty as "no remotes"', () => {
    setAppliedRemotes(new Map());
    expect(sameRemoteMap(undefined)).toBe(true);
    expect(sameRemoteMap({})).toBe(true);
  });
});
