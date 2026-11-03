// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.registers.test.ts
//
// A second ПРРО register in one store (ДК1, TechDocs/POS_DUAL_REGISTER.md §4.1):
// «Шабля» sells food through one ФОП's Cashalot and alcohol through another's.
//
// Two fakes stand behind one provider id, picked by the licence the call
// carries — so each register really has its own shift and its own documents,
// the way two Cashalot accounts would. The property under test throughout: a
// register's shift, cache, credentials and documents are its own, and a store
// with one register sees exactly what it saw before.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { getAuthByToken } from '../pos/core/auth.js';
import { decryptSecrets, generateSecretsKey } from '../pos/core/secrets.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import {
  parseRegisterNo,
  registerKeyOf,
  registerNoOfKey,
  secretsScope,
} from '../pos/fiscal/registers.js';
import { getCachedShift, resetRuntime } from '../pos/fiscal/runtime.js';
import {
  FiscalSettingsValidationError,
  getFiscalSettings,
  updateFiscalSettings,
  updateRegisterSettings,
} from '../pos/fiscal/settings.service.js';
import * as shifts from '../pos/fiscal/shifts.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';
import { BAR_LICENCE, FOOD_LICENCE, splitProvider } from './helpers/split-fiscal-provider.js';

const signal = () => AbortSignal.timeout(10_000);

const FOOD = FOOD_LICENCE;
const BAR = BAR_LICENCE;

describe.skipIf(!hasDb)('POS fiscal: a second register (ДК1)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let food: FakeFiscalProvider;
  let bar: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rdual');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    food = new FakeFiscalProvider({ id: 'cashalot' });
    bar = new FakeFiscalProvider({ id: 'cashalot' });
    registerProvider(splitProvider(food, bar));
    resetRuntime();
    // The limiter is process-wide and keyed per register: documents of the
    // tests before would otherwise eat this test's budget.
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_registers WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'cashalot',
      auto_open_shift: true,
      secrets: { licenceKey: FOOD, cashierPin: '0000' },
    });
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const enableBar = (patch: Record<string, unknown> = {}) =>
    updateRegisterSettings(store.storeId, 2, {
      enabled: true,
      label: 'Бар · ФОП Петренко',
      secrets: { licenceKey: BAR, cashierPin: '1111' },
      ...patch,
    });

  const liveShifts = async () =>
    (
      await pool.query(
        `SELECT cash_register_key, status FROM pos_fiscal_shifts
         WHERE store_id = $1 AND status IN ('opening','open','closing')
         ORDER BY cash_register_key`,
        [store.storeId]
      )
    ).rows;

  // ── The key ↔ number mapping ──────────────────────────────────────────────

  it('maps register numbers to shift keys and back', () => {
    expect(registerKeyOf(1, {})).toBe('');
    expect(registerKeyOf(1, { cashRegisterKey: ' abc ' })).toBe('abc');
    expect(registerKeyOf(2, { cashRegisterKey: 'abc' })).toBe('r2');
    expect(registerNoOfKey('')).toBe(1);
    expect(registerNoOfKey('abc')).toBe(1);
    expect(registerNoOfKey('r2')).toBe(2);
    expect(parseRegisterNo(undefined)).toBe(1);
    expect(parseRegisterNo('2')).toBe(2);
    expect(parseRegisterNo('3')).toBeNull();
    expect(parseRegisterNo('x')).toBeNull();
    expect(secretsScope('cashalot', 1)).toBe('cashalot');
    expect(secretsScope('cashalot', 2)).toBe('cashalot:r2');
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  it('switches register 2 on only beside a Cashalot register 1', async () => {
    await updateFiscalSettings(store.storeId, { provider: 'checkbox' });
    await expect(enableBar()).rejects.toBeInstanceOf(FiscalSettingsValidationError);

    await updateFiscalSettings(store.storeId, {
      provider: 'cashalot',
      secrets: { licenceKey: FOOD, cashierPin: '0000' },
    });
    const saved = await enableBar();
    expect(saved).toMatchObject({ register_no: 2, enabled: true, provider: 'cashalot' });
  });

  it('serves register 2 settings over the route without its secrets', async () => {
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.ownerToken),
      payload: {
        register: 2,
        enabled: true,
        label: 'Бар',
        secrets: { licenceKey: BAR, cashierPin: '1111' },
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      register_no: 2,
      label: 'Бар',
      enabled: true,
      offline_mode: false,
      secrets_set: ['cashierPin', 'licenceKey'],
    });
    expect(JSON.stringify(patched.json())).not.toContain(BAR);

    const main = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings',
      headers: auth(store.ownerToken),
    });
    expect(main.json().extra_registers).toEqual([
      { register_no: 2, label: 'Бар', enabled: true, provider: 'cashalot', configured: true },
    ]);

    const bad = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/settings?register=3',
      headers: auth(store.ownerToken),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('binds register 2 credentials to register 2', async () => {
    await enableBar();
    const row = await getFiscalSettings(store.storeId, 2);
    const envelope = row?.secrets_encrypted as Buffer;
    expect(decryptSecrets(store.storeId, 'cashalot:r2', envelope)).toMatchObject({
      licenceKey: BAR,
    });
    // Read as register 1's — the AAD differs, so it does not open at all.
    expect(() => decryptSecrets(store.storeId, 'cashalot', envelope)).toThrow();
  });

  it('keeps register 1 on Cashalot, online and on while register 2 works', async () => {
    await enableBar();
    await expect(updateFiscalSettings(store.storeId, { provider: 'checkbox' })).rejects.toThrow(
      /друга каса/i
    );
    await expect(updateFiscalSettings(store.storeId, { enabled: false })).rejects.toThrow(
      /друга каса/i
    );
    await expect(
      updateFiscalSettings(store.storeId, { config: { cashRegisterKey: 'r2' } })
    ).rejects.toThrow(/зарезервовано/);
  });

  it('refuses to switch register 2 off with its shift open', async () => {
    await enableBar();
    const ctx = await shifts.resolveContext(store.storeId, 2);
    await shifts.openShift(ctx!, signal(), store.sellerId);
    await expect(updateRegisterSettings(store.storeId, 2, { enabled: false })).rejects.toThrow(
      /відкрита зміна/
    );
  });

  // ── Shifts ────────────────────────────────────────────────────────────────

  it('opens register 2 shift without touching register 1', async () => {
    await enableBar();
    const opened = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/shift/open',
      headers: auth(store.sellerToken),
      payload: { register: 2 },
    });
    expect(opened.statusCode).toBe(200);
    expect(bar.shift?.status).toBe('open');
    expect(food.shift).toBeNull();
    expect(await liveShifts()).toEqual([{ cash_register_key: 'r2', status: 'open' }]);

    // The cache is per register too.
    expect(getCachedShift({ storeId: store.storeId, registerNo: 2 })?.status).toBe('open');
    expect(getCachedShift(store.storeId)).toBeNull();

    const status = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/status',
      headers: auth(store.sellerToken),
    });
    expect(status.json().shift).toBeNull();
    expect(status.json().registers).toEqual([
      expect.objectContaining({
        register_no: 2,
        label: 'Бар · ФОП Петренко',
        shift: expect.objectContaining({ status: 'open' }),
      }),
    ]);
  });

  it('runs two shifts at once and auto-closes each through its own register', async () => {
    await enableBar();
    await shifts.openShift((await shifts.resolveContext(store.storeId))!, signal(), store.sellerId);
    await shifts.openShift(
      (await shifts.resolveContext(store.storeId, 2))!,
      signal(),
      store.sellerId
    );
    expect(await liveShifts()).toEqual([
      { cash_register_key: '', status: 'open' },
      { cash_register_key: 'r2', status: 'open' },
    ]);

    await pool.query(
      `UPDATE pos_fiscal_shifts SET auto_close_due_at = NOW() - INTERVAL '1 minute'
       WHERE store_id = $1 AND status = 'open'`,
      [store.storeId]
    );
    const result = await shifts.closeDueShifts({ storeId: store.storeId });
    expect(result).toEqual({ closed: 2, failed: 0 });
    expect(food.calls.filter((c) => c.method === 'closeShift')).toHaveLength(1);
    expect(bar.calls.filter((c) => c.method === 'closeShift')).toHaveLength(1);
    expect(await liveShifts()).toEqual([]);
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  it('files a service receipt of register 2 under register 2', async () => {
    await enableBar();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/service',
      headers: auth(store.sellerToken),
      payload: { register: 2, amount_cents: 50_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(bar.calls.some((c) => c.method === 'registerService')).toBe(true);
    expect(food.calls.some((c) => c.method === 'registerService')).toBe(false);
    const rows = (
      await pool.query(`SELECT register_no, status FROM pos_fiscal_receipts WHERE store_id = $1`, [
        store.storeId,
      ])
    ).rows;
    expect(rows).toEqual([{ register_no: 2, status: 'done' }]);
  });

  it('lists one register’s stuck documents when asked, and every register’s otherwise (ДК3)', async () => {
    await enableBar();
    for (const registerNo of [1, 2]) {
      await pool.query(
        `INSERT INTO pos_fiscal_receipts
           (store_id, doc_type, provider, status, provider_request_id, total_cents, register_no)
         VALUES ($1, 'service_in', 'cashalot', 'abandoned', gen_random_uuid(), $2, $3)`,
        [store.storeId, registerNo * 100, registerNo]
      );
    }
    const list = async (query: string) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/fiscal/attention${query}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      return res.json() as { documents: Array<{ register_no: number }>; sessions: unknown[] };
    };
    expect((await list('')).documents.map((d) => d.register_no).sort()).toEqual([1, 2]);
    expect((await list('?register=2')).documents.map((d) => d.register_no)).toEqual([2]);
    expect((await list('?register=2')).sessions).toEqual([]);
    expect((await list('?register=1')).documents.map((d) => d.register_no)).toEqual([1]);
    const bad = await app.inject({
      method: 'GET',
      url: '/api/pos/fiscal/attention?register=7',
      headers: auth(store.ownerToken),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('retries a register 2 document through register 2', async () => {
    await enableBar();
    // Open the shift first, so the queued failure hits the document itself.
    await shifts.openShift(
      (await shifts.resolveContext(store.storeId, 2))!,
      signal(),
      store.sellerId
    );
    bar.queueError('unavailable', 'fake outage', { transmitted: true });
    await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/service',
      headers: auth(store.sellerToken),
      payload: { register: 2, amount_cents: 20_000 },
    });
    const parked = (
      await pool.query(
        `SELECT id, register_no, status FROM pos_fiscal_receipts WHERE store_id = $1`,
        [store.storeId]
      )
    ).rows;
    expect(parked).toEqual([expect.objectContaining({ register_no: 2, status: 'failed' })]);

    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = $1`,
      [parked[0].id]
    );
    const servicesBefore = food.calls.filter((c) => c.method === 'registerService').length;
    await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });

    const after = (
      await pool.query(`SELECT status FROM pos_fiscal_receipts WHERE id = $1`, [parked[0].id])
    ).rows[0];
    expect(after.status).toBe('done');
    expect(food.calls.filter((c) => c.method === 'registerService')).toHaveLength(servicesBefore);
  });

  it('returns a register 1 sale through register 1 with register 2 switched on', async () => {
    await enableBar();
    const product = await seedProduct(store.storeId, { priceCents: 10_000, quantity: 5 });
    const sold = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10_000 }],
      },
    });
    expect(sold.statusCode).toBe(201);
    const saleId = sold.json().id;
    expect(await fiscalService.registerOfSale(saleId)).toBe(1);

    const refunded = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${saleId}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: sold.json().items[0].id, quantity: 1 }], method: 'cash' },
    });
    expect(refunded.statusCode).toBe(200);
    expect(refunded.json().refund_fiscal).toMatchObject({ status: 'done' });
    expect(food.calls.some((c) => c.method === 'registerRefund')).toBe(true);
    expect(bar.calls.some((c) => c.method === 'registerRefund')).toBe(false);
    const registers = (
      await pool.query(
        `SELECT doc_type, register_no FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`,
        [store.storeId]
      )
    ).rows;
    expect(registers).toEqual([
      { doc_type: 'sale', register_no: 1 },
      { doc_type: 'refund', register_no: 1 },
    ]);
  });

  // ── The login ─────────────────────────────────────────────────────────────

  it('carries a switched-on register 2 with the login, and nothing otherwise', async () => {
    const before = await getAuthByToken(store.sellerToken);
    expect(before?.fiscal).not.toHaveProperty('registers');

    await enableBar({ default_tax_code: '4' });
    const after = await getAuthByToken(store.sellerToken);
    expect(after?.fiscal.registers).toEqual([
      {
        register_no: 2,
        label: 'Бар · ФОП Петренко',
        register_fiscal_number: null,
        default_tax_code: '4',
        requisites: null,
      },
    ]);

    await updateRegisterSettings(store.storeId, 2, { enabled: false });
    expect((await getAuthByToken(store.sellerToken))?.fiscal).not.toHaveProperty('registers');
  });
});
