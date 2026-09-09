// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.ledger.test.ts
//
// The `pos_fiscal_receipts` state machine and the reconciliation cron.
//
// Every case here is a way a document could be lost or double-sent: a crash in
// a window, a shift that closed underneath it, a sale voided behind its back.
// The invariant they collectively defend is that **every non-`done` row has a
// bounded life and none of them is ever sent for a voided sale**.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import * as ledger from '../pos/fiscal/ledger.js';
import { FiscalError } from '../pos/fiscal/errors.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

describe.skipIf(!hasDb)('POS fiscal ledger and reconciliation', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfledg');
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
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    product = await seedProduct(store.storeId, { priceCents: 10000, quantity: 50 });
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

  const sell = () =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: product.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      },
    });

  const warm = () => fiscalService.preflight(store.storeId, store.sellerId);

  const rows = async () =>
    (
      await pool.query(
        `SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`,
        [store.storeId]
      )
    ).rows;

  const saleRow = async (id: number) =>
    (await pool.query(`SELECT * FROM pos_sales WHERE id = $1`, [id])).rows[0];

  /** Make the single ledger row due for a retry right now. */
  const makeDue = async () => {
    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute'
       WHERE store_id = $1 AND status IN ('pending','failed')`,
      [store.storeId]
    );
  };

  // ── Retry ─────────────────────────────────────────────────────────────────

  it('retries a failed document and marks it done', async () => {
    await warm();
    fake.queueError('unavailable');
    const failed = await sell();
    expect(failed.json().sale_voided).toBe(false);
    expect((await rows())[0].status).toBe('failed');

    await makeDue();
    const result = await fiscalService.retryPendingFiscalDocs();
    expect(result.done).toBe(1);

    const after = (await rows())[0];
    expect(after.status).toBe('done');
    expect(after.fiscal_code).toBeTruthy();
    expect((await saleRow(after.sale_id)).fiscal_status).toBe('done');
  });

  it('abandons a document once its attempt budget is gone', async () => {
    await warm();
    fake.queueError('unavailable');
    const failed = await sell();
    const saleId = failed.json().sale_id;

    // Burn the budget: the claim increments `attempts` before each send.
    await pool.query(
      `UPDATE pos_fiscal_receipts SET attempts = $2 WHERE store_id = $1`,
      [store.storeId, ledger.MAX_ATTEMPTS - 1]
    );
    await makeDue();
    fake.queueError('unavailable');
    await fiscalService.retryPendingFiscalDocs();

    const after = (await rows())[0];
    expect(after.status).toBe('abandoned');
    expect(after.next_attempt_at).toBeNull();
    // The projection has no 'abandoned' — it must collapse to 'failed'.
    expect((await saleRow(saleId)).fiscal_status).toBe('failed');
  });

  it('parks a terminal failure instead of scheduling a retry', async () => {
    await warm();
    // `auth_rejected` will fail identically every two minutes forever; the
    // owner has to fix the credentials.
    fake.queueError('auth_rejected');
    await sell();
    const after = (await rows())[0];
    expect(after.status).toBe('failed');
    expect(after.next_attempt_at).toBeNull();
  });

  // ── Voided sales ──────────────────────────────────────────────────────────

  it('never sends a document for a sale that has been voided', async () => {
    // `abortSale` voids first and abandons second (the reverse would strand a
    // live sale as abandoned). A crash in between leaves a voided sale with a
    // claimable row — and two minutes later the tax service would get a receipt
    // for goods already back on the shelf.
    await warm();
    fake.queueError('unavailable');
    const failed = await sell();
    const saleId = failed.json().sale_id;

    await pool.query(`UPDATE pos_sales SET status = 'voided' WHERE id = $1`, [saleId]);
    await makeDue();

    const before = fake.calls.filter((c) => c.method === 'registerSale').length;
    const result = await fiscalService.retryPendingFiscalDocs();

    expect(result.abandoned).toBeGreaterThan(0);
    expect(fake.calls.filter((c) => c.method === 'registerSale').length).toBe(before);
    const after = (await rows())[0];
    expect(after.status).toBe('abandoned');
    expect(after.error_code).toBe('sale_voided');
  });

  // ── Orphans ───────────────────────────────────────────────────────────────

  it('parks a sale left pending with no ledger row at all', async () => {
    // The crash window between `completeSale`'s COMMIT and the ledger INSERT.
    // A sale that says it is being fiscalised with nothing that ever will is
    // exactly the silently un-fiscalised revenue the projection exists to
    // prevent — reintroduced one layer up.
    await warm();
    const sold = await sell();
    const saleId = sold.json().id;
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE sale_id = $1`, [saleId]);
    await pool.query(`UPDATE pos_sales SET fiscal_status = 'pending' WHERE id = $1`, [saleId]);

    // No live shift the sale belongs to any more.
    await pool.query(`UPDATE pos_fiscal_shifts SET status = 'closed' WHERE store_id = $1`, [
      store.storeId,
    ]);
    resetRuntime();

    await fiscalService.retryPendingFiscalDocs();
    // Parked where the owner will see it, instead of being rescanned forever.
    expect((await saleRow(saleId)).fiscal_status).toBe('failed');
  });

  it('adopts an orphan that still belongs to the live shift', async () => {
    await warm();
    const sold = await sell();
    const saleId = sold.json().id;
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE sale_id = $1`, [saleId]);
    await pool.query(`UPDATE pos_sales SET fiscal_status = 'pending' WHERE id = $1`, [saleId]);

    const result = await fiscalService.retryPendingFiscalDocs();
    expect(result.adopted).toBe(1);
    const adopted = (await rows()).find((r) => Number(r.sale_id) === saleId);
    expect(adopted).toBeTruthy();
  });

  // ── Sweeps ────────────────────────────────────────────────────────────────

  it('sweeps documents no shift close will ever collect', async () => {
    // `closeDueShifts` can park a shift in 'error' without calling `closeShift`
    // (fiscalisation switched off, credentials rejected), and its documents are
    // then invisible to the shift sweep. The age net is the backstop.
    await warm();
    fake.queueError('unavailable');
    await sell();
    await pool.query(
      `UPDATE pos_fiscal_receipts SET created_at = NOW() - interval '3 days'
       WHERE store_id = $1`,
      [store.storeId]
    );

    const swept = await ledger.abandonStaleDocs(fiscalService.STALE_DOC_AGE_MS);
    expect(swept).toBe(1);
    const after = (await rows())[0];
    expect(after.status).toBe('abandoned');
    expect(after.error_code).toBe('unavailable');
  });

  it('lets done win a race against the shift-close sweep', async () => {
    // If the sweep abandoned a row while its call was in flight and the
    // provider then accepted it, `done` must win: the receipt exists at the tax
    // service, and the ledger has to say so.
    await warm();
    fake.queueError('unavailable');
    const failed = await sell();
    const row = (await rows())[0] as ledger.FiscalReceiptRow;

    await ledger.markAbandoned(Number(row.id), 'shift_closed', 'swept mid-flight');
    expect((await rows())[0].status).toBe('abandoned');

    await ledger.markDone(row, {
      providerDocId: 'doc-late',
      fiscalCode: 'FISCAL-LATE',
      fiscalDate: new Date().toISOString(),
      taxUrl: null,
      qrPayload: null,
      vatCents: null,
      receiptText: null,
      raw: {},
    });

    const after = (await rows())[0];
    expect(after.status).toBe('done');
    expect(after.fiscal_code).toBe('FISCAL-LATE');
    expect((await saleRow(failed.json().sale_id)).fiscal_status).toBe('done');
  });

  // ── Claim mechanics ───────────────────────────────────────────────────────

  it('does not hand the same document to two overlapping ticks', async () => {
    await warm();
    fake.queueError('unavailable');
    await sell();
    await makeDue();

    const first = await ledger.claimDueDocuments(10);
    expect(first).toHaveLength(1);
    // The claim re-leases via `next_attempt_at`, so a second tick sees nothing.
    const second = await ledger.claimDueDocuments(10);
    expect(second).toHaveLength(0);
  });

  it('increments attempts on every claim so a poison document cannot loop', async () => {
    await warm();
    fake.queueError('unavailable');
    await sell();
    const before = Number((await rows())[0].attempts);

    await makeDue();
    await ledger.claimDueDocuments(10);
    expect(Number((await rows())[0].attempts)).toBe(before + 1);
  });

  it('schedules a backoff that grows with attempts', async () => {
    await warm();
    fake.queueError('unavailable');
    await sell();
    const row = (await rows())[0] as ledger.FiscalReceiptRow;

    const early = await ledger.markFailed(
      { ...row, attempts: 1 },
      new FiscalError('x', 'unavailable')
    );
    const late = await ledger.markFailed(
      { ...row, attempts: 6 },
      new FiscalError('x', 'unavailable')
    );
    expect(new Date(late.next_attempt_at as unknown as string).getTime()).toBeGreaterThan(
      new Date(early.next_attempt_at as unknown as string).getTime()
    );
  });

  it('is a no-op for a store that stopped fiscalising', async () => {
    await warm();
    fake.queueError('unavailable');
    await sell();
    await updateFiscalSettings(store.storeId, { enabled: false });
    await makeDue();

    await fiscalService.retryPendingFiscalDocs();
    const after = (await rows())[0];
    expect(after.status).toBe('abandoned');
    expect(after.error_code).toBe('not_configured');
  });
});
