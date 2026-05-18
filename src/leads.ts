import { pool } from './db.js';
import { logger } from './logger.js';

export interface Lead {
  id: number;
  phone: string;
  name: string | null;
  createdAt: Date;
  status: string;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');

  if (digits.length < 10) return null;

  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('80') && digits.length === 11) return `+3${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;

  return null;
}

export async function createLead(phone: string, name?: string): Promise<Lead> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new Error('Invalid phone number');
  }

  const trimmedName = name?.trim() || null;

  const result = await pool.query(
    `INSERT INTO leads (phone, name)
     VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, leads.name),
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, phone, name, created_at, status`,
    [normalized, trimmedName],
  );

  const row = result.rows[0];
  logger.info('New lead captured', { phone: normalized, name: trimmedName });

  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    createdAt: row.created_at,
    status: row.status,
  };
}

export async function getLeads(limit = 100): Promise<Lead[]> {
  const result = await pool.query(
    `SELECT id, phone, name, created_at, status
     FROM leads
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    name: row.name,
    createdAt: row.created_at,
    status: row.status,
  }));
}
