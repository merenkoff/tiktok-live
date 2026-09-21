// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.rounds.test.ts — firing a round (migration 052, phase К4c).
//
// The round is the unit of truth: it locks the price, moves the stock and
// wakes the kitchen. What this pins is exactly those three plus their
// reversal — a cancelled round gives back what its SNAPSHOT says, never what
// the recipe says today — and the board seeing a round beside a sale.
// See TechDocs/POS_TABLES.md §4.1–4.3, §9, §11.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
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
import * as bills from '../pos/bills.service.js';
import * as modifiers from '../pos/modifiers.service.js';
import { createProduct } from '../pos/products.service.js';
import { listOpenOrders } from '../pos/kitchen.service.js';

describe.skipIf(!hasDb)('POS bill rounds', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let hall = 0;
  let latte = 0;
  let latteProduct = 0;
  let croissant = 0;
  let oatMilk = 0;
  let oatId = 0;
  let milkGroup = 0;
  let tableSeq = 0;

  const stockOf = async (variantId: number): Promise<number> =>
    Number(
      (await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId]))
        .rows[0]?.quantity ?? 0
    );

  async function newTable(): Promise<number> {
    tableSeq += 1;
    const row = await pool.query(
      `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [store.storeId, hall, `T${tableSeq}`]
    );
    return Number(row.rows[0].id);
  }

  /** A bill with `items` in its draft, ready to fire. */
  async function draftBill(
    items: Array<{ variant_id: number; quantity: number; modifiers?: number[]; note?: string }>
  ): Promise<number> {
    const opened = await bills.openBill({
      storeId: store.storeId,
      staffId: store.sellerId,
      tableId: await newTable(),
    });
    for (const item of items) {
      await bills.addDraftItem(store.storeId, store.sellerId, opened.bill.id, item);
    }
    return opened.bill.id;
  }

  const fire = (billId: number, clientUuid?: string) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/fire`,
      headers: auth(store.sellerToken),
      payload: clientUuid ? { client_uuid: clientUuid } : {},
    });
  const tapRound = (roundId: number, prep_status: unknown) =>
    app.inject({
      method: 'PATCH',
      url: `/api/pos/kitchen/rounds/${roundId}/prep`,
      headers: auth(store.sellerToken),
      payload: { prep_status },
    });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rounds');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    hall = Number(
      (
        await pool.query(
          `INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`,
          [store.storeId]
        )
      ).rows[0].id
    );

    const latteCard = await seedProduct(store.storeId, {
      name: 'Латте',
      priceCents: 6500,
      quantity: 500,
      attributes: { size: 'M' },
    });
    latte = latteCard.variantId;
    latteProduct = latteCard.productId;
    croissant = (
      await seedProduct(store.storeId, { name: 'Круасан', priceCents: 5500, quantity: 500 })
    ).variantId;

    const milk = await modifiers.createGroup(store.storeId, {
      name: 'Молоко',
      min_select: 0,
      max_select: 1,
    });
    milkGroup = milk.id;
    const oatCard = await createProduct(store.storeId, {
      name: 'Молоко вівсяне',
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, quantity: 5000 }],
    });
    oatMilk = (oatCard!.variants[0] as { id: number }).id;
    // `createModifier` answers with the group, not the answer it just added.
    const withOat = await modifiers.createModifier(store.storeId, milk.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: oatMilk,
      component_quantity: 200,
    });
    oatId = withOat.modifiers.find((m) => m.name === 'вівсяне')!.id;
    await modifiers.setProductGroups(store.storeId, latteProduct, [milk.id]);
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  it('locks the price, composes the caption and takes the stock at fire time', async () => {
    const billId = await draftBill([
      { variant_id: latte, quantity: 2, modifiers: [oatId], note: 'гарячіше' },
      { variant_id: croissant, quantity: 1 },
    ]);
    const beforeLatte = await stockOf(latte);
    const beforeOat = await stockOf(oatMilk);

    const res = await fire(billId);
    expect(res.statusCode).toBe(200);
    const bill = res.json();
    expect(bill.draft).toHaveLength(0);
    expect(bill.rounds).toHaveLength(1);

    const round = bill.rounds[0];
    expect(round.seq).toBe(1);
    expect(round.prep_status).toBe('new');
    const line = round.items.find((i: { variant_id: number }) => i.variant_id === latte);
    // 6500 card + 1500 for oat milk, and the answers are already in the caption
    // so the receipt, the printer and the analytics need no special case.
    expect(line.unit_price_cents).toBe(8000);
    expect(line.variant_label).toBe('M · вівсяне');
    expect(line.note).toBe('гарячіше');
    expect(round.total_cents).toBe(8000 * 2 + 5500);
    expect(bill.fired_total_cents).toBe(round.total_cents);

    // The shelf moved for the drink and for what its answer writes off.
    expect(await stockOf(latte)).toBe(beforeLatte - 2);
    expect(await stockOf(oatMilk)).toBe(beforeOat - 400);

    // And the line remembers what it took, per ONE unit.
    const snapshot = await pool.query(
      `SELECT component_variant_id, quantity_per_unit FROM pos_bill_item_components
        WHERE bill_item_id = $1 ORDER BY sort_order`,
      [line.id]
    );
    expect(snapshot.rows.map((r) => [Number(r.component_variant_id), Number(r.quantity_per_unit)]))
      .toEqual([
        [latte, 1],
        [oatMilk, 200],
      ]);
  });

  it('keeps a fired price when the menu changes underneath it', async () => {
    const billId = await draftBill([{ variant_id: croissant, quantity: 1 }]);
    await fire(billId);
    await pool.query(`UPDATE pos_variants SET price_cents = 9900 WHERE id = $1`, [croissant]);

    const after = await bills.addDraftItem(store.storeId, store.sellerId, billId, {
      variant_id: croissant,
      quantity: 1,
    });
    // What was fired is what is owed; what is still a draft previews the new
    // price, because it has not been promised to anybody yet.
    expect(after.rounds[0].items[0].unit_price_cents).toBe(5500);
    expect(after.draft[0].preview_unit_price_cents).toBe(9900);
    await pool.query(`UPDATE pos_variants SET price_cents = 5500 WHERE id = $1`, [croissant]);
  });

  it('fires once however many times the tap is repeated, and refuses an empty draft', async () => {
    const billId = await draftBill([{ variant_id: croissant, quantity: 3 }]);
    const uuid = '22222222-2222-4222-8222-222222222222';
    const before = await stockOf(croissant);

    expect((await fire(billId, uuid)).statusCode).toBe(200);
    const replay = await fire(billId, uuid);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().rounds).toHaveLength(1);
    expect(await stockOf(croissant)).toBe(before - 3);

    // Nothing left in the draft — an empty ticket is not a round.
    const empty = await fire(billId);
    expect(empty.statusCode).toBe(409);
    expect(empty.json().error).toMatch(/Немає чого відправляти/);
  });

  it('gives back exactly what the snapshot says when a round is cancelled', async () => {
    const billId = await draftBill([{ variant_id: latte, quantity: 1, modifiers: [oatId] }]);
    const beforeLatte = await stockOf(latte);
    const beforeOat = await stockOf(oatMilk);
    const roundId = (await fire(billId)).json().rounds[0].id;
    expect(await stockOf(oatMilk)).toBe(beforeOat - 200);

    // The recipe changes between firing and cancelling. The reversal must not
    // notice: it replays the movement the round actually recorded.
    await modifiers.updateModifier(store.storeId, oatId, {
      component_variant_id: oatMilk,
      component_quantity: 999,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/rounds/${roundId}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(await stockOf(latte)).toBe(beforeLatte);
    expect(await stockOf(oatMilk)).toBe(beforeOat);

    const bill = res.json();
    expect(bill.rounds[0].cancelled_at).not.toBeNull();
    // The lines stay on the cancelled round; they do not fall back into the
    // draft, and a cancelled round owes nothing.
    expect(bill.rounds[0].items).toHaveLength(1);
    expect(bill.draft).toHaveLength(0);
    expect(bill.fired_total_cents).toBe(0);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/pos/bills/${billId}/rounds/${roundId}/cancel`,
          headers: auth(store.sellerToken),
        })
      ).statusCode
    ).toBe(409);
    await modifiers.updateModifier(store.storeId, oatId, {
      component_variant_id: oatMilk,
      component_quantity: 200,
    });
  });

  it('refuses to cancel a round that has already been handed over', async () => {
    const billId = await draftBill([{ variant_id: croissant, quantity: 1 }]);
    const roundId = (await fire(billId)).json().rounds[0].id;
    await tapRound(roundId, 'ready');
    await tapRound(roundId, 'served');

    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/rounds/${roundId}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/повернення, а не скасування/);
  });

  it('takes the same two taps as a sale, with the same words', async () => {
    const billId = await draftBill([{ variant_id: croissant, quantity: 1 }]);
    const roundId = (await fire(billId)).json().rounds[0].id;

    const skipped = await tapRound(roundId, 'served');
    expect(skipped.statusCode).toBe(409);
    expect(skipped.json().error).toBe('Спершу натисніть „Готово“');

    expect((await tapRound(roundId, 'ready')).json().prep_status).toBe('ready');
    // A re-tap of the state it is already in is the state the caller wanted.
    const again = await tapRound(roundId, 'ready');
    expect(again.statusCode).toBe(200);
    expect(again.json().prep_status).toBe('ready');

    expect((await tapRound(roundId, 'served')).json().prep_status).toBe('served');
    const reversed = await tapRound(roundId, 'ready');
    expect(reversed.statusCode).toBe(409);
    expect(reversed.json().error).toBe('Замовлення вже видано');

    expect((await tapRound(999_999_999, 'ready')).statusCode).toBe(404);
    expect((await tapRound(roundId, 'new')).statusCode).toBe(400);
  });

  it('shows a round on the same board as a sale, and drops it when cancelled', async () => {
    const billId = await draftBill([{ variant_id: latte, quantity: 1, modifiers: [oatId] }]);
    const fired = (await fire(billId)).json();
    const roundId = fired.rounds[0].id;
    const tableName = fired.table_name;

    const board = await listOpenOrders(store.storeId);
    const card = board.orders.find((o) => o.kind === 'round' && o.id === roundId);
    expect(card).toBeDefined();
    expect(card!.title).toBe(`Стіл ${tableName} · раунд 1`);
    expect(card!.table_name).toBe(tableName);
    expect(card!.round_seq).toBe(1);
    expect(card!.order_no).toBeNull();
    expect(card!.items[0].variant_label).toBe('M · вівсяне');
    expect(card!.items[0].modifiers).toEqual([{ group_name: 'Молоко', name: 'вівсяне' }]);

    await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/rounds/${roundId}/cancel`,
      headers: auth(store.sellerToken),
    });
    const after = await listOpenOrders(store.storeId);
    expect(after.orders.find((o) => o.id === roundId && o.kind === 'round')).toBeUndefined();
  });

  it('keeps a round fired before midnight on the board after it', async () => {
    const billId = await draftBill([{ variant_id: croissant, quantity: 1 }]);
    const roundId = (await fire(billId)).json().rounds[0].id;
    // A counter sale drops off the board at the store's midnight — its number
    // restarts. A round does not: the guests are still eating it.
    await pool.query(
      `UPDATE pos_bill_rounds SET fired_at = NOW() - INTERVAL '2 days' WHERE id = $1`,
      [roundId]
    );
    const board = await listOpenOrders(store.storeId);
    expect(board.orders.find((o) => o.kind === 'round' && o.id === roundId)).toBeDefined();
  });

  it('honours a promise the owner has since deleted', async () => {
    const promo = await modifiers.createModifier(store.storeId, milkGroup, {
      name: 'мигдальне',
      price_delta_cents: 1200,
      component_variant_id: oatMilk,
      component_quantity: 150,
    });
    const almondId = promo.modifiers.find((m) => m.name === 'мигдальне')!.id;
    const billId = await draftBill([{ variant_id: latte, quantity: 1, modifiers: [almondId] }]);
    const beforeOat = await stockOf(oatMilk);

    await modifiers.deleteModifier(store.storeId, almondId);
    const bill = (await fire(billId)).json();
    const line = bill.rounds[0].items[0];
    // The guest was promised 6500 + 1200, so that is what they pay, and the
    // answer still reads on the bill — but a modifier that no longer exists
    // takes nothing off a shelf.
    expect(line.unit_price_cents).toBe(7700);
    expect(line.variant_label).toBe('M · мигдальне');
    expect(line.modifiers[0].modifier_id).toBeNull();
    expect(await stockOf(oatMilk)).toBe(beforeOat);
  });
});
