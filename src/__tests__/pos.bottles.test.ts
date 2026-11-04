// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.bottles.test.ts
//
// Open bottles at the till (track ДК, ДК5-А, TechDocs/POS_DUAL_REGISTER.md
// §4.4, migration 093). A shot of vodka pours 50 ml out of the bottle the bar
// has open; the bottle's excise stamp goes on the receipt of the FIRST pour
// from it and on no other (З2); a pour that would open a bottle without its
// stamp is refused with every bottle named (Д4); the count reaching the
// bottle's size always asks for a new stamp (Д19); and a line that pours from
// a stamped bottle — a coffee with a cognac answer — is that bottle's
// register's excise goods (Д20). «Шабля» again: food on register 1, alcohol
// on register 2, two fakes behind one `cashalot` id.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { issueOnCredit } from '../pos/debts.service.js';
import { DebtConflict } from '../pos/debt-lines.service.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { resetRateLimiter } from '../pos/fiscal/rateLimit.js';
import { resetRuntime } from '../pos/fiscal/runtime.js';
import { updateFiscalSettings, updateRegisterSettings } from '../pos/fiscal/settings.service.js';
import type { FiscalSaleDoc } from '../pos/fiscal/types.js';
import * as modifiers from '../pos/modifiers.service.js';
import { createPreorder, PreorderError } from '../pos/preorders.service.js';
import { createProduct } from '../pos/products.service.js';
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

const STAMP_A = 'ANFC015604';
const STAMP_B = 'AICY275034';
const STAMP_C = 'AATE508932 0000412168';

describe.skipIf(!hasDb)('POS open bottles at the till (ДК5-А)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let food: FakeFiscalProvider;
  let bar: FakeFiscalProvider;
  let previousKey: string | undefined;
  /** The bottle ingredients, counted in ml. */
  let vodka = 0;
  let liqueur = 0;
  let cognac = 0;
  /** What is sold. */
  let shot = 0;
  let cocktail = 0;
  let coffee = 0;
  let coffeeProduct = 0;
  let withCognac = 0;

  const ingredient = async (name: string, uktzed: string, bottleMl: number) => {
    const made = await createProduct(store.storeId, {
      name,
      sellable: false,
      fiscal_excise: true,
      fiscal_uktzed: uktzed,
      fiscal_register: 2,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, quantity: 20_000, bottle_ml: bottleMl }],
    } as never);
    return Number((made!.variants[0] as { id: number }).id);
  };
  const pour = async (name: string, priceCents: number, components: Array<[number, number]>) => {
    const made = await createProduct(store.storeId, {
      name,
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: priceCents,
          components: components.map(([id, quantity]) => ({ component_variant_id: id, quantity })),
        },
      ],
    } as never);
    return Number((made!.variants[0] as { id: number }).id);
  };

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rbottles');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    vodka = await ingredient('Горілка «Хлібний дар»', '2208601100', 500);
    liqueur = await ingredient('Лікер кавовий', '2208709000', 700);
    cognac = await ingredient('Коньяк', '2208201200', 500);
    shot = await pour('Горілка 50', 9_000, [[vodka, 50]]);
    cocktail = await pour('Black Russian', 18_000, [
      [vodka, 50],
      [liqueur, 25],
    ]);
    const c = await seedProduct(store.storeId, { name: 'Кава', priceCents: 5_000, quantity: 500 });
    coffee = c.variantId;
    coffeeProduct = c.productId;
    let group = await modifiers.createGroup(store.storeId, { name: 'Додати', min_select: 0, max_select: 1 });
    group = await modifiers.createModifier(store.storeId, group.id, {
      name: 'коньяк 20 мл',
      price_delta_cents: 6_000,
      component_variant_id: cognac,
      component_quantity: 20,
    });
    await modifiers.setProductGroups(store.storeId, coffeeProduct, [group.id]);
    const answers = await pool.query(`SELECT id FROM pos_modifiers WHERE group_id = $1`, [group.id]);
    withCognac = Number(answers.rows[0].id);
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
    await pool.query(`DELETE FROM pos_bottle_pours WHERE store_id = $1`, [store.storeId]);
    await pool.query(`DELETE FROM pos_open_bottles WHERE store_id = $1`, [store.storeId]);
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

  const sell = (
    items: Array<Record<string, unknown>>,
    amount: number,
    openBottles?: Array<{ variant_id: number; excise_label: string }>
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items,
        payments: [{ method: 'cash', amount_cents: amount }],
        client_uuid: randomUUID(),
        ...(openBottles ? { open_bottles: openBottles } : {}),
      },
    });
  const docsOf = (fake: FakeFiscalProvider, method = 'registerSale') =>
    fake.calls.filter((c) => c.method === method).map((c) => c.doc as FiscalSaleDoc);
  const bottlesOf = async (variantId: number) =>
    (
      await pool.query(
        `SELECT label, capacity_ml, poured_ml, label_pending, closed_at IS NOT NULL AS closed, close_reason
           FROM pos_open_bottles WHERE store_id = $1 AND variant_id = $2 ORDER BY id`,
        [store.storeId, variantId]
      )
    ).rows;
  /** Open a bottle and leave `left` ml in it, through the till as a shift would. */
  const openWith = async (variantId: number, label: string, capacity: number, left: number) => {
    await pool.query(
      `INSERT INTO pos_open_bottles (store_id, variant_id, label, capacity_ml, poured_ml, label_pending)
       VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [store.storeId, variantId, label, capacity, capacity - left]
    );
  };

  // ── the card ────────────────────────────────────────────────────────────

  it('lets only excise goods counted in ml open by a stamp, never one sold whole', async () => {
    const create = (body: Record<string, unknown>, variant: Record<string, unknown> = {}) =>
      app.inject({
        method: 'POST',
        url: '/api/pos/products',
        headers: auth(store.ownerToken),
        payload: {
          name: `Віскі ${randomUUID().slice(0, 6)}`,
          variants: [{ attributes: {}, unit: 'мл', price_cents: 200, bottle_ml: 700, ...variant }],
          ...body,
        },
      });
    expect((await create({})).json().error).toMatch(/лише для підакцизного/);
    expect((await create({ fiscal_excise: true, fiscal_uktzed: '2208301100' }, { unit: 'шт' })).json().error).toMatch(
      /у мл/
    );
    expect(
      (await create({ fiscal_excise: true, excise_per_unit: true, fiscal_uktzed: '2208301100' })).json().error
    ).toMatch(/з маркою на кожну одиницю/);
    const made = await create({ fiscal_excise: true, fiscal_uktzed: '2208301100' });
    expect(made.statusCode).toBe(201);
    expect(made.json().variants[0].bottle_ml).toBe(700);

    const catalog = await app.inject({
      method: 'GET',
      url: '/api/pos/catalog?include_unsellable=1',
      headers: auth(store.sellerToken),
    });
    const rows = catalog.json() as Array<{ variant_id: number; bottle_ml?: number; fiscal_register: number }>;
    expect(rows.find((r) => r.variant_id === vodka)).toMatchObject({ bottle_ml: 500, fiscal_register: 2 });
    // A pour of it goes where the bottle goes, though its own card names no register (Д20).
    expect(rows.find((r) => r.variant_id === shot)).toMatchObject({ fiscal_register: 2 });
    expect(rows.find((r) => r.variant_id === shot)?.bottle_ml).toBeUndefined();
  });

  // ── the first pour carries the stamp ────────────────────────────────────

  it('asks for the bottle’s stamp, puts it on the first pour and on no other', async () => {
    const asked = await sell([{ variant_id: shot, quantity: 1 }], 9_000);
    expect(asked.statusCode).toBe(409);
    expect(asked.json()).toMatchObject({
      error: 'bottle_needed',
      bottles: [{ variant_id: vodka, count: 1 }],
    });
    expect(asked.json().message).toMatch(/Відкрийте нову пляшку: «Горілка «Хлібний дар»/);
    expect(await bottlesOf(vodka)).toEqual([]);

    // The bar's scanner under a Ukrainian layout: the same stamp (#382).
    const first = await sell([{ variant_id: shot, quantity: 1 }], 9_000, [{ variant_id: vodka, excise_label: 'ФТАС015604' }]);
    expect(first.statusCode).toBe(201);
    expect(first.json().items[0]).toMatchObject({ excise: true, bottle_labels: [STAMP_A] });
    expect(first.json().items[0].excise_labels).toBeUndefined();
    const [doc] = docsOf(bar);
    expect(doc.lines[0]).toMatchObject({ excise: true, exciseLabels: [STAMP_A], uktzed: '2208601100' });
    expect(docsOf(food)).toHaveLength(0);

    const second = await sell([{ variant_id: shot, quantity: 2 }], 18_000);
    expect(second.statusCode).toBe(201);
    const [, next] = docsOf(bar);
    expect(next.lines[0].excise).toBe(true);
    expect(next.lines[0].exciseLabels).toBeUndefined();
    expect(await bottlesOf(vodka)).toEqual([
      expect.objectContaining({ label: STAMP_A, poured_ml: 150, label_pending: false, closed: false }),
    ]);

    // An open bottle's stamp can never also sell as a whole bottle.
    const again = await sell([{ variant_id: shot, quantity: 1 }], 9_000, [{ variant_id: vodka, excise_label: STAMP_A }]);
    expect(again.statusCode).toBe(201);
    expect(await bottlesOf(vodka)).toHaveLength(1);
  });

  it('takes the end of one bottle and the start of the next, and the new stamp goes on that pour (Д19)', async () => {
    await openWith(vodka, STAMP_A, 500, 20);
    const asked = await sell([{ variant_id: shot, quantity: 1 }], 9_000);
    expect(asked.json()).toMatchObject({ error: 'bottle_needed', bottles: [{ variant_id: vodka, count: 1 }] });
    // Refused whole: the old bottle still has its 20 ml.
    expect((await bottlesOf(vodka))[0]).toMatchObject({ poured_ml: 480, closed: false });

    const sold = await sell([{ variant_id: shot, quantity: 1 }], 9_000, [{ variant_id: vodka, excise_label: STAMP_B }]);
    expect(sold.statusCode).toBe(201);
    expect(sold.json().items[0].bottle_labels).toEqual([STAMP_B]);
    expect(await bottlesOf(vodka)).toEqual([
      expect.objectContaining({ label: STAMP_A, poured_ml: 500, closed: true, close_reason: 'empty' }),
      expect.objectContaining({ label: STAMP_B, poured_ml: 30, closed: false }),
    ]);
  });

  it('counts every bottle a sale would open, and a cocktail of two new bottles carries both stamps', async () => {
    await openWith(vodka, STAMP_A, 500, 40);
    // Twelve shots: the old 40 ml, one whole new bottle, and the start of another.
    const asked = await sell([{ variant_id: shot, quantity: 12 }], 108_000);
    expect(asked.json()).toMatchObject({ error: 'bottle_needed', bottles: [{ variant_id: vodka, count: 2 }] });

    await pool.query(`DELETE FROM pos_open_bottles WHERE store_id = $1`, [store.storeId]);
    const both = await sell([{ variant_id: cocktail, quantity: 1 }], 18_000);
    expect(both.json().bottles.map((b: { variant_id: number }) => b.variant_id).sort()).toEqual(
      [vodka, liqueur].sort()
    );
    const sold = await sell([{ variant_id: cocktail, quantity: 1 }], 18_000, [
      { variant_id: vodka, excise_label: STAMP_A },
      { variant_id: liqueur, excise_label: STAMP_B },
    ]);
    expect(sold.statusCode).toBe(201);
    const [doc] = docsOf(bar);
    expect([...(doc.lines[0].exciseLabels ?? [])].sort()).toEqual([STAMP_A, STAMP_B].sort());
  });

  it('refuses a stamp already sold, and leaves nothing of the refused sale', async () => {
    const whole = await seedProduct(store.storeId, { name: 'Горілка 0,5 ціла', priceCents: 30_000, quantity: 5 });
    await pool.query(
      `UPDATE pos_products SET fiscal_register = 2, fiscal_excise = TRUE, excise_per_unit = TRUE,
              fiscal_uktzed = '2208601100' WHERE id = $1`,
      [whole.productId]
    );
    expect((await sell([{ variant_id: whole.variantId, quantity: 1, excise_labels: [STAMP_C] }], 30_000)).statusCode).toBe(201);
    const taken = await sell([{ variant_id: shot, quantity: 1 }], 9_000, [{ variant_id: vodka, excise_label: STAMP_C }]);
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: 'excise_label_taken', label: STAMP_C });
    expect(await bottlesOf(vodka)).toEqual([]);
  });

  // ── undoing ─────────────────────────────────────────────────────────────

  it('gives a voided pour back to its bottle, and its stamp to the next pour', async () => {
    const first = await sell([{ variant_id: shot, quantity: 1 }], 9_000, [{ variant_id: vodka, excise_label: STAMP_A }]);
    expect(first.statusCode).toBe(201);
    await voidSale({ storeId: store.storeId, saleId: first.json().id, staffId: store.sellerId });
    expect((await bottlesOf(vodka))[0]).toMatchObject({ poured_ml: 0, label_pending: true, closed: false });

    const next = await sell([{ variant_id: shot, quantity: 1 }], 9_000);
    expect(next.statusCode).toBe(201);
    expect(next.json().items[0].bottle_labels).toEqual([STAMP_A]);
  });

  it('puts the stamp on the return of the pour that carried it, pours nothing back, and the next pour carries it', async () => {
    const first = await sell([{ variant_id: shot, quantity: 2 }], 18_000, [{ variant_id: vodka, excise_label: STAMP_A }]);
    const item = first.json().items[0];
    const refund = (quantity: number) =>
      app.inject({
        method: 'POST',
        url: `/api/pos/sales/${first.json().id}/refunds`,
        headers: auth(store.sellerToken),
        payload: { items: [{ sale_item_id: item.id, quantity }], method: 'cash', client_uuid: randomUUID() },
      });

    // One of two shots back: the line still stands, the stamp stays with it.
    expect((await refund(1)).statusCode).toBe(200);
    expect(docsOf(bar, 'registerRefund')[0].lines[0].exciseLabels).toBeUndefined();
    expect((await bottlesOf(vodka))[0]).toMatchObject({ poured_ml: 100, label_pending: false });

    // The other: the line no longer stands.
    expect((await refund(1)).statusCode).toBe(200);
    expect(docsOf(bar, 'registerRefund')[1].lines[0]).toMatchObject({ excise: true, exciseLabels: [STAMP_A] });
    expect((await bottlesOf(vodka))[0]).toMatchObject({ poured_ml: 100, label_pending: true });

    const next = await sell([{ variant_id: shot, quantity: 1 }], 9_000);
    expect(next.json().items[0].bottle_labels).toEqual([STAMP_A]);
  });

  it('never pours one bottle twice for two tills at once', async () => {
    await openWith(vodka, STAMP_A, 500, 50);
    const [a, b] = await Promise.all([
      sell([{ variant_id: shot, quantity: 1 }], 9_000),
      sell([{ variant_id: shot, quantity: 1 }], 9_000),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect((await bottlesOf(vodka))[0]).toMatchObject({ poured_ml: 500, closed: true });
  });

  // ── excise by what it pours (Д20) ───────────────────────────────────────

  it('sells a coffee with a cognac answer on the bar’s register as excise goods with the cognac’s code', async () => {
    const plain = await sell([{ variant_id: coffee, quantity: 1 }], 5_000);
    expect(plain.statusCode).toBe(201);
    expect(docsOf(food)[0].lines[0].excise).toBeUndefined();

    const spiked = await sell([{ variant_id: coffee, quantity: 1, modifiers: [withCognac] }], 11_000, [
      { variant_id: cognac, excise_label: STAMP_B },
    ]);
    expect(spiked.statusCode).toBe(201);
    const [doc] = docsOf(bar);
    expect(doc.lines[0]).toMatchObject({ excise: true, exciseLabels: [STAMP_B], uktzed: '2208201200' });

    // A cart of both is two registers: the till is told to split it.
    const both = await sell(
      [
        { variant_id: coffee, quantity: 1 },
        { variant_id: coffee, quantity: 1, modifiers: [withCognac] },
      ],
      16_000
    );
    expect(both.statusCode).toBe(409);
    expect(both.json().error).toBe('split_needs_update');
  });

  it('never pours on credit or into a pre-order', async () => {
    const customer = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, 'Оля', $2, 100000) RETURNING id`,
      [store.storeId, `+38050${Date.now().toString().slice(-7)}`]
    );
    await pool.query(`DELETE FROM pos_fiscal_registers WHERE store_id = $1`, [store.storeId]);
    await expect(
      issueOnCredit({
        storeId: store.storeId,
        staffId: store.sellerId,
        customerId: Number(customer.rows[0].id),
        items: [{ variant_id: coffee, quantity: 1, modifiers: [withCognac] }],
        client_uuid: randomUUID(),
      } as never)
    ).rejects.toSatisfy((error: unknown) => error instanceof DebtConflict && (error as DebtConflict).code === 'excise_goods');
    await expect(
      createPreorder({
        storeId: store.storeId,
        staffId: store.sellerId,
        clientUuid: randomUUID(),
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        items: [{ variant_id: shot, quantity: 1 }],
      })
    ).rejects.toBeInstanceOf(PreorderError);
  });
});
