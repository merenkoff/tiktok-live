// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.debts.test.ts — goods given «під запис» (migration 073,
// TechDocs/grocery/G3_DEBTS.md): the owner's limit, the handover, a return
// from an unpaid line, the owner's write-off, and what the till and the owner
// read back. Paying a debt off is pos.debts-payment.test.ts.
//
// One thing is checked after every write: the customer's balance is both the
// sum of the journal and what the open lines still owe (G3_DEBTS.md,
// decision 1). If those ever drift apart, the notebook is lying.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { setComponents } from '../pos/composites.service.js';
import { owedCents } from '../pos/debt-lines.service.js';
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

describe.skipIf(!hasDb)('POS «під запис» — the journal', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let bread = 0;
  let milk = 0;
  let rose = 0;
  let customerSeq = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('debts');
    bread = (await seedProduct(store.storeId, { name: 'Хліб', priceCents: 3200, quantity: 100 })).variantId;
    milk = (await seedProduct(store.storeId, { name: 'Молоко', priceCents: 4500, quantity: 100 })).variantId;
    rose = (await seedProduct(store.storeId, { name: 'Троянда', priceCents: 6000, quantity: 100 })).variantId;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  async function customer(limitCents: number | null = 100000): Promise<number> {
    customerSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [store.storeId, `Покупець ${customerSeq}`, `+38050000${String(customerSeq).padStart(4, '0')}`, limitCents]
    );
    return Number(row.rows[0].id);
  }

  const issue = (body: Record<string, unknown>, token = store.sellerToken) =>
    app.inject({ method: 'POST', url: '/api/pos/debts/issue', headers: auth(token), payload: body });
  const post = (url: string, body: Record<string, unknown>, token = store.sellerToken) =>
    app.inject({ method: 'POST', url, headers: auth(token), payload: body });
  const get = (url: string, token = store.sellerToken) =>
    app.inject({ method: 'GET', url, headers: auth(token) });

  const stockOf = async (variantId: number): Promise<number> =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);

  const movements = async (referenceType: string, referenceId: number) =>
    (
      await pool.query(
        `SELECT variant_id, delta, reason FROM pos_stock_movements
          WHERE store_id = $1 AND reference_type = $2 AND reference_id = $3 ORDER BY id`,
        [store.storeId, referenceType, referenceId]
      )
    ).rows.map((r) => ({ variant_id: Number(r.variant_id), delta: Number(r.delta), reason: String(r.reason) }));

  /** Decision 1 of G3_DEBTS.md: the journal and the open lines say the same thing. */
  async function expectBalanced(customerId: number): Promise<number> {
    const journal = Number(
      (
        await pool.query(
          `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM pos_debt_entries WHERE store_id = $1 AND customer_id = $2`,
          [store.storeId, customerId]
        )
      ).rows[0].s
    );
    const lines = await pool.query(
      `SELECT quantity, returned_quantity, line_total_cents FROM pos_debt_items
        WHERE store_id = $1 AND customer_id = $2
          AND sale_id IS NULL AND written_off_entry_id IS NULL AND returned_quantity < quantity`,
      [store.storeId, customerId]
    );
    const owed = lines.rows.reduce(
      (sum, r) =>
        sum +
        owedCents({
          line_total_cents: Number(r.line_total_cents),
          quantity: Number(r.quantity),
          returned_quantity: Number(r.returned_quantity),
        }),
      0
    );
    expect(journal).toBe(owed);
    return journal;
  }

  // ── the owner's limit ──────────────────────────────────────────────────

  describe('the limit', () => {
    it('is the owner’s to set, and a cashier is refused', async () => {
      const id = await customer(null);
      const seller = await app.inject({
        method: 'PATCH',
        url: `/api/pos/debts/customers/${id}/credit`,
        headers: auth(store.sellerToken),
        payload: { credit_limit_cents: 50000 },
      });
      expect(seller.statusCode).toBe(403);

      const owner = await app.inject({
        method: 'PATCH',
        url: `/api/pos/debts/customers/${id}/credit`,
        headers: auth(store.ownerToken),
        payload: { credit_limit_cents: 50000 },
      });
      expect(owner.statusCode).toBe(200);
      expect(owner.json()).toMatchObject({
        customer_id: id,
        limit_cents: 50000,
        locked: false,
        balance_cents: 0,
        available_cents: 50000,
      });
      expect(owner.json().set_at).toBeTruthy();
    });

    it('refuses a limit out of range and a lock that is not yes or no', async () => {
      const id = await customer(null);
      const patch = (payload: Record<string, unknown>) =>
        app.inject({
          method: 'PATCH',
          url: `/api/pos/debts/customers/${id}/credit`,
          headers: auth(store.ownerToken),
          payload,
        });
      expect((await patch({ credit_limit_cents: 50 })).statusCode).toBe(400);
      expect((await patch({ credit_limit_cents: 12.5 })).statusCode).toBe(400);
      expect((await patch({ credit_locked: 'yes' })).statusCode).toBe(400);
      expect((await patch({})).statusCode).toBe(400);
      // NULL is a real answer: no more credit for this person.
      expect((await patch({ credit_limit_cents: null })).json().limit_cents).toBeNull();
    });

    it('answers 404 for a customer of another store', async () => {
      const other = await createTestStore('debts-other');
      try {
        const foreign = Number(
          (
            await pool.query(
              `INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents) VALUES ($1, 'Чужий', '+380990000001', 100000) RETURNING id`,
              [other.storeId]
            )
          ).rows[0].id
        );
        expect((await get(`/api/pos/debts/customers/${foreign}`)).statusCode).toBe(404);
        const res = await issue({ customer_id: foreign, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(other.storeId);
      }
    });
  });

  // ── giving goods ───────────────────────────────────────────────────────

  describe('giving goods «під запис»', () => {
    it('refuses a customer the owner gave no limit (Д2)', async () => {
      const id = await customer(null);
      const res = await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('no_credit');
      expect(res.json().error).toContain('власник');
    });

    it('refuses a locked customer', async () => {
      const id = await customer(100000);
      await pool.query(`UPDATE pos_customers SET credit_locked = TRUE WHERE id = $1`, [id]);
      const res = await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('credit_locked');
    });

    it('refuses to go over the limit, and says by how much in figures (Д3)', async () => {
      const id = await customer(10000);
      const ok = await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 2 }] });
      expect(ok.statusCode).toBe(201);
      const stock = await stockOf(milk);

      const res = await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: milk, quantity: 1 }] });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        code: 'over_limit',
        balance_cents: 6400,
        attempt_cents: 4500,
        limit_cents: 10000,
        available_cents: 3600,
      });
      expect(res.json().error).toContain('64,00 ₴');
      expect(await stockOf(milk)).toBe(stock);
      await expectBalanced(id);
    });

    it('lets only one of two tills squeeze under the same limit', async () => {
      const id = await customer(5000);
      const [a, b] = await Promise.all([
        issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] }),
        issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] }),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
      expect(await expectBalanced(id)).toBe(3200);
    });

    it('prices the cart as a sale would, moves stock as `credit` and records the lines', async () => {
      const id = await customer(100000);
      const breadBefore = await stockOf(bread);
      const milkBefore = await stockOf(milk);
      const res = await issue({
        customer_id: id,
        client_uuid: randomUUID(),
        items: [
          { variant_id: bread, quantity: 2 },
          { variant_id: milk, quantity: 1 },
          { variant_id: bread, quantity: 1 },
        ],
        note: 'до зарплати',
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.replay).toBe(false);
      expect(body.entry).toMatchObject({ kind: 'issue', amount_cents: 14100, reason: 'до зарплати' });
      // The two bread lines merge, the way checkout merges them.
      expect(body.lines).toHaveLength(2);
      expect(body.lines.find((l: { product_name: string }) => l.product_name === 'Хліб')).toMatchObject({
        quantity: 3,
        unit_price_cents: 3200,
        line_total_cents: 9600,
        owed_cents: 9600,
        status: 'open',
      });
      expect(body.credit).toMatchObject({ balance_cents: 14100, limit_cents: 100000, available_cents: 85900 });

      expect(await stockOf(bread)).toBe(breadBefore - 3);
      expect(await stockOf(milk)).toBe(milkBefore - 1);
      const moved = await movements('debt_issue', body.entry.id);
      expect(moved.map((m) => m.reason)).toEqual(['credit', 'credit']);
      expect(moved.reduce((sum, m) => sum + m.delta, 0)).toBe(-4);
      await expectBalanced(id);
    });

    it('takes the cart discount the way a sale shares it out', async () => {
      const id = await customer(100000);
      const res = await issue({
        customer_id: id,
        client_uuid: randomUUID(),
        items: [
          { variant_id: bread, quantity: 1 },
          { variant_id: milk, quantity: 1 },
        ],
        cart_discount: { type: 'percent', value: 10 },
      });
      expect(res.statusCode).toBe(201);
      const lines = res.json().lines as Array<{ line_discount_cents: number; line_total_cents: number }>;
      // 10 % of 77,00 is 7,70, shared by value and the remainder on the last line.
      expect(lines.reduce((sum, l) => sum + l.line_discount_cents, 0)).toBe(770);
      expect(res.json().entry.amount_cents).toBe(6930);
      await expectBalanced(id);
    });

    it('is idempotent on client_uuid: the same tap gives the goods once', async () => {
      const id = await customer(100000);
      const uuid = randomUUID();
      const before = await stockOf(bread);
      const first = await issue({ customer_id: id, client_uuid: uuid, items: [{ variant_id: bread, quantity: 1 }] });
      const again = await issue({ customer_id: id, client_uuid: uuid, items: [{ variant_id: bread, quantity: 1 }] });
      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(again.json().replay).toBe(true);
      expect(again.json().entry.id).toBe(first.json().entry.id);
      expect(await stockOf(bread)).toBe(before - 1);

      // The same key cannot be spent on a different kind of write.
      const reused = await post(`/api/pos/debts/customers/${id}/return`, {
        client_uuid: uuid,
        lines: [{ line_id: first.json().lines[0].id, quantity: 1 }],
      });
      expect(reused.statusCode).toBe(409);
      expect(reused.json().code).toBe('uuid_taken');
    });

    it('refuses what a sale would refuse: an archived card, the stop-list, a bouquet put together at the till', async () => {
      const id = await customer(100000);
      const archived = (await seedProduct(store.storeId, { name: 'Старий товар', priceCents: 1000 })).variantId;
      await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [archived]);
      expect(
        (await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: archived, quantity: 1 }] }))
          .statusCode
      ).toBe(400);

      const stopped = await seedProduct(store.storeId, { name: 'Борщ', priceCents: 9000 });
      await pool.query(
        `UPDATE pos_products SET stop_listed_on = (NOW() AT TIME ZONE 'Europe/Kyiv')::date WHERE id = $1`,
        [stopped.productId]
      );
      const stop = await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: stopped.variantId, quantity: 1 }] });
      expect(stop.statusCode).toBe(409);
      expect(stop.json().code).toBe('stop_listed');

      const bouquet = await issue({
        customer_id: id,
        client_uuid: randomUUID(),
        items: [{ variant_id: rose, quantity: 1, components: [{ component_variant_id: rose, quantity: 3 }] }],
      });
      expect(bouquet.statusCode).toBe(400);
      expect(bouquet.json().error).toContain('Букет');

      expect((await issue({ client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] })).statusCode).toBe(400);
      expect((await issue({ customer_id: id, items: [{ variant_id: bread, quantity: 1 }] })).statusCode).toBe(400);
      expect(await expectBalanced(id)).toBe(0);
    });

    it('writes a catalogue bouquet’s stems off and remembers them on the line', async () => {
      const product = await pool.query(
        `INSERT INTO pos_products (store_id, name, kind, stock_mode) VALUES ($1, 'Букет «Ніжність»', 'composite', 'derived') RETURNING id`,
        [store.storeId]
      );
      const variant = await pool.query(
        `INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
         VALUES ($1, $2, '{}'::jsonb, '', 'шт', 15000, 0) RETURNING id`,
        [store.storeId, product.rows[0].id]
      );
      const bouquet = Number(variant.rows[0].id);
      await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 0)`, [bouquet, store.storeId]);
      await setComponents(pool, store.storeId, bouquet, [{ component_variant_id: rose, quantity: 3 }]);

      const id = await customer(100000);
      const roses = await stockOf(rose);
      const res = await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bouquet, quantity: 2 }] });
      expect(res.statusCode).toBe(201);
      expect(await stockOf(rose)).toBe(roses - 6);
      const snapshot = await pool.query(
        `SELECT component_variant_id, quantity_per_unit FROM pos_debt_item_components WHERE debt_item_id = $1`,
        [res.json().lines[0].id]
      );
      expect(snapshot.rows.map((r) => [Number(r.component_variant_id), Number(r.quantity_per_unit)])).toEqual([[rose, 3]]);
    });
  });

  // ── taking goods back ──────────────────────────────────────────────────

  describe('a return from an unpaid line', () => {
    it('gives back part of a line: stock as `credit`, the entry worth the units returned', async () => {
      const id = await customer(100000);
      const given = (await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 3 }] })).json();
      const line = given.lines[0];
      const before = await stockOf(bread);

      const res = await post(`/api/pos/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: line.id, quantity: 1 }],
        reason: 'не той хліб',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entry).toMatchObject({ kind: 'return', amount_cents: -3200 });
      expect(res.json().lines[0]).toMatchObject({ remaining_quantity: 2, owed_cents: 6400 });
      expect(await stockOf(bread)).toBe(before + 1);
      expect((await movements('debt_return', res.json().entry.id))[0]).toMatchObject({ delta: 1, reason: 'credit' });
      expect(await expectBalanced(id)).toBe(6400);
    });

    it('splits a discounted line by the same rounding a refund uses, so the units add up exactly', async () => {
      const id = await customer(100000);
      const given = (
        await issue({
          customer_id: id,
          client_uuid: randomUUID(),
          items: [{ variant_id: bread, quantity: 3 }],
          cart_discount: { type: 'fixed', value: 1 },
        })
      ).json();
      const line = given.lines[0];
      expect(line.line_total_cents).toBe(9599);
      const back = async () =>
        (await post(`/api/pos/debts/customers/${id}/return`, {
          client_uuid: randomUUID(),
          lines: [{ line_id: line.id, quantity: 1 }],
        })).json().entry.amount_cents as number;
      const slices = [await back(), await back(), await back()];
      expect(slices.reduce((a, b) => a + b, 0)).toBe(-9599);
      expect(await expectBalanced(id)).toBe(0);
    });

    it('refuses more than is still owed, and a line that is not open', async () => {
      const id = await customer(100000);
      const given = (await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] })).json();
      const lineId = given.lines[0].id;
      const tooMany = await post(`/api/pos/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: lineId, quantity: 2 }],
      });
      expect(tooMany.statusCode).toBe(409);
      expect(tooMany.json().code).toBe('too_many');

      expect(
        (await post(`/api/pos/debts/customers/${id}/return`, { client_uuid: randomUUID(), lines: [{ line_id: lineId, quantity: 1 }] }))
          .statusCode
      ).toBe(200);
      const again = await post(`/api/pos/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: lineId, quantity: 1 }],
      });
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('stale_statement');
      await expectBalanced(id);
    });
  });

  // ── the owner's write-off ──────────────────────────────────────────────

  describe('a write-off', () => {
    it('is the owner’s, needs a reason, closes the lines and moves no stock', async () => {
      const id = await customer(100000);
      await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 2 }] });
      await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: milk, quantity: 1 }] });
      const stock = await stockOf(bread);

      const url = `/api/pos/debts/customers/${id}/writeoff`;
      expect((await post(url, { client_uuid: randomUUID(), reason: 'поїхав' })).statusCode).toBe(403);
      expect((await post(url, { client_uuid: randomUUID() }, store.ownerToken)).statusCode).toBe(400);
      expect((await post(url, { client_uuid: randomUUID(), reason: 'ну' }, store.ownerToken)).statusCode).toBe(400);

      const res = await post(url, { client_uuid: randomUUID(), reason: 'Переїхала, не повернеться' }, store.ownerToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().entry).toMatchObject({ kind: 'writeoff', amount_cents: -10900, reason: 'Переїхала, не повернеться' });
      expect(res.json().lines.every((l: { status: string }) => l.status === 'written_off')).toBe(true);
      expect(res.json().open_lines).toHaveLength(0);
      expect(await stockOf(bread)).toBe(stock);
      expect(await expectBalanced(id)).toBe(0);

      const nothing = await post(url, { client_uuid: randomUUID(), reason: 'ще раз' }, store.ownerToken);
      expect(nothing.statusCode).toBe(400);
    });
  });

  // ── reading ────────────────────────────────────────────────────────────

  // ── a handover the desktop wrote without a network (rule 6, migration 074) ─

  describe('a handover the desktop wrote without a network', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

    it('is recorded over the limit, for a locked customer and for one with no limit — and marked', async () => {
      const over = await customer(5000);
      const locked = await customer(100000);
      await pool.query(`UPDATE pos_customers SET credit_locked = TRUE WHERE id = $1`, [locked]);
      const none = await customer(null);
      const breadBefore = await stockOf(bread);

      for (const id of [over, locked, none]) {
        const res = await issue({
          customer_id: id,
          client_uuid: randomUUID(),
          items: [{ variant_id: bread, quantity: 2 }],
          offline_at: hoursAgo(1),
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().entry).toMatchObject({ kind: 'issue', amount_cents: 6400, offline: true });
        expect(await expectBalanced(id)).toBe(6400);
      }
      // The goods left: the shelf moved for all three.
      expect(await stockOf(bread)).toBe(breadBefore - 6);

      // Over the limit is what the owner sees, not a refusal.
      const credit = (await get(`/api/pos/debts/customers/${over}/balance`)).json();
      expect(credit).toMatchObject({ balance_cents: 6400, limit_cents: 5000, available_cents: 0 });
      const statement = (await get(`/api/pos/debts/customers/${over}`)).json();
      expect(statement.entries[0]).toMatchObject({ kind: 'issue', offline: true });
    });

    it('is not refused by an archived card or the stop-list, but still by another store’s customer', async () => {
      const id = await customer(100000);
      const archived = (await seedProduct(store.storeId, { name: 'Знятий з продажу', priceCents: 1500, quantity: 10 })).variantId;
      await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [archived]);
      const stopped = await seedProduct(store.storeId, { name: 'Стоп сьогодні', priceCents: 2500, quantity: 10 });
      await pool.query(
        `UPDATE pos_products SET stop_listed_on = (NOW() AT TIME ZONE 'Europe/Kyiv')::date WHERE id = $1`,
        [stopped.productId]
      );

      const res = await issue({
        customer_id: id,
        client_uuid: randomUUID(),
        items: [
          { variant_id: archived, quantity: 1 },
          { variant_id: stopped.variantId, quantity: 1 },
        ],
        offline_at: hoursAgo(2),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().entry.amount_cents).toBe(4000);
      await expectBalanced(id);

      const other = await createTestStore('debts-offline-foreign');
      try {
        const foreign = await issue({
          customer_id: id,
          client_uuid: randomUUID(),
          items: [{ variant_id: bread, quantity: 1 }],
          offline_at: hoursAgo(1),
        }, other.sellerToken);
        expect(foreign.statusCode).toBe(404);
      } finally {
        await dropTestStore(other.storeId);
      }
    });

    it('is dated by the till, so the oldest-first rule and the journal put it where it happened', async () => {
      const id = await customer(100000);
      const online = (await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: milk, quantity: 1 }] })).json();
      const offline = (
        await issue({
          customer_id: id,
          client_uuid: randomUUID(),
          items: [{ variant_id: bread, quantity: 1 }],
          offline_at: hoursAgo(3),
        })
      ).json();

      const statement = (await get(`/api/pos/debts/customers/${id}`)).json();
      // Given three hours ago, paid first.
      expect(statement.open_lines.map((l: { id: number }) => l.id)).toEqual([offline.lines[0].id, online.lines[0].id]);
      // The journal reads newest first by when it happened, not by when it arrived.
      expect(statement.entries.map((e: { id: number }) => e.id)).toEqual([online.entry.id, offline.entry.id]);
      expect(Date.parse(offline.entry.created_at)).toBeLessThan(Date.parse(online.entry.created_at) - 2 * 3600_000);
      expect(statement.entries[0].offline).toBe(false);

      const received = await pool.query(
        `SELECT offline_received_at FROM pos_debt_entries WHERE id = $1`,
        [offline.entry.id]
      );
      expect(received.rows[0].offline_received_at).not.toBeNull();
    });

    it('reads a till clock ahead of ours as now, refuses what is not a date, and replays on its key', async () => {
      const id = await customer(100000);
      const ahead = (
        await issue({
          customer_id: id,
          client_uuid: randomUUID(),
          items: [{ variant_id: bread, quantity: 1 }],
          offline_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
      ).json();
      expect(Date.parse(ahead.entry.created_at)).toBeLessThanOrEqual(Date.now() + 1000);

      const bad = await issue({
        customer_id: id,
        client_uuid: randomUUID(),
        items: [{ variant_id: bread, quantity: 1 }],
        offline_at: 'вчора',
      });
      expect(bad.statusCode).toBe(400);

      const key = randomUUID();
      const first = await issue({ customer_id: id, client_uuid: key, items: [{ variant_id: milk, quantity: 1 }], offline_at: hoursAgo(1) });
      const again = await issue({ customer_id: id, client_uuid: key, items: [{ variant_id: milk, quantity: 1 }], offline_at: hoursAgo(1) });
      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(again.json().entry.id).toBe(first.json().entry.id);
      expect(again.json().replay).toBe(true);
      await expectBalanced(id);
    });
  });

  describe('what the till and the owner read', () => {
    it('lists who owes, the longest-owing first, and with ?all=1 everyone with a limit', async () => {
      const owing = await customer(100000);
      const clean = await customer(100000);
      await issue({ customer_id: owing, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] });

      const list = (await get('/api/pos/debts')).json().debtors as Array<{ customer_id: number; balance_cents: number }>;
      expect(list.find((d) => d.customer_id === owing)?.balance_cents).toBe(3200);
      expect(list.some((d) => d.customer_id === clean)).toBe(false);

      const all = (await get('/api/pos/debts?all=1')).json().debtors as Array<{ customer_id: number }>;
      expect(all.some((d) => d.customer_id === clean)).toBe(true);
    });

    it('gives the statement: credit, open lines oldest first, the journal newest first', async () => {
      const id = await customer(100000);
      await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] });
      await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: milk, quantity: 1 }] });
      const res = await get(`/api/pos/debts/customers/${id}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.credit.balance_cents).toBe(7700);
      expect(body.open_lines.map((l: { product_name: string }) => l.product_name)).toEqual(['Хліб', 'Молоко']);
      expect(body.entries.map((e: { amount_cents: number }) => e.amount_cents)).toEqual([4500, 3200]);
      expect(body.entries[0].staff_name).toBeTruthy();
      expect(body.oldest_open_at).toBe(body.open_lines[0].created_at);

      const balance = (await get(`/api/pos/debts/customers/${id}/balance`)).json();
      expect(balance).toMatchObject({ balance_cents: 7700, available_cents: 92300 });
    });

    it('gives the owner the window’s figures, never as takings', async () => {
      const id = await customer(100000);
      const given = (await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 2 }] })).json();
      await post(`/api/pos/debts/customers/${id}/return`, {
        client_uuid: randomUUID(),
        lines: [{ line_id: given.lines[0].id, quantity: 1 }],
      });

      expect((await get('/api/pos/debts/summary')).statusCode).toBe(403);
      expect((await get('/api/pos/debts/summary?from=2026-13-40', store.ownerToken)).statusCode).toBe(400);
      const res = await get('/api/pos/debts/summary', store.ownerToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.issued_cents).toBeGreaterThanOrEqual(6400);
      expect(body.returned_cents).toBeGreaterThanOrEqual(3200);
      expect(body.balance_end_cents).toBeGreaterThan(0);
      expect(body.debtors_end).toBeGreaterThan(0);
      // Giving goods «під запис» is not income: the day's takings do not move.
      const summary = (await get('/api/pos/analytics/summary', store.ownerToken)).json();
      expect(summary.gross_cents ?? 0).toBe(0);
    });

    it('keeps a customer card that has a journal', async () => {
      const id = await customer(100000);
      await issue({ customer_id: id, client_uuid: randomUUID(), items: [{ variant_id: bread, quantity: 1 }] });
      const res = await app.inject({ method: 'DELETE', url: `/api/pos/customers/${id}`, headers: auth(store.ownerToken) });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('під запис');
    });
  });
});
