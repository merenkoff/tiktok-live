// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The whole migration list, applied more than once.
 *
 * This is not a style preference. `Dockerfile` starts the service with
 * `node dist/pos/migrate.js && node dist/index.js`, and `migrate.ts` keeps no
 * tracking table: every file in `POS_MIGRATIONS` is re-applied on **every**
 * container start, and the API comes up only if that exits 0. So a migration
 * that drops a column an earlier one reads does not break the deploy that ships
 * it — it breaks the next restart, with the service simply never coming back.
 *
 * That is exactly what registering `036_pos_drop_variant_size_color.sql` would
 * have done: `035` backfills `attributes` from `pos_variants.size`, `036` drops
 * the column, and the second boot dies on `column "size" does not exist`. `007`
 * had the quieter half of the same bug — `ADD COLUMN IF NOT EXISTS` resurrected
 * the placeholder pair `036` had just dropped, so every boot left two more
 * `attisdropped` entries behind against Postgres's ceiling of 1600 columns per
 * table, and rebuilt an index `035` immediately replaced.
 *
 * Runs against its own scratch database rather than the shared test one: the
 * point is a *fresh* schema built from nothing and then re-applied, and
 * `ALTER TABLE` storms against the database the other suites are using is what
 * `vitest.global-setup.ts` exists to avoid.
 */

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POS_MIGRATIONS, readMigration } from '../pos/migrations.js';
import { hasDb } from './helpers/pos-fixtures.js';
import { applyAllMigrations as applyAll, canCreateDatabase, poolFor } from './helpers/scratch-db.js';

const PROBE_DB = 'pos_migrations_probe';

const canCreate = hasDb ? await canCreateDatabase() : false;

async function liveColumns(probe: Pool, table: string, names: string[]): Promise<string[]> {
  const r = await probe.query(
    `SELECT attname FROM pg_attribute
      WHERE attrelid = $1::regclass AND attname = ANY($2) AND NOT attisdropped`,
    [table, names]
  );
  return r.rows.map((row) => row.attname as string);
}

async function droppedAttributeCount(probe: Pool, table: string): Promise<number> {
  const r = await probe.query(
    `SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid = $1::regclass AND attisdropped`,
    [table]
  );
  return r.rows[0].n as number;
}

describe.skipIf(!hasDb || !canCreate)('POS migrations, applied the way the runner applies them', () => {
  let probe: Pool;

  beforeAll(async () => {
    const admin = poolFor('postgres');
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${PROBE_DB}`);
      await admin.query(`CREATE DATABASE ${PROBE_DB}`);
    } finally {
      await admin.end();
    }
    probe = poolFor(PROBE_DB);
  });

  afterAll(async () => {
    await probe?.end();
    const admin = poolFor('postgres');
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${PROBE_DB}`);
    } finally {
      await admin.end();
    }
  });

  it('builds the schema from nothing', async () => {
    await applyAll(probe);
    const tables = await probe.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'pos\\_%'`
    );
    expect(tables.rows[0].n).toBeGreaterThan(30);
  });

  it('applies the whole list again — this is what every container start does', async () => {
    // The assertion is that this does not throw. Before the guards in 007/035/036
    // it threw `035_pos_variant_attributes.sql: column "size" does not exist`.
    await expect(applyAll(probe)).resolves.toBeUndefined();
  });

  it('has really dropped the clothing-shaped columns', async () => {
    expect(await liveColumns(probe, 'pos_variants', ['size', 'color'])).toEqual([]);
    expect(
      await liveColumns(probe, 'pos_stock_document_lines', ['placeholder_size', 'placeholder_color'])
    ).toEqual([]);
    // What replaced them is there, so this is a drop and not a failed migration.
    expect(await liveColumns(probe, 'pos_variants', ['attributes', 'label', 'unit'])).toHaveLength(3);
  });

  it('does not resurrect them, one dead column pair per boot', async () => {
    // 007 adds the pair, 036 drops it: on a fresh database that happens exactly
    // once. `DROP COLUMN` only marks the entry `attisdropped`, so an unguarded
    // re-add would push this number up by two on every restart.
    const before = await droppedAttributeCount(probe, 'pos_stock_document_lines');
    await applyAll(probe);
    expect(await droppedAttributeCount(probe, 'pos_stock_document_lines')).toBe(before);
    expect(before).toBe(2);
  });

  it('keeps the card-keyed placeholder index (065) and neither of its two predecessors', async () => {
    // 007 → 035 → 065 each replaced the key; the two older creates are guarded
    // by their successor's marker column, so a restart does not create an old
    // index only for the next file to drop it again.
    const idx = await probe.query(
      `SELECT indexname FROM pg_indexes
        WHERE indexname IN ('idx_pos_stock_doc_lines_placeholder_uniq',
                            'idx_pos_stock_doc_lines_placeholder_attr_uniq',
                            'idx_pos_stock_doc_lines_placeholder_key_uniq')`
    );
    expect(idx.rows.map((r) => r.indexname)).toEqual(['idx_pos_stock_doc_lines_placeholder_key_uniq']);
  });

  it('comes up again with a guest order the kitchen already took (068 `sent`)', async () => {
    // 058 runs before 068 on every boot and drops + re-adds the status CHECK.
    // With 058's original list the second boot after the first auto-sent order
    // died on `check constraint "pos_guest_orders_status_check" … is violated`.
    const store = await probe.query(`INSERT INTO pos_stores (name, slug) VALUES ('Probe', 'probe-sent') RETURNING id`);
    const storeId = store.rows[0].id;
    const hall = await probe.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зал') RETURNING id`, [storeId]);
    const table = await probe.query(`INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '1') RETURNING id`, [
      storeId,
      hall.rows[0].id,
    ]);
    await probe.query(
      `INSERT INTO pos_guest_orders (store_id, table_id, client_uuid, status, expires_at)
       VALUES ($1, $2, gen_random_uuid(), 'sent', NOW() + INTERVAL '30 minutes')`,
      [storeId, table.rows[0].id]
    );
    await expect(applyAll(probe)).resolves.toBeUndefined();
  });

  it('comes up again with goods given «під запис» (073), even on a demo store it rebuilds', async () => {
    // Two ways 073 could kill the next boot. The movement reason `credit` lives
    // in 006's CHECK, which 006 drops and re-adds on every start — a list there
    // without `credit` fails once a single handover exists. And a demo
    // migration that rebuilds its catalogue deletes the variants a debt line
    // points at, so it must clear the store's debt rows first (behind a guard,
    // because on a fresh database 073 has not run yet when 039 does).
    const flowers = await probe.query(`SELECT id FROM pos_stores WHERE slug = 'demo-flowers'`);
    const storeId = flowers.rows[0].id;
    const staffId = (await probe.query(`SELECT id FROM pos_staff WHERE store_id = $1 LIMIT 1`, [storeId])).rows[0].id;
    const variant = (
      await probe.query(
        `SELECT v.id FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
          WHERE v.store_id = $1 AND p.kind = 'simple' ORDER BY v.id LIMIT 1`,
        [storeId]
      )
    ).rows[0].id;
    const customer = await probe.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, 'Боржник', '+380670000001', 100000) RETURNING id`,
      [storeId]
    );
    const customerId = customer.rows[0].id;
    const entry = await probe.query(
      `INSERT INTO pos_debt_entries (store_id, customer_id, kind, amount_cents, staff_id)
       VALUES ($1, $2, 'issue', 6000, $3) RETURNING id`,
      [storeId, customerId, staffId]
    );
    const item = await probe.query(
      `INSERT INTO pos_debt_items
         (store_id, customer_id, entry_id, variant_id, quantity, unit, product_name, variant_label,
          unit_price_cents, line_total_cents)
       VALUES ($1, $2, $3, $4, 1, 'шт', 'Троянда', '', 6000, 6000) RETURNING id`,
      [storeId, customerId, entry.rows[0].id, variant]
    );
    await probe.query(
      `INSERT INTO pos_debt_item_components (store_id, debt_item_id, component_variant_id, quantity_per_unit)
       VALUES ($1, $2, $3, 1)`,
      [storeId, item.rows[0].id, variant]
    );
    await probe.query(
      `INSERT INTO pos_debt_entry_lines (store_id, entry_id, debt_item_id, quantity, amount_cents)
       VALUES ($1, $2, $3, 1, 6000)`,
      [storeId, entry.rows[0].id, item.rows[0].id]
    );
    await probe.query(
      `INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, staff_id, reference_type, reference_id)
       VALUES ($1, $2, -1, 'credit', $3, 'debt_issue', $4)`,
      [storeId, variant, staffId, entry.rows[0].id]
    );

    // A plain restart: the `credit` movement must not trip 006's CHECK.
    await expect(applyAll(probe)).resolves.toBeUndefined();
    // A restart that rebuilds the demo: the debt goes with the catalogue, the customer stays.
    await probe.query(`DELETE FROM pos_demo_seed WHERE slug = 'demo-flowers'`);
    await expect(applyAll(probe)).resolves.toBeUndefined();
    const left = await probe.query(
      `SELECT (SELECT count(*) FROM pos_debt_entries WHERE store_id = $1)::int AS entries,
              (SELECT count(*) FROM pos_debt_items WHERE store_id = $1)::int AS items,
              (SELECT count(*) FROM pos_customers WHERE id = $2)::int AS customers`,
      [storeId, customerId]
    );
    expect(left.rows[0]).toEqual({ entries: 0, items: 0, customers: 1 });
  });

  it('switches «Шабля»’s short menu address on once (080), and an owner’s «off» survives the next boot', async () => {
    // The boot before 080: no column yet, and the store has never published its menu.
    await probe.query(`ALTER TABLE pos_stores DROP COLUMN public_menu_slug_enabled`);
    await probe.query(`INSERT INTO pos_stores (name, slug, vertical) VALUES ('Шабля', 'shablya', 'cafe')`);
    const read = async () =>
      (
        await probe.query(
          `SELECT public_menu_slug_enabled AS short, public_menu_enabled AS menu, public_menu_token AS token
             FROM pos_stores WHERE slug = 'shablya'`
        )
      ).rows[0];

    await expect(applyAll(probe)).resolves.toBeUndefined();
    const first = await read();
    expect(first).toMatchObject({ short: true, menu: true });
    expect(first.token).toMatch(/^[0-9a-f]{32}$/);
    // Nobody else was touched.
    const others = await probe.query(`SELECT count(*)::int AS n FROM pos_stores WHERE public_menu_slug_enabled`);
    expect(others.rows[0].n).toBe(1);

    await probe.query(`UPDATE pos_stores SET public_menu_slug_enabled = FALSE WHERE slug = 'shablya'`);
    await expect(applyAll(probe)).resolves.toBeUndefined();
    expect(await read()).toEqual({ short: false, menu: true, token: first.token });
  });

  it('fills «Шабля»’s email, Instagram and Google card once (082), and a field the owner cleared stays cleared', async () => {
    // The boot before 082: none of the five columns yet. The store row is the
    // one the 080 case inserted, or a fresh one on a run of this test alone.
    await probe.query(
      `ALTER TABLE pos_stores DROP COLUMN public_email, DROP COLUMN public_instagram, DROP COLUMN public_facebook,
                              DROP COLUMN public_tiktok, DROP COLUMN public_google_url`
    );
    await probe.query(
      `INSERT INTO pos_stores (name, slug, vertical) VALUES ('Шабля', 'shablya', 'cafe') ON CONFLICT (slug) DO NOTHING`
    );
    const read = async () =>
      (
        await probe.query(
          `SELECT public_email AS email, public_instagram AS instagram, public_facebook AS facebook,
                  public_tiktok AS tiktok, public_google_url AS google
             FROM pos_stores WHERE slug = 'shablya'`
        )
      ).rows[0];

    await expect(applyAll(probe)).resolves.toBeUndefined();
    expect(await read()).toEqual({
      email: 'shablya.ads@gmail.com',
      instagram: 'shablya.cafe',
      facebook: null,
      tiktok: null,
      google: 'https://share.google/49kQb5FHbjSlkT7q6',
    });
    // Nobody else was touched (the demo cafés are not in this scratch database's seed of stores).
    const others = await probe.query(
      `SELECT count(*)::int AS n FROM pos_stores WHERE public_google_url IS NOT NULL AND slug <> 'shablya'`
    );
    expect(others.rows[0].n).toBe(0);

    await probe.query(`UPDATE pos_stores SET public_instagram = NULL WHERE slug = 'shablya'`);
    await expect(applyAll(probe)).resolves.toBeUndefined();
    expect((await read()).instagram).toBeNull();
  });

  it('fills «Шабля»’s cork fee once (083), and an owner’s «off» survives the next boot', async () => {
    await probe.query(`ALTER TABLE pos_stores DROP COLUMN public_corkage`);
    await probe.query(
      `INSERT INTO pos_stores (name, slug, vertical) VALUES ('Шабля', 'shablya', 'cafe') ON CONFLICT (slug) DO NOTHING`
    );
    const read = async () =>
      (await probe.query(`SELECT public_corkage AS corkage FROM pos_stores WHERE slug = 'shablya'`)).rows[0].corkage;

    await expect(applyAll(probe)).resolves.toBeUndefined();
    const first = await read();
    expect(first).toMatchObject({ fee_cents: 10000, min_food_cents: 70000 });
    expect(first.note).toContain('корковий збір рахується автоматично');
    expect(first.note.split('\n')).toHaveLength(3);
    const others = await probe.query(`SELECT count(*)::int AS n FROM pos_stores WHERE public_corkage IS NOT NULL`);
    expect(others.rows[0].n).toBe(1);
    const column = await probe.query(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'pos_products' AND column_name = 'menu_hidden'`
    );
    expect(column.rows[0].column_default).toBe('false');

    await probe.query(`UPDATE pos_stores SET public_corkage = NULL WHERE slug = 'shablya'`);
    await expect(applyAll(probe)).resolves.toBeUndefined();
    expect(await read()).toBeNull();
  });

  it('marks «Шабля»’s «Бограч» as spicy once (086), and a label the owner took off stays off', async () => {
    await probe.query(`ALTER TABLE pos_products DROP COLUMN menu_labels`);
    await probe.query(
      `INSERT INTO pos_stores (name, slug, vertical) VALUES ('Шабля', 'shablya', 'cafe') ON CONFLICT (slug) DO NOTHING`
    );
    await probe.query(
      `INSERT INTO pos_products (store_id, name)
       SELECT id, d.name FROM pos_stores, (VALUES ('Бограч'), ('Борщ')) AS d(name) WHERE slug = 'shablya'`
    );
    const read = async () =>
      (
        await probe.query(
          `SELECT p.name, p.menu_labels AS labels FROM pos_products p JOIN pos_stores s ON s.id = p.store_id
            WHERE s.slug = 'shablya' ORDER BY p.name`
        )
      ).rows;

    await expect(applyAll(probe)).resolves.toBeUndefined();
    expect(await read()).toEqual([
      { name: 'Бограч', labels: ['spicy'] },
      { name: 'Борщ', labels: [] },
    ]);
    const column = await probe.query(
      `SELECT column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'pos_products' AND column_name = 'menu_labels'`
    );
    expect(column.rows[0]).toEqual({ column_default: "'{}'::text[]", is_nullable: 'NO' });

    await probe.query(`UPDATE pos_products SET menu_labels = '{}' WHERE name = 'Бограч'`);
    await expect(applyAll(probe)).resolves.toBeUndefined();
    expect((await read()).find((r) => r.name === 'Бограч')!.labels).toEqual([]);
  });
});

/**
 * A constraint that two files add by the same name is re-added by BOTH on every
 * boot, the earlier one first. If a later file widens it and the earlier one is
 * left alone, the earlier one narrows it back — harmless on an empty table, a
 * boot that never comes up once a row uses the new value (058/068 `sent`). So
 * every file that adds a constraint by a given name must add the same thing.
 */
describe('constraints added by more than one migration', () => {
  it('are added identically by each of them', () => {
    const statements = new Map<string, Map<string, string>>();
    for (const file of POS_MIGRATIONS) {
      const sql = readMigration(file).replace(/--[^\n]*/g, '');
      for (const match of sql.matchAll(/ADD\s+CONSTRAINT\s+(\w+)([^;]*);/gi)) {
        const name = match[1]!;
        const body = match[2]!.replace(/\s+/g, ' ').trim();
        if (!statements.has(name)) statements.set(name, new Map());
        statements.get(name)!.set(file, body);
      }
    }
    const shared = [...statements].filter(([, byFile]) => byFile.size > 1);
    expect(shared.map(([name]) => name)).toContain('pos_guest_orders_status_check');
    for (const [name, byFile] of shared) {
      expect(new Set(byFile.values()).size, `${name} in ${[...byFile.keys()].join(', ')}`).toBe(1);
    }
  });
});
