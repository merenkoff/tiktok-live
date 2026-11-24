// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  carriedWords,
  chipOrder,
  dishTitle,
  leftOf,
  liveRounds,
  minutesSince,
  platesLabel,
  quantityChoices,
  roomToServe,
  servedWords,
  stationWord,
  tableState,
  withCarrying,
} from './feed';
import type { ServingLine, ServingRound, ServingTable } from './types';

const line = (over: Partial<ServingLine> = {}): ServingLine => ({
  id: 1,
  product_name: 'Борщ',
  caption: '',
  note: '',
  modifiers: [],
  quantity: 3,
  served_quantity: 0,
  stations: ['kitchen'],
  ...over,
});

const round = (over: Partial<ServingRound> = {}): ServingRound => ({
  id: 10,
  seq: 1,
  fired_at: '2026-11-24T18:00:00.000Z',
  fired_by_name: 'Оля',
  prep_status: 'new',
  ready_at: null,
  items: [line()],
  ...over,
});

const table = (over: Partial<ServingTable> = {}): ServingTable => ({
  table_id: 5,
  table_name: '5',
  hall_name: 'Зала',
  bill_id: 90,
  bill_no: 1,
  opened_by_name: 'Оля',
  to_serve: 3,
  rounds: [round()],
  ...over,
});

describe('what is left to carry', () => {
  it('counts the plates not yet carried, never below zero', () => {
    expect(leftOf(line({ quantity: 3, served_quantity: 1 }))).toBe(2);
    expect(leftOf(line({ quantity: 1, served_quantity: 2 }))).toBe(0);
  });

  it('keeps only the lines and rounds that still have a plate', () => {
    const t = table({
      rounds: [
        round({ id: 1, items: [line({ id: 1, served_quantity: 3 }), line({ id: 2, quantity: 1 })] }),
        round({ id: 2, items: [line({ id: 3, served_quantity: 3 })] }),
      ],
    });
    const live = liveRounds(t);
    expect(live.map((r) => r.id)).toEqual([1]);
    expect(live[0].items.map((l) => l.id)).toEqual([2]);
  });

  it('shows a tap at once, before the server answers', () => {
    const feed = { now: '2026-11-24T18:10:00.000Z', tables: [table()] };
    const after = withCarrying(feed, new Map([[1, 2]]));
    expect(after.tables[0].rounds[0].items[0].served_quantity).toBe(2);
    expect(after.tables[0].to_serve).toBe(1);
    // Never more than was fired, whatever the taps add up to.
    expect(withCarrying(feed, new Map([[1, 9]])).tables[0].to_serve).toBe(0);
    // No taps: the very same feed.
    expect(withCarrying(feed, new Map())).toBe(feed);
  });
});

describe('the row of tables', () => {
  it('walks to the food on the pass first, then to what is cooking, and keeps the done ones at the end', () => {
    const cooking = table({ bill_id: 1, table_name: '1', rounds: [round({ fired_at: '2026-11-24T17:00:00.000Z' })] });
    const readyLate = table({
      bill_id: 2,
      table_name: '2',
      rounds: [round({ prep_status: 'ready', ready_at: '2026-11-24T18:05:00.000Z' })],
    });
    const readyEarly = table({
      bill_id: 3,
      table_name: '3',
      rounds: [round({ prep_status: 'ready', ready_at: '2026-11-24T18:01:00.000Z' })],
    });
    const done = table({ bill_id: 4, table_name: '4', rounds: [round({ items: [line({ served_quantity: 3 })] })], to_serve: 0 });
    expect(chipOrder([done, cooking, readyLate, readyEarly]).map((t) => t.bill_id)).toEqual([3, 2, 1, 4]);
    expect(tableState(done)).toBe('done');
    expect(tableState(readyEarly)).toBe('ready');
    expect(tableState(cooking)).toBe('cooking');
    expect(roomToServe([done, cooking, readyLate])).toBe(6);
  });

  it('orders tables with nothing to tell them apart by name, numbers as numbers', () => {
    const t = (name: string, id: number) =>
      table({ bill_id: id, table_name: name, rounds: [], to_serve: 0 });
    expect(chipOrder([t('10', 1), t('2', 2), t('Тераса', 3)]).map((x) => x.table_name)).toEqual(['2', '10', 'Тераса']);
  });
});

describe('words', () => {
  it('says where the plate waits, and nothing for a store without stations', () => {
    expect(stationWord(['kitchen'])).toBe('Кухня');
    expect(stationWord(['bar'])).toBe('Бар');
    expect(stationWord(['bar', 'kitchen'])).toBe('Кухня, бар');
    expect(stationWord([])).toBeNull();
  });

  it('says how much of a line has gone, only once something has', () => {
    expect(servedWords(line({ served_quantity: 1 }))).toBe('винесено 1 з 3');
    expect(servedWords(line())).toBeNull();
  });

  it('offers one by one up to a hand’s worth, and «all» last', () => {
    expect(quantityChoices(1)).toEqual([1]);
    expect(quantityChoices(2)).toEqual([1, 2]);
    expect(quantityChoices(3)).toEqual([1, 2, 3]);
    expect(quantityChoices(9)).toEqual([1, 2, 3, 4, 5, 9]);
  });

  it('names a dish with its caption, and a tray by its plates', () => {
    expect(dishTitle({ product_name: 'Латте', caption: 'M · вівсяне' })).toBe('Латте · M · вівсяне');
    expect(dishTitle({ product_name: 'Борщ', caption: '' })).toBe('Борщ');
    expect(carriedWords([{ name: 'Борщ', quantity: 1 }])).toBe('Борщ ×1 винесено');
    expect(carriedWords([{ name: 'Борщ', quantity: 2 }, { name: 'Узвар', quantity: 1 }])).toBe('3 страви винесено');
    expect([1, 2, 5, 11, 21, 22].map(platesLabel)).toEqual([
      '1 страва',
      '2 страви',
      '5 страв',
      '11 страв',
      '21 страва',
      '22 страви',
    ]);
  });

  it('counts whole minutes waited, never negative', () => {
    expect(minutesSince('2026-11-24T18:00:00.000Z', '2026-11-24T18:12:59.000Z')).toBe(12);
    expect(minutesSince('2026-11-24T18:00:00.000Z', '2026-11-24T17:59:00.000Z')).toBe(0);
  });
});
