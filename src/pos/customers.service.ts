// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/customers.service.ts

import { pool } from '../db.js';

export interface CustomerChild {
  name: string;
  birthday: string; // YYYY-MM-DD
}

export interface PosCustomer {
  id: number;
  store_id: number;
  name: string;
  phone: string;
  email: string | null;
  children_birthdays: CustomerChild[];
  /** Personal discount, whole percent 0..100 (0 = none). Written only by the owner. */
  discount_percent: number;
  created_at: Date;
  updated_at: Date;
  client_uuid?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function validateChildren(raw: unknown): CustomerChild[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('children_birthdays must be an array');
  if (raw.length > 5) throw new Error('Maximum 5 children');
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid child at index ${i}`);
    }
    const name = String((item as { name?: unknown }).name ?? '').trim();
    const birthday = String((item as { birthday?: unknown }).birthday ?? '').trim();
    if (!name) throw new Error(`Child name required at index ${i}`);
    if (!DATE_RE.test(birthday)) {
      throw new Error(`Child birthday must be YYYY-MM-DD at index ${i}`);
    }
    return { name, birthday };
  });
}

/**
 * A personal discount: a whole percent from 0 to 100, `null` meaning «none».
 * Whole because it travels as the cart discount, whose `cart_discount_value`
 * column is an INTEGER percent (migration 061); a half-percent tier would need
 * a second representation on every sale.
 */
export function parseDiscountPercent(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const value = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error('Знижка клієнта — ціле число відсотків від 0 до 100');
  }
  return value;
}

function mapCustomer(row: Record<string, unknown>): PosCustomer {
  const children = Array.isArray(row.children_birthdays)
    ? (row.children_birthdays as CustomerChild[])
    : typeof row.children_birthdays === 'string'
      ? (JSON.parse(row.children_birthdays) as CustomerChild[])
      : [];
  return {
    id: Number(row.id),
    store_id: Number(row.store_id),
    name: String(row.name),
    phone: String(row.phone),
    email: row.email == null ? null : String(row.email),
    children_birthdays: children,
    discount_percent: Number(row.discount_percent ?? 0),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    client_uuid: row.client_uuid == null ? null : String(row.client_uuid),
  };
}

export async function listCustomers(
  storeId: number,
  q?: string,
  snapshot = false
): Promise<PosCustomer[]> {
  const query = q?.trim();
  const limit = snapshot ? 10000 : query ? 100 : 200;
  if (query && !snapshot) {
    const digits = normalizePhone(query);
    const result = await pool.query(
      `SELECT * FROM pos_customers
       WHERE store_id = $1
         AND (
           name ILIKE $2
           OR phone LIKE $3
           OR ($4 <> '' AND phone LIKE $4)
         )
       ORDER BY name ASC
       LIMIT ${limit}`,
      [storeId, `%${query}%`, `%${query}%`, digits ? `%${digits}%` : '']
    );
    return result.rows.map(mapCustomer);
  }
  const result = await pool.query(
    `SELECT * FROM pos_customers WHERE store_id = $1 ORDER BY name ASC LIMIT ${limit}`,
    [storeId]
  );
  return result.rows.map(mapCustomer);
}

export async function getCustomer(
  storeId: number,
  id: number
): Promise<PosCustomer | null> {
  const result = await pool.query(
    `SELECT * FROM pos_customers WHERE id = $1 AND store_id = $2`,
    [id, storeId]
  );
  if (result.rows.length === 0) return null;
  return mapCustomer(result.rows[0]);
}

export async function createCustomer(
  storeId: number,
  input: {
    name: string;
    phone: string;
    email?: string | null;
    children_birthdays?: CustomerChild[];
    discount_percent?: number | null;
    client_uuid?: string | null;
  }
): Promise<PosCustomer> {
  const name = input.name?.trim();
  if (!name) throw new Error('Name is required');
  const phone = normalizePhone(input.phone ?? '');
  if (phone.length < 8) throw new Error('Phone is required');
  const email = input.email?.trim() || null;
  const children = validateChildren(input.children_birthdays ?? []);
  const discount = parseDiscountPercent(input.discount_percent);
  const clientUuid = input.client_uuid?.trim() || null;

  if (clientUuid) {
    const byUuid = await pool.query(
      `SELECT * FROM pos_customers WHERE store_id = $1 AND client_uuid = $2`,
      [storeId, clientUuid]
    );
    if (byUuid.rows.length > 0) {
      return updateCustomer(storeId, Number(byUuid.rows[0].id), {
        name,
        phone,
        email,
        children_birthdays: children,
        discount_percent: input.discount_percent,
        client_uuid: clientUuid,
      });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, email, children_birthdays, discount_percent, client_uuid)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING *`,
      [storeId, name, phone, email, JSON.stringify(children), discount, clientUuid]
    );
    return mapCustomer(result.rows[0]);
  } catch (error) {
    const unique =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505';
    if (!unique) throw error;
    if (clientUuid) {
      const byUuid = await pool.query(
        `SELECT * FROM pos_customers WHERE store_id = $1 AND client_uuid = $2`,
        [storeId, clientUuid]
      );
      if (byUuid.rows.length > 0) {
        return updateCustomer(storeId, Number(byUuid.rows[0].id), {
          name,
          phone,
          email,
          children_birthdays: children,
          discount_percent: input.discount_percent,
          client_uuid: clientUuid,
        });
      }
    }
    const existing = await pool.query(
      `SELECT * FROM pos_customers WHERE store_id = $1 AND phone = $2`,
      [storeId, phone]
    );
    if (existing.rows.length === 0) throw error;
    return updateCustomer(storeId, Number(existing.rows[0].id), {
      name,
      phone,
      email,
      children_birthdays: children,
      discount_percent: input.discount_percent,
      client_uuid: clientUuid,
    });
  }
}

export async function updateCustomer(
  storeId: number,
  id: number,
  input: {
    name?: string;
    phone?: string;
    email?: string | null;
    children_birthdays?: CustomerChild[];
    /** Absent = leave as it is (the merge paths below never touch a stored discount). */
    discount_percent?: number | null;
    client_uuid?: string | null;
  }
): Promise<PosCustomer> {
  const existing = await getCustomer(storeId, id);
  if (!existing) throw new Error('Customer not found');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new Error('Name is required');
  const phone =
    input.phone !== undefined ? normalizePhone(input.phone) : existing.phone;
  if (phone.length < 8) throw new Error('Phone is required');
  const email =
    input.email !== undefined
      ? input.email?.trim() || null
      : existing.email;
  const children =
    input.children_birthdays !== undefined
      ? validateChildren(input.children_birthdays)
      : existing.children_birthdays;
  const clientUuid =
    input.client_uuid !== undefined
      ? input.client_uuid?.trim() || null
      : existing.client_uuid ?? null;
  const discount =
    input.discount_percent !== undefined
      ? parseDiscountPercent(input.discount_percent)
      : existing.discount_percent;

  const result = await pool.query(
    `UPDATE pos_customers
     SET name = $1, phone = $2, email = $3, children_birthdays = $4::jsonb,
         client_uuid = COALESCE($7, client_uuid), discount_percent = $8, updated_at = NOW()
     WHERE id = $5 AND store_id = $6
     RETURNING *`,
    [name, phone, email, JSON.stringify(children), id, storeId, clientUuid, discount]
  );
  return mapCustomer(result.rows[0]);
}

export async function deleteCustomer(storeId: number, id: number): Promise<void> {
  const sales = await pool.query(
    `SELECT id FROM pos_sales WHERE store_id = $1 AND customer_id = $2 LIMIT 1`,
    [storeId, id]
  );
  if (sales.rows.length > 0) {
    throw new Error('Cannot delete customer with sales history');
  }
  const result = await pool.query(
    `DELETE FROM pos_customers WHERE id = $1 AND store_id = $2 RETURNING id`,
    [id, storeId]
  );
  if (result.rows.length === 0) throw new Error('Customer not found');
}
