// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { buildReceiveLines, cellLabel, commonPriceCents, receiveCells, type ReceiveCard } from './receiveMatrix';
import { confirmStubsMessage, stubsFooter, summarizeStubs } from './stubs';

function variant(id: number, color: string, size: string, over: Partial<ReceiveCard['variants'][number]> = {}) {
  return {
    id,
    label: `${color} · ${size}`,
    unit: 'шт',
    price_cents: 39000,
    cost_cents: 15000,
    quantity: 3,
    is_active: true,
    attributes: { color, size },
    ...over,
  };
}

const card: ReceiveCard = {
  id: 1,
  name: 'Боді',
  variants: [variant(10, 'Синій', '86'), variant(11, 'Синій', '92', { quantity: 0 }), variant(12, 'Рожевий', '86', { is_active: false })],
};

describe('receiveCells', () => {
  it('pairs every colour × size with the variant the card has for it — however the pair was spelled', () => {
    const cells = receiveCells(['синій', 'Рожевий'], ['86', '98/104'], card);
    expect(cells.map((c) => [cellLabel(c.cell), c.variant?.id ?? null])).toEqual([
      ['синій · 86', 10],
      ['синій · 98/104', null],
      ['Рожевий · 86', null], // archived — the shop stopped it
      ['Рожевий · 98/104', null],
    ]);
  });

  it('is one row with no colours and one column with no sizes', () => {
    expect(receiveCells([], ['86'], null).map((c) => c.key)).toEqual(['|86']);
    expect(receiveCells([], [], null)).toHaveLength(1);
  });
});

describe('commonPriceCents', () => {
  it('is the price most live variants carry, and nothing for a new card', () => {
    expect(commonPriceCents(card)).toBe(39000);
    expect(commonPriceCents({ ...card, variants: [variant(1, 'a', 's', { price_cents: 100 }), variant(2, 'a', 't', { price_cents: 200 }), variant(3, 'a', 'u', { price_cents: 200 })] })).toBe(200);
    expect(commonPriceCents(null)).toBeNull();
  });
});

describe('buildReceiveLines', () => {
  const cells = receiveCells(['Синій'], ['86', '92', '98'], card);

  it('turns a count on an existing size into a line, and on a new size into a stub on the card', () => {
    const out = buildReceiveLines({
      card,
      name: '',
      cells,
      quantities: { [cells[0].key]: '2', [cells[2].key]: '1' },
      priceCents: 41000,
      costCents: 16000,
      unit: 'шт',
    });
    expect(out.problem).toBeNull();
    expect(out.existing).toEqual([{ variant: card.variants[0], quantity: 2, label: 'Боді Синій · 86' }]);
    expect(out.placeholders).toEqual([
      { name: 'Боді', attributes: { color: 'Синій', size: '98' }, quantity: 1, price_cents: 41000, unit_cost_cents: 16000, product_id: 1, unit: 'шт' },
    ]);
    expect(out.units).toBe(3);
    expect(out.newCells).toBe(1);
  });

  it('skips a blank and a zero cell, and refuses a fraction by name', () => {
    const fine = buildReceiveLines({ card, name: '', cells, quantities: { [cells[0].key]: ' ', [cells[1].key]: '0', [cells[2].key]: '' }, priceCents: null, costCents: null, unit: 'шт' });
    expect(fine.problem).toBe('Впишіть кількість хоча б в одну клітинку');
    const half = buildReceiveLines({ card, name: '', cells, quantities: { [cells[0].key]: '1,5' }, priceCents: null, costCents: null, unit: 'шт' });
    expect(half.problem).toBe('Кількість — ціле число: Синій · 86');
    expect(half.existing).toEqual([]);
  });

  it('asks for a price only when a NEW size has a count — an existing size keeps its own', () => {
    const existingOnly = buildReceiveLines({ card, name: '', cells, quantities: { [cells[0].key]: '2' }, priceCents: null, costCents: null, unit: 'шт' });
    expect(existingOnly.problem).toBeNull();
    expect(existingOnly.existing).toHaveLength(1);
    const withNew = buildReceiveLines({ card, name: '', cells, quantities: { [cells[2].key]: '2' }, priceCents: null, costCents: null, unit: 'шт' });
    expect(withNew.problem).toBe('Вкажіть ціну продажу для нових розмірів');
    expect(withNew.placeholders).toEqual([]);
  });

  it('for a new product every cell is a stub under the typed name, with no card', () => {
    const fresh = receiveCells(['Сірий'], ['86'], null);
    const out = buildReceiveLines({ card: null, name: ' Світшот ', cells: fresh, quantities: { [fresh[0].key]: '4' }, priceCents: 50000, costCents: null, unit: 'шт' });
    expect(out.placeholders).toEqual([{ name: 'Світшот', attributes: { color: 'Сірий', size: '86' }, quantity: 4, price_cents: 50000, unit: 'шт' }]);
    expect(buildReceiveLines({ card: null, name: '  ', cells: fresh, quantities: { [fresh[0].key]: '4' }, priceCents: 50000, costCents: null, unit: 'шт' }).problem).toBe('Вкажіть назву товару');
    expect(buildReceiveLines({ card: null, name: 'X', cells: fresh, quantities: { [fresh[0].key]: '4' }, priceCents: null, costCents: null, unit: 'шт' }).problem).toBe('Вкажіть ціну продажу');
  });

  it('leaves a cell with no colour and no size out of the attribute bag', () => {
    const one = receiveCells([], [], null);
    const out = buildReceiveLines({ card: null, name: 'Шапка', cells: one, quantities: { [one[0].key]: '1' }, priceCents: 100, costCents: null, unit: 'шт' });
    expect(out.placeholders[0].attributes).toEqual({});
  });
});

describe('what posting will create — counted the way the server creates it', () => {
  it('counts a name once however many sizes, and a stub on a card as a size', () => {
    const summary = summarizeStubs([
      { name: 'Боді' },
      { name: 'боді ' },
      { name: 'Світшот' },
      { name: 'Боді', product_id: 1 },
      { name: 'Боді', product_id: 1 },
    ]);
    expect(summary).toEqual({ products: 2, variantsOnCards: 2 });
    expect(confirmStubsMessage(summary)).toBe('Буде створено 2 нових товари і 2 нові розміри на наявних картках у каталозі. Продовжити?');
    expect(stubsFooter(summary)).toBe(' · нових товарів: 2 · нових розмірів: 2');
  });

  it('says nothing when nothing is created, and declines the words correctly', () => {
    expect(confirmStubsMessage({ products: 0, variantsOnCards: 0 })).toBeNull();
    expect(stubsFooter({ products: 0, variantsOnCards: 0 })).toBe('');
    expect(confirmStubsMessage({ products: 1, variantsOnCards: 0 })).toBe('Буде створено 1 новий товар у каталозі. Продовжити?');
    expect(confirmStubsMessage({ products: 0, variantsOnCards: 5 })).toBe('Буде створено 5 нових розмірів на наявних картках у каталозі. Продовжити?');
    expect(confirmStubsMessage({ products: 21, variantsOnCards: 0 })).toBe('Буде створено 21 новий товар у каталозі. Продовжити?');
  });
});
