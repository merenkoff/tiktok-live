// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a till keeps of the kitchen for when it has no network (РК5, §8): per
// store, never another store's, and never older than a week.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const signedIn = { store: 7 as number | null };
vi.mock('./hostPlatform', () => ({ currentStoreId: () => signedIn.store }));

import { SETUP_MEMORY_MAX_AGE_MS, rememberSetup, rememberedSetup } from './setupMemory';

const setupOf = (phone: string) => ({ as_cafe: { link: { status: 'active', kitchen_phone: phone } }, as_kitchen: null });

beforeEach(() => {
  localStorage.clear();
  signedIn.store = 7;
});

describe('the setup a till keeps for offline', () => {
  it('keeps one per store, so a till two stores share remembers each one’s kitchen', () => {
    rememberSetup(setupOf('+380 7'), 7);
    signedIn.store = 8;
    rememberSetup(setupOf('+380 8'), 8);
    expect(rememberedSetup()).toEqual(setupOf('+380 8'));
    signedIn.store = 7;
    expect(rememberedSetup()).toEqual(setupOf('+380 7'));
  });

  it('drops an answer that lands after someone signed into another store', () => {
    // The read was made for store 7; by the time it answers, store 8 is signed in.
    signedIn.store = 8;
    rememberSetup(setupOf('+380 7'), 7);
    expect(rememberedSetup()).toBeNull();
    signedIn.store = 7;
    expect(rememberedSetup()).toBeNull();
  });

  it('forgets a week-old setup, and clears what the tiles used to keep', () => {
    localStorage.setItem('remote-kitchen:tiles:7', '{"link":{}}');
    const then = Date.now();
    rememberSetup(setupOf('+380 7'), 7, then);
    expect(localStorage.getItem('remote-kitchen:tiles:7')).toBeNull();
    expect(rememberedSetup(then + SETUP_MEMORY_MAX_AGE_MS - 1)).toEqual(setupOf('+380 7'));
    expect(rememberedSetup(then + SETUP_MEMORY_MAX_AGE_MS + 1)).toBeNull();
  });
});
