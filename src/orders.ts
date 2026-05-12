import { pool } from './db.js';
// import { logger } from './logger.js';

export interface Order {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  tiktokNickname: string;
  telegramId: number | null;
  productCode: string;
  size: string;
  status: string;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  novaPoshtaBranch: string | null;
  trackingNumber: string | null;
  paymentConfirmedAt: Date | null;
  shippedAt: Date | null;
}

/**
 * Get order by ID
 */
export async function getOrder(orderId: number): Promise<Order | null> {
  const result = await pool.query(
    `SELECT 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at
     FROM orders WHERE id = $1`,
    [orderId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrder(result.rows[0]);
}

/**
 * Get orders by TikTok nickname
 */
export async function getOrdersByTiktok(tiktokNickname: string): Promise<Order[]> {
  const result = await pool.query(
    `SELECT 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at
     FROM orders WHERE tiktok_nickname = $1
     ORDER BY created_at DESC`,
    [tiktokNickname]
  );

  return result.rows.map(mapRowToOrder);
}

/**
 * Get orders by status
 */
export async function getOrdersByStatus(status: string): Promise<Order[]> {
  const result = await pool.query(
    `SELECT 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at
     FROM orders WHERE status = $1
     ORDER BY created_at DESC`,
    [status]
  );

  return result.rows.map(mapRowToOrder);
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: number,
  status: string
): Promise<Order | null> {
  const result = await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at`,
    [status, orderId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrder(result.rows[0]);
}

/**
 * Update order with customer details
 */
export async function updateOrderDetails(
  orderId: number,
  details: {
    customerName?: string;
    phone?: string;
    city?: string;
    novaPoshtaBranch?: string;
  }
): Promise<Order | null> {
  const updateFields = [];
  const values: any[] = [orderId];
  let paramCount = 2;

  if (details.customerName) {
    updateFields.push(`customer_name = $${paramCount++}`);
    values.push(details.customerName);
  }
  if (details.phone) {
    updateFields.push(`phone = $${paramCount++}`);
    values.push(details.phone);
  }
  if (details.city) {
    updateFields.push(`city = $${paramCount++}`);
    values.push(details.city);
  }
  if (details.novaPoshtaBranch) {
    updateFields.push(`nova_poshta_branch = $${paramCount++}`);
    values.push(details.novaPoshtaBranch);
  }

  if (updateFields.length === 0) {
    return getOrder(orderId);
  }

  updateFields.push('updated_at = NOW()');

  const result = await pool.query(
    `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $1
     RETURNING 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrder(result.rows[0]);
}

/**
 * Add tracking number to order
 */
export async function addTrackingNumber(
  orderId: number,
  trackingNumber: string
): Promise<Order | null> {
  const result = await pool.query(
    `UPDATE orders 
     SET tracking_number = $1, shipped_at = NOW(), status = 'shipped', updated_at = NOW()
     WHERE id = $2
     RETURNING 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at`,
    [trackingNumber, orderId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrder(result.rows[0]);
}

/**
 * Confirm payment
 */
export async function confirmPayment(orderId: number): Promise<Order | null> {
  const result = await pool.query(
    `UPDATE orders 
     SET status = 'paid', payment_confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at`,
    [orderId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToOrder(result.rows[0]);
}

/**
 * Get orders pending payment (for admin dashboard)
 */
export async function getOrdersPendingPayment(): Promise<Order[]> {
  const result = await pool.query(
    `SELECT 
      id, created_at, updated_at, tiktok_nickname, telegram_id,
      product_code, size, status, customer_name, phone, city,
      nova_poshta_branch, tracking_number, payment_confirmed_at, shipped_at
     FROM orders WHERE status = 'waiting_payment'
     ORDER BY created_at ASC`
  );

  return result.rows.map(mapRowToOrder);
}

// Helper
function mapRowToOrder(row: any): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tiktokNickname: row.tiktok_nickname,
    telegramId: row.telegram_id,
    productCode: row.product_code,
    size: row.size,
    status: row.status,
    customerName: row.customer_name,
    phone: row.phone,
    city: row.city,
    novaPoshtaBranch: row.nova_poshta_branch,
    trackingNumber: row.tracking_number,
    paymentConfirmedAt: row.payment_confirmed_at,
    shippedAt: row.shipped_at,
  };
}
