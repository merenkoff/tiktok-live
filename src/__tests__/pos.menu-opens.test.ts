// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.menu-opens.test.ts — the opens of the guest QR menu that
// the office television counts (track W, TechDocs/POS_MENU_WALL.md): what a
// page open writes, what it does not, the super admin's summary, and the
// read-only key and snapshot of `/super/menu-wall`.

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
  type TestStore,
} from './helpers/pos-fixtures.js';
import { createHall, createTable } from '../pos/tables.service.js';
import { getTableKeys } from '../pos/public-menu/table-keys.js';
import { resetPublicMenuCache } from '../pos/public-menu/menu.service.js';
import { localDateString } from '../pos/core/localDate.js';
import { isMenuWallKey, menuWallKey, resetSuperRateLimiter } from '../pos/core/superAuth.js';
import {
  cleanTag,
  isPreviewAgent,
  settleMenuOpens,
  WALL_ZONE,
  type MenuScansSummary,
  type MenuWallSnapshot,
} from '../pos/menu-opens.service.js';

const PASSWORD = 'menu-wall-super-password-1';
const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('menu opens — pure helpers', () => {
  it('tells a messenger preview or a crawler from a guest', () => {
    for (const ua of [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'TelegramBot (like TwitterBot)',
      'WhatsApp/2.23.20.0 A',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
      'curl/8.4.0',
      'python-requests/2.31',
      'GPTBot/1.0',
    ]) {
      expect(isPreviewAgent(ua), ua).toBe(true);
    }
    for (const ua of [
      PHONE_UA,
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      // Viber's in-app browser: guests open the menu from a chat.
      'Mozilla/5.0 (Linux; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36 Viber/20.5.1.0',
      // Instagram and Facebook in-app browsers are people too.
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 Instagram 300.0.0.29.112',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBAV/430.0.0.31.108]',
      '',
      undefined,
    ]) {
      expect(isPreviewAgent(ua), String(ua)).toBe(false);
    }
  });

  it('keeps a plain label from the link and drops anything else', () => {
    expect(cleanTag('table-7')).toBe('table-7');
    expect(cleanTag('stand_A1')).toBe('stand_A1');
    expect(cleanTag('з пробілом')).toBeNull();
    expect(cleanTag('x'.repeat(65))).toBeNull();
    expect(cleanTag(['a'])).toBeNull();
    expect(cleanTag(undefined)).toBeNull();
  });

  it('has no wall key while the super password is not configured', () => {
    const saved = process.env.POS_SUPER_PASSWORD;
    try {
      delete process.env.POS_SUPER_PASSWORD;
      expect(menuWallKey()).toBeNull();
      expect(isMenuWallKey('0'.repeat(32))).toBe(false);
      process.env.POS_SUPER_PASSWORD = PASSWORD;
      const key = menuWallKey();
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(isMenuWallKey(key)).toBe(true);
      expect(isMenuWallKey(key!.toUpperCase())).toBe(false);
      expect(isMenuWallKey(`${key}0`)).toBe(false);
      // Another password is another key — rotating the password revokes the screen.
      process.env.POS_SUPER_PASSWORD = `${PASSWORD}-rotated`;
      expect(isMenuWallKey(key)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.POS_SUPER_PASSWORD;
      else process.env.POS_SUPER_PASSWORD = saved;
    }
  });
});

describe.skipIf(!hasDb)('menu opens — counting and the television snapshot', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let bistro: TestStore;
  let boutique: TestStore;
  let token = '';
  let bistroToken = '';
  let hallId = 0;
  let tableA = 0;
  let tableB = 0;
  let tableRetired = 0;
  let foreignTable = 0;
  let superToken = '';

  // The insert is fire-and-forget, so two opens in a row may land in either
  // order: where the order of rows matters, each open waits for its row.
  const open = async (url: string, ua: string | null = PHONE_UA) => {
    const res = await app.inject({ method: 'GET', url, headers: ua === null ? {} : { 'user-agent': ua } });
    await settleMenuOpens();
    return res;
  };

  const rows = (storeId: number) =>
    pool
      .query(
        `SELECT store_id, table_id, keyed, via, page, tag
         FROM pos_menu_opens WHERE store_id = $1 ORDER BY id ASC`,
        [storeId]
      )
      .then((r) =>
        r.rows.map((row) => ({
          table_id: row.table_id == null ? null : Number(row.table_id),
          keyed: Boolean(row.keyed),
          via: String(row.via),
          page: String(row.page),
          tag: row.tag == null ? null : String(row.tag),
        }))
      );

  const clear = () => pool.query(`DELETE FROM pos_menu_opens WHERE store_id = ANY($1::bigint[])`, [
    [cafe.storeId, bistro.storeId, boutique.storeId],
  ]);

  const enable = (store: TestStore, payload: Record<string, unknown> = { enabled: true }) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/public-menu', headers: auth(store.ownerToken), payload });

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = PASSWORD;
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('mopen');
    bistro = await createTestStore('mopen2');
    boutique = await createTestStore('mopen3');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [cafe.storeId, bistro.storeId],
    ]);
    resetPublicMenuCache();
    token = (await enable(cafe)).json().token;
    bistroToken = (await enable(bistro)).json().token;

    const hall = await createHall(cafe.storeId, { name: 'Зал', sort_order: 10 });
    hallId = hall.id;
    const terrace = await createHall(cafe.storeId, { name: 'Тераса', sort_order: 20 });
    tableA = (await createTable(cafe.storeId, { hall_id: hallId, name: '1', pos_x: 0, pos_y: 0, width: 2, height: 2 })).id;
    tableB = (await createTable(cafe.storeId, { hall_id: terrace.id, name: '7', pos_x: 3, pos_y: 1, width: 2, height: 1, shape: 'round' })).id;
    tableRetired = (await createTable(cafe.storeId, { hall_id: hallId, name: 'Знятий', is_active: false })).id;
    const elsewhere = await createHall(bistro.storeId, { name: 'Чужий зал' });
    foreignTable = (await createTable(bistro.storeId, { hall_id: elsewhere.id, name: 'Ч1' })).id;

    resetSuperRateLimiter();
    const login = await app.inject({ method: 'POST', url: '/api/pos/super/login', payload: { password: PASSWORD } });
    superToken = login.json().token;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    for (const store of [cafe, bistro, boutique]) if (store) await dropTestStore(store.storeId);
    delete process.env.POS_SUPER_PASSWORD;
    await pool.end();
  });

  describe('what a page open writes', () => {
    it('counts the menu page: the store, by its token, no table', async () => {
      await clear();
      expect((await open(`/m/${token}`)).statusCode).toBe(200);
      await settleMenuOpens();
      expect(await rows(cafe.storeId)).toEqual([{ table_id: null, keyed: false, via: 'token', page: 'menu', tag: null }]);
    });

    it('names the table a QR carries, and whether its key was proved', async () => {
      await clear();
      const keys = await getTableKeys(cafe.storeId);
      await open(`/m/${token}?t=${tableA}&k=${keys.get(tableA)}`);
      await open(`/m/${token}?t=${tableB}`);
      await open(`/m/${token}?t=${tableB}&k=not-the-key`);
      await settleMenuOpens();
      expect(await rows(cafe.storeId)).toEqual([
        { table_id: tableA, keyed: true, via: 'token', page: 'menu', tag: null },
        { table_id: tableB, keyed: false, via: 'token', page: 'menu', tag: null },
        { table_id: tableB, keyed: false, via: 'token', page: 'menu', tag: null },
      ]);
    });

    it('treats a foreign, retired or junk table as no table — exactly as the page does', async () => {
      await clear();
      await open(`/m/${token}?t=${foreignTable}`);
      await open(`/m/${token}?t=${tableRetired}`);
      await open(`/m/${token}?t=abc`);
      await settleMenuOpens();
      expect((await rows(cafe.storeId)).map((r) => r.table_id)).toEqual([null, null, null]);
      expect(await rows(bistro.storeId)).toEqual([]);
    });

    it("counts a dish's own address as a dish page, a stale dish id included", async () => {
      await clear();
      await open(`/m/${token}/d/999999?t=${tableA}`);
      await settleMenuOpens();
      expect(await rows(cafe.storeId)).toEqual([{ table_id: tableA, keyed: false, via: 'token', page: 'dish', tag: null }]);
    });

    it('says «slug» when the short address opened the page', async () => {
      await clear();
      expect((await enable(cafe, { slug_enabled: true })).statusCode).toBe(200);
      try {
        expect((await open(`/m/${cafe.slug}`)).statusCode).toBe(200);
        expect((await open(`/m/${cafe.slug.toUpperCase()}`)).statusCode).toBe(200);
        await settleMenuOpens();
        expect((await rows(cafe.storeId)).map((r) => r.via)).toEqual(['slug', 'slug']);
      } finally {
        await enable(cafe, { slug_enabled: false });
      }
    });

    it('keeps a plain label from the link for the day the QR codes carry one', async () => {
      await clear();
      await open(`/m/${token}?utm_campaign=stand-A`);
      await open(`/m/${token}?c=flyer_2`);
      await open(`/m/${token}?utm_campaign=${encodeURIComponent('з пробілом')}`);
      await settleMenuOpens();
      expect((await rows(cafe.storeId)).map((r) => r.tag)).toEqual(['stand-A', 'flyer_2', null]);
    });

    it('does not count the JSON the page polls, the print pages, the picture or an unknown key', async () => {
      await clear();
      expect((await open(`/api/pos/public/menu/${token}`)).statusCode).toBe(200);
      expect((await open(`/m/${token}/qr`)).statusCode).toBe(200);
      expect((await open(`/m/${token}/tables`)).statusCode).toBe(200);
      await open(`/m/${token}/og.png`);
      expect((await open(`/m/no-such-token-here`)).statusCode).toBe(404);
      await settleMenuOpens();
      expect(await rows(cafe.storeId)).toEqual([]);
    });

    it("does not count a messenger's preview or a crawler, but counts a phone with no agent", async () => {
      await clear();
      await open(`/m/${token}`, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');
      await open(`/m/${token}`, 'TelegramBot (like TwitterBot)');
      await open(`/m/${token}`, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
      await open(`/m/${token}`, null);
      await settleMenuOpens();
      expect((await rows(cafe.storeId)).length).toBe(1);
    });
  });

  describe('the super admin', () => {
    const superHeaders = () => ({ 'x-pos-super-token': superToken });

    it('refuses the summary and the key without the super token', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/pos/super/menu-scans' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/pos/super/menu-wall-key' })).statusCode).toBe(401);
    });

    it('sums today per place and lists only places with a published menu or with opens', async () => {
      await clear();
      const keys = await getTableKeys(cafe.storeId);
      await open(`/m/${token}?t=${tableA}&k=${keys.get(tableA)}`);
      await open(`/m/${token}?t=${tableA}`);
      await open(`/m/${token}`);
      await open(`/m/${bistroToken}`);
      await settleMenuOpens();
      const res = await app.inject({ method: 'GET', url: '/api/pos/super/menu-scans', headers: superHeaders() });
      expect(res.statusCode).toBe(200);
      const body = res.json() as MenuScansSummary;
      expect(body.day).toBe(localDateString(WALL_ZONE));
      const mine = body.stores.filter((s) => [cafe.storeId, bistro.storeId, boutique.storeId].includes(s.id));
      expect(mine.map((s) => [s.slug, s.today, s.table_today, s.tables_total, s.menu_enabled])).toEqual([
        [cafe.slug, 3, 2, 2, true],
        [bistro.slug, 1, 0, 1, true],
      ]);
      expect(mine[0].last7d).toBe(3);
      expect(mine[0].last30d).toBe(3);
      expect(mine[0].total).toBe(3);
      expect(mine[0].last_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.today).toBeGreaterThanOrEqual(4);
      expect(body.table_today).toBeGreaterThanOrEqual(2);
    });

    it('hands out the read-only key the television opens the page with', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/super/menu-wall-key', headers: superHeaders() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ key: menuWallKey() });
    });
  });

  describe('the television snapshot', () => {
    const wall = (query: string) => app.inject({ method: 'GET', url: `/api/pos/super/menu-wall${query}` });

    it('answers only the key: 403 for a wrong one, 503 with no password on the server', async () => {
      expect((await wall('')).statusCode).toBe(403);
      expect((await wall('?key=0000000000000000000000000000000f')).statusCode).toBe(403);
      // The super token is not the key: the screen never holds one.
      expect(
        (await app.inject({ method: 'GET', url: '/api/pos/super/menu-wall', headers: { 'x-pos-super-token': superToken } }))
          .statusCode
      ).toBe(403);
      const saved = process.env.POS_SUPER_PASSWORD;
      try {
        delete process.env.POS_SUPER_PASSWORD;
        expect((await wall(`?key=${'0'.repeat(32)}`)).statusCode).toBe(503);
      } finally {
        process.env.POS_SUPER_PASSWORD = saved;
      }
    });

    it('counts today for every place, draws the plan only where a table was scanned, and moves the cursor', async () => {
      await clear();
      const keys = await getTableKeys(cafe.storeId);
      await open(`/m/${token}?t=${tableA}&k=${keys.get(tableA)}`);
      await open(`/m/${token}?t=${tableA}`);
      await open(`/m/${token}?t=${tableB}`);
      await open(`/m/${token}?t=${tableRetired}`);
      await open(`/m/${token}`);
      await open(`/m/${bistroToken}`);
      await settleMenuOpens();

      const res = await wall(`?key=${menuWallKey()}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const snap = res.json() as MenuWallSnapshot;
      expect(snap.day).toBe(localDateString(WALL_ZONE));
      expect(snap.hourly).toHaveLength(24);
      expect(snap.hourly.reduce((a, b) => a + b, 0)).toBe(snap.total);
      expect(snap.total).toBeGreaterThanOrEqual(6);
      expect(snap.tableToday).toBeGreaterThanOrEqual(3);

      const mine = snap.stores.filter((s) => [cafe.storeId, bistro.storeId, boutique.storeId].includes(s.id));
      expect(mine.map((s) => s.slug)).toEqual([cafe.slug, bistro.slug]);
      const [c, b] = mine;
      expect(c.today).toBe(5);
      expect(c.lastHour).toBe(5);
      expect(c.last3h).toBe(5);
      expect(c.tableToday).toBe(3);
      expect(c.tablesScanned).toBe(2);
      expect(c.tablesTotal).toBe(2);
      expect(c.hourly.reduce((a, b) => a + b, 0)).toBe(5);
      expect(c.lastAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // The plan: live halls in order, live tables with their cells and today's count.
      expect(c.halls?.map((h) => h.name)).toEqual(['Зал', 'Тераса']);
      const plan = c.halls!.flatMap((h) => h.tables.map((t) => [h.name, t.name, t.shape, t.pos_x, t.pos_y, t.width, t.height, t.today]));
      expect(plan).toEqual([
        ['Зал', '1', 'rect', 0, 0, 2, 2, 2],
        ['Тераса', '7', 'round', 3, 1, 2, 1, 1],
      ]);
      // The bistro was opened but never by a table: no plan to draw.
      expect(b.today).toBe(1);
      expect(b.halls).toBeNull();
      expect(b.tablesTotal).toBe(1);

      // Events: every open of ours today, oldest first, with the table named.
      const ours = snap.events.filter((e) => e.storeId === cafe.storeId || e.storeId === bistro.storeId);
      expect(ours.map((e) => [e.storeId, e.tableName, e.hallName])).toEqual([
        [cafe.storeId, '1', 'Зал'],
        [cafe.storeId, '1', 'Зал'],
        [cafe.storeId, '7', 'Тераса'],
        [cafe.storeId, null, null],
        [cafe.storeId, null, null],
        [bistro.storeId, null, null],
      ]);
      expect(snap.lastId).toBe(Math.max(...snap.events.map((e) => e.id)));

      // The next read with the cursor sees nothing new, and the same totals.
      const again = (await wall(`?key=${menuWallKey()}&after=${snap.lastId}`)).json() as MenuWallSnapshot;
      expect(again.events).toEqual([]);
      expect(again.lastId).toBe(snap.lastId);
      expect(again.total).toBe(snap.total);

      // One more open: exactly it comes back as the event.
      await open(`/m/${bistroToken}`);
      await settleMenuOpens();
      const next = (await wall(`?key=${menuWallKey()}&after=${snap.lastId}`)).json() as MenuWallSnapshot;
      expect(next.events.map((e) => e.storeId)).toEqual([bistro.storeId]);
      expect(next.lastId).toBeGreaterThan(snap.lastId);
    });

    it('lists a place with a published menu even before its first open, and never a boutique', async () => {
      await clear();
      const snap = (await wall(`?key=${menuWallKey()}`)).json() as MenuWallSnapshot;
      const mine = snap.stores.filter((s) => [cafe.storeId, bistro.storeId, boutique.storeId].includes(s.id));
      expect(mine.map((s) => [s.slug, s.today, s.halls])).toEqual([
        [cafe.slug, 0, null],
        [bistro.slug, 0, null],
      ]);
    });

    it('counts yesterday up to this time of day and finds the best day of the last 90', async () => {
      // In the first minutes after Kyiv midnight «yesterday at this time minus
      // two minutes» is the day before — this check waits for the next run.
      const minuteOfDay = (() => {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: WALL_ZONE,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(new Date());
        const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
        const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
        return h * 60 + m;
      })();
      if (minuteOfDay < 5) return;

      await clear();
      const day = localDateString(WALL_ZONE);
      const dayStart = `(($1::date)::timestamp AT TIME ZONE '${WALL_ZONE}')`;
      // Yesterday, two minutes before this time of day — inside «на цю пору».
      await pool.query(
        `INSERT INTO pos_menu_opens (store_id, via, page, opened_at)
         VALUES ($2, 'token', 'menu', ${dayStart} - INTERVAL '1 day' + (NOW() - ${dayStart}) - INTERVAL '2 minutes')`,
        [day, cafe.storeId]
      );
      // Two days ago at noon, three times — the best day; yesterday has one.
      for (let i = 0; i < 3; i += 1) {
        await pool.query(
          `INSERT INTO pos_menu_opens (store_id, via, page, opened_at)
           VALUES ($2, 'token', 'menu', ${dayStart} - INTERVAL '2 days' + INTERVAL '12 hours')`,
          [day, bistro.storeId]
        );
      }
      const twoDaysAgo = (await pool.query(`SELECT ($1::date - 2)::text AS d`, [day])).rows[0].d as string;

      const snap = (await wall(`?key=${menuWallKey()}`)).json() as MenuWallSnapshot;
      expect(snap.yesterdaySameTime).toBeGreaterThanOrEqual(1);
      expect(snap.bestDay).not.toBeNull();
      expect(snap.bestDay!.count).toBeGreaterThanOrEqual(3);
      // Our three may be beaten by other suites' rows on the same database,
      // but never by fewer than three on an earlier day.
      if (snap.bestDay!.count === 3) expect(snap.bestDay!.day).toBe(twoDaysAgo);
      // Yesterday's row is not today's.
      const mine = snap.stores.find((s) => s.id === cafe.storeId)!;
      expect(mine.today).toBe(0);

      const summary = (
        await app.inject({ method: 'GET', url: '/api/pos/super/menu-scans', headers: { 'x-pos-super-token': superToken } })
      ).json() as MenuScansSummary;
      const c = summary.stores.find((s) => s.id === cafe.storeId)!;
      const b = summary.stores.find((s) => s.id === bistro.storeId)!;
      expect([c.today, c.last7d, c.total]).toEqual([0, 1, 1]);
      expect([b.today, b.last7d, b.last30d, b.total]).toEqual([0, 3, 3, 3]);
    });
  });
});
