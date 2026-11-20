// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The whole road a desktop till walks on a morning without a network: it
// logged in online yesterday, the cashier logged out at closing (which wipes
// `pos_auth`), and today the PIN is checked locally. The session that comes
// back must be the same shop — above all it must round cash the way the
// server will file the sale (НБУ № 25), or the receipt and the ledger differ.

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { makeAuthResponse } from '../test/utils';
import { posApiBase } from '../lib/urls';
import { storeCashRounding } from '../lib/cashRounding';

vi.mock('../offline/enabled', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offline/enabled')>()),
  isOfflineReadsEnabled: () => true,
}));

// The login also starts a snapshot and a sync pass in the background; neither
// is what this file is about, and both would only reach for the network.
vi.mock('../offline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offline')>()),
  refreshSnapshot: vi.fn().mockResolvedValue(undefined),
  runSync: vi.fn().mockResolvedValue(undefined),
  cacheQrImage: vi.fn().mockResolvedValue(undefined),
}));

const url = (path: string) => `${posApiBase()}${path}`;

describe('useAuth — PIN login without a network after a logout', () => {
  afterEach(() => vi.resetModules());

  it('comes back as the same shop: cash is still rounded to 50 kopecks', async () => {
    server.use(
      http.post(url('/auth/staff/pin'), () =>
        HttpResponse.json(
          makeAuthResponse({
            staff: { id: 2, display_name: 'Ігор', role: 'seller' },
            store: {
              slug: 'demo-grocery',
              cash_rounding: 50,
              age_check: true,
              feedback_url: 'https://the-live.shop/m/demo-grocery#feedback',
            },
          })
        )
      )
    );
    vi.resetModules();
    const { useAuthStore } = await import('./useAuth');

    await useAuthStore.getState().loginPin('demo-grocery', '1234');
    expect(useAuthStore.getState().auth?.store.cash_rounding).toBe(50);

    await useAuthStore.getState().logout();
    expect(localStorage.getItem('pos_auth')).toBeNull();

    // The next morning the router is down.
    server.use(http.post(url('/auth/staff/pin'), () => HttpResponse.error()));
    await useAuthStore.getState().loginPin('demo-grocery', '1234');

    const auth = useAuthStore.getState().auth;
    expect(auth?.offlineSession).toBe(true);
    expect(storeCashRounding(auth?.store.cash_rounding)).toBe(50);
    expect(auth?.store.age_check).toBe(true);
    expect(auth?.store.feedback_url).toBe('https://the-live.shop/m/demo-grocery#feedback');
    // What every payment screen reads after a reload of the window.
    const cached = JSON.parse(localStorage.getItem('pos_auth') ?? '{}');
    expect(cached.store.cash_rounding).toBe(50);
  });
});
