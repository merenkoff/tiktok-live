// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.pin-attempts.test.ts
//
// Wrong PINs at the till (migration 081, `pin-attempts.ts`): four free misses,
// waits of 1/5/15/30/60 minutes after misses 5–9, an hour's block after the
// 10th, and the three ways back — a right PIN, the owner's «Розблокувати»,
// a new PIN. Time is moved by writing `pin_locked_until` into the past.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  PIN_WAIT_MINUTES,
  clearPinMisses,
  lockMinutesAfterMiss,
  pinLockMessage,
  waitWords,
} from '../pos/pin-attempts.js';
import * as authService from '../pos/auth.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe('the schedule', () => {
  it('lets four misses go, then waits 1, 5, 15, 30, 60 minutes, then blocks for an hour', () => {
    expect([1, 2, 3, 4].map(lockMinutesAfterMiss)).toEqual([null, null, null, null]);
    expect([5, 6, 7, 8, 9].map(lockMinutesAfterMiss)).toEqual([...PIN_WAIT_MINUTES]);
    expect(PIN_WAIT_MINUTES).toEqual([1, 5, 15, 30, 60]);
    expect(lockMinutesAfterMiss(10)).toBe(60);
  });

  it('says the wait rounded up, in minutes and hours', () => {
    expect(waitWords(1)).toBe('1 хв');
    expect(waitWords(61_000)).toBe('2 хв');
    expect(waitWords(15 * 60_000)).toBe('15 хв');
    expect(waitWords(60 * 60_000)).toBe('1 год');
    expect(waitWords(65 * 60_000)).toBe('1 год 5 хв');
  });

  it('tells a wait from a block, and names where the owner unblocks', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    const wait = pinLockMessage({ until: new Date(now + 5 * 60_000), blocked: false }, now, true);
    expect(wait).toBe('Невірний PIN або код магазину. Забагато невдалих спроб. Наступна — через 5 хв.');
    const block = pinLockMessage({ until: new Date(now + 3_600_000), blocked: true }, now);
    expect(block).toMatch(/^Вхід за PIN заблоковано на 1 год: 10 невдалих спроб поспіль\./);
    expect(block).toMatch(/«Співробітники»/);
  });
});

describe.skipIf(!hasDb)('POS PIN login attempts (081)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;

  const pin = (code: string, slug = store.slug) =>
    app.inject({ method: 'POST', url: '/api/pos/auth/staff/pin', payload: { store_slug: slug, pin: code } });
  const state = async (storeId = store.storeId) =>
    (
      await pool.query(
        `SELECT pin_failed_count AS misses, pin_locked_until > NOW() AS locked FROM pos_stores WHERE id = $1`,
        [storeId]
      )
    ).rows[0] as { misses: number; locked: boolean | null };
  /** The wait (or block) runs out. */
  const elapse = () =>
    pool.query(`UPDATE pos_stores SET pin_locked_until = NOW() - INTERVAL '1 second' WHERE id = $1`, [store.storeId]);
  const setMisses = (n: number) =>
    pool.query(`UPDATE pos_stores SET pin_failed_count = $2, pin_locked_until = NULL WHERE id = $1`, [store.storeId, n]);
  const lockStatus = (token = store.ownerToken) =>
    app.inject({ method: 'GET', url: '/api/pos/staff/pin-lock', headers: auth(token) });

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('pinlock');
    other = await createTestStore('pinlock2');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  beforeEach(async () => {
    await clearPinMisses(store.storeId);
    await clearPinMisses(other.storeId);
  });

  it('answers misses 1–4 exactly like an unknown store, and counts them', async () => {
    const unknown = await pin('9999', 'no-such-store-pinlock');
    for (let i = 1; i <= 4; i += 1) {
      const res = await pin('9999');
      expect(res.statusCode).toBe(401);
      expect(res.body).toBe(unknown.body);
    }
    expect(await state()).toMatchObject({ misses: 4 });
  });

  it('closes PIN login after the 5th miss, and the right PIN waits too', async () => {
    await setMisses(4);
    const fifth = await pin('9999');
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json()).toMatchObject({ blocked: false, retry_after_s: expect.any(Number) });
    expect(fifth.json().retry_after_s).toBeGreaterThan(55);
    expect(fifth.json().retry_after_s).toBeLessThanOrEqual(60);
    expect(fifth.headers['retry-after']).toBe(String(fifth.json().retry_after_s));
    expect(fifth.json().error).toBe('Невірний PIN або код магазину. Забагато невдалих спроб. Наступна — через 1 хв.');

    const right = await pin(store.sellerPin);
    expect(right.statusCode).toBe(429);
    expect(right.json().error).toBe('Забагато невдалих спроб. Наступна — через 1 хв.');
    expect(await state()).toMatchObject({ misses: 5, locked: true });
  });

  it('waits longer each time, then blocks for an hour on the 10th miss', async () => {
    await setMisses(4);
    const waits: string[] = [];
    for (let miss = 5; miss <= 9; miss += 1) {
      const res = await pin('9999');
      expect(res.statusCode).toBe(429);
      waits.push(res.json().error.replace(/^.*через /, ''));
      await elapse();
    }
    expect(waits).toEqual(['1 хв.', '5 хв.', '15 хв.', '30 хв.', '1 год.']);

    const tenth = await pin('9999');
    expect(tenth.statusCode).toBe(423);
    expect(tenth.json().blocked).toBe(true);
    expect(tenth.json().error).toMatch(/^Невірний PIN або код магазину\. Вхід за PIN заблоковано на 1 год/);

    const blocked = await pin(store.sellerPin);
    expect(blocked.statusCode).toBe(423);
    expect(blocked.json().error).toMatch(/^Вхід за PIN заблоковано на 1 год/);

    const status = await lockStatus();
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ misses: 10, blocked: true, locked_until: expect.any(String) });
  });

  it('lifts the block by itself after the hour, and the count starts again', async () => {
    await setMisses(9);
    expect((await pin('9999')).statusCode).toBe(423);
    await elapse();
    expect((await lockStatus()).json()).toEqual({ misses: 0, locked_until: null, blocked: false });
    expect((await pin('9999')).statusCode).toBe(401);
    expect(await state()).toMatchObject({ misses: 1 });
    expect((await pin(store.sellerPin)).statusCode).toBe(200);
  });

  it('starts from zero after a right PIN', async () => {
    await setMisses(4);
    expect((await pin(store.sellerPin)).statusCode).toBe(200);
    expect(await state()).toMatchObject({ misses: 0, locked: null });
    for (let i = 0; i < 4; i += 1) expect((await pin('9999')).statusCode).toBe(401);
  });

  it('lets the owner unblock, and only the owner', async () => {
    await setMisses(9);
    expect((await pin('9999')).statusCode).toBe(423);

    expect((await lockStatus(store.sellerToken)).statusCode).toBe(403);
    const asSeller = await app.inject({
      method: 'POST',
      url: '/api/pos/staff/pin-lock/reset',
      headers: auth(store.sellerToken),
    });
    expect(asSeller.statusCode).toBe(403);

    const reset = await app.inject({
      method: 'POST',
      url: '/api/pos/staff/pin-lock/reset',
      headers: auth(store.ownerToken),
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ misses: 0, locked_until: null, blocked: false });
    expect((await pin(store.sellerPin)).statusCode).toBe(200);
  });

  it('reopens PIN login when the owner sets a new PIN for anyone', async () => {
    await setMisses(9);
    expect((await pin('9999')).statusCode).toBe(423);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/staff/${store.sellerId}/pin`,
      headers: auth(store.ownerToken),
      payload: { pin: '2468' },
    });
    expect(res.statusCode).toBe(200);
    expect((await pin('2468')).statusCode).toBe(200);
    await authService.setStaffPin(store.storeId, store.sellerId, store.sellerPin);
  });

  it('lets one of a burst through when the 5th miss is due, and closes the rest', async () => {
    await setMisses(4);
    const burst = await Promise.all(Array.from({ length: 6 }, () => pin('9999')));
    expect(burst.every((res) => res.statusCode === 429)).toBe(true);
    // Exactly one was compared and counted; the others met the lock it left.
    expect(burst.filter((res) => /^Невірний PIN/.test(res.json().error))).toHaveLength(1);
    expect(await state()).toMatchObject({ misses: 5, locked: true });
  });

  it('counts nothing for an unknown store or a PIN that is not 4–6 digits, and never another store', async () => {
    await setMisses(4);
    expect((await pin('12')).statusCode).toBe(401);
    expect((await pin('abcd')).statusCode).toBe(401);
    expect(await state()).toMatchObject({ misses: 4 });
    expect((await pin('9999', 'no-such-store-pinlock')).statusCode).toBe(401);

    for (let i = 0; i < 5; i += 1) await pin('9999', other.slug);
    expect(await state(other.storeId)).toMatchObject({ misses: 5, locked: true });
    expect(await state()).toMatchObject({ misses: 4 });
    expect((await pin(store.sellerPin)).statusCode).toBe(200);
  });

  it('keeps the owner’s password login open while PIN login is blocked', async () => {
    await setMisses(9);
    expect((await pin('9999')).statusCode).toBe(423);
    const owner = await app.inject({
      method: 'POST',
      url: '/api/pos/auth/owner/login',
      payload: { login: store.ownerLogin, password: store.ownerPassword, store_slug: store.slug },
    });
    expect(owner.statusCode).toBe(200);
  });

  it('throws from loginWithPin while closed, so no caller mistakes a lock for a wrong PIN', async () => {
    await setMisses(9);
    expect(await authService.loginWithPin(store.slug, '9999')).toBeNull();
    await expect(authService.loginWithPin(store.slug, store.sellerPin)).rejects.toBeInstanceOf(
      authService.PinLoginLocked
    );
  });
});
