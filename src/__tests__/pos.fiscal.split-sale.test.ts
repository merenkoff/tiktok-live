// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.split-sale.test.ts
//
// One cart, one receipt per register (ДК2-Б, TechDocs/POS_DUAL_REGISTER.md
// §4.2): food and alcohol rung at the till become two receipts, one payment
// shared out by decision Д8 — every receipt but the last takes exactly what
// it owes, the last takes the rest and the change. Two fakes behind one
// `cashalot` id, picked by the licence (helpers/split-fiscal-provider.ts).

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings, updateRegisterSettings } from '../pos/fiscal/settings.service.js';
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

describe.skipIf(!hasDb)('POS fiscal: a cart split between registers (ДК2-Б)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let food: FakeFiscalProvider;
  let bar: FakeFiscalProvider;
  let borscht = 0;
  let vodka = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rsplit');
    borscht = (await seedProduct(store.storeId, { name: 'Борщ', priceCents: 12_345, quantity: 500 }))
      .variantId;
    const v = await seedProduct(store.storeId, { name: 'Горілка 50 мл', priceCents: 6_000, quantity: 500 });
    vodka = v.variantId;
    await pool.query(`UPDATE pos_products SET fiscal_register = 2 WHERE id = $1`, [v.productId]);
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

  // A function: the ids exist only once `beforeAll` has seeded them.
  const cart = () => [
    { variant_id: borscht, quantity: 1 },
    { variant_id: vodka, quantity: 2 },
  ];

  const ring = (body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: { items: cart(), split_registers: true, client_uuid: randomUUID(), ...body },
    });

  const salesCount = async () =>
    Number(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM pos_sales WHERE store_id = $1`, [store.storeId]))
        .rows[0].n
    );

  const paidOf = async (saleId: number) =>
    Number(
      (await pool.query(`SELECT SUM(amount_cents)::int AS n FROM pos_payments WHERE sale_id = $1`, [saleId]))
        .rows[0].n
    );

  const registered = (fake: FakeFiscalProvider) => fake.calls.filter((c) => c.method === 'registerSale');

  it('rings food and alcohol as two receipts, the change on the last, as quoted', async () => {
    const payload = {
      items: cart(),
      payments: [{ method: 'cash', amount_cents: 30_000 }],
      cash_rounding: 10,
    };
    const quote = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/split-quote',
      headers: auth(store.sellerToken),
      payload,
    });
    expect(quote.statusCode).toBe(200);
    expect(quote.json().parts.map((p: { register_no: number }) => p.register_no)).toEqual([1, 2]);
    expect(quote.json().parts[1]).toMatchObject({ label: 'Бар', item_indexes: [1] });

    const res = await ring(payload);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.split).toBe(true);
    expect(body.parts.map((p: { register_no: number }) => p.register_no)).toEqual([1, 2]);
    // Each receipt says its register, so the till prints it with that ФОП's requisites.
    expect(body.parts.map((p: { sale: { fiscal_register: number } }) => p.sale.fiscal_register)).toEqual([1, 2]);
    expect(registered(food)).toHaveLength(1);
    expect(registered(bar)).toHaveLength(1);

    const [first, second] = body.parts.map((p: { sale: { id: number } }) => p.sale);
    const dues = quote.json().parts.map((p: { due_cents: number }) => p.due_cents);
    expect(await paidOf(first.id)).toBe(dues[0]);
    expect(Number(second.total_cents) + Number(second.rounding_cents)).toBe(dues[1]);
    expect((await paidOf(first.id)) + (await paidOf(second.id))).toBe(30_000);
    const registers = (
      await pool.query(`SELECT fiscal_register FROM pos_sales WHERE id = ANY($1::bigint[]) ORDER BY id`, [
        [first.id, second.id],
      ])
    ).rows.map((r) => r.fiscal_register);
    expect(registers).toEqual([1, 2]);
  });

  it('refuses mixed payment and too little money, writing nothing', async () => {
    const before = await salesCount();
    const mixed = await ring({
      payments: [
        { method: 'cash', amount_cents: 12_345 },
        { method: 'card', amount_cents: 12_000 },
      ],
    });
    expect(mixed.statusCode).toBe(409);
    expect(mixed.json().error).toBe('split_mixed_payment');

    const short = await ring({ payments: [{ method: 'card', amount_cents: 20_000 }] });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe('insufficient_payment');

    expect(await salesCount()).toBe(before);
    expect(registered(food)).toHaveLength(0);
    expect(registered(bar)).toHaveLength(0);
  });

  it('keeps the food receipt when the bar refuses, and names the lines left', async () => {
    await shifts.openShift((await shifts.resolveContext(store.storeId, 1))!, AbortSignal.timeout(10_000), store.sellerId);
    await shifts.openShift((await shifts.resolveContext(store.storeId, 2))!, AbortSignal.timeout(10_000), store.sellerId);
    bar.queueError('rejected', 'refused by the provider');

    const res = await ring({ payments: [{ method: 'card', amount_cents: 24_345 }] });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body).toMatchObject({
      error: 'split_part_failed',
      stage: 'document',
      register_no: 2,
      sale_voided: true,
      not_taken_items: [1],
      not_taken_cents: 12_000,
    });
    expect(body.parts).toHaveLength(1);
    const kept = (await pool.query(`SELECT status FROM pos_sales WHERE id = $1`, [body.sale_ids[0]])).rows[0];
    expect(kept.status).toBe('completed');
    const undone = (await pool.query(`SELECT status FROM pos_sales WHERE id = $1`, [body.sale_id])).rows[0];
    expect(undone.status).toBe('voided');
  });

  it('answers a repeated request with the same two receipts and rings nothing again', async () => {
    const key = randomUUID();
    const first = await ring({ client_uuid: key, payments: [{ method: 'card', amount_cents: 24_345 }] });
    expect(first.statusCode).toBe(201);
    const calls = registered(food).length + registered(bar).length;

    const again = await ring({ client_uuid: key, payments: [{ method: 'card', amount_cents: 24_345 }] });
    expect(again.statusCode).toBe(201);
    expect(again.json().parts.map((p: { sale: { id: number } }) => p.sale.id)).toEqual(
      first.json().parts.map((p: { sale: { id: number } }) => p.sale.id)
    );
    expect(registered(food).length + registered(bar).length).toBe(calls);
  });

  it('shares a fixed cart discount out to the kopeck', async () => {
    const res = await ring({
      payments: [{ method: 'card', amount_cents: 24_345 }],
      cart_discount: { type: 'fixed', value: 1_001 },
    });
    expect(res.statusCode).toBe(201);
    const discounts = res
      .json()
      .parts.map((p: { sale: { cart_discount_cents: number } }) => Number(p.sale.cart_discount_cents));
    expect(discounts.reduce((a: number, b: number) => a + b, 0)).toBe(1_001);
  });
});
