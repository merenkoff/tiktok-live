// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.excise.test.ts
//
// Excise goods and their stamps through the sale path (track ДК, ДК4-Б,
// TechDocs/POS_DUAL_REGISTER.md §4.3): a bottle sold whole needs its stamp
// wherever it is sold (Д4) — at the till before payment, on a table's line
// before its round fires — one stamp sells once in a store, a return names the
// stamps of the bottles that came back (Д16) and frees them, and every stamp
// reaches the fiscal document of its register. «Шабля» again: food on
// register 1, alcohol on register 2, two fakes behind one `cashalot` id.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import * as bills from '../pos/bills.service.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { issueOnCredit } from '../pos/debts.service.js';
import { DebtConflict } from '../pos/debt-lines.service.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings, updateRegisterSettings } from '../pos/fiscal/settings.service.js';
import type { FiscalSaleDoc } from '../pos/fiscal/types.js';
import { voidSale } from '../pos/sales.service.js';
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

const STAMP_A = 'AATE508932 0000412168';
const STAMP_B = 'AATE508932 0000412169';

describe.skipIf(!hasDb)('POS excise goods and stamps (ДК4-Б)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let food: FakeFiscalProvider;
  let bar: FakeFiscalProvider;
  let bottle = 0;
  let bottleProduct = 0;
  let beer = 0;
  let hall = 0;
  let tableSeq = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rexcise');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    hall = Number(
      (await pool.query(`INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`, [store.storeId]))
        .rows[0].id
    );
    const v = await seedProduct(store.storeId, { name: 'Горілка 0,5 л', priceCents: 30_000, quantity: 50 });
    bottle = v.variantId;
    bottleProduct = v.productId;
    await pool.query(
      `UPDATE pos_products SET fiscal_register = 2, fiscal_excise = TRUE, excise_per_unit = TRUE,
              fiscal_uktzed = '2208601100' WHERE id = $1`,
      [bottleProduct]
    );
    const b = await seedProduct(store.storeId, { name: 'Пиво 0,5', priceCents: 8_000, quantity: 50 });
    beer = b.variantId;
    await pool.query(
      `UPDATE pos_products SET fiscal_register = 2, fiscal_excise = TRUE, fiscal_uktzed = '2203000100' WHERE id = $1`,
      [b.productId]
    );
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
    resetRateLimiter();
    await pool.query(`UPDATE pos_excise_labels SET released_at = NOW() WHERE store_id = $1 AND released_at IS NULL`, [
      store.storeId,
    ]);
    await pool.query(`DELETE FROM pos_fiscal_receipts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_shifts WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_fiscal_registers WHERE store_id = $1`, [store.storeId]);
    await updateFiscalSettings(store.storeId, {
      enabled: true,
      provider: 'cashalot',
      auto_open_shift: true,
      secrets: { licenceKey: FOOD_LICENCE, cashierPin: '0000' },
    });
    await updateRegisterSettings(store.storeId, 2, {
      enabled: true,
      label: 'Бар',
      secrets: { licenceKey: BAR_LICENCE, cashierPin: '1111' },
    });
  });

  afterEach(() => {
    resetProviders();
    resetRuntime();
  });

  const sell = (items: Array<Record<string, unknown>>, amount: number) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: { items, payments: [{ method: 'cash', amount_cents: amount }], client_uuid: randomUUID() },
    });

  const docsOf = (fake: FakeFiscalProvider, method = 'registerSale') =>
    fake.calls.filter((c) => c.method === method).map((c) => c.doc as FiscalSaleDoc);

  // ── the product ──────────────────────────────────────────────────────────

  it('asks an excise product for its УКТ ЗЕД, and a stamp per unit only of an excise one', async () => {
    const create = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/pos/products',
        headers: auth(store.ownerToken),
        payload: { name: 'Коньяк', variants: [{ price_cents: 50_000 }], ...body },
      });
    expect((await create({ fiscal_excise: true })).json().error).toMatch(/УКТ ЗЕД/);
    expect((await create({ excise_per_unit: true })).json().error).toMatch(/лише для підакцизного/);
    expect((await create({ fiscal_excise: true, fiscal_uktzed: '22-08' })).json().error).toMatch(/від 4 до 10 цифр/);

    const made = await create({ fiscal_excise: true, excise_per_unit: true, fiscal_uktzed: '2208 2012 00' });
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({ fiscal_excise: true, excise_per_unit: true, fiscal_uktzed: '2208201200' });

    // Un-marking excise takes the stamp per unit with it.
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/pos/products/${made.json().id}`,
      headers: auth(store.ownerToken),
      payload: { fiscal_excise: false },
    });
    expect(patched.json()).toMatchObject({ fiscal_excise: false, excise_per_unit: false });

    const catalog = await app.inject({ method: 'GET', url: '/api/pos/catalog', headers: auth(store.sellerToken) });
    const row = catalog.json().find((item: { variant_id: number }) => item.variant_id === bottle);
    expect(row).toMatchObject({ fiscal_excise: true, excise_per_unit: true, fiscal_register: 2 });
  });

  // ── at the till ─────────────────────────────────────────────────────────

  it('sells a bottle only with its stamp, once, and puts the stamp on the bar’s receipt', async () => {
    const without = await sell([{ variant_id: bottle, quantity: 1 }], 30_000);
    expect(without.statusCode).toBe(409);
    expect(without.json()).toMatchObject({ error: 'excise_labels_needed', needed: 1, have: 0 });

    const short = await sell([{ variant_id: bottle, quantity: 2, excise_labels: [STAMP_A] }], 60_000);
    expect(short.json()).toMatchObject({ error: 'excise_labels_needed', needed: 2, have: 1 });

    const junk = await sell([{ variant_id: bottle, quantity: 1, excise_labels: ['???'] }], 30_000);
    expect(junk.statusCode).toBe(400);
    expect(junk.json().error).toBe('excise_label_invalid');

    const sold = await sell([{ variant_id: bottle, quantity: 1, excise_labels: [' aate508932   0000412168 '] }], 30_000);
    expect(sold.statusCode).toBe(201);
    expect(sold.json().items[0].excise_labels).toEqual([STAMP_A]);
    const [doc] = docsOf(bar);
    expect(doc.lines[0]).toMatchObject({ excise: true, exciseLabels: [STAMP_A], uktzed: '2208601100' });
    expect(docsOf(food)).toHaveLength(0);

    const again = await sell([{ variant_id: bottle, quantity: 1, excise_labels: [STAMP_A] }], 30_000);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'excise_label_taken', label: STAMP_A });
  });

  it('sells beer as excise goods without a stamp', async () => {
    const sold = await sell([{ variant_id: beer, quantity: 2 }], 16_000);
    expect(sold.statusCode).toBe(201);
    const [doc] = docsOf(bar);
    expect(doc.lines[0].excise).toBe(true);
    expect(doc.lines[0].exciseLabels).toBeUndefined();
    const stamped = await sell([{ variant_id: beer, quantity: 1, excise_labels: [STAMP_B] }], 8_000);
    expect(stamped.json().error).toBe('excise_label_not_needed');
  });

  it('takes back the stamps of the bottles that came back, and frees them', async () => {
    const sold = await sell(
      [{ variant_id: bottle, quantity: 2, excise_labels: [STAMP_A, STAMP_B] }],
      60_000
    );
    expect(sold.statusCode).toBe(201);
    const item = sold.json().items[0];
    const refund = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/pos/sales/${sold.json().id}/refunds`,
        headers: auth(store.sellerToken),
        payload: { items: [{ sale_item_id: item.id, quantity: 1, ...body }], method: 'cash' },
      });

    const unnamed = await refund({});
    expect(unnamed.statusCode).toBe(409);
    expect(unnamed.json()).toMatchObject({ error: 'excise_labels_needed', choices: [STAMP_A, STAMP_B] });
    expect((await refund({ excise_labels: ['AATE508932 0000999999'] })).statusCode).toBe(409);

    const back = await refund({ excise_labels: [STAMP_B] });
    expect(back.statusCode).toBe(200);
    const [returned] = docsOf(bar, 'registerRefund');
    expect(returned.lines[0].exciseLabels).toEqual([STAMP_B]);

    const read = await app.inject({
      method: 'GET',
      url: `/api/pos/sales/${sold.json().id}`,
      headers: auth(store.ownerToken),
    });
    expect(read.json().items[0]).toMatchObject({ excise_labels: [STAMP_A], excise_labels_returned: [STAMP_B] });

    // The bottle that came back may sell again; the one that left may not.
    expect((await sell([{ variant_id: bottle, quantity: 1, excise_labels: [STAMP_B] }], 30_000)).statusCode).toBe(201);
    expect((await sell([{ variant_id: bottle, quantity: 1, excise_labels: [STAMP_A] }], 30_000)).statusCode).toBe(409);
  });

  it('frees the stamps of a voided receipt', async () => {
    const sold = await sell([{ variant_id: bottle, quantity: 1, excise_labels: [STAMP_A] }], 30_000);
    expect(sold.statusCode).toBe(201);
    await voidSale({ storeId: store.storeId, saleId: sold.json().id, staffId: store.sellerId });
    expect((await sell([{ variant_id: bottle, quantity: 1, excise_labels: [STAMP_A] }], 30_000)).statusCode).toBe(201);
  });

  // ── at the table ────────────────────────────────────────────────────────

  async function draftBill(): Promise<bills.Bill> {
    tableSeq += 1;
    const table = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, `E${tableSeq}`]
    );
    const opened = await bills.openBill({
      storeId: store.storeId,
      staffId: store.sellerId,
      tableId: Number(table.rows[0].id),
    });
    return bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, { variant_id: bottle, quantity: 1 });
  }

  it('fires a bottle to the table only with its stamp, and the payment carries it', async () => {
    const bill = await draftBill();
    const line = bill.draft[0];
    expect(line.excise_per_unit).toBe(true);
    const fire = () =>
      app.inject({
        method: 'POST',
        url: `/api/pos/bills/${bill.id}/fire`,
        headers: auth(store.sellerToken),
        payload: { client_uuid: randomUUID() },
      });

    const refused = await fire();
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'excise_labels_needed', item_id: line.id, needed: 1, have: 0 });

    const scanned = await app.inject({
      method: 'PUT',
      url: `/api/pos/bills/${bill.id}/items/${line.id}/excise`,
      headers: auth(store.sellerToken),
      payload: { excise_labels: [STAMP_A] },
    });
    expect(scanned.statusCode).toBe(200);
    expect(scanned.json().draft[0].excise_labels).toEqual([STAMP_A]);
    // Another table cannot take the same bottle.
    const other = await draftBill();
    const taken = await app.inject({
      method: 'PUT',
      url: `/api/pos/bills/${other.id}/items/${other.draft[0].id}/excise`,
      headers: auth(store.sellerToken),
      payload: { excise_labels: [STAMP_A] },
    });
    expect(taken.json()).toMatchObject({ code: 'excise_label_taken', label: STAMP_A });

    expect((await fire()).statusCode).toBe(200);
    const paid = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${bill.id}/pay`,
      headers: auth(store.sellerToken),
      payload: { parts: [{ payments: [{ method: 'card', amount_cents: 30_000 }], client_uuid: randomUUID() }] },
    });
    expect(paid.statusCode).toBe(200);
    const [doc] = docsOf(bar);
    expect(doc.lines[0].exciseLabels).toEqual([STAMP_A]);
    const held = await pool.query(
      `SELECT sale_item_id FROM pos_excise_labels WHERE store_id = $1 AND label = $2 AND released_at IS NULL`,
      [store.storeId, STAMP_A]
    );
    expect(held.rows[0].sale_item_id).not.toBeNull();
  });

  it('frees a bottle’s stamp when its round is cancelled', async () => {
    const bill = await draftBill();
    await bills.setDraftExciseLabels(store.storeId, store.sellerId, bill.id, bill.draft[0].id, [STAMP_B]);
    const fired = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${bill.id}/fire`,
      headers: auth(store.sellerToken),
      payload: { client_uuid: randomUUID() },
    });
    expect(fired.statusCode).toBe(200);
    const roundId = fired.json().rounds[0].id;
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${bill.id}/rounds/${roundId}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(cancelled.statusCode).toBe(200);
    expect((await sell([{ variant_id: bottle, quantity: 1, excise_labels: [STAMP_B] }], 30_000)).statusCode).toBe(201);
  });

  // ── on credit ───────────────────────────────────────────────────────────

  it('never puts excise goods on credit, on either register', async () => {
    await pool.query(`DELETE FROM pos_fiscal_registers WHERE store_id = $1`, [store.storeId]);
    const customer = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, 'Оля', $2, 100000) RETURNING id`,
      [store.storeId, `+38050${Date.now().toString().slice(-7)}`]
    );
    await expect(
      issueOnCredit({
        storeId: store.storeId,
        staffId: store.sellerId,
        customerId: Number(customer.rows[0].id),
        items: [{ variant_id: beer, quantity: 1 }],
        client_uuid: randomUUID(),
      } as never)
    ).rejects.toSatisfy((error: unknown) => error instanceof DebtConflict && (error as DebtConflict).code === 'excise_goods');
  });
});
