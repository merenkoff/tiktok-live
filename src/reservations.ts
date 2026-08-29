// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { pool } from './db.js';
import { logger } from './logger.js';

export interface Reservation {
  id: number;
  productCode: string;
  size: string;
  tiktokNickname: string;
  createdAt: Date;
  expiresAt: Date;
  orderId: number | null;
}

const RESERVATION_TIMEOUT_MINUTES =
  parseInt(process.env.RESERVATION_TIMEOUT_MINUTES || '5');

/**
 * Create a reservation for a product+size combination
 * Returns reservation if successful, null if already reserved
 */
export async function createReservation(
  productCode: string,
  size: string,
  tiktokNickname: string,
  uniqueId?: any,
): Promise<Reservation | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already reserved or sold
    const existing = await client.query(
      `SELECT id FROM reservations 
       WHERE product_code = $1 AND size = $2 AND expires_at > NOW()`,
      [productCode, size]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      logger.info(`Reservation exists for ${productCode} ${size}`);
      return null;
    }

    // Create reservation
    const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MINUTES * 60000);

    const result = await client.query(
      `INSERT INTO reservations (product_code, size, tiktok_nickname, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, product_code, size, tiktok_nickname, created_at, expires_at, order_id`,
      [productCode, size, tiktokNickname, expiresAt]
    );

    await client.query('COMMIT');

    const row = result.rows[0];
    return {
      id: row.id,
      productCode: row.product_code,
      size: row.size,
      tiktokNickname: row.tiktok_nickname,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      orderId: row.order_id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create reservation', { error, productCode, size, uniqueId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if product+size is available
 */
export async function isAvailable(
  productCode: string,
  size: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM reservations 
     WHERE product_code = $1 AND size = $2 AND expires_at > NOW()`,
    [productCode, size]
  );

  return result.rows.length === 0;
}

/**
 * Get active reservation for product+size
 */
export async function getReservation(
  productCode: string,
  size: string
): Promise<Reservation | null> {
  const result = await pool.query(
    `SELECT id, product_code, size, tiktok_nickname, created_at, expires_at, order_id
     FROM reservations 
     WHERE product_code = $1 AND size = $2 AND expires_at > NOW()`,
    [productCode, size]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    productCode: row.product_code,
    size: row.size,
    tiktokNickname: row.tiktok_nickname,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    orderId: row.order_id,
  };
}

/**
 * Get all active reservations for a user
 */
export async function getUserReservations(
  tiktokNickname: string
): Promise<Reservation[]> {
  const result = await pool.query(
    `SELECT id, product_code, size, tiktok_nickname, created_at, expires_at, order_id
     FROM reservations 
     WHERE tiktok_nickname = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [tiktokNickname]
  );

  return result.rows.map((row) => ({
    id: row.id,
    productCode: row.product_code,
    size: row.size,
    tiktokNickname: row.tiktok_nickname,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    orderId: row.order_id,
  }));
}

/**
 * Release expired reservations (move to cron job)
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM reservations WHERE expires_at <= NOW()`
  );

  if (result.rowCount && result.rowCount > 0) {
    logger.info(`Cleaned up ${result.rowCount} expired reservations`);
  }

  return result.rowCount || 0;
}

/**
 * Convert reservation to order
 */
export async function reservationToOrder(
  reservationId: number,
  telegramId: number
): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get reservation
    const res = await client.query(
      `SELECT * FROM reservations WHERE id = $1 AND expires_at > NOW()`,
      [reservationId]
    );

    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const reservation = res.rows[0];

    // Create order
    const orderRes = await client.query(
      `INSERT INTO orders (tiktok_nickname, telegram_id, product_code, size, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [
        reservation.tiktok_nickname,
        telegramId,
        reservation.product_code,
        reservation.size,
      ]
    );

    const orderId = orderRes.rows[0].id;

    // Update reservation with order_id
    await client.query(
      `UPDATE reservations SET order_id = $1 WHERE id = $2`,
      [orderId, reservationId]
    );

    await client.query('COMMIT');
    return orderId;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to convert reservation to order', { error });
    throw error;
  } finally {
    client.release();
  }
}
