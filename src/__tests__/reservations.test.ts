// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/reservations.test.ts
//
// Reservations for the multi-tenant LIVE automation. Two things are pinned:
//
//  1. The hold time comes from the seller's `user_settings`, never from
//     RESERVATION_TIMEOUT_MINUTES. Each test sets that variable to an absurd
//     value; if any code path still read it, the assertions would fail.
//  2. Holds are scoped per seller. Two sellers may hold the same product code
//     at the same time; one seller may not hold it twice.
//
// Needs the LIVE schema (`users` / `sessions` / `reservations` / `orders`) on
// top of the POS one — `applyLiveMigrations()`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import {
  DEFAULT_RESERVATION_TIMEOUT_MINUTES,
  cleanupExpiredReservations,
  createReservation,
  getReservation,
  getReservationsByNickname,
  isAvailable,
  listActiveReservations,
  reservationToOrder,
  resolveTimeoutMinutes,
} from '../reservations.js';
import { applyLiveMigrations, applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';

describe('resolveTimeoutMinutes', () => {
  it('uses the seller value when it is sane', () => {
    expect(resolveTimeoutMinutes(15)).toBe(15);
  });

  it('falls back to the default when unset', () => {
    expect(resolveTimeoutMinutes(undefined)).toBe(DEFAULT_RESERVATION_TIMEOUT_MINUTES);
    expect(resolveTimeoutMinutes(null)).toBe(DEFAULT_RESERVATION_TIMEOUT_MINUTES);
  });

  it('falls back rather than creating an already-expired hold', () => {
    expect(resolveTimeoutMinutes(0)).toBe(DEFAULT_RESERVATION_TIMEOUT_MINUTES);
    expect(resolveTimeoutMinutes(-5)).toBe(DEFAULT_RESERVATION_TIMEOUT_MINUTES);
    expect(resolveTimeoutMinutes(NaN)).toBe(DEFAULT_RESERVATION_TIMEOUT_MINUTES);
  });

  it('caps a hold at a day', () => {
    expect(resolveTimeoutMinutes(99_999)).toBe(24 * 60);
  });
});

describe.skipIf(!hasDb)('reservations', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const nicknames = [`res_a_${suffix}`, `res_b_${suffix}`];
  let sellerA: { userId: number; sessionId: number };
  let sellerB: { userId: number; sessionId: number };
  const savedEnv = process.env.RESERVATION_TIMEOUT_MINUTES;

  async function makeSeller(tiktokUsername: string) {
    const user = await pool.query(
      `INSERT INTO users (tiktok_username) VALUES ($1) RETURNING id`,
      [tiktokUsername]
    );
    const userId = Number(user.rows[0].id);
    const session = await pool.query(
      `INSERT INTO sessions (user_id, status, started_at)
       VALUES ($1, 'running', NOW()) RETURNING id`,
      [userId]
    );
    return { userId, sessionId: Number(session.rows[0].id) };
  }

  beforeAll(async () => {
    await applyPosMigrations();
    await applyLiveMigrations();
    // If any code still read this, holds would last 999 minutes and the
    // "respects the seller's setting" assertions below would fail.
    process.env.RESERVATION_TIMEOUT_MINUTES = '999';
    sellerA = await makeSeller(nicknames[0]);
    sellerB = await makeSeller(nicknames[1]);
  }, 120000);

  afterAll(async () => {
    if (savedEnv === undefined) delete process.env.RESERVATION_TIMEOUT_MINUTES;
    else process.env.RESERVATION_TIMEOUT_MINUTES = savedEnv;
    // users cascades to sessions → reservations → orders.
    await pool.query(`DELETE FROM users WHERE tiktok_username = ANY($1)`, [nicknames]);
    await pool.end();
  });

  it('takes the hold length from the seller settings, not the environment', async () => {
    const before = Date.now();
    const held = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'TIMEOUT1',
      size: 'M',
      tiktokNickname: 'viewer1',
      timeoutMinutes: 12,
    });

    expect(held).not.toBeNull();
    const minutes = (held!.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(11.5);
    expect(minutes).toBeLessThan(12.5);
  });

  it('falls back to the default when the seller has no value saved', async () => {
    const before = Date.now();
    const held = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'TIMEOUT2',
      size: 'M',
      tiktokNickname: 'viewer1',
      timeoutMinutes: null,
    });

    const minutes = (held!.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(DEFAULT_RESERVATION_TIMEOUT_MINUTES - 0.5);
    expect(minutes).toBeLessThan(DEFAULT_RESERVATION_TIMEOUT_MINUTES + 0.5);
  });

  it('stores the owning seller and broadcast', async () => {
    const held = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'OWNED1',
      size: 'L',
      tiktokNickname: 'viewer2',
      timeoutMinutes: 5,
    });

    expect(held).toMatchObject({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'OWNED1',
      size: 'L',
      tiktokNickname: 'viewer2',
      status: 'reserved',
      orderId: null,
    });
  });

  it('refuses a second hold on the same product+size for one seller', async () => {
    const first = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'DOUBLE1',
      size: 'S',
      tiktokNickname: 'viewer3',
      timeoutMinutes: 5,
    });
    const second = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'DOUBLE1',
      size: 'S',
      tiktokNickname: 'viewer4',
      timeoutMinutes: 5,
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('lets a different size through', async () => {
    await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'SIZED1',
      size: 'S',
      tiktokNickname: 'viewer3',
      timeoutMinutes: 5,
    });
    const other = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'SIZED1',
      size: 'M',
      tiktokNickname: 'viewer3',
      timeoutMinutes: 5,
    });

    expect(other).not.toBeNull();
  });

  it('does not let one seller block another on the same product code', async () => {
    const a = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'SHARED1',
      size: 'M',
      tiktokNickname: 'viewer5',
      timeoutMinutes: 5,
    });
    const b = await createReservation({
      userId: sellerB.userId,
      sessionId: sellerB.sessionId,
      productCode: 'SHARED1',
      size: 'M',
      tiktokNickname: 'viewer5',
      timeoutMinutes: 5,
    });

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.userId).toBe(sellerB.userId);
  });

  it('reports availability per seller', async () => {
    await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'AVAIL1',
      size: 'M',
      tiktokNickname: 'viewer6',
      timeoutMinutes: 5,
    });

    expect(await isAvailable(sellerA.userId, 'AVAIL1', 'M')).toBe(false);
    expect(await isAvailable(sellerB.userId, 'AVAIL1', 'M')).toBe(true);
  });

  it('does not leak another seller reservation through a lookup', async () => {
    await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'LEAK1',
      size: 'M',
      tiktokNickname: 'viewer7',
      timeoutMinutes: 5,
    });

    expect(await getReservation(sellerA.userId, 'LEAK1', 'M')).not.toBeNull();
    expect(await getReservation(sellerB.userId, 'LEAK1', 'M')).toBeNull();
    expect(await getReservationsByNickname(sellerB.userId, 'viewer7')).toEqual([]);
  });

  it('lists only this seller active holds', async () => {
    const mine = await listActiveReservations(sellerB.userId);
    expect(mine.every((r) => r.userId === sellerB.userId)).toBe(true);
  });

  it('expires holds whose time is up and frees the item', async () => {
    const held = await createReservation({
      userId: sellerB.userId,
      sessionId: sellerB.sessionId,
      productCode: 'EXPIRE1',
      size: 'M',
      tiktokNickname: 'viewer8',
      timeoutMinutes: 5,
    });

    await pool.query(
      `UPDATE reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [held!.id]
    );

    expect(await cleanupExpiredReservations()).toBeGreaterThan(0);
    expect(await isAvailable(sellerB.userId, 'EXPIRE1', 'M')).toBe(true);

    const row = await pool.query(`SELECT status FROM reservations WHERE id = $1`, [held!.id]);
    // Marked, not deleted — a converted hold keeps its order trail.
    expect(row.rows[0].status).toBe('expired');
  });

  it('converts a live hold into an order for the same seller and session', async () => {
    const held = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'ORDER1',
      size: 'XL',
      tiktokNickname: 'viewer9',
      timeoutMinutes: 5,
    });

    const orderId = await reservationToOrder(held!.id, 424242);
    expect(orderId).not.toBeNull();

    const order = await pool.query(
      `SELECT user_id, session_id, product_code, size, tiktok_nickname,
              telegram_user_id, status, payment_status
       FROM orders WHERE id = $1`,
      [orderId]
    );
    expect(order.rows[0]).toMatchObject({
      product_code: 'ORDER1',
      size: 'XL',
      tiktok_nickname: 'viewer9',
      status: 'pending',
      payment_status: 'unpaid',
    });
    expect(Number(order.rows[0].user_id)).toBe(sellerA.userId);
    expect(Number(order.rows[0].session_id)).toBe(sellerA.sessionId);
    expect(Number(order.rows[0].telegram_user_id)).toBe(424242);

    const res = await pool.query(
      `SELECT status, converted_to_order_id FROM reservations WHERE id = $1`,
      [held!.id]
    );
    expect(res.rows[0].status).toBe('ordered');
    expect(Number(res.rows[0].converted_to_order_id)).toBe(orderId);
  });

  it('refuses to convert a hold that already expired', async () => {
    const held = await createReservation({
      userId: sellerA.userId,
      sessionId: sellerA.sessionId,
      productCode: 'ORDER2',
      size: 'XL',
      tiktokNickname: 'viewer10',
      timeoutMinutes: 5,
    });

    await pool.query(
      `UPDATE reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [held!.id]
    );

    expect(await reservationToOrder(held!.id, 424242)).toBeNull();
  });
});
