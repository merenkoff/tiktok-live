// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { MenuWallSnapshot, MenuWallStore } from '../superApi';
import {
  PLACE_PALETTE,
  PLACES_TAB,
  allTabs,
  buildCelebrations,
  heat,
  initialOf,
  isNightHour,
  isQuietHour,
  isRecent,
  nextTab,
  placeTabs,
  plural,
  rankedStores,
  rankingView,
  textOn,
  wallStores,
  wallUrl,
  whereLabel,
} from './menuWall';

const store = (over: Partial<MenuWallStore> & { id: number }): MenuWallStore => ({
  name: `Заклад ${over.id}`,
  slug: `s${over.id}`,
  logoUrl: null,
  today: 0,
  lastHour: 0,
  last3h: 0,
  lastAt: null,
  hourly: Array.from({ length: 24 }, () => 0),
  tableToday: 0,
  tablesScanned: 0,
  tablesTotal: 0,
  halls: null,
  ...over,
});

const snapshot = (over: Partial<MenuWallSnapshot> = {}): MenuWallSnapshot => ({
  now: '2026-11-09T10:00:00Z',
  day: '2026-11-09',
  total: 0,
  yesterdaySameTime: 0,
  hourly: Array.from({ length: 24 }, () => 0),
  tableToday: 0,
  bestDay: null,
  stores: [],
  events: [],
  lastId: 0,
  ...over,
});

const hallWith = (id: number, tables: number) => ({
  id,
  name: `Зал ${id}`,
  tables: Array.from({ length: tables }, (_, i) => ({
    id: id * 100 + i,
    name: String(i + 1),
    pos_x: i * 2,
    pos_y: 0,
    width: 2,
    height: 2,
    shape: 'rect' as const,
    today: 0,
    lastAt: null,
  })),
});

describe('menu wall — places and their colours', () => {
  it('gives a place a colour by its rank among ids, whatever the day’s order', () => {
    const a = wallStores(snapshot({ stores: [store({ id: 30, today: 9 }), store({ id: 10 }), store({ id: 20, today: 3 })] }));
    const byId = new Map(a.map((s) => [s.id, s.color]));
    expect(byId.get(10)).toBe(PLACE_PALETTE[0]);
    expect(byId.get(20)).toBe(PLACE_PALETTE[1]);
    expect(byId.get(30)).toBe(PLACE_PALETTE[2]);
    // The next poll, with the ranking turned round, keeps every colour.
    const b = wallStores(snapshot({ stores: [store({ id: 10, today: 50 }), store({ id: 20 }), store({ id: 30 })] }));
    for (const s of b) expect(s.color).toBe(byId.get(s.id));
  });

  it('reads the initial past an opening quote', () => {
    expect(initialOf('«Шабля»')).toBe('Ш');
    expect(initialOf('  sun city')).toBe('S');
    expect(initialOf('')).toBe('?');
  });

  it('ranks by today, then by the fresher open, then by name', () => {
    const ranked = rankedStores(
      wallStores(
        snapshot({
          stores: [
            store({ id: 1, name: 'Ґанок', today: 2, lastAt: '2026-11-09T09:00:00Z' }),
            store({ id: 2, name: 'Бістро', today: 2, lastAt: '2026-11-09T09:30:00Z' }),
            store({ id: 3, name: 'Арт', today: 0 }),
            store({ id: 4, name: 'Шабля', today: 7 }),
          ],
        })
      )
    );
    expect(ranked.map((s) => s.name)).toEqual(['Шабля', 'Бістро', 'Ґанок', 'Арт']);
  });

  it('folds places past the eighth row into one line, idle ones counted apart', () => {
    const stores = wallStores(
      snapshot({ stores: Array.from({ length: 12 }, (_, i) => store({ id: i + 1, today: i < 9 ? 20 - i : 0 })) })
    );
    const view = rankingView(stores);
    expect(view.rows).toHaveLength(8);
    expect(view.hiddenActive).toBe(1);
    expect(view.hiddenIdle).toBe(3);
  });
});

describe('menu wall — the tabs', () => {
  const stores = wallStores(
    snapshot({
      stores: [
        store({ id: 1, name: 'Без столів', today: 9 }),
        store({ id: 2, name: 'Тераса', today: 4, tableToday: 4, halls: [hallWith(1, 3)] }),
        store({ id: 3, name: 'Головний', today: 6, tableToday: 5, halls: [hallWith(2, 4)] }),
        // Scanned by table, but the hall is gone: nothing to draw.
        store({ id: 4, name: 'Без плану', today: 2, tableToday: 2, halls: [] }),
      ],
    })
  );

  it('gives a tab only to a place whose tables were scanned today and that has a plan', () => {
    expect(placeTabs(stores).map((s) => s.name)).toEqual(['Головний', 'Тераса']);
    expect(allTabs(stores)).toEqual([PLACES_TAB, { kind: 'place', storeId: 3 }, { kind: 'place', storeId: 2 }]);
  });

  it('rotates through the tabs and starts over when the current one is gone', () => {
    const tabs = allTabs(stores);
    expect(nextTab(tabs, PLACES_TAB)).toEqual({ kind: 'place', storeId: 3 });
    expect(nextTab(tabs, { kind: 'place', storeId: 3 })).toEqual({ kind: 'place', storeId: 2 });
    expect(nextTab(tabs, { kind: 'place', storeId: 2 })).toEqual(PLACES_TAB);
    expect(nextTab(tabs, { kind: 'place', storeId: 99 })).toEqual(PLACES_TAB);
    expect(nextTab([], { kind: 'place', storeId: 2 })).toEqual(PLACES_TAB);
  });
});

describe('menu wall — the plan’s warmth and words', () => {
  it('draws nothing for zero and a clearly warm table for one open', () => {
    expect(heat(0, 10)).toBe(0);
    expect(heat(1, 10)).toBeCloseTo(0.37);
    expect(heat(10, 10)).toBe(1);
    expect(heat(3, 0)).toBe(0);
  });

  it('pulses for two minutes after an open', () => {
    const now = new Date('2026-11-09T10:00:00Z');
    expect(isRecent('2026-11-09T09:58:30Z', now)).toBe(true);
    expect(isRecent('2026-11-09T09:57:00Z', now)).toBe(false);
    expect(isRecent(null, now)).toBe(false);
  });

  it('names where the open came from', () => {
    expect(whereLabel({ tableName: '7', hallName: 'Тераса' })).toBe('Стіл 7 · Тераса');
    expect(whereLabel({ tableName: '7', hallName: null })).toBe('Стіл 7');
    expect(whereLabel({ tableName: null, hallName: null })).toBeNull();
  });

  it('picks a readable text colour and the Ukrainian plural', () => {
    expect(textOn('#ffffff')).toBe('#111522');
    expect(textOn('#2a78d6')).toBe('#ffffff');
    expect(textOn('junk')).toBe('#ffffff');
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, ['відкриття', 'відкриття', 'відкриттів']))).toEqual([
      'відкриття',
      'відкриття',
      'відкриттів',
      'відкриттів',
      'відкриття',
      'відкриття',
      'відкриттів',
    ]);
  });

  it('builds the widget address on the POS web’s origin', () => {
    expect(wallUrl('https://pos.the-live.shop', 'abc')).toBe('https://pos.the-live.shop/super/wall?key=abc');
  });
});

describe('menu wall — celebrations', () => {
  const stores = wallStores(
    snapshot({
      stores: [
        store({ id: 1, name: 'Шабля', today: 12, tableToday: 10 }),
        store({ id: 2, name: 'Sun City', today: 3 }),
        store({ id: 3, name: 'Третій', today: 1 }),
        store({ id: 4, name: 'Четвертий', today: 1 }),
        store({ id: 5, name: 'П’ятий', today: 1 }),
      ],
    })
  );
  const ev = (id: number, storeId: number, table: { tableName: string; hallName: string } | null = null) => ({
    id,
    storeId,
    tableId: table ? Number(table.tableName) : null,
    tableName: table?.tableName ?? null,
    hallName: table?.hallName ?? null,
    openedAt: '2026-11-09T10:00:00Z',
  });

  it('makes one celebration per place, naming the table, with the place’s rank and today', () => {
    const out = buildCelebrations(
      snapshot({ total: 15, events: [ev(1, 1, { tableName: '7', hallName: 'Тераса' }), ev(2, 2)], stores }),
      stores
    );
    expect(out.map((c) => [c.kind, c.name, c.where, c.added, c.rank, c.storeToday, c.totalAfter])).toEqual([
      ['open', 'Шабля', 'Стіл 7 · Тераса', 1, 1, 12, 14],
      ['open', 'Sun City', 'Загальне посилання', 1, 2, 3, 15],
    ]);
    expect(out[0].color).toBe(stores.find((s) => s.id === 1)!.color);
  });

  it('says how many tables when one place was opened from several at once', () => {
    const out = buildCelebrations(
      snapshot({
        total: 15,
        events: [
          ev(1, 1, { tableName: '7', hallName: 'Тераса' }),
          ev(2, 1, { tableName: '7', hallName: 'Тераса' }),
          ev(3, 1, { tableName: '2', hallName: 'Зал' }),
        ],
        stores,
      }),
      stores
    );
    expect(out).toHaveLength(1);
    expect(out[0].headline).toBe('+3 відкриття меню');
    expect(out[0].where).toBe('2 столи');
  });

  it('celebrates the first open of the day, a milestone and a beaten record', () => {
    const first = buildCelebrations(snapshot({ total: 1, events: [ev(1, 2)], stores }), stores);
    expect(first[0].kind).toBe('first');
    expect(first[0].headline).toBe('Перше відкриття сьогодні!');

    const milestone = buildCelebrations(snapshot({ total: 10, events: [ev(9, 1)], stores }), stores);
    expect(milestone[0].kind).toBe('milestone');
    expect(milestone[0].headline).toBe('Уже 10 сьогодні!');

    const record = buildCelebrations(
      snapshot({ total: 31, bestDay: { day: '2026-11-01', count: 30 }, events: [ev(5, 1)], stores }),
      stores
    );
    expect(record[0].kind).toBe('record');
    expect(record[0].headline).toBe('Рекорд дня! Уже 31');

    // A record beats a milestone when both fall on the same open; a tiny best day is no record.
    const tiny = buildCelebrations(snapshot({ total: 3, bestDay: { day: '2026-11-01', count: 2 }, events: [ev(5, 1)], stores }), stores);
    expect(tiny[0].kind).toBe('open');
  });

  it('folds more than four places into three celebrations and a summary', () => {
    const out = buildCelebrations(
      snapshot({ total: 20, events: [ev(1, 1), ev(2, 2), ev(3, 3), ev(4, 4), ev(5, 5), ev(6, 5)], stores }),
      stores
    );
    expect(out.map((c) => c.kind)).toEqual(['open', 'open', 'open', 'summary']);
    expect(out[3].name).toBe('Ще +3 у 2 закладах');
    expect(out[3].totalAfter).toBe(20);
    expect(out[3].where).toBeNull();
  });

  it('returns nothing for a poll without new opens', () => {
    expect(buildCelebrations(snapshot({ total: 5, stores }), stores)).toEqual([]);
  });
});

describe('menu wall — the Kyiv clock', () => {
  it('is quiet 22–08 and dim 23–06, Kyiv time', () => {
    // 20:30 UTC in November is 22:30 in Kyiv.
    expect(isQuietHour(new Date('2026-11-09T20:30:00Z'))).toBe(true);
    expect(isNightHour(new Date('2026-11-09T20:30:00Z'))).toBe(false);
    expect(isNightHour(new Date('2026-11-09T21:30:00Z'))).toBe(true);
    // 06:30 Kyiv: still quiet, no longer night.
    expect(isQuietHour(new Date('2026-11-09T04:30:00Z'))).toBe(true);
    expect(isNightHour(new Date('2026-11-09T04:30:00Z'))).toBe(false);
    // Noon.
    expect(isQuietHour(new Date('2026-11-09T10:00:00Z'))).toBe(false);
  });
});
