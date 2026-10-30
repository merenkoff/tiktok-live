// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A guest's feedback from the QR menu (TechDocs/POS_QR_MENU_FEEDBACK.md,
// phase F3; migration 084). What is worth pinning: the owner's switch is off
// and theirs alone; a feedback needs NO table key (a letter to the owner from
// the venue's QR) while a keyed table is attached with its open bill; one
// uuid is one row; every bad field is a 400 in words; the honeypot says yes
// and writes nothing; the hour's limits per table and per store; the page
// draws the sheet only when the switch is on; the phone is wiped after 90 days.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  type TestStore,
} from './helpers/pos-fixtures.js';
import { createHall, createTable } from '../pos/tables.service.js';
import { openBill } from '../pos/bills.service.js';
import { resetPublicMenuCache, type PublicMenu } from '../pos/public-menu/menu.service.js';
import { getTableKeys } from '../pos/public-menu/table-keys.js';
import {
  BAD_TAGS,
  FEEDBACK_TAGS,
  GOOD_TAGS,
  normalizeFeedback,
  resetGuestFeedbackLimits,
  setGuestFeedbackLimitsForTests,
  wipeGuestFeedbackPhones,
} from '../pos/guest-feedback.service.js';

const UUID = () => crypto.randomUUID();

describe('normalizeFeedback', () => {
  it('reads a full body, dedupes the chips, tidies the words and keeps the phone as typed', () => {
    const id = UUID();
    expect(
      normalizeFeedback({
        client_uuid: id.toUpperCase(),
        score: 2,
        tags: ['wait', 'wait', 'noise'],
        comment: '  Довго \n\n чекали  ',
        phone: '+380 44 123-45-67',
        source: 'bill',
        website: '',
      })
    ).toEqual({
      client_uuid: id,
      score: 2,
      tags: ['wait', 'noise'],
      comment: 'Довго\nчекали',
      phone: '+380 44 123-45-67',
      source: 'bill',
      bot: false,
    });
    expect(normalizeFeedback({ client_uuid: id, score: 5 })).toEqual({
      client_uuid: id,
      score: 5,
      tags: [],
      comment: null,
      phone: null,
      source: 'menu',
      bot: false,
    });
    expect(normalizeFeedback({ client_uuid: id, score: 5, website: 'http://spam' }).bot).toBe(true);
  });

  it.each([
    [{ score: 5 }, 'no uuid'],
    [{ client_uuid: 'abc', score: 5 }, 'a bad uuid'],
    [{ client_uuid: UUID(), score: 0 }, 'a zero'],
    [{ client_uuid: UUID(), score: 6 }, 'a six'],
    [{ client_uuid: UUID(), score: '5' }, 'a score as text'],
    [{ client_uuid: UUID(), score: 4.5 }, 'a half'],
    [{ client_uuid: UUID(), score: 5, tags: ['great'] }, 'an unknown chip'],
    [{ client_uuid: UUID(), score: 5, tags: 'food' }, 'chips not in a list'],
    [{ client_uuid: UUID(), score: 5, tags: new Array(9).fill('food') }, 'too many chips'],
    [{ client_uuid: UUID(), score: 5, comment: 'а'.repeat(601) }, 'a long comment'],
    [{ client_uuid: UUID(), score: 5, comment: 7 }, 'a comment that is not text'],
    [{ client_uuid: UUID(), score: 5, phone: 'call me' }, 'a phone that is not one'],
    ['not an object', 'a string body'],
  ])('refuses %o (%s)', (body) => {
    expect(() => normalizeFeedback(body)).toThrow();
  });

  it('offers every chip of both moods from the one dictionary', () => {
    for (const tag of [...GOOD_TAGS, ...BAD_TAGS]) expect(FEEDBACK_TAGS[tag]).toBeTruthy();
    expect(GOOD_TAGS).toContain('food');
    expect(BAD_TAGS).toContain('wait');
  });
});

describe.skipIf(!hasDb)('POS guest feedback (F3)', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let other: TestStore;
  let token = '';
  let table5 = 0;
  let table6 = 0;

  const patch = (store: TestStore, payload: Record<string, unknown>, bearer = store.ownerToken) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/public-menu', headers: auth(bearer), payload });
  const settings = async (store: TestStore) =>
    (await app.inject({ method: 'GET', url: '/api/pos/store/public-menu', headers: auth(store.ownerToken) })).json() as Record<
      string,
      unknown
    >;
  const keyed = async (tableId: number) => `?t=${tableId}&k=${(await getTableKeys(cafe.storeId)).get(tableId)}`;
  const send = (body: Record<string, unknown>, query = '', t = token) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/public/menu/${t}/feedback${query}`,
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
  const mine = (uuid: string, t = token) => app.inject({ method: 'GET', url: `/api/pos/public/menu/${t}/feedback/${uuid}` });
  const page = (query = '') => app.inject({ method: 'GET', url: `/m/${token}${query}` });
  const menu = async () => (await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` })).json() as PublicMenu;
  const rows = async (storeId = cafe.storeId) =>
    (
      await pool.query(
        `SELECT client_uuid, table_id, bill_id, score, tags, comment, phone, source
           FROM pos_guest_feedback WHERE store_id = $1 ORDER BY id`,
        [storeId]
      )
    ).rows;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('fb_cafe');
    other = await createTestStore('fb_other');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [[cafe.storeId, other.storeId]]);
    const hall = await createHall(cafe.storeId, { name: 'Зал' });
    table5 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '5' })).id;
    table6 = (await createTable(cafe.storeId, { hall_id: hall.id, name: '6' })).id;
    expect((await patch(cafe, { enabled: true })).statusCode).toBe(200);
    token = String((await settings(cafe)).token);
    await getTableKeys(cafe.storeId);
  });

  afterAll(async () => {
    resetPublicMenuCache();
    for (const store of [cafe, other]) await dropTestStore(store?.storeId);
    await app?.close();
  });

  beforeEach(async () => {
    resetGuestFeedbackLimits();
    await pool.query(`DELETE FROM pos_guest_feedback WHERE store_id = ANY($1::bigint[])`, [[cafe.storeId, other.storeId]]);
    resetPublicMenuCache();
  });

  describe('the owner’s switch', () => {
    it('is off by default, the owner’s alone, and refused for a store with no kitchen', async () => {
      expect((await settings(cafe)).feedback_enabled).toBe(false);
      expect((await patch(cafe, { feedback_enabled: true }, cafe.sellerToken)).statusCode).toBe(403);
      expect((await patch(cafe, { feedback_enabled: 'yes' })).statusCode).toBe(400);
      const boutique = await createTestStore('fb_boutique');
      try {
        expect((await patch(boutique, { feedback_enabled: true })).statusCode).toBe(409);
      } finally {
        await dropTestStore(boutique.storeId);
      }
    });

    it('keeps the sheet, the buttons and the endpoints off the page until it is on — then everywhere, key or no key', async () => {
      expect((await menu()).store.feedback_enabled).toBe(false);
      const off = (await page()).body;
      expect(off).not.toContain('data-feedback-url');
      expect(off).not.toContain('data-feedback-sheet');
      expect(off).not.toContain('class="ask"');
      expect((await send({ client_uuid: UUID(), score: 5 })).statusCode).toBe(404);
      expect((await mine(UUID())).statusCode).toBe(404);
      const revOff = (await menu()).rev;

      expect((await patch(cafe, { feedback_enabled: true })).statusCode).toBe(200);
      expect((await settings(cafe)).feedback_enabled).toBe(true);
      const on = await menu();
      expect(on.store.feedback_enabled).toBe(true);
      // An open page learns of the switch through the fingerprint.
      expect(on.rev).not.toBe(revOff);
      for (const query of ['', `?t=${table5}`, await keyed(table5)]) {
        const html = (await page(query)).body;
        expect(html, query).toContain(`data-feedback-url="/api/pos/public/menu/${token}/feedback"`);
        expect(html, query).toContain('<button type="button" class="fb-bar" data-feedback-open>Як вам сьогодні?</button>');
        expect(html, query).toContain('<section class="ask" data-ask>');
        expect(html, query).toContain('data-feedback-sheet');
        expect(html, query).toContain('aria-label="Чудово"');
        expect(html, query).toContain('data-tag="wait"');
        expect(html.match(/<script/g), query).toHaveLength(1);
      }
      // The Google card reaches the page only once the owner gave one, escaped.
      expect((await page()).body).not.toContain('data-feedback-google');
      await app.inject({
        method: 'PATCH',
        url: '/api/pos/store/profile',
        headers: auth(cafe.ownerToken),
        payload: { google_url: 'https://maps.app.goo.gl/AbC?x=1&y=2' },
      });
      expect((await page()).body).toContain('data-feedback-google="https://maps.app.goo.gl/AbC?x=1&amp;y=2"');
    });
  });

  describe('what a guest sends', () => {
    beforeAll(async () => {
      expect((await patch(cafe, { feedback_enabled: true })).statusCode).toBe(200);
    });

    it('takes one tap from the venue’s QR: no table, no bill, a view of its own and nothing else', async () => {
      const id = UUID();
      const res = await send({ client_uuid: id, score: 4 });
      expect(res.statusCode).toBe(201);
      expect(Object.keys(res.json()).sort()).toEqual(['created_at', 'score', 'uuid']);
      expect(res.json()).toMatchObject({ uuid: id, score: 4 });
      expect(await rows()).toEqual([
        { client_uuid: id, table_id: null, bill_id: null, score: 4, tags: [], comment: null, phone: null, source: 'menu' },
      ]);
      // Said again, the same answer and no second row.
      const again = await send({ client_uuid: id, score: 1, comment: 'changed my mind' });
      expect(again.statusCode).toBe(200);
      expect(again.json().score).toBe(4);
      expect(await rows()).toHaveLength(1);
      expect((await mine(id)).json()).toMatchObject({ uuid: id, score: 4 });
      expect((await mine(id.toUpperCase())).statusCode).toBe(200);
      expect((await mine(UUID())).statusCode).toBe(404);
    });

    it('attaches the table and its open bill only when the QR proved the table', async () => {
      const { bill } = await openBill({ storeId: cafe.storeId, staffId: cafe.sellerId, tableId: table5, guests: 2 });
      const withKey = UUID();
      expect((await send({ client_uuid: withKey, score: 2, tags: ['wait'], source: 'bill' }, await keyed(table5))).statusCode).toBe(201);
      const noKey = UUID();
      expect((await send({ client_uuid: noKey, score: 5 }, `?t=${table5}`)).statusCode).toBe(201);
      const wrongKey = UUID();
      expect((await send({ client_uuid: wrongKey, score: 5 }, `?t=${table5}&k=nope`)).statusCode).toBe(201);
      const emptyTable = UUID();
      expect((await send({ client_uuid: emptyTable, score: 3 }, await keyed(table6))).statusCode).toBe(201);
      const list = await rows();
      expect(list.find((r) => r.client_uuid === withKey)).toMatchObject({ table_id: String(table5), bill_id: String(bill.id), source: 'bill', tags: ['wait'] });
      expect(list.find((r) => r.client_uuid === noKey)).toMatchObject({ table_id: null, bill_id: null });
      expect(list.find((r) => r.client_uuid === wrongKey)).toMatchObject({ table_id: null, bill_id: null });
      expect(list.find((r) => r.client_uuid === emptyTable)).toMatchObject({ table_id: String(table6), bill_id: null });
    });

    it('answers every bad field with a 400 in words, and a wrong token with the same 404 as a switched-off one', async () => {
      for (const body of [
        { score: 5 },
        { client_uuid: UUID(), score: 7 },
        { client_uuid: UUID(), score: 5, tags: ['great'] },
        { client_uuid: UUID(), score: 5, phone: 'x' },
      ]) {
        const res = await send(body);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
        expect(typeof res.json().error).toBe('string');
      }
      expect((await send({ client_uuid: UUID(), score: 5 }, '', 'no_such_token')).statusCode).toBe(404);
      expect(await rows()).toHaveLength(0);
    });

    it('says yes to the trap and writes nothing', async () => {
      const res = await send({ client_uuid: UUID(), score: 1, comment: 'buy now', website: 'http://spam.example' });
      expect(res.statusCode).toBe(201);
      expect(await rows()).toHaveLength(0);
    });

    it('keeps the words and the phone the guest offered', async () => {
      const id = UUID();
      await send({ client_uuid: id, score: 5, tags: ['food', 'service'], comment: ' Смачно! \n Дякую ', phone: '+380 50 111 22 33' });
      expect((await rows())[0]).toMatchObject({ tags: ['food', 'service'], comment: 'Смачно!\nДякую', phone: '+380 50 111 22 33' });
    });

    it('allows three an hour from one table and sixty from the store, and a retry spends nothing', async () => {
      const q = await keyed(table5);
      for (let i = 0; i < 3; i += 1) expect((await send({ client_uuid: UUID(), score: 5 }, q)).statusCode).toBe(201);
      const fourth = await send({ client_uuid: UUID(), score: 5 }, q);
      expect(fourth.statusCode).toBe(429);
      expect(fourth.json().error).toContain('столу');
      // Another table, and the counter, still may.
      expect((await send({ client_uuid: UUID(), score: 5 }, await keyed(table6))).statusCode).toBe(201);
      expect((await send({ client_uuid: UUID(), score: 5 })).statusCode).toBe(201);

      resetGuestFeedbackLimits();
      setGuestFeedbackLimitsForTests({ perStore: 2 });
      const first = UUID();
      expect((await send({ client_uuid: first, score: 5 })).statusCode).toBe(201);
      expect((await send({ client_uuid: first, score: 5 })).statusCode).toBe(200);
      expect((await send({ client_uuid: UUID(), score: 5 })).statusCode).toBe(201);
      const over = await send({ client_uuid: UUID(), score: 5 });
      expect(over.statusCode).toBe(429);
      expect(over.json().error).toContain('пізніше');
      // The feedback already written is still readable.
      expect((await send({ client_uuid: first, score: 5 })).statusCode).toBe(200);
    });

    it('is the store’s own: another café’s token neither reads nor writes it', async () => {
      const id = UUID();
      await send({ client_uuid: id, score: 3 });
      expect((await patch(other, { enabled: true })).statusCode).toBe(200);
      expect((await patch(other, { feedback_enabled: true })).statusCode).toBe(200);
      const otherToken = String((await settings(other)).token);
      expect((await mine(id, otherToken)).statusCode).toBe(404);
      expect((await send({ client_uuid: id, score: 1 }, '', otherToken)).statusCode).toBe(201);
      expect(await rows(other.storeId)).toHaveLength(1);
      expect((await rows())[0]!.score).toBe(3);
    });
  });

  describe('the owner reads it (F4)', () => {
    const list = (query = '', bearer = cafe.ownerToken) =>
      app.inject({ method: 'GET', url: `/api/pos/feedback${query}`, headers: auth(bearer) });
    const summary = (query = '', bearer = cafe.ownerToken) =>
      app.inject({ method: 'GET', url: `/api/pos/feedback/summary${query}`, headers: auth(bearer) });
    const handled = (id: number, payload: Record<string, unknown> = {}, bearer = cafe.ownerToken) =>
      app.inject({ method: 'POST', url: `/api/pos/feedback/${id}/handled`, headers: auth(bearer), payload });

    beforeAll(async () => {
      expect((await patch(cafe, { feedback_enabled: true })).statusCode).toBe(200);
    });

    it('is the owner’s alone: a waiter reads nothing, a guest without a session nothing', async () => {
      expect((await list('', cafe.sellerToken)).statusCode).toBe(403);
      expect((await summary('', cafe.sellerToken)).statusCode).toBe(403);
      expect((await handled(1, {}, cafe.sellerToken)).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/api/pos/feedback' })).statusCode).toBe(401);
    });

    it('lists the guests’ words newest first, with the table, the bill, the phone and the chips in words', async () => {
      const { bill } = await openBill({ storeId: cafe.storeId, staffId: cafe.sellerId, tableId: table6, guests: 1 });
      const first = UUID();
      await send({ client_uuid: first, score: 5, tags: ['food', 'speed'], comment: 'Смачно' });
      const second = UUID();
      await send(
        { client_uuid: second, score: 2, tags: ['wait'], comment: 'Довго', phone: '+380 50 123 45 67', source: 'bill' },
        await keyed(table6)
      );
      const res = await list();
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.rows.map((r: { score: number }) => r.score)).toEqual([2, 5]);
      expect(Object.keys(body.rows[0]).sort()).toEqual([
        'bill_no',
        'comment',
        'created_at',
        'handled_at',
        'handled_by',
        'id',
        'phone',
        'score',
        'source',
        'table',
        'tag_labels',
        'tags',
      ]);
      expect(body.rows[0]).toMatchObject({
        score: 2,
        tags: ['wait'],
        tag_labels: ['Довго чекали'],
        comment: 'Довго',
        phone: '+380 50 123 45 67',
        source: 'bill',
        table: { id: table6, name: '6', hall: 'Зал' },
        bill_no: bill.bill_no,
        handled_at: null,
        handled_by: null,
      });
      expect(body.rows[1]).toMatchObject({ score: 5, tag_labels: ['Страви', 'Швидкість'], table: null, bill_no: null, phone: null });
      // Nothing of the guest's uuid leaves to the owner's screen either.
      expect(res.body).not.toContain(first);
    });

    it('filters by score and by what is still waiting, pages with a total, and refuses a bad window in words', async () => {
      const ids: string[] = [];
      for (const score of [5, 4, 3, 2, 1, 5]) {
        const id = UUID();
        ids.push(id);
        await send({ client_uuid: id, score });
      }
      expect((await list('?score=5')).json().rows).toHaveLength(2);
      expect((await list('?score=9')).statusCode).toBe(400);
      const page1 = (await list('?limit=4')).json();
      expect(page1.rows).toHaveLength(4);
      expect(page1.total).toBe(6);
      const page2 = (await list('?limit=4&offset=4')).json();
      expect(page2.rows).toHaveLength(2);
      expect((await list('?limit=0')).statusCode).toBe(400);
      expect((await list('?offset=-1')).statusCode).toBe(400);
      expect((await list('?from=2026-13-40')).statusCode).toBe(400);
      expect((await list('?handled=maybe')).statusCode).toBe(400);

      const low = (await list('?score=1')).json().rows[0];
      expect((await handled(low.id)).json()).toMatchObject({ handled_at: expect.any(String), handled_by: expect.any(String) });
      expect((await list('?handled=false')).json().total).toBe(5);
      expect((await list('?handled=true')).json().total).toBe(1);
      // A window that ends before today holds none of them.
      expect((await list('?from=2020-01-01&to=2020-01-31')).json()).toMatchObject({ total: 0, from: '2020-01-01', to: '2020-01-31' });
    });

    it('sums the window: the mean to one decimal, the spread, the chips ticked most, the low ones waiting', async () => {
      for (const [score, tags] of [
        [5, ['food', 'service']],
        [4, ['food']],
        [2, ['wait', 'food_wrong']],
        [1, ['wait']],
      ] as const) {
        await send({ client_uuid: UUID(), score, tags: [...tags], comment: score <= 2 ? 'Погано було' : null });
      }
      const body = (await summary()).json();
      expect(body).toMatchObject({
        count: 4,
        average: 3,
        distribution: { '1': 1, '2': 1, '3': 0, '4': 1, '5': 1 },
        unhandled_low: 2,
      });
      expect(body.tags.slice(0, 2)).toEqual([
        { code: 'food', label: 'Страви', count: 2 },
        { code: 'wait', label: 'Довго чекали', count: 2 },
      ]);
      expect(body.latest).toHaveLength(2);
      expect(body.latest.every((row: { comment: string | null }) => row.comment === 'Погано було')).toBe(true);
      expect(typeof body.from).toBe('string');
      expect(typeof body.to).toBe('string');

      const low = (await list('?score=1')).json().rows[0];
      await handled(low.id);
      expect((await summary()).json().unhandled_low).toBe(1);
      // An empty window is zeroes and a null mean, never a crash.
      expect((await summary('?from=2020-01-01&to=2020-01-02')).json()).toMatchObject({ count: 0, average: null, tags: [], latest: [] });
      expect((await summary('?from=2020-13-01')).statusCode).toBe(400);
    });

    it('marks handled once, keeps who did it first, un-marks on request and answers 404 for another store’s row', async () => {
      await send({ client_uuid: UUID(), score: 3 });
      const row = (await list()).json().rows[0];
      const first = (await handled(row.id)).json();
      expect(first.handled_by).toBeTruthy();
      const again = (await handled(row.id, { handled: true })).json();
      expect(again.handled_at).toBe(first.handled_at);
      const back = (await handled(row.id, { handled: false })).json();
      expect(back).toMatchObject({ handled_at: null, handled_by: null });
      expect((await handled(row.id, { handled: 'yes' })).statusCode).toBe(400);
      expect((await handled(999999999)).statusCode).toBe(404);
      expect((await handled(row.id, {}, other.ownerToken)).statusCode).toBe(404);
    });
  });

  describe('housekeeping', () => {
    it('wipes the phone after ninety days and keeps the feedback', async () => {
      const old = UUID();
      const fresh = UUID();
      await send({ client_uuid: old, score: 2, phone: '+380 50 000 00 01' });
      await send({ client_uuid: fresh, score: 2, phone: '+380 50 000 00 02' });
      await pool.query(
        `UPDATE pos_guest_feedback SET created_at = NOW() - INTERVAL '91 days' WHERE store_id = $1 AND client_uuid = $2`,
        [cafe.storeId, old]
      );
      await pool.query(
        `UPDATE pos_guest_feedback SET created_at = NOW() - INTERVAL '89 days' WHERE store_id = $1 AND client_uuid = $2`,
        [cafe.storeId, fresh]
      );
      expect(await wipeGuestFeedbackPhones()).toBeGreaterThanOrEqual(1);
      const list = await rows();
      expect(list.find((r) => r.client_uuid === old)).toMatchObject({ phone: null, score: 2 });
      expect(list.find((r) => r.client_uuid === fresh)).toMatchObject({ phone: '+380 50 000 00 02' });
      expect(await wipeGuestFeedbackPhones()).toBe(0);
    });
  });
});
