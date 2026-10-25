// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.debts-chain.test.ts — a «внесок» in a store with ПРРО:
// the line's prepayment chain (migration 079, TechDocs/grocery/G3_DEBTS.md §11
// «Крок 2»), against the fake provider with chains.
//
// The first «внесок» toward a line opens its chain under our number; further
// ones join it once the last is registered; the receipt that closes the line
// is the chain's after-payment, never on one receipt with other lines. One sum
// from the customer may so be several documents, each with its own pre-flight
// and its own three outcomes: the first that does not go through stops the
// rest and the answer says what went through and what to hand back, and the
// same request again goes on from there. Every test checks the debt's one
// invariant — the journal and the open lines owe the same.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import { FiscalError } from '../pos/fiscal/errors.js';
import * as fiscalService from '../pos/fiscal/fiscal.service.js';
import { resolveContext } from '../pos/fiscal/shifts.service.js';
import { refillOfflineCodes } from '../pos/fiscal/offline/pool.js';
import { getLiveSession } from '../pos/fiscal/offline/session.js';
import type { FiscalCallCtx, FiscalSaleDoc } from '../pos/fiscal/types.js';
import { chainIdFor } from '../pos/debt-lines.service.js';
import { completeSale } from '../pos/sales.service.js';
import {
  DebtFiscalRefusal,
  debtPartUuidFor,
  payDebt,
  prepaymentUuidFor,
} from '../pos/debt-payment.service.js';
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

interface Line {
  id: number;
  owed_cents: number;
  prepaid_cents: number;
  remaining_quantity: number;
  status: string;
  chain: { id: string; provider: string; pending: boolean; prepayments?: number; prepaid_cents?: number } | null;
}

describe.skipIf(!hasDb)('POS «під запис» — a «внесок» under ПРРО (prepayment chain)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let bread = 0;
  let milk = 0;
  let cap = 0;
  let customerSeq = 0;
  let previousKey: string | undefined;

  const post = (url: string, body: Record<string, unknown>, token = store.sellerToken) =>
    app.inject({ method: 'POST', url: `/api/pos${url}`, headers: auth(token), payload: body });
  const get = (url: string, token = store.sellerToken) =>
    app.inject({ method: 'GET', url: `/api/pos${url}`, headers: auth(token) });

  async function product(body: Record<string, unknown>): Promise<number> {
    const res = await post('/products', body, store.ownerToken);
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { variants: Array<{ id: number }> }).variants[0].id;
  }

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('debtchain');
    bread = await product({ name: 'Хліб', variants: [{ attributes: {}, unit: 'шт', price_cents: 3200, quantity: 500 }] });
    milk = await product({ name: 'Молоко', variants: [{ attributes: {}, unit: 'шт', price_cents: 4500, quantity: 500 }] });
    cap = await product({ name: 'Кепка', variants: [{ attributes: {}, unit: 'шт', price_cents: 59000, quantity: 50 }] });
  }, 120000);

  afterAll(async () => {
    resetProviders();
    resetRuntime();
    await app?.close();
    await dropTestStore(store?.storeId);
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(async () => {
    fake = new FakeFiscalProvider({ chains: true });
    registerProvider(fake);
    resetRuntime();
    resetRateLimiter();
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'checkbox',
      auto_open_shift: true,
      default_tax_code: '1',
      receipt_source: 'local',
      receipt_width: 32,
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    // Prime the runtime: the shift is opened once, outside what a test counts.
    await fiscalService.preflight(store.storeId, store.sellerId);
    fake.calls.length = 0;
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  async function customer(): Promise<number> {
    customerSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, $2, $3, 1000000) RETURNING id`,
      [store.storeId, `Боржник ${customerSeq}`, `+38067200${String(customerSeq).padStart(4, '0')}`]
    );
    return Number(row.rows[0].id);
  }

  async function give(customerId: number, items: Array<Record<string, unknown>>): Promise<Line[]> {
    const res = await post('/debts/issue', { customer_id: customerId, client_uuid: randomUUID(), items });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().lines;
  }

  const pay = (customerId: number, body: Record<string, unknown>, clientUuid = randomUUID()) =>
    post(`/debts/customers/${customerId}/pay`, { client_uuid: clientUuid, ...body });
  const cash = (amount: number) => [{ method: 'cash' as const, amount_cents: amount }];
  const prepay = (lineId: number, amount: number, method: 'cash' | 'card' = 'cash') => ({
    part: { line_id: lineId, amount_cents: amount, method },
    payments: [],
  });

  const statement = async (customerId: number) => {
    const res = await get(`/debts/customers/${customerId}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as {
      credit: { balance_cents: number };
      fiscal: { on: boolean; provider: string | null; chains: boolean };
      open_lines: Line[];
    };
  };

  /** The one invariant: the journal and the open lines owe the same — and return it. */
  async function owed(customerId: number): Promise<number> {
    const s = await statement(customerId);
    const journal = Number(
      (
        await pool.query(
          `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM pos_debt_entries WHERE store_id = $1 AND customer_id = $2`,
          [store.storeId, customerId]
        )
      ).rows[0].s
    );
    const lines = s.open_lines.reduce((sum, l) => sum + l.owed_cents, 0);
    expect(journal).toBe(lines);
    expect(s.credit.balance_cents).toBe(lines);
    return lines;
  }

  const lineRow = async (lineId: number) =>
    (
      await pool.query(
        `SELECT prepaid_cents, sale_id, fiscal_chain_id, fiscal_chain_provider, fiscal_chain_attempts
           FROM pos_debt_items WHERE id = $1`,
        [lineId]
      )
    ).rows[0] as {
      prepaid_cents: number;
      sale_id: string | null;
      fiscal_chain_id: string | null;
      fiscal_chain_provider: string | null;
      fiscal_chain_attempts: number;
    };

  const ledgerOf = async (saleId: number) =>
    (
      await pool.query(
        `SELECT status, request_payload, receipt_text FROM pos_fiscal_receipts WHERE sale_id = $1 AND doc_type = 'sale'`,
        [saleId]
      )
    ).rows[0] as { status: string; request_payload: FiscalSaleDoc; receipt_text: string | null } | undefined;

  const salesOf = async (customerId: number) =>
    (
      await pool.query(
        `SELECT id, status, fiscal_status, fiscal_chain_id, client_uuid, debt_prepay_item_id, total_cents
           FROM pos_sales WHERE store_id = $1 AND customer_id = $2 ORDER BY id`,
        [store.storeId, customerId]
      )
    ).rows as Array<{
      id: string;
      status: string;
      fiscal_status: string;
      fiscal_chain_id: string | null;
      client_uuid: string;
      debt_prepay_item_id: string | null;
      total_cents: number;
    }>;

  const chainDocs = () =>
    fake.calls
      .filter((call) => call.method === 'registerSale')
      .map((call) => (call.doc as FiscalSaleDoc).chain?.op ?? 'sale');

  // ── One line, its chain ──────────────────────────────────────────────────

  it('opens the line’s chain with the first «внесок»: our number, the goods at what is owed', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);

    const res = await pay(id, prepay(line.id, 30000));
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    const chainId = chainIdFor(store.storeId, line.id, 1);
    expect(body.parts.map((p: { kind: string }) => p.kind)).toEqual(['prepayment']);
    expect(body.prepayment).toMatchObject({ total_cents: 30000, fiscal_chain_id: chainId, fiscal_status: 'done' });
    expect(body.fiscal.status).toBe('done');

    // The document: the cap at what was owed before, the «внесок» as its money.
    const doc = (await ledgerOf(body.prepayment.id))!;
    expect(doc.status).toBe('done');
    expect(doc.request_payload.chain).toEqual({ relationId: chainId, op: 'open' });
    expect(doc.request_payload.lines).toMatchObject([
      { quantityMilli: 1000, unitPriceCents: 59000, lineTotalCents: 59000, sourceLineRef: `debt-${line.id}`, taxCode: '1' },
    ]);
    expect(doc.request_payload.totalCents).toBe(30000);
    // A chain's receipt is printed from the provider's text whatever the setting.
    expect(doc.receipt_text).toBeTruthy();

    expect(await lineRow(line.id)).toMatchObject({
      prepaid_cents: 30000,
      fiscal_chain_id: chainId,
      fiscal_chain_provider: 'checkbox',
      fiscal_chain_attempts: 1,
    });
    expect(fake.prepaymentChain!.chains.get(chainId)).toMatchObject({ totalCents: 59000, paidCents: 30000, status: 'open' });
    expect(chainId.length).toBeGreaterThanOrEqual(10);

    const s = await statement(id);
    expect(s.fiscal).toEqual({ on: true, provider: 'checkbox', chains: true });
    expect(s.open_lines[0].chain).toEqual({
      id: chainId,
      provider: 'checkbox',
      pending: false,
      prepayments: 1,
      prepaid_cents: 30000,
    });
    expect(await owed(id)).toBe(29000);
  });

  it('a further «внесок» joins the chain, and the receipt that closes the line is its after-payment', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    expect((await pay(id, prepay(line.id, 30000))).statusCode).toBe(200);
    const chainId = chainIdFor(store.storeId, line.id, 1);

    const second = await pay(id, prepay(line.id, 10000, 'card'));
    expect(second.statusCode, second.body).toBe(200);
    const secondDoc = (await ledgerOf(second.json().prepayment.id))!;
    expect(secondDoc.request_payload.chain).toEqual({ relationId: chainId, op: 'pay' });
    // What the chain is still owed before it — what Checkbox must find left.
    expect(secondDoc.request_payload.lines[0].lineTotalCents).toBe(29000);
    expect(await owed(id)).toBe(19000);

    const closing = await pay(id, { line_ids: [line.id], payments: cash(19000) });
    expect(closing.statusCode, closing.body).toBe(200);
    const body = closing.json();
    expect(body.parts.map((p: { kind: string }) => p.kind)).toEqual(['chain_close']);
    expect(body.sale).toMatchObject({ total_cents: 19000, fiscal_chain_id: chainId, fiscal_status: 'done' });
    expect(body.sale.items[0].debt_prepaid_cents).toBe(40000);
    const doc = (await ledgerOf(body.sale.id))!;
    expect(doc.request_payload.chain).toEqual({ relationId: chainId, op: 'pay' });
    expect(doc.request_payload.totalCents).toBe(19000);
    expect(fake.prepaymentChain!.chains.get(chainId)).toMatchObject({ paidCents: 59000, status: 'paid' });
    expect(chainDocs()).toEqual(['open', 'pay', 'pay']);
    expect(await owed(id)).toBe(0);
  });

  it('closes the chain with rounded cash, the rounding on its own receipt (НБУ № 25)', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    expect((await pay(id, prepay(line.id, 46877))).statusCode).toBe(200);
    // 590.00 − 468.77 = 121.23, which a store rounding to 50 kopecks takes as 121.00.
    const res = await pay(id, { line_ids: [line.id], payments: cash(12100), cash_rounding: 50 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().sale).toMatchObject({ total_cents: 12123, rounding_cents: -23, cash_rounding: 50 });
    const doc = (await ledgerOf(res.json().sale.id))!;
    expect(doc.request_payload.cashRounding).toEqual({ step: 50, amountCents: -23 });
    expect(doc.request_payload.payments).toEqual([{ method: 'cash', amountCents: 12100, providerRef: null }]);
    expect(await owed(id)).toBe(0);
  });

  // ── One sum, several documents ───────────────────────────────────────────

  async function threeLines(id: number) {
    const [capLine] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    expect((await pay(id, prepay(capLine.id, 30000))).statusCode).toBe(200);
    const [breadLine] = await give(id, [{ variant_id: bread, quantity: 2 }]);
    const [milkLine] = await give(id, [{ variant_id: milk, quantity: 1 }]);
    return { capLine, breadLine, milkLine };
  }

  it('one sum: the chained line closes alone, the rest on a receipt, the «внесок» last — each its own document', async () => {
    const id = await customer();
    const { capLine, breadLine, milkLine } = await threeLines(id);
    fake.calls.length = 0;
    const uuid = randomUUID();

    const res = await pay(
      id,
      {
        line_ids: [capLine.id, breadLine.id],
        part: { line_id: milkLine.id, amount_cents: 2000, method: 'cash' },
        payments: cash(29000 + 6400),
      },
      uuid
    );
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.parts.map((p: { kind: string }) => p.kind)).toEqual(['chain_close', 'receipt', 'prepayment']);
    expect(chainDocs()).toEqual(['pay', 'sale', 'open']);
    expect(body.parts.every((p: { fiscal: { status: string } }) => p.fiscal.status === 'done')).toBe(true);
    expect(body.warning).toBeNull();

    const [close, receipt, prepayment] = body.parts.map((p: { sale: { id: number } }) => p.sale);
    expect(close).toMatchObject({ total_cents: 29000, client_uuid: uuid, fiscal_chain_id: chainIdFor(store.storeId, capLine.id, 1) });
    expect(close.payments.map((p: { amount_cents: number }) => p.amount_cents)).toEqual([29000]);
    expect(receipt).toMatchObject({ total_cents: 6400, client_uuid: debtPartUuidFor(uuid, 1), fiscal_chain_id: null });
    expect(receipt.payments.map((p: { amount_cents: number }) => p.amount_cents)).toEqual([6400]);
    expect(prepayment).toMatchObject({
      total_cents: 2000,
      client_uuid: prepaymentUuidFor(uuid),
      fiscal_chain_id: chainIdFor(store.storeId, milkLine.id, 1),
    });
    expect(await owed(id)).toBe(2500);

    // The same request again: nothing is sent twice.
    fake.calls.length = 0;
    const again = await pay(
      id,
      {
        line_ids: [capLine.id, breadLine.id],
        part: { line_id: milkLine.id, amount_cents: 2000, method: 'cash' },
        payments: cash(29000 + 6400),
      },
      uuid
    );
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().parts.map((p: { sale: { id: number } }) => p.sale.id)).toEqual(
      body.parts.map((p: { sale: { id: number } }) => p.sale.id)
    );
    expect(chainDocs()).toEqual([]);
    expect(await owed(id)).toBe(2500);

    // The same key with other lines is not that request: refused, nothing written.
    const other = await pay(id, { line_ids: [milkLine.id], payments: cash(2500) }, uuid);
    expect(other.statusCode).toBe(409);
    expect(other.json()).toMatchObject({ code: 'stale_statement', sale_ids: [close.id] });
    expect(chainDocs()).toEqual([]);
    expect(await owed(id)).toBe(2500);

    // The journal says where ПРРО stands with each payment: the «внесок» is in its chain.
    const entries = (await statement(id)) as unknown as { entries: Array<{ prepayment: boolean; fiscal_status: string | null; kind: string }> };
    expect(entries.entries.find((e) => e.prepayment && e.kind === 'payment')?.fiscal_status).toBe('done');
    expect(entries.entries.find((e) => e.kind === 'issue')?.fiscal_status).toBeNull();
  });

  it('stops at the first document the provider refuses, says what went through and what to hand back', async () => {
    const id = await customer();
    const { capLine, breadLine, milkLine } = await threeLines(id);
    const register = fake.registerSale.bind(fake);
    fake.registerSale = async (callCtx: FiscalCallCtx, doc: FiscalSaleDoc) => {
      if (!doc.chain) throw new FiscalError('bad tax code', 'rejected');
      return register(callCtx, doc);
    };

    const res = await pay(id, {
      line_ids: [capLine.id, breadLine.id],
      part: { line_id: milkLine.id, amount_cents: 2000, method: 'cash' },
      payments: cash(35400),
    });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body).toMatchObject({ code: 'rejected', part: 'receipt', sale_voided: true, not_taken_cents: 8400 });
    expect(body.sale_ids).toHaveLength(1);
    expect(body.error).toContain('Попередні чеки пройшли');
    expect(body.error).toContain('84,00 ₴');

    // The cap is closed through its chain; the bread is owed again; the milk took nothing.
    expect((await lineRow(capLine.id)).sale_id).toBe(String(body.sale_ids[0]));
    expect((await lineRow(breadLine.id)).sale_id).toBeNull();
    expect(await lineRow(milkLine.id)).toMatchObject({ prepaid_cents: 0, fiscal_chain_id: null });
    expect(await owed(id)).toBe(6400 + 4500);
  });

  it('a later document ПРРО cannot be asked for writes nothing of it, and the same request goes on from there', async () => {
    const id = await customer();
    const { capLine, breadLine, milkLine } = await threeLines(id);
    const uuid = randomUUID();
    const request = {
      storeId: store.storeId,
      staffId: store.sellerId,
      customerId: id,
      line_ids: [capLine.id, breadLine.id],
      part: { line_id: milkLine.id, amount_cents: 2000, method: 'cash' },
      payments: cash(35400),
      client_uuid: uuid,
    };
    let gates = 0;
    const flaky = {
      gateFor: async (op?: fiscalService.FiscalOp) => {
        gates += 1;
        if (gates === 2) throw new FiscalError('Немає звʼязку з ПРРО', 'unavailable');
        return fiscalService.preflight(store.storeId, store.sellerId, null, op);
      },
      capability: () => fiscalService.fiscalCapability(store.storeId),
    };
    const refused = await payDebt({ ...request, fiscal: flaky }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(DebtFiscalRefusal);
    expect((refused as DebtFiscalRefusal).detail).toMatchObject({
      stage: 'preflight',
      part: 'receipt',
      notTakenCents: 8400,
    });
    expect((refused as DebtFiscalRefusal).detail.paidSaleIds).toHaveLength(1);
    expect(await owed(id)).toBe(6400 + 4500);

    // Again, the same key: the closed cap is found, not sent; the rest goes.
    fake.calls.length = 0;
    const result = await payDebt({ ...request, fiscal: flaky });
    expect(result.parts.map((p) => p.kind)).toEqual(['chain_close', 'receipt', 'prepayment']);
    expect(chainDocs()).toEqual(['sale', 'open']);
    expect(await owed(id)).toBe(2500);
  });

  it('shares one method out over the documents, and refuses two methods or too little in words', async () => {
    const id = await customer();
    const { capLine, breadLine } = await threeLines(id);
    const mixed = await pay(id, {
      line_ids: [capLine.id, breadLine.id],
      payments: [
        { method: 'cash', amount_cents: 20000 },
        { method: 'card', amount_cents: 15400 },
      ],
    });
    expect(mixed.statusCode).toBe(400);
    expect(mixed.json().error).toMatch(/одним способом/);

    const short = await pay(id, { line_ids: [capLine.id, breadLine.id], payments: cash(35000) });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toMatch(/окремими чеками — 354,00 ₴/);
    expect(chainDocs()).toEqual(['open']);

    // Handed over more than it comes to: the change rides the last receipt.
    const res = await pay(id, { line_ids: [capLine.id, breadLine.id], payments: cash(40000) });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().parts.map((p: { sale: { payments: Array<{ amount_cents: number }> } }) => p.sale.payments[0].amount_cents)).toEqual([
      29000, 11000,
    ]);
  });

  // ── The three outcomes of a chain document ───────────────────────────────

  it('a refused opening is undone: the money back, the line out of the chain, the next one under the next number', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    fake.queueError('rejected', 'bad');
    const res = await pay(id, prepay(line.id, 30000));
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ part: 'prepayment', sale_voided: true, sale_ids: [] });
    expect(res.json().error).toContain('Внесок скасовано');
    expect(await lineRow(line.id)).toMatchObject({ prepaid_cents: 0, fiscal_chain_id: null, fiscal_chain_attempts: 1 });
    expect(await owed(id)).toBe(59000);

    const again = await pay(id, prepay(line.id, 30000));
    expect(again.statusCode, again.body).toBe(200);
    expect((await lineRow(line.id)).fiscal_chain_id).toBe(chainIdFor(store.storeId, line.id, 2));
    expect(await owed(id)).toBe(29000);
  });

  it('an ambiguous one is kept, holds the chain until the retry registers it — with the provider’s text', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    fake.queueError('unavailable', 'gateway timeout');
    const res = await pay(id, prepay(line.id, 30000));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().warning).toContain('Не пробивайте його вдруге');
    const saleId = res.json().prepayment.id;
    expect((await salesOf(id)).find((s) => Number(s.id) === saleId)).toMatchObject({ status: 'completed', fiscal_status: 'failed' });
    expect((await statement(id)).open_lines[0].chain).toMatchObject({ pending: true });

    // Nothing more goes into the chain while it is unsettled.
    const next = await pay(id, prepay(line.id, 10000));
    expect(next.statusCode).toBe(409);
    expect(next.json().code).toBe('chain_pending');
    const close = await pay(id, { line_ids: [line.id], payments: cash(29000) });
    expect(close.statusCode).toBe(409);
    expect(close.json().code).toBe('chain_pending');
    // Nor is it voided while the retry still means to send it — not even by the owner.
    for (const token of [store.sellerToken, store.ownerToken]) {
      const voided = await post(`/sales/${saleId}/void`, {}, token);
      expect(voided.statusCode).toBe(409);
      expect(voided.json()).toMatchObject({ error: 'chain_pending', message: expect.stringContaining('ще реєструється') });
    }

    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE store_id = $1`,
      [store.storeId]
    );
    resetRateLimiter();
    const retried = await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId });
    expect(retried.done).toBe(1);
    const doc = (await ledgerOf(saleId))!;
    expect(doc.status).toBe('done');
    expect(doc.receipt_text).toBeTruthy();
    expect((await statement(id)).open_lines[0].chain).toMatchObject({ pending: false });
    expect((await pay(id, prepay(line.id, 10000))).statusCode).toBe(200);
    expect(await owed(id)).toBe(19000);
  });

  it('one the retry gave up on is the owner’s to settle — voiding a «внесок» the provider never got frees the line', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    fake.queueError('unavailable', 'gateway timeout');
    const res = await pay(id, prepay(line.id, 30000));
    const saleId = res.json().prepayment.id;
    await pool.query(
      `UPDATE pos_fiscal_receipts SET status = 'abandoned', next_attempt_at = NULL WHERE sale_id = $1`,
      [saleId]
    );

    const next = await pay(id, prepay(line.id, 10000));
    expect(next.statusCode).toBe(409);
    expect(next.json().code).toBe('chain_parked');
    expect(next.json().error).toContain('власник розбирається');

    // Only the owner, who can look in the provider's cabinet, voids it.
    const byCashier = await post(`/sales/${saleId}/void`, {}, store.sellerToken);
    expect(byCashier.statusCode).toBe(403);
    expect(byCashier.json()).toMatchObject({ error: 'chain_parked', message: expect.stringContaining('лише власник') });
    // The provider has no such receipt (the fake never registered it): void it.
    expect(fake.prepaymentChain!.chains.size).toBe(0);
    const voided = await post(`/sales/${saleId}/void`, {}, store.ownerToken);
    expect(voided.statusCode, voided.body).toBe(200);
    expect(await lineRow(line.id)).toMatchObject({ prepaid_cents: 0, fiscal_chain_id: null, fiscal_chain_attempts: 1 });
    const again = await pay(id, prepay(line.id, 10000));
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().prepayment.fiscal_chain_id).toBe(chainIdFor(store.storeId, line.id, 2));
    expect(await owed(id)).toBe(49000);
  });

  // ── Where the chain does not apply ───────────────────────────────────────

  it('a chain document never goes to a provider without chains', async () => {
    resetProviders();
    const plain = new FakeFiscalProvider();
    registerProvider(plain);
    resetRuntime();
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    const res = await pay(id, prepay(line.id, 30000));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('prepay_needs_chain');
    expect((await statement(id)).fiscal).toEqual({ on: true, provider: 'checkbox', chains: false });
    expect(plain.calls.filter((call) => call.method === 'registerSale')).toHaveLength(0);
  });

  it('with ПРРО switched off a chained line closes with an ordinary receipt, and a «внесок» takes it out of its chain', async () => {
    const id = await customer();
    const [capLine] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    const [other] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    expect((await pay(id, prepay(capLine.id, 30000))).statusCode).toBe(200);
    await updateFiscalSettings(store.storeId, { enabled: false });
    resetRuntime();
    fake.calls.length = 0;

    const closed = await pay(id, { line_ids: [capLine.id], payments: cash(29000) });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(closed.json().sale).toMatchObject({ fiscal_status: 'none', fiscal_chain_id: null });
    expect(fake.calls.filter((call) => call.method === 'registerSale')).toHaveLength(0);

    // A chained line given a «внесок» without ПРРО leaves its chain.
    await updateFiscalSettings(store.storeId, { enabled: true });
    resetRuntime();
    expect((await pay(id, prepay(other.id, 10000))).statusCode).toBe(200);
    await updateFiscalSettings(store.storeId, { enabled: false });
    resetRuntime();
    expect((await pay(id, prepay(other.id, 10000))).statusCode).toBe(200);
    expect((await lineRow(other.id)).fiscal_chain_id).toBeNull();
    expect(await owed(id)).toBe(39000);
  });

  // ── Offline mode: a chain has no offline document ─────────────────────────

  describe('in a store that sells offline', () => {
    const DEVICE = 'till-chain-1';
    const headers = () => ({ ...auth(store.sellerToken), 'x-pos-device-id': DEVICE });

    beforeEach(async () => {
      resetProviders();
      fake = new FakeFiscalProvider({ offline: true, chains: true, shiftOpen: true });
      registerProvider(fake);
      resetRuntime();
      resetRateLimiter();
      await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
      await pool.query(`DELETE FROM pos_fiscal_offline_codes WHERE store_id = $1`, [store.storeId]);
      await updateFiscalSettings(store.storeId, { enabled: true, offline_mode: true, offline_codes_target: 60 });
      await pool.query(
        `UPDATE pos_fiscal_settings SET holder_device_id = NULL, holder_since = NULL,
           holder_last_seen_at = NULL, handover_device_id = NULL WHERE store_id = $1`,
        [store.storeId]
      );
      const ctx = await resolveContext(store.storeId);
      await refillOfflineCodes(ctx!, AbortSignal.timeout(10_000));
      await fiscalService.preflight(store.storeId, store.sellerId, DEVICE);
    });

    afterEach(async () => {
      // The session first: offline mode is not switched off under a live one.
      await pool.query(`DELETE FROM pos_fiscal_offline_sessions WHERE store_id = $1`, [store.storeId]);
      await updateFiscalSettings(store.storeId, { offline_mode: false });
    });

    const payOffline = (customerId: number, body: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/pos/debts/customers/${customerId}/pay`,
        headers: headers(),
        payload: { client_uuid: randomUUID(), ...body },
      });

    it('a «внесок» never opens an offline session, and inside one it waits for the replay', async () => {
      const id = await customer();
      const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);

      // The provider is down: an ordinary sale would open a session; a «внесок» does not.
      resetRuntime();
      fake.queueError('unavailable');
      const down = await payOffline(id, prepay(line.id, 30000));
      expect(down.statusCode).toBe(503);
      expect(down.json().code).toBe('unavailable');
      expect(await getLiveSession(store.storeId, '')).toBeNull();

      // A session the till's sales opened: the «внесок» is refused until it is sent.
      resetRuntime();
      fake.queueError('unavailable');
      await fiscalService.preflight(store.storeId, store.sellerId, DEVICE, 'sale');
      expect(await getLiveSession(store.storeId, '')).not.toBeNull();
      const inside = await payOffline(id, prepay(line.id, 30000));
      expect(inside.statusCode).toBe(409);
      expect(inside.json().code).toBe('offline_session_open');
      expect(await owed(id)).toBe(59000);
    });
  });

  it('an ordinary receipt refuses a line that took a «внесок» since the till read the statement', async () => {
    // Two tills: B takes a «внесок» on the oldest line while A, which read the
    // statement before it, is about to close that line on an ordinary receipt.
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    expect((await pay(id, prepay(line.id, 30000))).statusCode).toBe(200);

    const raced = completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items: [],
      payments: cash(59000),
      client_uuid: randomUUID(),
      debt_part: { customer_id: id, line_ids: [line.id], chain_provider: 'checkbox' },
      fiscal_status: 'pending',
    });
    await expect(raced).rejects.toMatchObject({ code: 'stale_statement' });
    // Through the route it is the chain's own receipt, as planned from a fresh read.
    const res = await pay(id, { line_ids: [line.id], payments: cash(29000) });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().parts.map((p: { kind: string }) => p.kind)).toEqual(['chain_close']);
    expect(await owed(id)).toBe(0);
  });

  it('a registered «внесок» cannot be voided by the till — the chain keeps it', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    const res = await pay(id, prepay(line.id, 30000));
    const voided = await post(`/sales/${res.json().prepayment.id}/void`, {}, store.ownerToken);
    expect(voided.statusCode).toBe(409);
    expect(voided.json().error).toBe('sale_fiscalised');
    expect(await owed(id)).toBe(29000);
  });

  // ── Giving a chain back (2-Б): the whole chain, in one return ─────────────

  const cancelPrepayments = (customerId: number, lineId: number, clientUuid = randomUUID()) =>
    post(`/debts/customers/${customerId}/prepayments/cancel`, { line_id: lineId, client_uuid: clientUuid });
  const returnGoods = (customerId: number, lineId: number, clientUuid = randomUUID(), extra: Record<string, unknown> = {}) =>
    post(`/debts/customers/${customerId}/chain-return`, { line_id: lineId, client_uuid: clientUuid, ...extra });
  const refundsOf = async (saleId: number) =>
    (
      await pool.query(
        `SELECT r.id, r.method, r.total_cents, r.rounding_cents, r.fiscal_status, f.status AS doc_status
           FROM pos_refunds r
           LEFT JOIN pos_fiscal_receipts f ON f.refund_id = r.id AND f.doc_type = 'refund'
          WHERE r.sale_id = $1 ORDER BY r.id`,
        [saleId]
      )
    ).rows as Array<{ id: string; method: string; total_cents: number; rounding_cents: number; fiscal_status: string; doc_status: string | null }>;
  const stockOf = async (variantId: number) =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);
  const returns = () => fake.prepaymentChain!.calls.filter((call) => call.startsWith('returnChain:'));

  it('«Скасувати внески» gives every «внесок» back in one return of the chain; the sum is owed again and the next one opens a new chain', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    const first = (await pay(id, prepay(line.id, 30000))).json().prepayment;
    const second = (await pay(id, prepay(line.id, 10000, 'card'))).json().prepayment;
    expect((await statement(id)).open_lines[0].chain).toMatchObject({ prepayments: 2, prepaid_cents: 40000 });
    expect(await owed(id)).toBe(19000);
    fake.prepaymentChain!.calls.length = 0;

    const uuid = randomUUID();
    const res = await cancelPrepayments(id, line.id, uuid);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ back_cents: 40000, warning: null, replay: false });
    expect(body.parts.map((p: { kind: string; sale: { id: number } }) => [p.kind, p.sale.id])).toEqual([
      ['prepayment', second.id],
      ['prepayment', first.id],
    ]);
    expect(body.parts.every((p: { fiscal: { status: string } }) => p.fiscal.status === 'done')).toBe(true);
    expect(returns()).toEqual([`returnChain:${chainIdFor(store.storeId, line.id, 1)}`]);

    // Each «внесок» back by the way it was paid, registered as its own return.
    expect(await refundsOf(first.id)).toMatchObject([{ method: 'cash', total_cents: 30000, fiscal_status: 'done', doc_status: 'done' }]);
    expect(await refundsOf(second.id)).toMatchObject([{ method: 'card', total_cents: 10000, fiscal_status: 'done', doc_status: 'done' }]);
    expect(await owed(id)).toBe(59000);
    expect(await lineRow(line.id)).toMatchObject({ prepaid_cents: 0, fiscal_chain_id: null, fiscal_chain_attempts: 1 });
    const voids = await pool.query(
      `SELECT sale_id, amount_cents, reason FROM pos_debt_entries WHERE customer_id = $1 AND kind = 'payment_void' ORDER BY sale_id`,
      [id]
    );
    expect(voids.rows.map((r) => [Number(r.sale_id), Number(r.amount_cents), r.reason])).toEqual([
      [first.id, 30000, 'Внесок повернуто через ПРРО'],
      [second.id, 10000, 'Внесок повернуто через ПРРО'],
    ]);

    // The same tap again finds what it wrote and returns nothing twice.
    const again = await cancelPrepayments(id, line.id, uuid);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ replay: true, back_cents: 40000 });
    expect(again.json().parts.map((p: { refund_id: number }) => p.refund_id)).toEqual(
      body.parts.map((p: { refund_id: number }) => p.refund_id)
    );
    expect(returns()).toHaveLength(1);

    // The line is out of the chain: its next «внесок» opens another one.
    const next = await pay(id, prepay(line.id, 5000));
    expect(next.statusCode, next.body).toBe(200);
    expect(next.json().prepayment.fiscal_chain_id).toBe(chainIdFor(store.storeId, line.id, 2));
    expect(await owed(id)).toBe(54000);
  });

  it('refuses before anything is written: no chain, a document still on its way, ПРРО unreachable', async () => {
    const id = await customer();
    const [plain, line] = await give(id, [
      { variant_id: bread, quantity: 1 },
      { variant_id: cap, quantity: 1 },
    ]);
    const noChain = await cancelPrepayments(id, plain.id);
    expect(noChain.statusCode).toBe(409);
    expect(noChain.json().code).toBe('no_chain');

    expect((await pay(id, { line_ids: [plain.id], payments: cash(3200) })).statusCode).toBe(200);
    fake.queueError('unavailable', 'gateway timeout');
    expect((await pay(id, prepay(line.id, 30000))).statusCode).toBe(200);
    const pending = await cancelPrepayments(id, line.id);
    expect(pending.statusCode).toBe(409);
    expect(pending.json().code).toBe('chain_pending');

    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE store_id = $1`,
      [store.storeId]
    );
    resetRateLimiter();
    expect((await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId })).done).toBe(1);

    resetRuntime();
    fake.queueError('unavailable');
    const down = await cancelPrepayments(id, line.id);
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ code: 'unavailable', credit: { balance_cents: 29000 } });
    const prepayment = (await salesOf(id)).find((s) => s.debt_prepay_item_id != null)!;
    expect(await refundsOf(Number(prepayment.id))).toEqual([]);
    expect(await owed(id)).toBe(29000);
  });

  it('a return ПРРO does not answer stands: the money goes back, the retry asks for the chain again', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    const first = (await pay(id, prepay(line.id, 30000))).json().prepayment;
    const second = (await pay(id, prepay(line.id, 10000))).json().prepayment;
    fake.prepaymentChain!.calls.length = 0;
    fake.prepaymentChain!.returnError = 'unavailable';

    const res = await cancelPrepayments(id, line.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().warning).toContain('гроші покупцеві віддайте');
    expect(await refundsOf(first.id)).toMatchObject([{ fiscal_status: 'failed', doc_status: 'failed' }]);
    expect(await refundsOf(second.id)).toMatchObject([{ fiscal_status: 'failed', doc_status: 'failed' }]);
    expect(await owed(id)).toBe(59000);

    await pool.query(
      `UPDATE pos_fiscal_receipts SET next_attempt_at = NOW() - interval '1 minute' WHERE store_id = $1`,
      [store.storeId]
    );
    resetRateLimiter();
    expect((await fiscalService.retryPendingFiscalDocs({ storeId: store.storeId })).done).toBe(2);
    expect(await refundsOf(first.id)).toMatchObject([{ fiscal_status: 'done', doc_status: 'done' }]);
    expect(await refundsOf(second.id)).toMatchObject([{ fiscal_status: 'done', doc_status: 'done' }]);
    expect(returns().length).toBeGreaterThanOrEqual(2);
  });

  it('a line its chain closed comes back whole: the goods to the shelf, the receipt and every «внесок» refunded, the debt not reopened', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    const prepayment = (await pay(id, prepay(line.id, 30000))).json().prepayment;
    const closed = await pay(id, { line_ids: [line.id], payments: cash(29000) });
    expect(closed.statusCode, closed.body).toBe(200);
    const close = closed.json().sale;
    expect(await owed(id)).toBe(0);

    // The host's refund of the closing receipt points here instead.
    const item = close.items[0];
    const host = await post(`/sales/${close.id}/refunds`, { items: [{ sale_item_id: item.id, quantity: 1 }] });
    expect(host.statusCode).toBe(400);
    expect(host.json().error).toContain('«Борги»');

    const entry = (await get(`/debts/customers/${id}`)).json().entries.find(
      (e: { sale_id: number | null; kind: string }) => e.sale_id === close.id && e.kind === 'payment'
    );
    expect(entry.chain_return).toMatchObject({ line_id: line.id, documents: 2, back_cents: 59000 });

    const shelf = await stockOf(cap);
    fake.prepaymentChain!.calls.length = 0;
    const uuid = randomUUID();
    const res = await returnGoods(id, line.id, uuid);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ back_cents: 59000, warning: null });
    expect(res.json().parts.map((p: { kind: string }) => p.kind)).toEqual(['chain_close', 'prepayment']);
    expect(returns()).toHaveLength(1);
    expect(await stockOf(cap)).toBe(shelf + 1);
    expect(await refundsOf(close.id)).toMatchObject([{ total_cents: 29000, fiscal_status: 'done' }]);
    expect(await refundsOf(prepayment.id)).toMatchObject([{ total_cents: 30000, fiscal_status: 'done' }]);
    // Paid goods brought back: the journal is as it was, the line stays paid.
    expect(await owed(id)).toBe(0);
    expect((await lineRow(line.id)).sale_id).toBe(String(close.id));
    const after = (await get(`/debts/customers/${id}`)).json().entries.find(
      (e: { sale_id: number | null; kind: string }) => e.sale_id === close.id && e.kind === 'payment'
    );
    expect(after.chain_return).toBeNull();

    const again = await returnGoods(id, line.id, uuid);
    expect(again.json()).toMatchObject({ replay: true });
    const twice = await returnGoods(id, line.id);
    expect(twice.statusCode).toBe(409);
    expect(twice.json().code).toBe('already_returned');
    expect(await stockOf(cap)).toBe(shelf + 1);
  });

  it('a «внесок» taken without ПРРО is not voided while the line has a chain — the chain goes back first', async () => {
    const id = await customer();
    const [line] = await give(id, [{ variant_id: cap, quantity: 1 }]);
    await updateFiscalSettings(store.storeId, { enabled: false });
    resetRuntime();
    const plain = (await pay(id, prepay(line.id, 10000))).json().prepayment;
    expect(plain.fiscal_chain_id).toBeNull();
    await updateFiscalSettings(store.storeId, { enabled: true });
    resetRuntime();
    await fiscalService.preflight(store.storeId, store.sellerId);
    const chained = (await pay(id, prepay(line.id, 20000))).json().prepayment;
    expect(chained.fiscal_chain_id).toBe(chainIdFor(store.storeId, line.id, 1));

    const refused = await post(`/sales/${plain.id}/void`, {}, store.ownerToken);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain('спершу скасуйте їх');
    expect(await owed(id)).toBe(29000);

    const cancelled = await cancelPrepayments(id, line.id);
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json().back_cents).toBe(20000);
    expect(await owed(id)).toBe(49000);
    expect((await post(`/sales/${plain.id}/void`, {}, store.ownerToken)).statusCode).toBe(200);
    expect(await owed(id)).toBe(59000);
  });
});
