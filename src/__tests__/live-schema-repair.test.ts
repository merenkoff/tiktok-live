// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { initializeDatabase, pool, repairLegacyLiveColumns } from '../db.js';
import { hasDb } from './helpers/pos-fixtures.js';

/**
 * What production actually looked like on 2026-09-17: a database that first ran
 * the single-user MVP, so `orders` and `reservations` exist but predate
 * multi-tenancy. `CREATE TABLE IF NOT EXISTS` says nothing about a table like
 * that, so the six indexes over the newer columns failed with 42703, the
 * every-minute reservation-cleanup cron failed with it too, and nothing could
 * have created a reservation at all.
 *
 * These are the legacy shapes, missing exactly the columns whose indexes the
 * deploy log reported skipping.
 */
const LEGACY_ORDERS = `
  CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    product_code VARCHAR(50),
    size VARCHAR(50),
    tiktok_nickname VARCHAR(255),
    telegram_user_id BIGINT,
    customer_name VARCHAR(255),
    phone_number VARCHAR(20),
    city VARCHAR(255),
    branch VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

const LEGACY_RESERVATIONS = `
  CREATE TABLE reservations (
    id BIGSERIAL PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL,
    size VARCHAR(50) NOT NULL,
    tiktok_nickname VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

/** Everything `001_create_schema.sql` declares, so the teardown leaves nothing. */
const LIVE_TABLES = [
  'audit_logs',
  'reservations',
  'orders',
  'session_logs',
  'sessions',
  'user_settings',
  'leads',
  'users',
];

async function dropLiveTables(): Promise<void> {
  for (const table of LIVE_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function columns(table: string): Promise<string[]> {
  const rows = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
    [table]
  );
  return rows.rows.map((r) => String(r.column_name));
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [name]
  );
  return rows.rows.length > 0;
}

describe.skipIf(!hasDb)('LIVE schema repair (initializeDatabase)', () => {
  beforeAll(async () => {
    // The POS suites never create the LIVE schema, so this file owns it end to
    // end: it builds the legacy shape, runs the real init, and clears up after.
    await dropLiveTables();
    await pool.query(LEGACY_ORDERS);
    await pool.query(LEGACY_RESERVATIONS);
    await initializeDatabase();
  }, 60000);

  afterAll(async () => {
    await dropLiveTables();
    await pool.end();
  });

  it('adds the columns a pre-multi-tenancy database is missing', async () => {
    const reservations = await columns('reservations');
    expect(reservations).toContain('user_id');
    expect(reservations).toContain('session_id');
    expect(reservations).toContain('status');
    expect(reservations).toContain('expires_at');
    expect(reservations).toContain('converted_to_order_id');

    const orders = await columns('orders');
    expect(orders).toContain('user_id');
    expect(orders).toContain('session_id');
    expect(orders).toContain('status');
    expect(orders).toContain('payment_status');
  });

  it('creates the indexes that failed before the repair', async () => {
    // The actual regression: these six were reported as skipped on every deploy
    // and never retried, so they were simply absent. Their presence is the proof
    // that a deferred statement is retried after the columns arrive.
    for (const index of [
      'idx_reservations_user_id',
      'idx_reservations_session_id',
      'idx_reservations_status',
      'idx_orders_user_id',
      'idx_orders_session_id',
      'idx_orders_payment_status',
    ]) {
      expect(await indexExists(index), index).toBe(true);
    }
  });

  it('lets the cleanup cron run — the query that was failing every minute', async () => {
    // `cleanupExpiredReservations` is this statement. It threw 42703 on
    // production once a minute; here it has to come back with a row count.
    const result = await pool.query(
      `UPDATE reservations SET status = 'expired', updated_at = NOW()
        WHERE status = 'reserved' AND expires_at <= NOW()`
    );
    expect(result.rowCount).toBe(0);
  });

  it('accepts the insert the LIVE order flow makes', async () => {
    // A reservation needs a user and a session; both come from the schema the
    // init just created, which is the other half of "the flow can run".
    const user = await pool.query(
      `INSERT INTO users (tiktok_username) VALUES ('repair_probe') RETURNING id`
    );
    const session = await pool.query(
      `INSERT INTO sessions (user_id, status) VALUES ($1, 'active') RETURNING id`,
      [user.rows[0].id]
    );
    const reservation = await pool.query(
      `INSERT INTO reservations
         (user_id, session_id, product_code, size, tiktok_nickname, status, expires_at)
       VALUES ($1, $2, 'A1', 'M', 'someone', 'reserved', NOW() + INTERVAL '5 minutes')
       RETURNING id, status`,
      [user.rows[0].id, session.rows[0].id]
    );
    expect(reservation.rows[0].status).toBe('reserved');
  });

  it('is idempotent — a second init repairs nothing and changes nothing', async () => {
    expect(await repairLegacyLiveColumns()).toEqual([]);
    const before = await columns('reservations');
    await initializeDatabase();
    expect(await columns('reservations')).toEqual(before);
    expect(await repairLegacyLiveColumns()).toEqual([]);
  }, 60000);

  it('says nothing about tables this database does not have', async () => {
    // The POS-only databases (and every test database but this file's) have no
    // LIVE schema at all. The repair has to be a no-op there, not a throw.
    await dropLiveTables();
    expect(await repairLegacyLiveColumns()).toEqual([]);
  });
});
