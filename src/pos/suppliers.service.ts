// src/pos/suppliers.service.ts

import { pool } from '../db.js';

export interface Supplier {
  id: number;
  store_id: number;
  name: string;
  phone: string | null;
  note: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: Number(row.id),
    store_id: Number(row.store_id),
    name: String(row.name),
    phone: row.phone == null ? null : String(row.phone),
    note: row.note == null ? null : String(row.note),
    is_active: Boolean(row.is_active),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export async function listSuppliers(storeId: number, activeOnly = true): Promise<Supplier[]> {
  const result = await pool.query(
    `SELECT * FROM pos_suppliers
     WHERE store_id = $1 ${activeOnly ? 'AND is_active = TRUE' : ''}
     ORDER BY name ASC`,
    [storeId]
  );
  return result.rows.map(mapSupplier);
}

export async function createSupplier(
  storeId: number,
  input: { name: string; phone?: string; note?: string }
): Promise<Supplier> {
  const name = input.name.trim();
  if (!name) throw new Error('Supplier name required');
  const result = await pool.query(
    `INSERT INTO pos_suppliers (store_id, name, phone, note)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [storeId, name, input.phone?.trim() || null, input.note?.trim() || null]
  );
  return mapSupplier(result.rows[0]);
}

export async function updateSupplier(
  storeId: number,
  supplierId: number,
  input: { name?: string; phone?: string | null; note?: string | null; is_active?: boolean }
): Promise<Supplier> {
  const current = await pool.query(
    `SELECT * FROM pos_suppliers WHERE id = $1 AND store_id = $2`,
    [supplierId, storeId]
  );
  if (current.rows.length === 0) throw new Error('Supplier not found');

  const row = current.rows[0];
  const name = input.name !== undefined ? input.name.trim() : String(row.name);
  if (!name) throw new Error('Supplier name required');

  const result = await pool.query(
    `UPDATE pos_suppliers
     SET name = $1,
         phone = $2,
         note = $3,
         is_active = $4,
         updated_at = NOW()
     WHERE id = $5 AND store_id = $6
     RETURNING *`,
    [
      name,
      input.phone !== undefined ? input.phone?.trim() || null : row.phone,
      input.note !== undefined ? input.note?.trim() || null : row.note,
      input.is_active !== undefined ? input.is_active : row.is_active,
      supplierId,
      storeId,
    ]
  );
  return mapSupplier(result.rows[0]);
}
