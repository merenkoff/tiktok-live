// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.cashalot.checkout.test.ts
//
// The Cashalot adapter through the REAL orchestration — checkout, the ledger,
// the retry cron — with only `fetch` replaced by a fake of the WEB API. The
// path this file exists for: the answer to a sale is lost after Cashalot
// registered it, the sale is kept, the retry sends the same UID, Cashalot
// refuses it as a repeat, and the adapter finds the existing document instead
// of fiscalising the sale twice.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import { resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
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
import { FakeCashalot } from './helpers/fake-cashalot.js';

describe.skipIf(!hasDb)('POS fiscal — Cashalot through the orchestration', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;
  let fake: FakeCashalot;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rfcashalot');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    fake = new FakeCashalot();
    vi.stubGlobal('fetch', fake.fetch);
    resetProviders();
    resetRuntime();
    resetRateLimiter();
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`UPDATE pos_sales SET fiscal_status = 'none' WHERE store_id = $1`, [store.storeId]);
    product = await seedProduct(store.storeId, { priceCents: 6000, quantity: 50 });
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'cashalot',
      auto_open_shift: true,
      default_tax_code: 'A',
      config: { taxes: [{ letter: 'А', name: 'ПДВ', rate: 20 }] },
      secrets: { keyGuid: fake.keyGuid, keyPin: fake.keyPin, numFiscal: fake.numFiscal },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  const rows = async () =>
    (await pool.query(`SELECT * FROM pos_fiscal_receipts WHERE store_id = $1 ORDER BY id`, [store.storeId])).rows;

  it('fiscalises a sale: opens the shift, sends the ДПС check, records Cashalot’s number', async () => {
    const res = await sell();
    expect(res.statusCode).toBe(201);
    expect(res.json().fiscal).toMatchObject({ status: 'done', mode: 'online', fiscal_code: '100002' });

    expect(fake.commands('OpenShift')).toHaveLength(1);
    const check = fake.commands('RegisterCheck')[0].body;
    const row = (await rows())[0];
    expect(check.UID).toBe(row.provider_request_id);
    expect(check.Check).toMatchObject({
      CHECKTOTAL: { SUM: 60 },
      CHECKTAX: [{ LETTER: 'А', SOURCESUM: 60, SUM: 10 }],
      CHECKBODY: [{ LETTERS: 'А', UNITCD: 2009, UNITNM: 'шт' }],
    });
    expect(row).toMatchObject({ status: 'done', fiscal_code: '100002', provider_doc_id: '100002', vat_cents: 1000 });
  });

  it('fiscalises a refund against the sale’s fiscal number', async () => {
    const sold = await sell();
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${sold.json().id}/refunds`,
      headers: auth(store.sellerToken),
      payload: { items: [{ sale_item_id: sold.json().items[0].id, quantity: 1 }], method: 'cash' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().refund_fiscal).toMatchObject({ status: 'done' });
    expect(fake.commands('RegisterCheck').at(-1)?.body.Check).toMatchObject({
      CHECKHEAD: { DOCSUBTYPE: 'CheckReturn', ORDERRETNUM: sold.json().fiscal.fiscal_code },
    });
  });

  it('recovers a lost answer by finding the document, never by registering it twice', async () => {
    await fiscalService.preflight(store.storeId, store.sellerId);
    fake.loseNextAnswer = true;
    const res = await sell();
    // The check reached Cashalot and the answer did not come back: the sale
    // must be kept (it may be fiscal), not voided.
    expect(res.json().sale_voided).toBe(false);
    expect((await rows())[0].status).toBe('failed');
    const registered = [...fake.uids.values()];
    expect(registered).toHaveLength(1);

    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE store_id = $1`,
      [store.storeId]
    );
    resetRateLimiter();
    const result = await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });
    expect(result.done).toBe(1);

    const row = (await rows())[0];
    expect(row).toMatchObject({ status: 'done', fiscal_code: registered[0] });
    // The repeat was refused, then the number found and read back — one document at Cashalot.
    expect(fake.uids.size).toBe(1);
    expect(fake.commands('DocumentInfoByLocalNum').length).toBeGreaterThan(0);
    expect(fake.commands('GetCheck').length).toBeGreaterThan(0);
  });

  it('records a document Cashalot registered while the tax office was down', async () => {
    fake.nextOffline = true;
    const res = await sell();
    expect(res.json().fiscal).toMatchObject({ status: 'done', mode: 'provider_offline', control_number: '6127' });
    expect((await rows())[0]).toMatchObject({ mode: 'provider_offline', control_number: '6127' });
  });

  it('refuses a sale before writing it when Cashalot does not accept the credentials', async () => {
    fake.keyPin = 'changed-in-the-cabinet';
    const before = (await pool.query(`SELECT COUNT(*)::int AS n FROM pos_sales WHERE store_id = $1`, [store.storeId])).rows[0].n;
    const res = await sell();
    expect(res.statusCode).toBe(503);
    const after = (await pool.query(`SELECT COUNT(*)::int AS n FROM pos_sales WHERE store_id = $1`, [store.storeId])).rows[0].n;
    expect(after).toBe(before);
    expect(fake.commands('RegisterCheck')).toHaveLength(0);
  });
});
