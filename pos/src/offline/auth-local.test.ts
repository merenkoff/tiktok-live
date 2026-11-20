// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A till that logs in WITHOUT a network rebuilds its whole session from the
// `staffUnlock` row and nothing else: a logout has already wiped `pos_auth`,
// so there is no cached server answer to fall back on. Whatever the store set
// that the row does not carry is simply gone for that session — which is how a
// shop that rounds cash to 50 kopecks sold unrounded after an offline login.
//
// These pin the row against the store block of `AuthResponse`: every setting
// the sell screen and the receipt read must survive the round trip.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAuthResponse } from '../test/utils';
import { storeCashRounding } from '../lib/cashRounding';
import {
  localOwnerLogin,
  localPinLogin,
  saveStaffUnlock,
  updateStaffUnlockStoreFlags,
} from './auth-local';
import { db, type StaffUnlockRow } from './db';

/** A grocery that rounds cash to 50 kopecks and uses everything the login carries. */
function groceryAuth(store: Parameters<typeof makeAuthResponse>[0] = {}) {
  return makeAuthResponse({
    staff: { id: 2, display_name: 'Ігор', role: 'seller' },
    ...store,
    store: {
      slug: 'demo-grocery',
      cash_rounding: 50,
      age_check: true,
      feedback_url: 'https://the-live.shop/m/demo-grocery#feedback',
      florist_labour_bps: 1500,
      bottles: true,
      ...store.store,
    },
  });
}

describe('local login — the store settings a session is rebuilt from', () => {
  beforeEach(async () => {
    await db.staffUnlock.clear();
  });

  it('rounds cash after a PIN login without a network', async () => {
    await saveStaffUnlock({ auth: groceryAuth(), secret: '1234', kind: 'pin' });

    // `null`: the till was logged out, so no cached server answer is left.
    const session = await localPinLogin('demo-grocery', '1234', null);

    expect(session.offlineSession).toBe(true);
    expect(session.store.cash_rounding).toBe(50);
    // What the payment screen actually computes with.
    expect(storeCashRounding(session.store.cash_rounding)).toBe(50);
  });

  it('rounds cash after the owner logs in by password without a network', async () => {
    await saveStaffUnlock({
      auth: groceryAuth({ staff: { id: 1, display_name: 'Олена', role: 'owner' } }),
      secret: 'owner123',
      kind: 'password',
      loginHint: 'owner@grocery.shop',
    });

    const session = await localOwnerLogin('owner@grocery.shop', 'owner123', null, 'demo-grocery');

    expect(session.store.cash_rounding).toBe(50);
  });

  it('keeps the other settings the sell screen and the receipt read', async () => {
    await saveStaffUnlock({ auth: groceryAuth(), secret: '1234', kind: 'pin' });

    const { store } = await localPinLogin('demo-grocery', '1234', null);

    expect(store.age_check).toBe(true);
    expect(store.feedback_url).toBe('https://the-live.shop/m/demo-grocery#feedback');
    expect(store.florist_labour_bps).toBe(1500);
    expect(store.bottles).toBe(true);
  });

  it('refreshes them from `/me` without a new login', async () => {
    await saveStaffUnlock({
      auth: groceryAuth({ store: { cash_rounding: 0, age_check: false, feedback_url: null, bottles: false } }),
      secret: '1234',
      kind: 'pin',
    });

    // The owner switched rounding on at noon; the till only asked `/me`.
    await updateStaffUnlockStoreFlags(groceryAuth({ store: { cash_rounding: 10 } }));

    const { store } = await localPinLogin('demo-grocery', '1234', null);
    expect(store.cash_rounding).toBe(10);
    expect(store.age_check).toBe(true);
    expect(store.feedback_url).toBe('https://the-live.shop/m/demo-grocery#feedback');
    expect(store.bottles).toBe(true);
  });

  it('a switch the owner turned off is off after the next `/me`', async () => {
    await saveStaffUnlock({ auth: groceryAuth(), secret: '1234', kind: 'pin' });

    await updateStaffUnlockStoreFlags(
      groceryAuth({
        store: { cash_rounding: 0, age_check: false, feedback_url: null, florist_labour_bps: 0, bottles: false },
      })
    );

    const { store } = await localPinLogin('demo-grocery', '1234', null);
    expect(store.cash_rounding).toBe(0);
    expect(store.age_check).toBe(false);
    expect(store.feedback_url).toBeNull();
    expect(store.florist_labour_bps).toBe(0);
    expect(store.bottles).toBe(false);
  });

  it('an answer from an older backend leaves what the row already knows', async () => {
    await saveStaffUnlock({ auth: groceryAuth(), secret: '1234', kind: 'pin' });

    // No `cash_rounding`, `age_check`, … at all — not «off», just not said.
    await updateStaffUnlockStoreFlags(
      makeAuthResponse({ staff: { id: 2, display_name: 'Ігор', role: 'seller' }, store: { slug: 'demo-grocery' } })
    );

    const { store } = await localPinLogin('demo-grocery', '1234', null);
    expect(store.cash_rounding).toBe(50);
    expect(store.age_check).toBe(true);
    expect(store.bottles).toBe(true);
  });

  it('a row written by an older build behaves as it always did', async () => {
    await saveStaffUnlock({ auth: groceryAuth(), secret: '1234', kind: 'pin' });
    // What a build before this one stored: the same row without the new fields.
    const row = (await db.staffUnlock.toArray())[0];
    const { cashRounding, ageCheck, feedbackUrl, floristLabourBps, bottles, ...old } = row;
    void [cashRounding, ageCheck, feedbackUrl, floristLabourBps, bottles];
    await db.staffUnlock.put(old as StaffUnlockRow);

    const { store } = await localPinLogin('demo-grocery', '1234', null);

    expect(storeCashRounding(store.cash_rounding)).toBe(0);
    expect(store.age_check === true).toBe(false);
    expect(store.feedback_url ?? null).toBeNull();
    expect(store.florist_labour_bps ?? 0).toBe(0);
    expect(store.bottles === true).toBe(false);
  });

  it('a live cached session still wins over the row', async () => {
    await saveStaffUnlock({ auth: groceryAuth(), secret: '1234', kind: 'pin' });
    const live = groceryAuth({ token: 'jwt', store: { cash_rounding: 10 } });

    const session = await localPinLogin('demo-grocery', '1234', live);

    expect(session.offlineSession).toBe(false);
    expect(session.store.cash_rounding).toBe(10);
  });
});
