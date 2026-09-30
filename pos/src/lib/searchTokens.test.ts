// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's reading of the search box. TOKEN_CASES is the table the server
// pins in `src/__tests__/pos.catalog-search.test.ts`, copied verbatim: the
// offline till must split a query exactly the way the online one does.

import { describe, expect, it } from 'vitest';
import { foldSeparators, matchesToken, MAX_SEARCH_WORDS, searchTokens } from './searchTokens';

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
    expect(searchTokens('a b c d e f g h').map((t) => t.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('cuts one absurdly long word', () => {
    expect(searchTokens('x'.repeat(500))[0]!.text).toHaveLength(64);
  });
});

describe('foldSeparators', () => {
  it('spells a range one way', () => {
    expect(foldSeparators('98-104')).toBe('98-104');
    expect(foldSeparators('98–104')).toBe('98-104');
    expect(foldSeparators('98—104')).toBe('98-104');
    expect(foldSeparators('98/104')).toBe('98-104');
  });
});

describe('matchesToken', () => {
  const item = {
    product_name: 'Костюмчик Зайчик',
    label: 'блакитний / 98/104',
    sku: 'KZ-98',
    barcode: '2900000000028',
    attributes: { color: 'блакитний', size: '98/104', country: 'Туреччина' },
  };
  const [zaichyk] = searchTokens('зайчик');
  const [pair] = searchTokens('98-104');

  it('finds a word in the name, and a range saved with a slash by one typed with a hyphen', () => {
    expect(matchesToken(item, zaichyk!, [])).toBe(true);
    expect(matchesToken(item, pair!, [])).toBe(true);
  });

  it('reads an attribute only when the vertical marks it searchable', () => {
    const [country] = searchTokens('туреч');
    expect(matchesToken(item, country!, ['country'])).toBe(true);
    expect(matchesToken(item, country!, [])).toBe(false);
  });

  it('tolerates a row with no article, no barcode and no attributes', () => {
    const bare = { product_name: 'Шапка', label: '', sku: null, barcode: null, attributes: null };
    expect(matchesToken(bare, searchTokens('шапка')[0]!, ['color'])).toBe(true);
    expect(matchesToken(bare, searchTokens('0054')[0]!, ['color'])).toBe(false);
  });
});
