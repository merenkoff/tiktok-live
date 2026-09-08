// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/orders.ts — orders for the multi-tenant LIVE automation.
//
// Column names here follow the live schema (`migrations/001_create_schema.sql`):
// `telegram_user_id`, `phone_number`, `branch`, and a separate `payment_status`
// alongside `status`. The MVP shape this file used to carry
// (`telegram_id` / `phone` / `nova_poshta_branch` / `payment_confirmed_at` /
// `shipped_at`) never existed in that table, so every query in here raised
// 42703 (undefined_column) at runtime.
//
// Reads are scoped by `user_id` — one seller must never see another's orders.

import { pool } from './db.js';

const COLUMNS = `id, user_id, session_id, created_at, updated_at, order_code,
                 tiktok_nickname, telegram_user_id, product_code, size, quantity,
                 status, payment_status, customer_name, phone_number, city,
                 branch, tracking_number`;

export interface Order {
  id: number;
  userId: number;
  sessionId: number | null;
  createdAt: Date;
  updatedAt: Date;
  orderCode: string | null;
  tiktokNickname: string;
  telegramUserId: number | null;
  productCode: string;
  size: string;
  quantity: number;
  status: string;
  paymentStatus: string;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  branch: string | null;
  trackingNumber: string | null;
}

/** Get one order, scoped to its owner. */
export async function getOrder(userId: number, orderId: number): Promise<Order | null> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM orders WHERE user_id = $1 AND id = $2`,
    [userId, orderId]
  );
  return result.rows.length === 0 ? null : mapRowToOrder(result.rows[0]);
}

/** Orders this seller has from one TikTok viewer. */
export async function getOrdersByTiktok(
  userId: number,
  tiktokNickname: string
): Promise<Order[]> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM orders
     WHERE user_id = $1 AND tiktok_nickname = $2
     ORDER BY created_at DESC`,
    [userId, tiktokNickname]
  );
  return result.rows.map(mapRowToOrder);
}

/** Orders in a given fulfilment state. */
export async function getOrdersByStatus(userId: number, status: string): Promise<Order[]> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM orders
     WHERE user_id = $1 AND status = $2
     ORDER BY created_at DESC`,
    [userId, status]
  );
  return result.rows.map(mapRowToOrder);
}

/** Orders still waiting for the seller to confirm money arrived. */
export async function getOrdersPendingPayment(userId: number): Promise<Order[]> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM orders
     WHERE user_id = $1 AND payment_status = 'unpaid'
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows.map(mapRowToOrder);
}

export async function updateOrderStatus(
  orderId: number,
  status: string
): Promise<Order | null> {
  const result = await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING ${COLUMNS}`,
    [status, orderId]
  );
  return result.rows.length === 0 ? null : mapRowToOrder(result.rows[0]);
}

/** Fill in the delivery details the Telegram bot collected. */
export async function updateOrderDetails(
  orderId: number,
  details: {
    customerName?: string;
    phone?: string;
    city?: string;
    branch?: string;
  }
): Promise<Order | null> {
  const updates: string[] = [];
  const values: any[] = [orderId];
  let paramCount = 2;

  if (details.customerName) {
    updates.push(`customer_name = $${paramCount++}`);
    values.push(details.customerName);
  }
  if (details.phone) {
    updates.push(`phone_number = $${paramCount++}`);
    values.push(details.phone);
  }
  if (details.city) {
    updates.push(`city = $${paramCount++}`);
    values.push(details.city);
  }
  if (details.branch) {
    updates.push(`branch = $${paramCount++}`);
    values.push(details.branch);
  }

  if (updates.length === 0) {
    const result = await pool.query(`SELECT ${COLUMNS} FROM orders WHERE id = $1`, [orderId]);
    return result.rows.length === 0 ? null : mapRowToOrder(result.rows[0]);
  }

  updates.push('updated_at = NOW()');

  const result = await pool.query(
    `UPDATE orders SET ${updates.join(', ')} WHERE id = $1
     RETURNING ${COLUMNS}`,
    values
  );
  return result.rows.length === 0 ? null : mapRowToOrder(result.rows[0]);
}

/** Attach the Nova Poshta waybill and mark the parcel as sent. */
export async function addTrackingNumber(
  orderId: number,
  trackingNumber: string
): Promise<Order | null> {
  const result = await pool.query(
    `UPDATE orders
     SET tracking_number = $1, status = 'shipped', updated_at = NOW()
     WHERE id = $2
     RETURNING ${COLUMNS}`,
    [trackingNumber, orderId]
  );
  return result.rows.length === 0 ? null : mapRowToOrder(result.rows[0]);
}

/** Seller confirmed the payment landed. */
export async function confirmPayment(orderId: number): Promise<Order | null> {
  const result = await pool.query(
    `UPDATE orders
     SET payment_status = 'paid', status = 'paid', updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [orderId]
  );
  return result.rows.length === 0 ? null : mapRowToOrder(result.rows[0]);
}

function mapRowToOrder(row: any): Order {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    sessionId: row.session_id === null ? null : Number(row.session_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderCode: row.order_code,
    tiktokNickname: row.tiktok_nickname,
    telegramUserId: row.telegram_user_id === null ? null : Number(row.telegram_user_id),
    productCode: row.product_code,
    size: row.size,
    quantity: Number(row.quantity),
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    phone: row.phone_number,
    city: row.city,
    branch: row.branch,
    trackingNumber: row.tracking_number,
  };
}
