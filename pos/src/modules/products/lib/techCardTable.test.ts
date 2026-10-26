// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { parseDelimited } from '../../../lib/parseDelimited';
import { mapColumns, TECH_CARD_SAMPLE, tableToRows } from './techCardTable';
import { toCsv } from '../../../lib/csv';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('techCardTable', () => {
  it('reads the downloadable sample back into the rows it shows', () => {
    const { rows, headerFound } = tableToRows(parseDelimited(bytes(toCsv(TECH_CARD_SAMPLE))));
    expect(headerFound).toBe(true);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ line: 2, dish: 'Борщ', variant: '', ingredient: 'Буряк', quantity: '80', unit: 'г', price: '20' });
    expect(rows[5]).toMatchObject({ line: 7, dish: 'Взвар', variant: '300 мл', price: '' });
  });

  it('finds the columns by their headings in any order, the optional ones may be missing', () => {
    expect(mapColumns(['Ціна, грн/кг', 'Інгредієнт', 'Блюдо', 'Од. виміру', 'К-сть'])).toEqual({
      dish: 2,
      variant: null,
      ingredient: 1,
      quantity: 4,
      unit: 3,
      price: 0,
    });
  });

  it('reads a file with no headings in the sample’s order, its first row being data', () => {
    const { rows, headerFound } = tableToRows(parseDelimited(bytes('Борщ;;Буряк;80;г;20\nБорщ;;Сіль;2;г;\n')));
    expect(headerFound).toBe(false);
    expect(rows.map((r) => [r.line, r.ingredient, r.price])).toEqual([
      [1, 'Буряк', '20'],
      [2, 'Сіль', ''],
    ]);
  });

  it('drops the empty rows a spreadsheet leaves at the bottom, keeping the line numbers true', () => {
    const { rows } = tableToRows(parseDelimited(bytes('Страва;Складник;Кількість;Од.\nБорщ;Буряк;80;г\n;;;\nБорщ;Сіль;2;г\n'), { keepEmptyRows: true }));
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
  });
});
