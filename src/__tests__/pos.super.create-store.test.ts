// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.super.create-store.test.ts — «Новий магазин» in the super
// admin (TechDocs/POS_ONBOARDING.md, O1): a real store for a new client, its
// owner able to log in with the password the super admin typed, configuration
// copied from a template and nothing else of it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { issueSuperToken } from '../pos/core/superAuth.js';
import {
  applyPosMigrations,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

const SUPER_PASSWORD = 'correct-horse-battery-staple';
const OWNER_PASSWORD = 'new-owner-pass-42';
const TABLES_ENTRY = {
  url: 'https://cdn.jsdelivr.net/gh/o/r@module-tables-v2.5.0/tables/remote-entry.js',
  title: 'Столи',
  routePath: '/tables',
  nav: [{ label: 'Столи', location: 'cashier-primary', order: 5 }],
};

describe.skipIf(!hasDb)('POST /api/pos/super/stores', () => {
  let app: FastifyInstance;
  let template: TestStore;
  let token = '';
  const created: number[] = [];
  const run = String(Date.now()).slice(-6);
  const slug = (s: string) => `new-${s}-${run}`;

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = SUPER_PASSWORD;
    await applyPosMigrations();
    app = await buildPosTestApp();
    template = await createTestStore('nstpl');
    await pool.query(
      `UPDATE pos_stores
          SET vertical = 'cafe', module_remotes = $1::jsonb, enabled_modules = ARRAY['products','stock']::text[],
              nav_overrides = '{"products:admin:/admin/products":{"label":"Меню"}}'::jsonb,
              public_address = 'Шаблонна, 1', public_menu_enabled = TRUE, public_menu_token = $3
        WHERE id = $2`,
      [JSON.stringify({ tables: TABLES_ENTRY }), template.storeId, `tpl-${run}`]
    );
    token = issueSuperToken()!.token;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    for (const id of created) await dropTestStore(id);
    await dropTestStore(template?.storeId);
    delete process.env.POS_SUPER_PASSWORD;
    await pool.end();
  });

  const create = (payload: Record<string, unknown>, headers: Record<string, string> = { 'x-pos-super-token': token }) =>
    app.inject({ method: 'POST', url: '/api/pos/super/stores', headers, payload });

  it('opens a store from a template: configuration copied, the client’s own things not', async () => {
    const res = await create({
      name: 'Шабля',
      slug: slug('tpl'),
      template_store_id: template.storeId,
      owner_login: 'owner@shablya.test',
      owner_password: OWNER_PASSWORD,
      owner_name: 'Тарас',
    });
    expect(res.statusCode).toBe(201);
    const store = res.json();
    created.push(store.id);
    expect(store).toMatchObject({ name: 'Шабля', slug: slug('tpl'), vertical: 'cafe', staff_count: 1 });
    expect(store.module_remotes).toEqual({ tables: TABLES_ENTRY });
    expect(JSON.stringify(res.json())).not.toContain(OWNER_PASSWORD);

    const row = (
      await pool.query(
        `SELECT enabled_modules, nav_overrides, public_address, public_menu_enabled, public_menu_token FROM pos_stores WHERE id = $1`,
        [store.id]
      )
    ).rows[0];
    expect(row.enabled_modules).toEqual(['products', 'stock']);
    expect(row.nav_overrides).toEqual({ 'products:admin:/admin/products': { label: 'Меню' } });
    // The template's public profile and QR menu are its own.
    expect(row).toMatchObject({ public_address: null, public_menu_enabled: false, public_menu_token: null });

    const staff = (await pool.query(`SELECT role, display_name, login, pin_hash FROM pos_staff WHERE store_id = $1`, [store.id])).rows;
    expect(staff).toEqual([{ role: 'owner', display_name: 'Тарас', login: 'owner@shablya.test', pin_hash: null }]);
    // A template that seats guests gives the floor plan its one empty hall.
    const halls = (await pool.query(`SELECT name FROM pos_halls WHERE store_id = $1`, [store.id])).rows;
    expect(halls).toEqual([{ name: 'Зала' }]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM pos_tables WHERE store_id = $1`, [store.id])).rows[0].n).toBe(0);
  });

  it('lets the owner log in with the password the super admin typed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/auth/owner/login',
      payload: { login: 'owner@shablya.test', password: OWNER_PASSWORD, store_slug: slug('tpl') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().staff).toMatchObject({ role: 'owner' });
  });

  it('opens a bare store without a template: defaults, no hall', async () => {
    const res = await create({ name: 'Порожній', slug: slug('bare'), owner_login: 'bare@test.shop', owner_password: OWNER_PASSWORD });
    expect(res.statusCode).toBe(201);
    created.push(res.json().id);
    expect(res.json()).toMatchObject({ vertical: 'clothing', module_remotes: {} });
    expect((await pool.query(`SELECT count(*)::int AS n FROM pos_halls WHERE store_id = $1`, [res.json().id])).rows[0].n).toBe(0);
  });

  it('lower-cases the code, so a till can type it with a PIN', async () => {
    const res = await create({ name: 'Регістр', slug: slug('UPPER').toUpperCase(), owner_login: 'up@test.shop', owner_password: OWNER_PASSWORD });
    expect(res.statusCode).toBe(201);
    created.push(res.json().id);
    expect(res.json().slug).toBe(slug('upper'));
  });

  it('refuses in words what it cannot open', async () => {
    const base = { name: 'Х', slug: slug('bad'), owner_login: 'x@test.shop', owner_password: OWNER_PASSWORD };
    const bad = async (patch: Record<string, unknown>, pattern: RegExp) => {
      const res = await create({ ...base, ...patch });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(pattern);
    };
    await bad({ name: '  ' }, /Назва магазину/);
    await bad({ slug: 'ш-абля' }, /Код магазину/);
    await bad({ slug: '-lead' }, /Код магазину/);
    await bad({ owner_login: 'two words' }, /Логін власника/);
    await bad({ owner_password: 'short' }, /щонайменше 10/);
    await bad({ template_store_id: 'x' }, /Шаблон/);
    await bad({ template_store_id: 2 ** 40 }, /Шаблон не знайдено/);
    expect((await pool.query(`SELECT count(*)::int AS n FROM pos_stores WHERE slug = $1`, [slug('bad')])).rows[0].n).toBe(0);
  });

  it('answers 409 for a code that is taken, whatever its case', async () => {
    const res = await create({ name: 'Дубль', slug: slug('tpl').toUpperCase(), owner_login: 'd@test.shop', owner_password: OWNER_PASSWORD });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/уже зайнятий/);
  });

  it('is the super admin’s alone', async () => {
    const res = await create({ name: 'Х', slug: slug('anon'), owner_login: 'a@test.shop', owner_password: OWNER_PASSWORD }, {});
    expect(res.statusCode).toBe(401);
    const forged = await create(
      { name: 'Х', slug: slug('anon'), owner_login: 'a@test.shop', owner_password: OWNER_PASSWORD },
      { 'x-pos-super-token': `${Date.now() + 60_000}.forged` }
    );
    expect(forged.statusCode).toBe(401);
  });
});
