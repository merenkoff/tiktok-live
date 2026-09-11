// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.shifts.test.ts
//
// ПРРО shift lifecycle, driven end to end against a fake provider — no account
// with a real provider needed, which is the whole point of the adapter seam.
//
// The property under test throughout: **the provider owns the shift, our
// `pos_fiscal_shifts` row is a mirror.** Every case here is a way that mirror
// could drift — a concurrent second till, a shift closed behind our back, a
// process restart, an expired session.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime, SHIFT_TTL_MS } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as shifts from '../pos/fiscal/shifts.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

const signal = () => AbortSignal.timeout(10_000);

describe.skipIf(!hasDb)('POS fiscal shifts', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rshift');
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
    fake = new FakeFiscalProvider();
    registerProvider(fake);
    resetRuntime();
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const ctx = async () => {
    const resolved = await shifts.resolveContext(store.storeId);
    if (!resolved) throw new Error('expected a fiscal context');
    return resolved;
  };

  const liveRows = async () =>
    (
      await pool.query(
        `SELECT * FROM pos_fiscal_shifts
         WHERE store_id = $1 AND status IN ('opening','open','closing')
         ORDER BY id`,
        [store.storeId]
      )
    ).rows;

  // ── Context resolution ────────────────────────────────────────────────────

  it('returns no context for a store that does not fiscalise', async () => {
    await updateFiscalSettings(store.storeId, { enabled: false });
    expect(await shifts.resolveContext(store.storeId)).toBeNull();
  });

  it('throws not_configured when no adapter exists for the chosen provider', async () => {
    // Loud, rather than falling through to an un-fiscalised sale. vchasno has
    // no adapter yet — checkbox itself is always built in now.
    await updateFiscalSettings(store.storeId, { provider: 'vchasno' });
    await expect(shifts.resolveContext(store.storeId)).rejects.toMatchObject({
      kind: 'not_configured',
    });
  });

  // ── Opening ───────────────────────────────────────────────────────────────

  it('auto-opens a shift and mirrors it', async () => {
    const state = await shifts.ensureOpenShift(await ctx(), signal(), store.sellerId);
    expect(state.status).toBe('open');

    const rows = await liveRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'open',
      provider_shift_id: state.providerShiftId,
      opened_by_staff_id: String(store.sellerId),
    });
    expect(rows[0].auto_close_due_at).toBeTruthy();
  });

  it('passes the 23h30m deadline to the provider', async () => {
    // Checkbox closes the shift itself at auto_close_at; our cron is the
    // backstop for providers that will not.
    const before = Date.now();
    const state = await shifts.openShift(await ctx(), signal());
    const due = new Date(state.autoCloseAt as string).getTime();
    const elapsed = due - before;
    expect(elapsed).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(elapsed).toBeLessThanOrEqual(shifts.SHIFT_MAX_AGE_MS + 5000);
  });

  it('refuses to auto-open when the store turned that off', async () => {
    await updateFiscalSettings(store.storeId, { auto_open_shift: false });
    await expect(shifts.ensureOpenShift(await ctx(), signal())).rejects.toMatchObject({
      kind: 'shift_closed',
    });
    expect(fake.calls.some((c) => c.method === 'openShift')).toBe(false);
  });

  it('keeps exactly one live mirror row when two tills reconcile at once', async () => {
    // The partial unique index is what makes the second writer update the
    // first one's row instead of failing.
    const c = await ctx();
    await shifts.openShift(c, signal(), store.sellerId);
    resetRuntime();
    await shifts.openShift(c, signal(), store.ownerId);

    const rows = await liveRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].provider_shift_id).toBe(fake.shift?.providerShiftId);
  });

  // ── Caching ───────────────────────────────────────────────────────────────

  it('does not ask the provider again inside the TTL', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    const callsAfterOpen = fake.calls.filter((x) => x.method === 'getShift').length;

    await shifts.ensureOpenShift(c, signal());
    await shifts.ensureOpenShift(c, signal());
    expect(fake.calls.filter((x) => x.method === 'getShift').length).toBe(callsAfterOpen);
    // A pre-flight per sale must not cost a round trip, nor half the
    // 2-receipts/sec budget.
    expect(SHIFT_TTL_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('signs in once and reuses the session', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await shifts.getShiftState(c, signal(), { force: true });
    expect(fake.signInCount).toBe(1);
  });

  it('rebuilds from the provider after a process restart', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    const providerShift = fake.shift;

    resetRuntime(); // as if the process had restarted
    const state = await shifts.getShiftState(c, signal());
    expect(state?.providerShiftId).toBe(providerShift?.providerShiftId);
    expect(fake.signInCount).toBe(2);
  });

  it('re-signs-in after auth_expired and drops the cached session', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    expect(fake.signInCount).toBe(1);

    fake.queueError('auth_expired');
    await expect(shifts.getShiftState(c, signal(), { force: true })).rejects.toMatchObject({
      kind: 'auth_expired',
    });
    // The cached session was the thing that turned out to be wrong.
    await shifts.getShiftState(c, signal(), { force: true });
    expect(fake.signInCount).toBe(2);
  });

  it('drops the cached session when settings are written', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await updateFiscalSettings(store.storeId, { default_tax_code: 'A' });
    // Otherwise a token minted for the old provider/credentials would be
    // reused against the new ones.
    await shifts.getShiftState(await ctx(), signal(), { force: true });
    expect(fake.signInCount).toBe(2);
  });

  // ── Closing ───────────────────────────────────────────────────────────────

  it('closes a shift, persists the Z-report and clears the mirror', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    const closed = await shifts.closeShift(c, signal());

    expect(closed.status).toBe('closed');
    expect(closed.zReportText).toBe('FAKE Z-REPORT');
    expect(await liveRows()).toHaveLength(0);

    const row = (
      await pool.query(
        `SELECT * FROM pos_fiscal_shifts WHERE store_id = $1 ORDER BY id DESC LIMIT 1`,
        [store.storeId]
      )
    ).rows[0];
    expect(row.status).toBe('closed');
    expect(row.z_report_text).toBe('FAKE Z-REPORT');
    expect(row.z_report).toEqual({ total: 0, receipts: 0 });
    expect(row.closed_at).toBeTruthy();
  });

  it('reconciles a ghost row when the provider says there is no shift', async () => {
    // Our mirror can outlive the provider's shift — someone closed it in the
    // provider's own web cabinet. Leaving the row live would make the cron
    // retry it forever.
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    fake.shift = null;
    resetRuntime();

    await expect(shifts.closeShift(c, signal())).rejects.toMatchObject({
      kind: 'shift_closed',
    });
    expect(await liveRows()).toHaveLength(0);
  });

  // ── Auto-close cron ───────────────────────────────────────────────────────

  it('closes a shift past its deadline in one tick', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await pool.query(
      `UPDATE pos_fiscal_shifts SET auto_close_due_at = NOW() - interval '1 minute'
       WHERE store_id = $1 AND status = 'open'`,
      [store.storeId]
    );

    const result = await shifts.closeDueShifts({ storeId: store.storeId });
    expect(result).toMatchObject({ closed: 1, failed: 0 });
    expect(await liveRows()).toHaveLength(0);
    expect(fake.calls.some((x) => x.method === 'closeShift')).toBe(true);
  });

  it('leaves an overdue shift alone while an offline session is live (§6 of the offline design)', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await pool.query(
      `UPDATE pos_fiscal_shifts SET auto_close_due_at = NOW() - interval '1 minute'
       WHERE store_id = $1 AND status = 'open'`,
      [store.storeId]
    );
    await pool.query(
      `INSERT INTO pos_fiscal_offline_sessions (store_id, cash_register_key, holder, started_at, status)
       VALUES ($1, '', 'server', NOW(), 'open')`,
      [store.storeId]
    );
    try {
      expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 0, failed: 0 });
      expect(await liveRows()).toHaveLength(1);
      expect(fake.calls.some((x) => x.method === 'closeShift')).toBe(false);

      await pool.query(
        `UPDATE pos_fiscal_offline_sessions SET status = 'closed', ended_at = NOW() WHERE store_id = $1`,
        [store.storeId]
      );
      expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 1 });
    } finally {
      await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
    }
  });

  it('leaves a shift alone before its deadline', async () => {
    await shifts.ensureOpenShift(await ctx(), signal());
    expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 0, failed: 0 });
    expect(await liveRows()).toHaveLength(1);
  });

  it('returns a transiently failed shift to open so the next tick retries', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await pool.query(
      `UPDATE pos_fiscal_shifts SET auto_close_due_at = NOW() - interval '1 minute'
       WHERE store_id = $1 AND status = 'open'`,
      [store.storeId]
    );

    fake.queueError('unavailable');
    expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 0, failed: 1 });

    const rows = await liveRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('open');
    expect(rows[0].error_code).toBe('unavailable');

    // Next tick succeeds.
    expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 1 });
  });

  it('parks a shift in error when the cause cannot resolve itself', async () => {
    // Retrying `auth_rejected` every five minutes forever helps nobody; the
    // owner has to fix the credentials.
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await pool.query(
      `UPDATE pos_fiscal_shifts SET auto_close_due_at = NOW() - interval '1 minute'
       WHERE store_id = $1 AND status = 'open'`,
      [store.storeId]
    );

    fake.signInError = 'auth_rejected';
    resetRuntime();
    expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 0, failed: 1 });

    const row = (
      await pool.query(
        `SELECT * FROM pos_fiscal_shifts WHERE store_id = $1 ORDER BY id DESC LIMIT 1`,
        [store.storeId]
      )
    ).rows[0];
    expect(row.status).toBe('error');
    expect(row.error_code).toBe('auth_rejected');
  });

  it('parks a shift left behind when fiscalisation was switched off', async () => {
    const c = await ctx();
    await shifts.ensureOpenShift(c, signal());
    await pool.query(
      `UPDATE pos_fiscal_shifts SET auto_close_due_at = NOW() - interval '1 minute'
       WHERE store_id = $1 AND status = 'open'`,
      [store.storeId]
    );
    await updateFiscalSettings(store.storeId, { enabled: false });

    expect(await shifts.closeDueShifts({ storeId: store.storeId })).toMatchObject({ closed: 0, failed: 1 });
    const row = (
      await pool.query(
        `SELECT status, error_code FROM pos_fiscal_shifts WHERE store_id = $1 ORDER BY id DESC LIMIT 1`,
        [store.storeId]
      )
    ).rows[0];
    expect(row.status).toBe('error');
    expect(row.error_code).toBe('not_configured');
  });

  // ── Routes ────────────────────────────────────────────────────────────────

  describe('routes', () => {
    const post = (url: string, token = store.sellerToken) =>
      app.inject({ method: 'POST', url, headers: auth(token) });

    it('reports status to any staff member', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/fiscal/status',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        enabled: true,
        provider: 'checkbox',
        configured: true,
        shift: null,
        error: null,
      });
    });

    it('opens and closes the shift over HTTP', async () => {
      const opened = await post('/api/pos/fiscal/shift/open');
      expect(opened.statusCode).toBe(200);
      expect(opened.json().shift.status).toBe('open');

      const status = await app.inject({
        method: 'GET',
        url: '/api/pos/fiscal/status',
        headers: auth(store.sellerToken),
      });
      expect(status.json().shift).toMatchObject({ status: 'open' });

      const closed = await post('/api/pos/fiscal/shift/close');
      expect(closed.statusCode).toBe(200);
      expect(closed.json().z_report_text).toBe('FAKE Z-REPORT');
    });

    it('returns the X-report', async () => {
      await post('/api/pos/fiscal/shift/open');
      const res = await post('/api/pos/fiscal/x-report');
      expect(res.statusCode).toBe(200);
      expect(res.json().text).toBe('FAKE X-REPORT');
    });

    it('answers 502 with a support code when the provider is unreachable', async () => {
      fake.queueError('unavailable');
      const res = await post('/api/pos/fiscal/shift/open');
      expect(res.statusCode).toBe(502);
      expect(res.json()).toMatchObject({
        error: 'unavailable',
        support_code: 'FS-UNAVAILABLE',
      });
      // The cashier-facing message says what to do, not what broke.
      expect(res.json().message).toContain('спробуйте ще раз');
    });

    it('answers 409 when the store does not fiscalise', async () => {
      await updateFiscalSettings(store.storeId, { enabled: false });
      const res = await post('/api/pos/fiscal/shift/open');
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('not_configured');
    });

    it('reports an unreachable provider as a status, not a failed request', async () => {
      fake.queueError('unavailable');
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/fiscal/status',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().error).toMatchObject({ code: 'unavailable' });
    });

    it('needs a session', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/pos/fiscal/shift/open' });
      expect(res.statusCode).toBe(401);
    });
  });
});
