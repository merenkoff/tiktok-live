// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/crm.migration-import.test.ts — 070 carries the old LIVE
// `leads` table over once, and only once: the runner applies every file on
// every boot, so a second run must copy nothing and add no second «imported»
// touch. On a scratch database, because the shared test one has no LIVE
// schema and must not grow a `leads` table other suites do not expect.

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { readMigration } from '../pos/migrations.js';
import { hasDb } from './helpers/pos-fixtures.js';
import { canCreateDatabase, createScratchDatabase, dropScratchDatabase } from './helpers/scratch-db.js';

const DB = 'crm_import_probe';
const canCreate = hasDb ? await canCreateDatabase() : false;

describe.skipIf(!hasDb || !canCreate)('070 carries the old leads over once', () => {
  let db: Pool;

  beforeAll(async () => {
    db = await createScratchDatabase(DB);
    // The shape 001 gives `leads`, as far as 070 reads it.
    await db.query(`
      CREATE TABLE leads (
        id BIGSERIAL PRIMARY KEY, phone VARCHAR(20), name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO leads (phone, name, status, created_at) VALUES
        ('+380671111111', 'Оксана', 'new', '2026-09-01 10:00'),
        ('+380672222222', '${'д'.repeat(120)}', 'contacted', '2026-09-02 10:00'),
        ('+380673333333', NULL, 'weird', '2026-09-03 10:00'),
        ('', 'без телефону', 'new', '2026-09-04 10:00');
    `);
  });

  afterAll(async () => {
    await dropScratchDatabase(DB, db);
  });

  it('copies each person once, with an «imported» touch, and keeps a known status', async () => {
    await db.query(readMigration('070_crm_leads.sql'));
    const people = await db.query(`SELECT phone, name, status, created_at FROM crm_leads ORDER BY phone`);
    expect(people.rows.map((r) => [r.phone, r.status])).toEqual([
      ['+380671111111', 'new'],
      ['+380672222222', 'contacted'],
      ['+380673333333', 'new'],
    ]);
    expect(people.rows[1].name).toHaveLength(80);
    expect(new Date(people.rows[0].created_at).toISOString()).toBe('2026-09-01T10:00:00.000Z');
    const touches = await db.query(`SELECT form_id FROM crm_lead_touches`);
    expect(touches.rows.map((r) => r.form_id)).toEqual(['imported', 'imported', 'imported']);
  });

  it('copies nothing the second time, and never overwrites a person the CRM already has', async () => {
    await db.query(`UPDATE crm_leads SET status = 'client', note = 'купив' WHERE phone = '+380671111111'`);
    await db.query(readMigration('070_crm_leads.sql'));
    const people = await db.query(`SELECT count(*)::int AS n FROM crm_leads`);
    expect(people.rows[0].n).toBe(3);
    const touches = await db.query(`SELECT count(*)::int AS n FROM crm_lead_touches`);
    expect(touches.rows[0].n).toBe(3);
    const kept = await db.query(`SELECT status, note FROM crm_leads WHERE phone = '+380671111111'`);
    expect(kept.rows[0]).toEqual({ status: 'client', note: 'купив' });
  });
});
