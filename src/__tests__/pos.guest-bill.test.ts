// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.guest-bill.test.ts — a guest reads the bill of THEIR table
// from the QR menu (migration 057, phase Q5), end to end through the real POS
// plugin. What matters most is what does NOT happen: no bill without the key
// printed on that table, no key from a page anyone with the store token can
// open, and nothing in the answer that belongs to the waiter.
// TechDocs/POS_QR_MENU.md.

import crypto from 'crypto';
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
import { createHall, createTable } from '../pos/tables.service.js';
import { resetPublicMenuCache, tableMenuUrl } from '../pos/public-menu/menu.service.js';
import { qrSvg } from '../pos/public-menu/render.js';
import {
  ensureTableKeys,
  getTableKeys,
  issuePrintLink,
  verifyPrintLink,
  verifyTableKey,
} from '../pos/public-menu/table-keys.js';

describe.skipIf(!hasDb)('POS guest bill (Q5)', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let other: TestStore;
  let boutique: TestStore;
  let token = '';
  let otherToken = '';
  let table5 = 0;
  let table6 = 0;
  let table7 = 0;
  let foreignTable = 0;
  let borscht = { productId: 0, variantId: 0 };
  let latte = { productId: 0, variantId: 0 };

  const owner = (store: TestStore) => auth(store.ownerToken);
  const patch = (store: TestStore, payload: Record<string, unknown>, bearer = store.ownerToken) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/public-menu', headers: auth(bearer), payload });
  const settings = async (store: TestStore) =>
    (await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: owner(store) })).json() as Record<
      string,
      unknown
    >;
  const bill = (t: string, query: string) =>
    app.inject({ method: 'GET', url: `/api/pos/public/menu/${t}/bill${query}` });
  const page = (t: string, suffix = '') => app.inject({ method: 'GET', url: `/m/${t}${suffix}` });

  const seat = async (tableId: number): Promise<{ id: number }> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/bills',
      headers: auth(cafe.sellerToken),
      payload: { table_id: tableId, guests: 3, note: 'СЕКРЕТНА-НОТАТКА' },
    });
    return (res.json() as { bill: { id: number } }).bill;
  };
  const add = (billId: number, variantId: number, quantity = 1, note = '') =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/items`,
      headers: auth(cafe.sellerToken),
      payload: { variant_id: variantId, quantity, note },
    });
  const fire = async (billId: number) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/bills/${billId}/fire`,
      headers: auth(cafe.sellerToken),
      payload: { client_uuid: crypto.randomUUID() },
    });

  /** The address the QR on a table holds, with the key the owner's print link would put in it. */
  async function keyFor(tableId: number): Promise<string> {
    return (await getTableKeys(cafe.storeId)).get(tableId)!;
  }
  const q = async (tableId: number) => `?t=${tableId}&k=${await keyFor(tableId)}`;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('gbill_cafe');
    other = await createTestStore('gbill_other');
    boutique = await createTestStore('gbill_boutique');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [cafe.storeId, other.storeId],
    ]);

    const hall = await createHall(cafe.storeId, { name: 'Зала' });
    table5 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '5' })).id;
    table6 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '6' })).id;
    table7 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '7' })).id;
    const elsewhere = await createHall(other.storeId, { name: 'Чужа зала' });
    foreignTable = (await createTable(other.storeId, { hall_id: elsewhere.id, name: '5' })).id;

    borscht = await seedProduct(cafe.storeId, { name: 'Борщ', priceCents: 19000, quantity: 500 });
    latte = await seedProduct(cafe.storeId, { name: 'Латте', priceCents: 6500, quantity: 500 });

    expect((await patch(cafe, { enabled: true })).statusCode).toBe(200);
    expect((await patch(other, { enabled: true })).statusCode).toBe(200);
    token = String((await settings(cafe)).token);
    otherToken = String((await settings(other)).token);
    await ensureTableKeys(cafe.storeId);
    await ensureTableKeys(other.storeId);
  });

  afterAll(async () => {
    resetPublicMenuCache();
    for (const store of [cafe, other, boutique]) await dropTestStore(store?.storeId);
    await app?.close();
  });

  describe('the owner’s switches', () => {
    it('keeps the guest bill off until the owner switches it on, and hands out a print link', async () => {
      const before = await settings(cafe);
      expect(before.bill_enabled).toBe(false);
      expect(before.print).toMatch(/^\d{9,12}\.[A-Za-z0-9_-]{43}$/);
      const on = await patch(cafe, { bill_enabled: true });
      expect(on.statusCode).toBe(200);
      expect(on.json().bill_enabled).toBe(true);
      // Switching one thing leaves the other where it was.
      expect(on.json().enabled).toBe(true);
    });

    it('accepts either field, both, and refuses neither or a non-boolean', async () => {
      expect((await patch(cafe, {})).statusCode).toBe(400);
      expect((await patch(cafe, { bill_enabled: 'yes' })).statusCode).toBe(400);
      expect((await patch(cafe, { enabled: 1 })).statusCode).toBe(400);
      const both = await patch(cafe, { enabled: true, bill_enabled: true });
      expect(both.statusCode).toBe(200);
      expect(both.json()).toMatchObject({ enabled: true, bill_enabled: true });
    });

    it('is the owner’s alone, and a store with no kitchen cannot switch it on', async () => {
      expect((await patch(cafe, { bill_enabled: true }, cafe.sellerToken)).statusCode).toBe(403);
      const res = await patch(boutique, { bill_enabled: true });
      expect(res.statusCode).toBe(409);
    });

    it('does not send the print link to anyone but the owner', async () => {
      const asSeller = await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(cafe.sellerToken) });
      expect(asSeller.statusCode).toBe(403);
      expect(asSeller.body).not.toMatch(/\d{9,12}\.[A-Za-z0-9_-]{43}/);
    });
  });

  describe('the table key', () => {
    it('gives every table its own random key, once', async () => {
      const keys = await getTableKeys(cafe.storeId);
      expect(keys.size).toBe(3);
      const [a, b] = [keys.get(table5)!, keys.get(table6)!];
      expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
      expect(a).not.toBe(b);
      // Asking again does not rotate it: the QR already printed must keep working.
      expect((await getTableKeys(cafe.storeId)).get(table5)).toBe(a);
      // A table created later is keyed the next time somebody prints.
      const hall = await createHall(cafe.storeId, { name: 'Пізній зал' });
      const late = await createTable(cafe.storeId, { hall_id: hall.id, name: '9' });
      expect(await verifyTableKey(cafe.storeId, late.id, 'abcdefghijkl')).toBe(false);
      expect((await getTableKeys(cafe.storeId)).get(late.id)).toMatch(/^[A-Za-z0-9_-]{12}$/);
    });

    it('accepts only that table’s key, of that store', async () => {
      const key5 = await keyFor(table5);
      expect(await verifyTableKey(cafe.storeId, table5, key5)).toBe(true);
      expect(await verifyTableKey(cafe.storeId, table6, key5)).toBe(false);
      // The right key of a table, asked for through another store.
      expect(await verifyTableKey(other.storeId, table5, key5)).toBe(false);
      for (const junk of [undefined, null, 5, '', 'short', `${key5}x`, `${key5.slice(0, -1)}!`, ['a'], { k: key5 }]) {
        expect(await verifyTableKey(cafe.storeId, table5, junk)).toBe(false);
      }
    });
  });

  describe('GET /public/menu/:token/bill', () => {
    it('answers every way of being wrong with the same 404', async () => {
      const key5 = await keyFor(table5);
      const key6 = await keyFor(table6);
      const foreignKey = (await getTableKeys(other.storeId)).get(foreignTable)!;
      const attempts: Array<[string, string]> = [
        [token, ''],
        [token, `?t=${table5}`],
        [token, `?t=${table5}&k=`],
        [token, `?t=${table5}&k=${key6}`], // another table's key
        [token, `?t=${table5}&k=nope`],
        [token, `?t=${table6}&k=${key5}`],
        [token, `?t=${foreignTable}&k=${foreignKey}`], // a table of another restaurant, its own key
        [token, `?t=abc&k=${key5}`],
        [token, `?t=999999999&k=${key5}`],
        [token, `?t=${table5}&t=${table6}&k=${key5}`],
        ['no-such-token-xx', `?t=${table5}&k=${key5}`],
        ['bad token!', `?t=${table5}&k=${key5}`],
        [otherToken, `?t=${table5}&k=${key5}`], // right key, another store's menu
      ];
      const bodies = new Set<string>();
      for (const [t, query] of attempts) {
        const res = await bill(t, query);
        expect(res.statusCode, `${t} ${query}`).toBe(404);
        bodies.add(res.body);
      }
      expect(bodies.size).toBe(1);
    });

    it('answers 404 while the owner’s bill switch is off — same as a wrong key', async () => {
      expect((await patch(cafe, { bill_enabled: false })).statusCode).toBe(200);
      const res = await bill(token, await q(table5));
      expect(res.statusCode).toBe(404);
      expect((await bill(token, `?t=${table5}&k=wrong`)).body).toBe(res.body);
      expect((await patch(cafe, { bill_enabled: true })).statusCode).toBe(200);
    });

    it('says there is no bill yet for a table nobody has been seated at', async () => {
      const res = await bill(token, await q(table6));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ table: 'Стіл 6', hall: 'Зала', open: false, rounds: [], to_pay_cents: 0 });
    });

    it('shows what the kitchen took, at the price fixed then, and nothing else', async () => {
      const opened = await seat(table5);
      await add(opened.id, borscht.variantId, 2);
      await add(opened.id, latte.variantId, 1, 'ЗАМІТКА-КУХНІ');
      expect((await fire(opened.id)).statusCode).toBe(200);
      // A menu edit after the round left must not reprice what was already ordered.
      await pool.query(`UPDATE pos_variants SET price_cents = 99900 WHERE id = $1`, [borscht.variantId]);
      // What the waiter is still typing is not owed and not the guest's.
      await add(opened.id, latte.variantId, 4, 'ЧЕРНЕТКА-ОФІЦІАНТА');

      const res = await bill(token, await q(table5));
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      const body = res.json();
      expect(Object.keys(body).sort()).toEqual(
        ['generated_at', 'hall', 'open', 'paid_text', 'rounds', 'table', 'to_pay_cents', 'to_pay_text'].sort()
      );
      expect(body).toMatchObject({ table: 'Стіл 5', hall: 'Зала', open: true, to_pay_cents: 2 * 19000 + 6500, paid_text: null });
      expect(body.to_pay_text).toBe('445 ₴');
      expect(body.rounds).toHaveLength(1);
      const round = body.rounds[0];
      expect(Object.keys(round).sort()).toEqual(['at', 'lines', 'seq', 'status']);
      expect(round).toMatchObject({ seq: 1, status: 'cooking' });
      expect(round.at).toMatch(/^\d{2}:\d{2}$/);
      expect(round.lines).toHaveLength(2);
      for (const line of round.lines) {
        expect(Object.keys(line).sort()).toEqual(['caption', 'name', 'paid', 'price_text', 'quantity', 'total_text']);
      }
      const byName = Object.fromEntries(round.lines.map((l: { name: string }) => [l.name, l]));
      expect(byName['Борщ']).toMatchObject({ quantity: 2, price_text: '190 ₴', total_text: '380 ₴', paid: false });
      expect(byName['Латте']).toMatchObject({ quantity: 1, price_text: '65 ₴' });

      // Nothing that belongs to the waiter or the bill's bookkeeping.
      for (const secret of ['СЕКРЕТНА-НОТАТКА', 'ЗАМІТКА-КУХНІ', 'ЧЕРНЕТКА-ОФІЦІАНТА', 'display_name', 'opened_by', 'customer', 'bill_no', 'guests', 'draft']) {
        expect(res.body).not.toContain(secret);
      }
      await pool.query(`UPDATE pos_variants SET price_cents = 19000 WHERE id = $1`, [borscht.variantId]);
    });

    it('follows the kitchen: cooking → ready → served', async () => {
      const q5 = await q(table5);
      for (const [prep, word] of [['ready', 'ready'], ['served', 'served']] as const) {
        await pool.query(
          `UPDATE pos_bill_rounds SET prep_status = $2
            WHERE bill_id = (SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $3 AND status = 'open')`,
          [cafe.storeId, prep, table5]
        );
        expect((await bill(token, q5)).json().rounds[0].status).toBe(word);
      }
    });

    it('drops a cancelled round from the lines and from what is owed', async () => {
      const open = (await pool.query(`SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2 AND status = 'open'`, [cafe.storeId, table5])).rows[0].id;
      await pool.query(`UPDATE pos_bill_rounds SET prep_status = 'new' WHERE bill_id = $1`, [open]);
      // Firing takes the whole draft: the four lattes the waiter had typed and the one added now.
      await add(open, latte.variantId, 1);
      expect((await fire(open)).statusCode).toBe(200);
      const q5 = await q(table5);
      const two = (await bill(token, q5)).json();
      expect(two.rounds).toHaveLength(2);
      expect(two.to_pay_cents).toBe(2 * 19000 + 6500 + 5 * 6500);

      const second = (await pool.query(`SELECT id FROM pos_bill_rounds WHERE bill_id = $1 AND seq = 2`, [open])).rows[0].id;
      const cancel = await app.inject({
        method: 'POST',
        url: `/api/pos/bills/${open}/rounds/${second}/cancel`,
        headers: auth(cafe.sellerToken),
        payload: {},
      });
      expect(cancel.statusCode).toBe(200);
      const one = (await bill(token, q5)).json();
      expect(one.rounds).toHaveLength(1);
      expect(one.to_pay_cents).toBe(2 * 19000 + 6500);
    });

    it('marks lines a split has paid and leaves them out of what is still owed', async () => {
      const opened = await seat(table7);
      await add(opened.id, borscht.variantId, 1);
      await add(opened.id, latte.variantId, 1);
      expect((await fire(opened.id)).statusCode).toBe(200);
      const borschtLine = (
        await pool.query(`SELECT id FROM pos_bill_items WHERE bill_id = $1 AND product_name = 'Борщ'`, [opened.id])
      ).rows[0].id;
      // One guest pays for their own dish; the bill stays open for the rest.
      const paid = await app.inject({
        method: 'POST',
        url: `/api/pos/bills/${opened.id}/pay`,
        headers: auth(cafe.sellerToken),
        payload: { parts: [{ line_ids: [Number(borschtLine)], payments: [{ method: 'cash', amount_cents: 19000 }] }] },
      });
      expect(paid.statusCode).toBe(200);

      const res = (await bill(token, await q(table7))).json();
      expect(res.open).toBe(true);
      expect(res.paid_text).toBe('190 ₴');
      expect(res.to_pay_cents).toBe(6500);
      expect(res.to_pay_text).toBe('65 ₴');
      const lines = res.rounds[0].lines as Array<{ name: string; paid: boolean }>;
      expect(lines.find((l) => l.name === 'Борщ')?.paid).toBe(true);
      expect(lines.find((l) => l.name === 'Латте')?.paid).toBe(false);
    });

    it('never shows one table another table’s bill', async () => {
      const opened = await seat(table6);
      await add(opened.id, latte.variantId, 3);
      expect((await fire(opened.id)).statusCode).toBe(200);
      const six = (await bill(token, await q(table6))).json();
      expect(six.rounds[0].lines.map((l: { name: string }) => l.name)).toEqual(['Латте']);
      const five = (await bill(token, await q(table5))).json();
      expect(JSON.stringify(five)).not.toContain('3 ×');
    });
  });

  describe('the menu page', () => {
    it('grows a bill bar only when the QR carries this table’s key and the owner allows it', async () => {
      const withKey = await page(token, await q(table5));
      expect(withKey.body).toContain('data-bill-open');
      expect(withKey.body).toContain(`data-bill-url="/api/pos/public/menu/${token}/bill"`);
      expect(withKey.body).toContain('Рахунок · Стіл 5');
      // The key is in the address bar, never in the markup the server sends.
      expect(withKey.body).not.toContain(await keyFor(table5));

      for (const query of ['', `?t=${table5}`, `?t=${table5}&k=wrong`, `?t=${table5}&k=${await keyFor(table6)}`, `?k=${await keyFor(table5)}`]) {
        const res = await page(token, query);
        expect(res.statusCode).toBe(200);
        expect(res.body, query).not.toContain('data-bill-open');
        expect(res.body, query).not.toContain('data-bill-url');
      }
      // The caption still works without the key (phase Q2).
      expect((await page(token, `?t=${table5}`)).body).toContain('<p class="at-table"><b>Стіл 5</b>');

      await patch(cafe, { bill_enabled: false });
      expect((await page(token, await q(table5))).body).not.toContain('data-bill-open');
      await patch(cafe, { bill_enabled: true });
    });
  });

  describe('the print pages', () => {
    it('put no key into a QR unless the request carries the owner’s signed link', async () => {
      const key5 = await keyFor(table5);
      const plain = tableMenuUrl(token, table5);
      const keyed = tableMenuUrl(token, table5, key5);
      expect(keyed).toContain(`&k=${key5}`);

      const anonymous = await page(token, `/qr?t=${table5}`);
      expect(anonymous.body).toContain(qrSvg(plain));
      expect(anonymous.body).not.toContain(qrSvg(keyed));
      expect(anonymous.body).toContain('class="notice"'); // the bill is on, so the owner is told why it will not work

      const sheet = await page(token, '/tables');
      expect(sheet.body).toContain(qrSvg(plain));
      expect(sheet.body).not.toContain(qrSvg(keyed));

      const link = String((await settings(cafe)).print);
      const signed = await page(token, `/qr?t=${table5}&p=${link}`);
      expect(signed.body).toContain(qrSvg(keyed));
      expect(signed.body).not.toContain('class="notice"');
      const signedSheet = await page(token, `/tables?p=${link}`);
      for (const [id, key] of await getTableKeys(cafe.storeId)) {
        expect(signedSheet.body).toContain(qrSvg(tableMenuUrl(token, id, key)));
      }
      // The card prints its address under the QR, the way it always has; the key
      // rides in that address and nowhere else on the page.
      expect(signed.body.split(key5).length - 1).toBe(1);
      expect(signed.body).toContain(`?t=${table5}&amp;k=${key5}</p>`);
    });

    it('refuses a forged, edited, expired, foreign or rotated link', async () => {
      const key5 = await keyFor(table5);
      const keyed = qrSvg(tableMenuUrl(token, table5, key5));
      const good = String((await settings(cafe)).print);
      const [expires, sig] = good.split('.') as [string, string];
      const expired = await issuePrintLink(cafe.storeId, Date.now() - 7 * 60 * 60 * 1000);
      const foreign = String((await settings(other)).print);
      const candidates = [
        `${expires}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, // one character off
        `${Number(expires) + 3600}.${sig}`, // a later expiry on the same signature
        expired,
        foreign, // another store's valid link
        'abc.def',
        `${expires}.`,
        '',
      ];
      for (const p of candidates) {
        const res = await page(token, `/qr?t=${table5}&p=${encodeURIComponent(p)}`);
        expect(res.body, p).not.toContain(keyed);
      }
      expect(await verifyPrintLink(cafe.storeId, good)).toBe(true);
      expect(await verifyPrintLink(cafe.storeId, expired)).toBe(false);
      expect(await verifyPrintLink(cafe.storeId, good, Date.now() + 7 * 60 * 60 * 1000)).toBe(false);
      expect(await verifyPrintLink(other.storeId, good)).toBe(false);
    });

    it('stops honouring a link the moment the menu link is rotated', async () => {
      const good = String((await settings(cafe)).print);
      expect(await verifyPrintLink(cafe.storeId, good)).toBe(true);
      const rotated = await app.inject({ method: 'POST', url: '/api/pos/store/public-menu/rotate', headers: owner(cafe) });
      expect(rotated.statusCode).toBe(200);
      expect(await verifyPrintLink(cafe.storeId, good)).toBe(false);
      const fresh = rotated.json();
      expect(fresh.print).not.toBe(good);
      expect(await verifyPrintLink(cafe.storeId, fresh.print)).toBe(true);
      // The old address is gone, the table keys are not: a reprint with the new token works.
      token = String(fresh.token);
      expect((await bill(token, await q(table5))).statusCode).toBe(200);
    });
  });
});
