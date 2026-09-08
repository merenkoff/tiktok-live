// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, buildPlan, chunk, guessMapping } from './importPlan';
import type { DelimitedTable } from './parseDelimited';

function table(headers: string[], rows: string[][]): DelimitedTable {
  return { headers, rows, delimiter: ';', encoding: 'utf-8' };
}

describe('guessMapping', () => {
  it('recognises the usual Ukrainian and English headings', () => {
    expect(guessMapping(['Штрихкод', 'Найменування', 'Бренд'])).toEqual({
      gtin: 0,
      name: 1,
      brand: 2,
    });
    expect(guessMapping(['SKU', 'EAN', 'Product name', 'Manufacturer'])).toEqual({
      gtin: 1,
      name: 2,
      brand: 3,
    });
  });

  it('never maps one column to two fields', () => {
    // "Код товару" matches the barcode hints; "Товар" must not take it again.
    const m = guessMapping(['Код товару', 'Товар']);
    expect(m.gtin).toBe(0);
    expect(m.name).toBe(1);
  });

  it('returns -1 for a field it cannot find', () => {
    expect(guessMapping(['A', 'B']).gtin).toBe(-1);
  });
});

describe('buildPlan', () => {
  it('maps rows to learn/batch items under the supplier source', () => {
    const plan = buildPlan(
      table(['bc', 'nm', 'br'], [['4820000000017', 'Боді', 'Acme']]),
      { gtin: 0, name: 1, brand: 2 }
    );
    expect(plan.items).toEqual([
      { gtin: '4820000000017', name: 'Боді', brand: 'Acme', source: 'supplier' },
    ]);
    expect(plan.droppedTotal).toBe(0);
  });

  it('strips the separators a price list prints inside a barcode', () => {
    const plan = buildPlan(table(['bc', 'nm'], [['4 820000 000017', 'Боді']]), {
      gtin: 0,
      name: 1,
      brand: -1,
    });
    expect(plan.items[0]!.gtin).toBe('4820000000017');
    expect(plan.items[0]!.brand).toBeNull();
  });

  it('reports what it drops, by line number a human can find', () => {
    const plan = buildPlan(
      table(
        ['bc', 'nm'],
        [
          ['', 'Без штрихкоду'],
          ['4820000000017', ''],
          ['н/д', 'Літери замість коду'],
          ['4820000000024', 'Гарний рядок'],
        ]
      ),
      { gtin: 0, name: 1, brand: -1 }
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.droppedTotal).toBe(3);
    expect(plan.dropped).toEqual([
      { row: 2, reason: 'порожній штрихкод' },
      { row: 3, reason: 'порожня назва' },
      { row: 4, reason: 'у колонці штрихкоду немає цифр' },
    ]);
  });

  it('leaves check digits to the server rather than judging them here', () => {
    // 1504230037765 fails its check digit — the server says so, with a reason.
    const plan = buildPlan(table(['bc', 'nm'], [['1504230037765', 'Жилет']]), {
      gtin: 0,
      name: 1,
      brand: -1,
    });
    expect(plan.items).toHaveLength(1);
  });

  it('caps the listed drops but keeps counting them', () => {
    const rows = Array.from({ length: 50 }, () => ['', 'x']);
    const plan = buildPlan(table(['bc', 'nm'], rows), { gtin: 0, name: 1, brand: -1 });
    expect(plan.droppedTotal).toBe(50);
    expect(plan.dropped).toHaveLength(20);
  });
});

describe('chunk', () => {
  it('splits at the batch limit the API enforces', () => {
    const items = Array.from({ length: BATCH_SIZE * 2 + 3 }, (_, i) => i);
    const parts = chunk(items);
    expect(parts.map((p) => p.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 3]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([])).toEqual([]);
  });
});
