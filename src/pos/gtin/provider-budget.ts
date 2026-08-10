// src/pos/gtin/provider-budget.ts

import { pool } from '../../db.js';

export type QuotaProvider = 'upcitemdb' | 'upc_dev';

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailyLimit(provider: QuotaProvider): number {
  if (provider === 'upcitemdb') {
    return Number(process.env.GTIN_UPCITEMDB_DAILY_LIMIT ?? 100);
  }
  return Number(process.env.GTIN_UPC_DEV_DAILY_LIMIT ?? 100);
}

export async function getUsedCount(provider: QuotaProvider): Promise<number> {
  const r = await pool.query(
    `SELECT used_count FROM pos_gtin_provider_budget
     WHERE provider = $1 AND day_utc = $2::date`,
    [provider, utcDay()]
  );
  if (r.rows.length === 0) return 0;
  return Number(r.rows[0].used_count);
}

/** Returns true if a slot was consumed; false if quota exhausted. */
export async function tryConsumeBudget(provider: QuotaProvider): Promise<boolean> {
  const limit = dailyLimit(provider);
  const day = utcDay();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO pos_gtin_provider_budget (provider, day_utc, used_count)
       VALUES ($1, $2::date, 0)
       ON CONFLICT (provider, day_utc) DO NOTHING`,
      [provider, day]
    );
    const updated = await client.query(
      `UPDATE pos_gtin_provider_budget
       SET used_count = used_count + 1
       WHERE provider = $1 AND day_utc = $2::date AND used_count < $3
       RETURNING used_count`,
      [provider, day, limit]
    );
    await client.query('COMMIT');
    return updated.rows.length > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
