// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.catalog-search.test.ts
//
// The till's search box reads WORDS (TechDocs/POS_CLOTHING.md, phase C1): every
// word has to match something about the variant, in any order. «зайчик 86» is a
// product and a size; «98/104» finds the pair saved as «98-104»; a short number
// is a size and never an EAN fragment.
//
// The table of tokens and the table of matches are copied, verbatim, into
// `pos/src/lib/searchTokens.test.ts` and `pos/src/offline/catalog-filter.test.ts`:
// the offline till must find exactly what this query finds.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as products from '../pos/products.service.js';
import { escapeLike, MAX_SEARCH_WORDS, searchTokens } from '../pos/searchTokens.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

const TOKEN_CASES: Array<{ query: string | null | undefined; tokens: Array<[string, boolean]> }> = [
  { query: 'зайчик 86', tokens: [['зайчик', false], ['86', true]] },
  { query: '  Блакитний   98–104 ', tokens: [['блакитний', false], ['98-104', false]] },
  { query: '98/104', tokens: [['98-104', false]] },
  { query: '98—104', tokens: [['98-104', false]] },
  { query: '', tokens: [] },
  { query: '   ', tokens: [] },
  { query: null, tokens: [] },
  { query: undefined, tokens: [] },
  // A short pure number is a size; four digits and up is an article or a scan.
  { query: '9', tokens: [['9', true]] },
  { query: '123', tokens: [['123', true]] },
  { query: '1234', tokens: [['1234', false]] },
  { query: '0054', tokens: [['0054', false]] },
  { query: '12a', tokens: [['12a', false]] },
  { query: '98-104', tokens: [['98-104', false]] },
];

describe('searchTokens', () => {
  it.each(TOKEN_CASES)('reads %j', ({ query, tokens }) => {
    expect(searchTokens(query).map((t) => [t.text, t.shortNumber])).toEqual(tokens);
  });

  it('keeps at most six words and drops the rest', () => {
    expect(MAX_SEARCH_WORDS).toBe(6);
    const words = searchTokens('a b c d e f g h').map((t) => t.text);
    expect(words).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('cuts one absurdly long word', () => {
    expect(searchTokens('x'.repeat(500))[0]!.text).toHaveLength(64);
  });

  it('escapes the characters LIKE treats as syntax', () => {
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\');
    expect(escapeLike('зайчик')).toBe('зайчик');
  });
});

interface Fixture {
  key: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  barcode: string;
}

const FIXTURES: Fixture[] = [
  { key: 'A', name: 'Костюмчик Зайчик', color: 'блакитний', size: '86', sku: 'KZ-86', barcode: '2900000000011' },
  { key: 'B', name: 'Костюмчик Зайчик', color: 'блакитний', size: '98-104', sku: 'KZ-98', barcode: '2900000000028' },
  { key: 'C', name: 'Костюмчик Зайчик', color: 'рожевий', size: '86', sku: 'KZ-R86', barcode: '2900000008606' },
  { key: 'D', name: 'Сукня Свято', color: 'біла', size: '92-98', sku: 'SS-1', barcode: '4820086123456' },
  { key: 'E', name: 'Комплект 100%', color: 'молочний', size: '62', sku: 'K_1', barcode: '5901234123457' },
  { key: 'F', name: 'Реглан', color: 'сірий', size: '110', sku: '0054', barcode: '2900000000554' },
  // Saved the way an owner actually types a pair: with a slash, and with an en dash.
  { key: 'G', name: 'Боді', color: 'жовтий', size: '98/104', sku: 'BD-1', barcode: '5901234000016' },
  { key: 'H', name: 'Боді', color: 'жовтий', size: '104–110', sku: 'BD-2', barcode: '5901234000023' },
  // A shop whose articles are plain short numbers: «77» finds the article that IS 77…
  { key: 'I', name: 'Шапка', color: 'сіра', size: 'OS', sku: '77', barcode: '5901234000030' },
  // …and not the EAN that merely has a 77 inside it.
  { key: 'J', name: 'Шарф', color: 'сірий', size: 'OS', sku: 'J-1', barcode: '5907712345678' },
];

const MATCH_CASES: Array<{ query: string; expected: string }> = [
  { query: 'зайчик 86', expected: 'AC' },
  { query: 'зайчик', expected: 'ABC' },
  { query: 'ЗАЙЧИК', expected: 'ABC' },
  { query: '86 зайчик', expected: 'AC' },
  { query: 'блакитний 98/104', expected: 'B' },
  // The field is folded too, so a pair saved with a slash or an en dash is one of these.
  { query: '98-104', expected: 'BG' },
  { query: '98–104', expected: 'BG' },
  { query: '98/104', expected: 'BG' },
  { query: '104-110', expected: 'H' },
  { query: '104–110 жовтий', expected: 'H' },
  { query: 'зайчик сукня', expected: '' },
  // A short number is a size: «86» is in the barcode of D too, and must not find it.
  { query: '86', expected: 'AC' },
  // …while a fragment of a scan (six digits) still does.
  { query: '086123', expected: 'D' },
  { query: '4820086123456', expected: 'D' },
  { query: '0054', expected: 'F' },
  { query: '54', expected: '' },
  { query: '77', expected: 'I' },
  { query: '5907712345678', expected: 'J' },
  { query: '907712', expected: 'J' },
  { query: 'kz-86', expected: 'A' },
  { query: 'реглан 110', expected: 'F' },
  // LIKE syntax means itself.
  { query: '100%', expected: 'E' },
  { query: '%', expected: 'E' },
  { query: '_', expected: 'E' },
  { query: 'k_1', expected: 'E' },
  // Only six words count: the seventh («lol») would exclude everything.
  { query: 'костюмчик зайчик блакитний 86 2900000000011 kz-86 lol', expected: 'A' },
  { query: '', expected: 'ABCDEFGHIJ' },
  { query: '   ', expected: 'ABCDEFGHIJ' },
];

describe.skipIf(!hasDb)('catalog search through the service', () => {
  let store: TestStore;
  const keyByVariant = new Map<number, string>();

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('csearch');
    for (const f of FIXTURES) {
      const created = (await products.createProduct(store.storeId, {
        name: f.name,
        variants: [
          {
            attributes: { color: f.color, size: f.size },
            sku: f.sku,
            barcode: f.barcode,
            price_cents: 50000,
            quantity: 1,
          },
        ],
      })) as { variants: Array<{ id: number }> };
      keyByVariant.set(created.variants[0]!.id, f.key);
    }
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  async function find(q: string): Promise<string> {
    const rows = await products.getCatalog(store.storeId, { q });
    return rows
      .map((r) => keyByVariant.get(r.variant_id) ?? '?')
      .sort()
      .join('');
  }

  it.each(MATCH_CASES)('«$query» finds $expected', async ({ query, expected }) => {
    expect(await find(query)).toBe(expected);
  });

  it('still takes an exact barcode from a scanner, whatever the words rule says', async () => {
    const rows = await products.getCatalog(store.storeId, { barcode: '4820086123456' });
    expect(rows.map((r) => keyByVariant.get(r.variant_id))).toEqual(['D']);
  });
});
