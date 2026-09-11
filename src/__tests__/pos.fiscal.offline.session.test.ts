// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.offline.session.test.ts
//
// The offline session (`src/pos/fiscal/offline/session.ts`) and the ledger's
// offline columns — phase 2, step 1. What is pinned: one live session per
// register no matter how many checkouts race to open it; a dense, monotonic
// `offline_seq` under concurrency; codes taken atomically with the stamp (a
// lost race or an empty pool leaves nothing half-done); and the flat retry
// pass and the stale-doc sweep both leaving offline documents alone.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import * as ledger from '../pos/fiscal/ledger.js';
import * as offlinePool from '../pos/fiscal/offline/pool.js';
import * as session from '../pos/fiscal/offline/session.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import { resolveContext, type FiscalContext } from '../pos/fiscal/shifts.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

describe.skipIf(!hasDb)('POS fiscal offline session', () => {
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;
  let shiftId: number;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfsess');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    fake = new FakeFiscalProvider({ offline: true, shiftOpen: true });
    registerProvider(fake);
    resetRuntime();
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_offline_codes WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      offline_mode: true,
      offline_codes_target: 60,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    const shift = await pool.query(
      `INSERT INTO pos_fiscal_shifts (store_id, provider, status, opened_at)
       VALUES ($1, 'checkbox', 'open', NOW()) RETURNING id`,
      [store.storeId]
    );
    shiftId = Number(shift.rows[0].id);
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const ctx = async () => (await resolveContext(store.storeId)) as FiscalContext;
  const fillPool = async () => {
    resetRateLimiter();
    await offlinePool.refillOfflineCodes(await ctx(), AbortSignal.timeout(10_000));
  };
  const counts = () => offlinePool.countCodes(store.storeId, '');
  const sessions = async () =>
    (
      await pool.query(
        `SELECT * FROM pos_fiscal_offline_sessions WHERE store_id = $1 ORDER BY id`,
        [store.storeId]
      )
    ).rows as session.OfflineSessionRow[];
  // A service receipt has no parent sale, so the ledger row can stand alone.
  const openDoc = (mode: ledger.FiscalDocMode = 'offline') =>
    ledger.openDocument({
      storeId: store.storeId,
      docType: 'service_in',
      shiftId,
      provider: 'checkbox',
      requestId: randomUUID(),
      totalCents: 1000,
      mode,
    });
  const receipt = async (id: number) =>
    (await pool.query(`SELECT * FROM pos_fiscal_receipts WHERE id = $1`, [id])).rows[0] as ledger.FiscalReceiptRow;

  // ── Opening ───────────────────────────────────────────────────────────────

  it('opens one server session per register and spends a code on go-offline', async () => {
    await fillPool();
    const opened = await session.openServerSession(await ctx(), shiftId);
    expect(opened).toMatchObject({
      holder: 'server',
      status: 'open',
      shift_id: shiftId,
      go_offline_code: 'OFF-0001',
      go_offline_tx_id: null,
      device_id: null,
    });
    expect(await counts()).toEqual({ free: 59, leased: 0, used: 1, burned: 0 });

    // Opening again is idempotent — the live one comes back, no second row,
    // no second code.
    const again = await session.openServerSession(await ctx(), shiftId);
    expect(again.id).toBe(opened.id);
    expect(await sessions()).toHaveLength(1);
    expect(await counts()).toMatchObject({ used: 1 });
    expect(await session.getLiveSession(store.storeId, '')).toMatchObject({ id: opened.id });
  });

  it('racing opens all land on the same session', async () => {
    await fillPool();
    const c = await ctx();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => session.openServerSession(c, shiftId)));
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);
    expect(await sessions()).toHaveLength(1);
    // Exactly one go-offline code left the pool; the losers' transactions
    // rolled theirs back.
    expect(await counts()).toEqual({ free: 59, leased: 0, used: 1, burned: 0 });
  });

  it('refuses to open on an empty pool and leaves no half-open session', async () => {
    await expect(session.openServerSession(await ctx(), shiftId)).rejects.toMatchObject({
      kind: 'offline_codes_exhausted',
    });
    expect(await sessions()).toHaveLength(0);
    expect(await session.getLiveSession(store.storeId, '')).toBeNull();
  });

  // ── Stamping ──────────────────────────────────────────────────────────────

  it('stamps documents with the next code, now, and a dense seq', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    const a = await openDoc();
    const b = await openDoc();

    const stampA = await session.stampNext(s.id, a.id);
    const stampB = await session.stampNext(s.id, b.id);
    expect(stampA).toMatchObject({ seq: 1, fiscalCode: 'OFF-0002' });
    expect(stampB).toMatchObject({ seq: 2, fiscalCode: 'OFF-0003' });
    expect(stampA.fiscalDate.getTime()).toBeLessThanOrEqual(stampB.fiscalDate.getTime());

    const rowA = await receipt(a.id);
    expect(Number(rowA.offline_session_id)).toBe(s.id);
    expect(rowA).toMatchObject({
      mode: 'offline',
      offline_seq: 1,
      fiscal_code: 'OFF-0002',
      status: 'pending',
      next_attempt_at: null,
      control_number: null,
    });
    expect(rowA.fiscal_date).not.toBeNull();

    const codes = await pool.query(
      `SELECT fiscal_code, status, used_by_receipt_id FROM pos_fiscal_offline_codes
       WHERE store_id = $1 AND status = 'used' ORDER BY serial_id`,
      [store.storeId]
    );
    expect(codes.rows).toEqual([
      { fiscal_code: 'OFF-0001', status: 'used', used_by_receipt_id: null },
      { fiscal_code: 'OFF-0002', status: 'used', used_by_receipt_id: String(a.id) },
      { fiscal_code: 'OFF-0003', status: 'used', used_by_receipt_id: String(b.id) },
    ]);
    expect(await ledger.listSessionDocuments(s.id)).toEqual([
      expect.objectContaining({ id: a.id, offline_seq: 1 }),
      expect.objectContaining({ id: b.id, offline_seq: 2 }),
    ]);
  });

  it('keeps seq dense and codes unique under concurrent stamps', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    const docs = await Promise.all(Array.from({ length: 8 }, () => openDoc()));
    const stamps = await Promise.all(docs.map((d) => session.stampNext(s.id, d.id)));
    expect(stamps.map((x) => x.seq).sort((p, q) => p - q)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(stamps.map((x) => x.fiscalCode)).size).toBe(8);
    expect(await counts()).toEqual({ free: 51, leased: 0, used: 9, burned: 0 });
  });

  it('refuses to stamp once the session is replaying, and on an empty pool', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    const doc = await openDoc();

    // Drain the pool: every remaining code goes to a till.
    await offlinePool.takeFreeCodes(store.storeId, '', 100, { status: 'leased', deviceId: 'dev-A' });
    await expect(session.stampNext(s.id, doc.id)).rejects.toMatchObject({ kind: 'offline_codes_exhausted' });
    // Nothing was written to the row — the transaction rolled back.
    expect(await receipt(doc.id)).toMatchObject({ offline_session_id: null, offline_seq: null, fiscal_code: null });

    await offlinePool.releaseLeasedCodes(store.storeId, 'dev-A', 'free');
    expect(await session.markReplaying(s.id)).toMatchObject({ status: 'replaying' });
    await expect(session.stampNext(s.id, doc.id)).rejects.toMatchObject({ kind: 'replaying' });
  });

  // ── The rest of the ledger leaves offline documents alone ────────────────

  it('the flat retry pass never claims an offline document', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    const off = await openDoc();
    await session.stampNext(s.id, off.id);
    const on = await openDoc('online');
    // Make both "due" — the offline one has no next_attempt_at anyway, but
    // the mode filter is the guarantee, so give it one and prove it is still
    // skipped.
    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE id = ANY($1::bigint[])`,
      [[off.id, on.id]]
    );
    const claimed = await ledger.claimDueDocuments(10);
    expect(claimed.map((r) => r.id)).toContain(on.id);
    expect(claimed.map((r) => r.id)).not.toContain(off.id);
  });

  it('the stale sweep skips offline documents of a live session, not of a finished one', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    const doc = await openDoc();
    await session.stampNext(s.id, doc.id);
    await pool.query(`UPDATE pos_fiscal_receipts SET created_at = NOW() - interval '2 days' WHERE id = $1`, [doc.id]);

    expect(await ledger.abandonStaleDocs(60 * 60 * 1000)).toBe(0);
    expect((await receipt(doc.id)).status).toBe('pending');

    await session.markReplaying(s.id);
    await session.markStuck(s.id, 'go_offline_order', 'test');
    expect(await ledger.abandonStaleDocs(60 * 60 * 1000)).toBe(1);
    expect((await receipt(doc.id)).status).toBe('abandoned');
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  it('walks open → replaying → closed and records go-offline / go-online', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    expect(await session.markClosed(s.id)).toBeNull(); // not from `open`
    expect(await session.markReplaying(s.id)).toMatchObject({ status: 'replaying' });
    expect(await session.markReplaying(s.id)).toBeNull(); // only once
    expect(await session.markGoOfflineSent(s.id, 'tx-1')).toMatchObject({ go_offline_tx_id: 'tx-1' });
    expect(await session.markGoOfflineSent(s.id, null)).toMatchObject({ go_offline_tx_id: 'tx-1' });
    const throttled = await session.markGoOnlineSent(s.id);
    expect(throttled?.last_go_online_at).not.toBeNull();
    expect(await session.markClosed(s.id)).toMatchObject({ status: 'closed' });
    expect((await session.getSession(s.id))?.ended_at).not.toBeNull();
    expect(await session.getLiveSession(store.storeId, '')).toBeNull();
    // A closed session is out of the worklist, and a new one may open.
    expect((await session.listLiveServerSessions()).map((x) => x.id)).not.toContain(s.id);
    const next = await session.openServerSession(await ctx(), shiftId);
    expect(next.id).not.toBe(s.id);
  });

  it('marks a session stuck with a reason, from open or replaying, never from closed', async () => {
    await fillPool();
    const s = await session.openServerSession(await ctx(), shiftId);
    expect(await session.markStuck(s.id, 'register_taken', 'x'.repeat(600))).toMatchObject({
      status: 'stuck',
      error_code: 'register_taken',
    });
    expect((await session.getSession(s.id))?.error_message).toHaveLength(500);
    expect(await session.markStuck(s.id, 'again', 'again')).toBeNull();
  });
});
