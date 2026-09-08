// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/reservations.ts — reservations for the multi-tenant LIVE automation.
//
// Every reservation belongs to one seller (`user_id`) and one broadcast
// (`session_id`), so two sellers can use the same product code at the same time
// without colliding. All the "is this taken?" queries are therefore scoped by
// user; a bare product_code+size lookup would be a cross-tenant leak.
//
// The hold time is NOT read from the environment. It comes from the seller's
// own `user_settings.reservation_timeout_minutes`, which the session snapshots
// into memory at start (`sessions.manager.ts`) and passes down here. That is
// deliberate: one broadcast runs with one consistent set of settings, and
// changing them mid-stream requires a stop/start.

import { pool } from './db.js';
import { logger } from './logger.js';

/** Used when a seller's settings row has no explicit value. Mirrors the DB default. */
export const DEFAULT_RESERVATION_TIMEOUT_MINUTES = 5;

/** A reservation is only "live" while it is still held and not yet expired. */
const ACTIVE = `status = 'reserved' AND expires_at > NOW()`;

const COLUMNS = `id, user_id, session_id, product_code, size, tiktok_nickname,
                 status, created_at, expires_at, converted_to_order_id`;

export interface Reservation {
  id: number;
  userId: number;
  sessionId: number;
  productCode: string;
  size: string;
  tiktokNickname: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  orderId: number | null;
}

function mapRow(row: any): Reservation {
  return {
    id: row.id,
    userId: Number(row.user_id),
    sessionId: Number(row.session_id),
    productCode: row.product_code,
    size: row.size,
    tiktokNickname: row.tiktok_nickname,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    orderId: row.converted_to_order_id === null ? null : Number(row.converted_to_order_id),
  };
}

/** Clamp a settings value to something sane; falls back to the default when unset. */
export function resolveTimeoutMinutes(minutes?: number | null): number {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_RESERVATION_TIMEOUT_MINUTES;
  return Math.min(Math.round(value), 24 * 60);
}

/**
 * Hold a product+size for one viewer. Returns null when this seller already has
 * a live hold on the same product+size (race-safe: the check and the insert
 * share one transaction).
 */
export async function createReservation(params: {
  userId: number;
  sessionId: number;
  productCode: string;
  size: string;
  tiktokNickname: string;
  /** From `user_settings.reservation_timeout_minutes` via the active session. */
  timeoutMinutes?: number | null;
}): Promise<Reservation | null> {
  const { userId, sessionId, productCode, size, tiktokNickname } = params;
  const timeoutMinutes = resolveTimeoutMinutes(params.timeoutMinutes);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM reservations
       WHERE user_id = $1 AND product_code = $2 AND size = $3 AND ${ACTIVE}
       FOR UPDATE`,
      [userId, productCode, size]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      logger.info(`Reservation exists for ${productCode} ${size}`, { userId });
      return null;
    }

    const expiresAt = new Date(Date.now() + timeoutMinutes * 60_000);

    const result = await client.query(
      `INSERT INTO reservations
         (user_id, session_id, product_code, size, tiktok_nickname, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'reserved', $6)
       RETURNING ${COLUMNS}`,
      [userId, sessionId, productCode, size, tiktokNickname, expiresAt]
    );

    await client.query('COMMIT');
    return mapRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create reservation', { error, userId, productCode, size });
    throw error;
  } finally {
    client.release();
  }
}

/** Is this product+size free for this seller right now? */
export async function isAvailable(
  userId: number,
  productCode: string,
  size: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM reservations
     WHERE user_id = $1 AND product_code = $2 AND size = $3 AND ${ACTIVE}`,
    [userId, productCode, size]
  );
  return result.rows.length === 0;
}

/** The live hold on this product+size, if any. */
export async function getReservation(
  userId: number,
  productCode: string,
  size: string
): Promise<Reservation | null> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM reservations
     WHERE user_id = $1 AND product_code = $2 AND size = $3 AND ${ACTIVE}`,
    [userId, productCode, size]
  );
  return result.rows.length === 0 ? null : mapRow(result.rows[0]);
}

/** Live holds one viewer has with this seller. */
export async function getReservationsByNickname(
  userId: number,
  tiktokNickname: string
): Promise<Reservation[]> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM reservations
     WHERE user_id = $1 AND tiktok_nickname = $2 AND ${ACTIVE}
     ORDER BY created_at DESC`,
    [userId, tiktokNickname]
  );
  return result.rows.map(mapRow);
}

/** Every live hold for this seller (admin view). */
export async function listActiveReservations(userId: number): Promise<Reservation[]> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM reservations
     WHERE user_id = $1 AND ${ACTIVE}
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map(mapRow);
}

/**
 * Release holds whose time is up (cron, every minute). Marks them `expired`
 * rather than deleting, so a hold that already became an order keeps its
 * `converted_to_order_id` trail.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const result = await pool.query(
    `UPDATE reservations SET status = 'expired', updated_at = NOW()
     WHERE status = 'reserved' AND expires_at <= NOW()`
  );

  if (result.rowCount && result.rowCount > 0) {
    logger.info(`Cleaned up ${result.rowCount} expired reservations`);
  }

  return result.rowCount || 0;
}

/**
 * Turn a still-live hold into a pending order. Returns null when the hold
 * expired in the meantime.
 */
export async function reservationToOrder(
  reservationId: number,
  telegramUserId: number
): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT ${COLUMNS} FROM reservations
       WHERE id = $1 AND ${ACTIVE}
       FOR UPDATE`,
      [reservationId]
    );

    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const reservation = res.rows[0];

    const orderRes = await client.query(
      `INSERT INTO orders
         (user_id, session_id, product_code, size, tiktok_nickname,
          telegram_user_id, status, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'unpaid')
       RETURNING id`,
      [
        reservation.user_id,
        reservation.session_id,
        reservation.product_code,
        reservation.size,
        reservation.tiktok_nickname,
        telegramUserId,
      ]
    );

    const orderId = Number(orderRes.rows[0].id);

    await client.query(
      `UPDATE reservations
       SET converted_to_order_id = $1, status = 'ordered', updated_at = NOW()
       WHERE id = $2`,
      [orderId, reservationId]
    );

    await client.query('COMMIT');
    return orderId;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to convert reservation to order', { error, reservationId });
    throw error;
  } finally {
    client.release();
  }
}
