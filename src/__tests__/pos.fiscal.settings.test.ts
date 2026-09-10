// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.settings.test.ts
//
// `GET`/`PATCH /api/pos/fiscal/settings` — the only path by which a ПРРО
// provider credential enters or leaves the database.
//
// The load-bearing assertions here are the security ones: a secret must never
// appear in a response body, must be stored as ciphertext, and must not be
// readable by a seller. See TechDocs/POS_FISCAL_PRRO.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { getFiscalCredentials } from '../pos/fiscal/settings.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

const LICENCE = 'lic-secret-do-not-leak-9f3a';
const PIN = '778899';

describe.skipIf(!hasDb)('POS fiscal settings', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfiscal');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  const get = () =>
    app.inject({ method: 'GET', url: '/api/pos/fiscal/settings', headers: auth(store.ownerToken) });

  const patch = (payload: unknown, token = store.ownerToken) =>
    app.inject({
      method: 'PATCH',
      url: '/api/pos/fiscal/settings',
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });

  // ── Access ────────────────────────────────────────────────────────────────

  it('is owner-only', async () => {
    expect((await patch({ enabled: false }, store.sellerToken)).statusCode).toBe(403);
    const sellerGet = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.sellerToken),
    });
    expect(sellerGet.statusCode).toBe(403);
  });

  it('needs a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/fiscal/settings' });
    expect(res.statusCode).toBe(401);
  });

  // ── Defaults ──────────────────────────────────────────────────────────────

  it('reports safe defaults for a store that never configured ПРРО', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      enabled: false,
      provider: null,
      secrets_set: [],
      fail_mode: 'block',
      receipt_source: 'local',
      receipt_width: 32,
      auto_open_shift: true,
      secrets_key_configured: true,
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('refuses an unknown provider', async () => {
    const res = await patch({ provider: 'not-a-provider' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Unknown fiscal provider/);
  });

  it('refuses enabling without a provider', async () => {
    const res = await patch({ enabled: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/provider must be selected/i);
  });

  it('refuses a malformed default_tax_code', async () => {
    expect((await patch({ default_tax_code: 'has space' })).statusCode).toBe(400);
    expect((await patch({ default_tax_code: 'x'.repeat(20) })).statusCode).toBe(400);
  });

  it('refuses credentials before a provider is chosen', async () => {
    const res = await patch({ secrets: { licenceKey: LICENCE } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/provider must be selected/i);
  });

  it('refuses a secrets key that is not an identifier', async () => {
    const res = await patch({ provider: 'checkbox', secrets: { 'bad key!': 'x' } });
    expect(res.statusCode).toBe(400);
  });

  // ── Storing credentials ───────────────────────────────────────────────────

  it('stores credentials without ever echoing them', async () => {
    const res = await patch({
      enabled: true,
      provider: 'checkbox',
      default_tax_code: 'A',
      secrets: { licenceKey: LICENCE, cashierPin: PIN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      enabled: true,
      provider: 'checkbox',
      default_tax_code: 'A',
      secrets_set: ['cashierPin', 'licenceKey'],
    });
    // The whole body, not just the fields we thought to check.
    expect(res.body).not.toContain(LICENCE);
    expect(res.body).not.toContain(PIN);

    const readBack = await get();
    expect(readBack.body).not.toContain(LICENCE);
    expect(readBack.json().secrets_set).toEqual(['cashierPin', 'licenceKey']);
  });

  it('writes ciphertext to the column, not the credential', async () => {
    const row = await pool.query(
      `SELECT secrets_encrypted, secrets_key_version FROM pos_fiscal_settings WHERE store_id = $1`,
      [store.storeId]
    );
    const blob = row.rows[0].secrets_encrypted as Buffer;
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(blob.toString('binary')).not.toContain(LICENCE);
    expect(blob.toString('binary')).not.toContain('licenceKey');
    expect(Number(row.rows[0].secrets_key_version)).toBe(1);
  });

  it('hands the decrypted bag to the backend only', async () => {
    const creds = await getFiscalCredentials(store.storeId);
    expect(creds).toMatchObject({
      provider: 'checkbox',
      secrets: { licenceKey: LICENCE, cashierPin: PIN },
    });
  });

  // ── Patch semantics ───────────────────────────────────────────────────────

  it('treats an empty string as "leave it alone"', async () => {
    // The settings form round-trips blank password inputs; treating that as a
    // clear would wipe a working licence key on every unrelated edit.
    const res = await patch({ secrets: { licenceKey: '' }, default_tax_code: 'B' });
    expect(res.statusCode).toBe(200);
    expect(res.json().secrets_set).toEqual(['cashierPin', 'licenceKey']);
    expect(res.json().default_tax_code).toBe('B');
    expect((await getFiscalCredentials(store.storeId))?.secrets.licenceKey).toBe(LICENCE);
  });

  it('clears one credential on explicit null and keeps the rest', async () => {
    const res = await patch({ secrets: { cashierPin: null } });
    expect(res.json().secrets_set).toEqual(['licenceKey']);
    const creds = await getFiscalCredentials(store.storeId);
    expect(creds?.secrets).toEqual({ licenceKey: LICENCE });
  });

  it('leaves untouched fields alone', async () => {
    const res = await patch({ auto_open_shift: false });
    expect(res.json()).toMatchObject({
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: false,
      default_tax_code: 'B',
      secrets_set: ['licenceKey'],
    });
  });

  it('round-trips the receipt source and width', async () => {
    const res = await patch({ receipt_source: 'provider', receipt_width: 48 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ receipt_source: 'provider', receipt_width: 48 });
    expect((await get()).json()).toMatchObject({ receipt_source: 'provider', receipt_width: 48 });

    // And back, independently of each other.
    expect((await patch({ receipt_source: 'local' })).json()).toMatchObject({
      receipt_source: 'local',
      receipt_width: 48,
    });
  });

  it('refuses a receipt width the thermal rolls cannot print', async () => {
    const res = await patch({ receipt_width: 40 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/receipt_width/);
  });

  it('stores provider config as given', async () => {
    const res = await patch({ config: { cashRegisterKey: 'REG-1', baseUrl: 'https://x.test' } });
    expect(res.json().config).toEqual({ cashRegisterKey: 'REG-1', baseUrl: 'https://x.test' });
  });

  it('drops credentials when the provider changes', async () => {
    // A Checkbox licence key means nothing to Вчасно, and the AAD binds the
    // envelope to the provider it was written for — carrying it would not
    // decrypt anyway.
    const res = await patch({ provider: 'vchasno' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ provider: 'vchasno', secrets_set: [] });

    const row = await pool.query(
      `SELECT secrets_encrypted FROM pos_fiscal_settings WHERE store_id = $1`,
      [store.storeId]
    );
    expect(row.rows[0].secrets_encrypted).toBeNull();
  });

  it('reports no credentials when fiscalisation is off', async () => {
    await patch({ enabled: false });
    expect(await getFiscalCredentials(store.storeId)).toBeNull();
  });

  // ── Offline mode (TechDocs/POS_FISCAL_OFFLINE.md §2) ──────────────────────

  it('defaults offline_mode off and reports offline_capable per provider', async () => {
    await patch({ provider: 'checkbox', enabled: false });
    const res = await get();
    expect(res.json()).toMatchObject({
      offline_mode: false,
      offline_codes_target: 200,
      offline_capable: true, // the Checkbox adapter declares `offline`
    });
    await patch({ provider: 'vchasno' });
    expect((await get()).json().offline_capable).toBe(false);
  });

  it('refuses offline_mode for a provider without the capability, and before enabling', async () => {
    await patch({ provider: 'vchasno' });
    const noCap = await patch({ offline_mode: true });
    expect(noCap.statusCode).toBe(400);
    expect(noCap.json().error).toMatch(/офлайн/i);

    await patch({ provider: 'checkbox', enabled: false, secrets: { licenceKey: LICENCE } });
    const notEnabled = await patch({ offline_mode: true });
    expect(notEnabled.statusCode).toBe(400);

    const ok = await patch({ enabled: true, offline_mode: true, offline_codes_target: 300 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ offline_mode: true, offline_codes_target: 300 });
  });

  it('bounds offline_codes_target and drops offline_mode on a provider switch', async () => {
    await patch({ provider: 'checkbox', enabled: true, secrets: { licenceKey: LICENCE }, offline_mode: true });
    expect((await patch({ offline_codes_target: 10 })).statusCode).toBe(400);
    expect((await patch({ offline_codes_target: 5000 })).statusCode).toBe(400);
    expect((await patch({ offline_codes_target: 2.5 })).statusCode).toBe(400);
    expect((await patch({ offline_mode: 'yes' })).statusCode).toBe(400);

    const switched = await patch({ provider: 'vchasno' });
    expect(switched.statusCode).toBe(200);
    expect(switched.json()).toMatchObject({ offline_mode: false, offline_capable: false });
  });

  it('refuses to switch offline_mode off while an offline session is live', async () => {
    await patch({ provider: 'checkbox', enabled: true, secrets: { licenceKey: LICENCE }, offline_mode: true });
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions (store_id, holder, started_at, status)
       VALUES ($1, 'server', NOW(), 'replaying')`,
      [store.storeId]
    );
    try {
      const res = await patch({ offline_mode: false });
      expect(res.statusCode).toBe(400);
      expect((await get()).json().offline_mode).toBe(true);
    } finally {
      await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
    }
    expect((await patch({ offline_mode: false })).statusCode).toBe(200);
  });

  it('carries offline_mode in the auth response next to the provider', async () => {
    await patch({ provider: 'checkbox', enabled: true, secrets: { licenceKey: LICENCE }, offline_mode: true });
    const me = await app.inject({ method: 'GET', url: '/api/pos/me', headers: auth(store.sellerToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json().store.fiscal).toMatchObject({ enabled: true, provider: 'checkbox', offline_mode: true });
    await patch({ offline_mode: false });
  });

  // ── Missing encryption key ────────────────────────────────────────────────

  it('answers 503 rather than storing a credential in plaintext', async () => {
    const key = process.env.POS_SECRETS_KEY;
    delete process.env.POS_SECRETS_KEY;
    try {
      const res = await patch({ provider: 'checkbox', secrets: { licenceKey: LICENCE } });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe('secrets_key_missing');

      // Non-secret fields still fail closed on the read side's flag, but do
      // not require the key.
      const readBack = await get();
      expect(readBack.json().secrets_key_configured).toBe(false);
    } finally {
      process.env.POS_SECRETS_KEY = key;
    }
  });

  // ── Auth response ─────────────────────────────────────────────────────────

  it('carries fiscal state in the auth response so the cashier can block offline', async () => {
    await patch({ enabled: true, provider: 'checkbox' });
    const me = await app.inject({
      method: 'GET',
      url: '/api/pos/me',
      headers: auth(store.sellerToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().store.fiscal).toEqual({ enabled: true, provider: 'checkbox', offline_mode: false });
  });

  it('reports fiscal off for a store with no settings row', async () => {
    const other = await createTestStore('rfiscal2');
    try {
      const me = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: auth(other.sellerToken),
      });
      expect(me.json().store.fiscal).toEqual({ enabled: false, provider: null, offline_mode: false });
    } finally {
      await dropTestStore(other.storeId);
    }
  });
});
