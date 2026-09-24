// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.bills.test.ts — the open bill (migration 052, phase К4b).
//
// Firing a round is К4c, so everything here is about the half before it: the
// table is seated idempotently, the draft carries no price, it merges on the
// server's own key, and a bill moves only onto a free table. The one place
// this suite reaches into a round is to prove that a line already in the
// kitchen's hands refuses to be edited.
// See TechDocs/POS_TABLES.md §8.2–8.3, §9.

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
import { localDateString } from '../pos/core/localDate.js';

describe.skipIf(!hasDb)('POS bills', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let bare: TestStore;
  let hall = 0;
  let five = 0;
  let six = 0;
  let latte = 0;
  let latteProduct = 0;
  let croissant = 0;
  let croissantProduct = 0;
  let oatId = 0;

  const seat = (tableId: number, body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/pos/bills',
      headers: auth(store.sellerToken),
      payload: { table_id: tableId, ...body },
    });
  const add = (billId: number, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/items`,
      headers: auth(store.sellerToken),
      payload,
    });

  /** A fired round, written straight — the service that fires one is К4c. */
  async function fireRound(billId: number, itemIds: number[]): Promise<number> {
    const round = await pool.query(
      `INSERT INTO pos_bill_rounds (store_id, bill_id, seq, fired_by)
       VALUES ($1, $2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM pos_bill_rounds WHERE bill_id = $2), $3)
       RETURNING id`,
      [store.storeId, billId, store.sellerId]
    );
    const roundId = Number(round.rows[0].id);
    await pool.query(
      `UPDATE pos_bill_items
          SET round_id = $2, unit_price_cents = 6500, product_name = 'Латте',
              variant_label = 'M', unit = 'шт'
        WHERE id = ANY($1::bigint[])`,
      [itemIds, roundId]
    );
    return roundId;
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('bills');
    bare = await createTestStore('bills_bare');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [store.storeId, bare.storeId],
    ]);

    hall = (
      await pool.query(
        `INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`,
        [store.storeId]
      )
    ).rows[0].id;
    const seatTable = async (name: string): Promise<number> =>
      Number(
        (
          await pool.query(
            `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, $3) RETURNING id`,
            [store.storeId, hall, name]
          )
        ).rows[0].id
      );
    five = await seatTable('5');
    six = await seatTable('6');

    const latteCard = await seedProduct(store.storeId, {
      name: 'Латте',
      priceCents: 6500,
      quantity: 500,
      attributes: { size: 'M' },
    });
    latte = latteCard.variantId;
    latteProduct = latteCard.productId;
    const croissantCard = await seedProduct(store.storeId, {
      name: 'Круасан',
      priceCents: 5500,
      quantity: 500,
    });
    croissant = croissantCard.variantId;
    croissantProduct = croissantCard.productId;

    // One question with one answer, so the merge key has something to key on.
    const milk = await modifiers.createGroup(store.storeId, {
      name: 'Молоко',
      min_select: 0,
      max_select: 1,
    });
    const oatCard = await createProduct(store.storeId, {
      name: 'Молоко вівсяне',
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, quantity: 5000 }],
    });
    // `createModifier` answers with the GROUP, not the answer it just added.
    const withOat = await modifiers.createModifier(store.storeId, milk.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: (oatCard!.variants[0] as { id: number }).id,
      component_quantity: 200,
    });
    oatId = withOat.modifiers.find((m) => m.name === 'вівсяне')!.id;
    await modifiers.setProductGroups(store.storeId, latteProduct, [milk.id]);
  });

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(bare?.storeId);
  });

  it('refuses to seat anybody in a store with no hall', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/bills',
      headers: auth(bare.sellerToken),
      payload: { table_id: five },
    });
    // The room is checked before the table: «Столи не налаштовано» is what
    // this store's owner can act on, while «Стіл не знайдено» would send a
    // waiter looking for a table that was never going to exist.
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Столи не налаштовано/);
  });

  it('seats a table once, however many waiters tap it', async () => {
    const first = await seat(five, { guests: 2, client_uuid: '11111111-1111-4111-8111-111111111111' });
    expect(first.statusCode).toBe(200);
    expect(first.json().created).toBe(true);
    const billId = first.json().bill.id;
    expect(first.json().bill).toMatchObject({ table_name: '5', hall_name: 'Зала', guests: 2 });
    expect(first.json().bill.bill_no).toBeGreaterThan(0);

    // A second waiter tapping the same table lands on the same bill.
    const second = await seat(five);
    expect(second.json().created).toBe(false);
    expect(second.json().bill.id).toBe(billId);

    // And a replay of the first tap returns the row it made, not a new one.
    const replay = await seat(five, { client_uuid: '11111111-1111-4111-8111-111111111111' });
    expect(replay.json().bill.id).toBe(billId);

    const open = await bills.listOpenBills(store.storeId);
    expect(open.filter((b) => b.table_id === five)).toHaveLength(1);
  });

  it('keeps the draft priced only as a preview, and merges it the way checkout does', async () => {
    const billId = (await seat(six)).json().bill.id;

    await add(billId, { variant_id: latte, quantity: 1, modifiers: [oatId] });
    await add(billId, { variant_id: latte, quantity: 2, modifiers: [oatId] });
    const withCroissant = await add(billId, { variant_id: croissant, quantity: 1 });
    expect(withCroissant.statusCode).toBe(200);

    const bill = withCroissant.json();
    expect(bill.draft).toHaveLength(2);
    const lattes = bill.draft.find((l: { variant_id: number }) => l.variant_id === latte);
    expect(lattes.quantity).toBe(3);
    // No money is owed yet: the price is a preview, locked only when fired.
    expect(lattes.unit_price_cents).toBeNull();
    expect(lattes.preview_unit_price_cents).toBe(8000); // 6500 + 1500
    expect(lattes.modifiers.map((m: { name: string }) => m.name)).toEqual(['вівсяне']);
    expect(bill.fired_total_cents).toBe(0);
    expect(bill.draft_preview_cents).toBe(8000 * 3 + 5500);

    // A different note is a different line — the server's own key.
    await add(billId, { variant_id: croissant, quantity: 1, note: 'підігріти' });
    const split = await bills.getBill(store.storeId, billId);
    expect(split.draft.filter((l) => l.variant_id === croissant)).toHaveLength(2);
  });

  it('retypes and removes a draft line, and refuses one the kitchen has', async () => {
    const billId = (await seat(five)).json().bill.id;
    const added = (await add(billId, { variant_id: croissant, quantity: 1 })).json();
    const lineId = added.draft[added.draft.length - 1].id;

    const retyped = await app.inject({
      method: 'PATCH',
      url: `/api/pos/bills/${billId}/items/${lineId}`,
      headers: auth(store.sellerToken),
      payload: { quantity: 4 },
    });
    expect(retyped.json().draft.find((l: { id: number }) => l.id === lineId).quantity).toBe(4);

    // Once it is on a round, it belongs to the kitchen.
    await fireRound(billId, [lineId]);
    const late = await app.inject({
      method: 'PATCH',
      url: `/api/pos/bills/${billId}/items/${lineId}`,
      headers: auth(store.sellerToken),
      payload: { quantity: 1 },
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error).toMatch(/вже на кухні/);

    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/pos/bills/${billId}/items/${lineId}`,
      headers: auth(store.sellerToken),
    });
    expect(gone.statusCode).toBe(409);

    // A fired line is money owed; the draft total stays separate from it.
    const bill = await bills.getBill(store.storeId, billId);
    expect(bill.rounds).toHaveLength(1);
    expect(bill.fired_total_cents).toBe(6500 * 4);
    expect(bill.draft).toHaveLength(0);
  });

  it('retypes a draft line’s answers and note, and folds it into its twin (К4m)', async () => {
    const billId = (await seat(five)).json().bill.id;
    await add(billId, { variant_id: latte, quantity: 1, modifiers: [oatId] });
    const plain = (await add(billId, { variant_id: latte, quantity: 2 })).json();
    expect(plain.draft).toHaveLength(2);
    const oat = plain.draft.find((l: { modifiers: unknown[] }) => l.modifiers.length === 1);
    const bare = plain.draft.find((l: { modifiers: unknown[] }) => l.modifiers.length === 0);
    const patch = (lineId: number, payload: Record<string, unknown>) =>
      app.inject({
        method: 'PATCH',
        url: `/api/pos/bills/${billId}/items/${lineId}`,
        headers: auth(store.sellerToken),
        payload,
      });

    // A note alone: the line keeps its answers and its count.
    const noted = await patch(oat.id, { note: 'гарячіше' });
    expect(noted.statusCode).toBe(200);
    const notedLine = noted.json().draft.find((l: { id: number }) => l.id === oat.id);
    expect(notedLine).toMatchObject({ quantity: 1, note: 'гарячіше' });
    expect(notedLine.modifiers.map((m: { name: string }) => m.name)).toEqual(['вівсяне']);
    expect(notedLine.preview_unit_price_cents).toBe(8000);

    // Turning the oat milk back and dropping the note makes it the plain
    // line's twin — one row of three, not two rows the kitchen reads twice.
    const folded = await patch(oat.id, { modifiers: [], note: '' });
    expect(folded.statusCode).toBe(200);
    expect(folded.json().draft).toHaveLength(1);
    expect(folded.json().draft[0]).toMatchObject({ id: bare.id, quantity: 3 });

    // Only a variant of the same product; a different dish is remove + add.
    const other = await patch(bare.id, { variant_id: croissant });
    expect(other.statusCode).toBe(400);
    expect(other.json().error).toMatch(/тієї ж страви/);
    // And an answer the product does not have is refused by the same rule
    // that refuses it at add time.
    expect((await patch(bare.id, { modifiers: [999999] })).statusCode).toBe(400);
    // An empty patch is a mistake, not a no-op that costs a round-trip.
    expect((await patch(bare.id, {})).statusCode).toBe(400);
  });

  it('refuses a dish that left the menu or is on the stop-list today', async () => {
    const billId = (await seat(six)).json().bill.id;
    const tz = await pool.query(`SELECT timezone FROM pos_stores WHERE id = $1`, [store.storeId]);
    await pool.query(`UPDATE pos_products SET stop_listed_on = $2::date WHERE id = $1`, [
      croissantProduct,
      localDateString(String(tz.rows[0].timezone ?? 'Europe/Kyiv')),
    ]);
    const stopped = await add(billId, { variant_id: croissant, quantity: 1 });
    expect(stopped.statusCode).toBe(409);
    expect(stopped.json().error).toMatch(/стоп-листі/);
    await pool.query(`UPDATE pos_products SET stop_listed_on = NULL WHERE id = $1`, [
      croissantProduct,
    ]);

    await pool.query(`UPDATE pos_products SET is_active = FALSE WHERE id = $1`, [croissantProduct]);
    const retired = await add(billId, { variant_id: croissant, quantity: 1 });
    expect(retired.statusCode).toBe(409);
    expect(retired.json().error).toMatch(/знято з меню/);
    await pool.query(`UPDATE pos_products SET is_active = TRUE WHERE id = $1`, [croissantProduct]);
  });

  it('answers a bad answer with 400, not a 500', async () => {
    const billId = (await seat(six)).json().bill.id;
    // A modifier that belongs to no group of this dish is the client's
    // mistake; before this mapping the waiter saw «Internal Server Error».
    const wrong = await add(billId, { variant_id: croissant, quantity: 1, modifiers: [oatId] });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toMatch(/недоступний для цього товару/);

    const both = await add(billId, {
      variant_id: latte,
      quantity: 1,
      modifiers: [oatId],
      components: [{ component_variant_id: croissant, quantity: 1 }],
    });
    expect(both.statusCode).toBe(400);
    expect(both.json().error).toMatch(/не приймає модифікаторів/);
  });

  it('moves a bill only onto a free table', async () => {
    const seventh = Number(
      (
        await pool.query(
          `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '7') RETURNING id`,
          [store.storeId, hall]
        )
      ).rows[0].id
    );
    const billId = (await seat(seventh)).json().bill.id;

    const taken = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/move`,
      headers: auth(store.sellerToken),
      payload: { table_id: five },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toMatch(/зайнятий/);

    const free = Number(
      (
        await pool.query(
          `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '8') RETURNING id`,
          [store.storeId, hall]
        )
      ).rows[0].id
    );
    const moved = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/move`,
      headers: auth(store.sellerToken),
      payload: { table_id: free },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().table_name).toBe('8');
    // The table it left is free again, so somebody else can be seated there.
    expect((await seat(seventh)).json().created).toBe(true);
  });

  it('cancels a bill nobody fired, and refuses one the kitchen started', async () => {
    const spare = Number(
      (
        await pool.query(
          `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '9') RETURNING id`,
          [store.storeId, hall]
        )
      ).rows[0].id
    );
    const billId = (await seat(spare)).json().bill.id;
    const added = (await add(billId, { variant_id: latte, quantity: 1 })).json();

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('cancelled');
    expect(cancelled.json().draft).toHaveLength(0);
    // Cancelling frees the table, and editing a closed bill is refused.
    expect((await seat(spare)).json().created).toBe(true);
    expect((await add(billId, { variant_id: latte, quantity: 1 })).statusCode).toBe(409);

    const second = (await seat(spare)).json().bill.id;
    const line = (await add(second, { variant_id: latte, quantity: 1 })).json();
    await fireRound(second, [line.draft[line.draft.length - 1].id]);
    const refused = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${second}/cancel`,
      headers: auth(store.sellerToken),
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/Раунди вже на кухні/);
    expect(added).toBeDefined();
  });

  it('records the pre-bill without freezing anything', async () => {
    const open = await bills.listOpenBills(store.storeId);
    const target = open[0];
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/bills/${target.id}/precheck`,
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().precheck_printed_at).not.toBeNull();
    // Still open, still editable: a printed pre-bill loses the shop a coffee
    // if it refuses the next order (§4.6).
    expect(res.json().status).toBe('open');
    expect((await add(target.id, { variant_id: latte, quantity: 1 })).statusCode).toBe(200);
  });

  it('shows the hall map what each table owes and waits for', async () => {
    const summary = await bills.listOpenBills(store.storeId);
    expect(summary.length).toBeGreaterThan(0);
    for (const row of summary) {
      expect(row.bill_no).toBeGreaterThan(0);
      expect(row.opened_by_name).toBeTruthy();
      expect(Number.isInteger(row.opened_by)).toBe(true);
    }
    const withRound = summary.find((row) => row.prep_status === 'new');
    expect(withRound?.fired_total_cents).toBeGreaterThan(0);
    const withDraft = summary.find((row) => row.draft_count > 0);
    expect(withDraft).toBeDefined();
  });
});
