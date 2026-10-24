// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the till says about a debt before it asks the server anything.

import { describe, expect, it } from 'vitest';
import { formatUah } from '@pos/platform';
import type { CartLine } from '@pos/platform';
import {
  ageText,
  creditLine,
  daysSince,
  goodsText,
  hasAssembledLine,
  issueBlock,
  issueItems,
  isOverLimit,
  limitInputToCents,
  linesCoveredBy,
  matchesDebtor,
  nextCount,
  prefixTotals,
  returnAmount,
} from './debt';
import type { DebtCredit, DebtLine } from './types';

function cartLine(over: Partial<CartLine> = {}): CartLine {
  return {
    uid: '10',
    variant_id: 10,
    product_name: 'Хліб',
    variant_label: '',
    unit: 'шт',
    unit_price_cents: 3200,
    quantity: 1,
    max_quantity: 99,
    ...over,
  };
}

function credit(over: Partial<DebtCredit> = {}): DebtCredit {
  return {
    customer_id: 7,
    limit_cents: 300000,
    locked: false,
    balance_cents: 124000,
    available_cents: 176000,
    set_at: null,
    set_by_name: null,
    ...over,
  };
}

function line(over: Partial<DebtLine> = {}): DebtLine {
  return {
    id: 1,
    entry_id: 1,
    created_at: '2026-10-20T10:00:00.000Z',
    product_name: 'Хліб',
    variant_label: '',
    unit: 'шт',
    quantity: 1,
    returned_quantity: 0,
    remaining_quantity: 1,
    unit_price_cents: 3200,
    line_discount_cents: 0,
    line_total_cents: 3200,
    owed_cents: 3200,
    status: 'open',
    sale_id: null,
    receipt_number: null,
    note: '',
    ...over,
  };
}

describe('issueItems', () => {
  it('sends the checkout’s own wire shape: answers sorted, the note, nothing else', () => {
    const items = issueItems([
      cartLine({
        variant_id: 5,
        quantity: 2,
        modifiers: [
          { id: 9, group_id: 1, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 },
          { id: 3, group_id: 2, group_name: 'Цукор', name: 'без', price_delta_cents: 0 },
        ] as unknown as CartLine['modifiers'],
        note: 'гаряче',
      }),
      cartLine({ variant_id: 6, quantity: 1 }),
    ]);
    expect(items).toEqual([
      { variant_id: 5, quantity: 2, modifiers: [3, 9], note: 'гаряче' },
      { variant_id: 6, quantity: 1 },
    ]);
  });
});

describe('issueBlock', () => {
  const base = { customerId: 7, credit: credit(), totalCents: 50000, lines: [cartLine()], online: true };

  it('lets a cart through that fits under the limit', () => {
    expect(issueBlock(base)).toBeNull();
  });

  it('asks for a customer first — a debt is written to a person', () => {
    expect(issueBlock({ ...base, customerId: null })?.code).toBe('no_customer');
  });

  it('says it needs the network where there is no queue — the web and the tablet', () => {
    expect(issueBlock({ ...base, online: false })?.code).toBe('offline');
  });

  it('lets the desktop write down without a network, judged by its mirror exactly as online (Д3)', () => {
    const offline = { ...base, online: false, queue: true };
    expect(issueBlock(offline)).toBeNull();
    expect(issueBlock({ ...offline, totalCents: 176001 })?.code).toBe('over_limit');
    expect(issueBlock({ ...offline, credit: credit({ locked: true }) })?.code).toBe('locked');
    expect(issueBlock({ ...offline, credit: credit({ limit_cents: null, available_cents: null }) })?.code).toBe(
      'no_credit'
    );
  });

  it('refuses offline when the till never had the list — it cannot vouch for anyone', () => {
    const block = issueBlock({ ...base, online: false, queue: true, credit: null, noMirror: true });
    expect(block?.code).toBe('no_mirror');
    expect(block?.text).toContain('Потрібна мережа');
    // With a network the server decides; the mirror does not matter.
    expect(issueBlock({ ...base, queue: true, noMirror: true })).toBeNull();
  });

  it('refuses a customer the till created offline: no owner has given them a limit yet', () => {
    expect(issueBlock({ ...base, customerId: -3, credit: null, online: false, queue: true })?.code).toBe('no_credit');
  });

  it('refuses a bouquet assembled at the counter, with what to do instead', () => {
    const lines = [cartLine({ components: [{ component_variant_id: 1, quantity: 3 } as never] })];
    expect(hasAssembledLine(lines)).toBe(true);
    expect(issueBlock({ ...base, lines })).toMatchObject({ code: 'assembled' });
  });

  it('says nothing while the credit is still loading', () => {
    expect(issueBlock({ ...base, credit: null })).toBeNull();
  });

  it('refuses a customer the owner gave no limit, and says who gives one (Д2)', () => {
    const block = issueBlock({ ...base, credit: credit({ limit_cents: null, available_cents: null }) });
    expect(block?.code).toBe('no_credit');
    expect(block?.text).toContain('власник');
  });

  it('refuses a locked customer', () => {
    expect(issueBlock({ ...base, credit: credit({ locked: true }) })?.code).toBe('locked');
  });

  it('refuses a cart above what is still allowed, in figures (Д3)', () => {
    const block = issueBlock({ ...base, totalCents: 176001 });
    expect(block?.code).toBe('over_limit');
    expect(block?.text).toContain(formatUah(176000));
    expect(block?.text).toContain(formatUah(176001));
    // Exactly what is left is still fine.
    expect(issueBlock({ ...base, totalCents: 176000 })).toBeNull();
  });
});

describe('paying the oldest lines first (Д4)', () => {
  const open = [line({ id: 1, owed_cents: 3200 }), line({ id: 2, owed_cents: 4500 }), line({ id: 3, owed_cents: 6000 })];

  it('adds up what paying the oldest k lines comes to', () => {
    expect(prefixTotals(open)).toEqual([3200, 7700, 13700]);
  });

  it('turns the sum the customer holds out into the whole lines it closes', () => {
    expect(linesCoveredBy(open, 10000)).toEqual({ count: 2, total: 7700 });
    expect(linesCoveredBy(open, 13700)).toEqual({ count: 3, total: 13700 });
    // Not even the oldest one: nothing is taken against nothing in particular.
    expect(linesCoveredBy(open, 3199)).toEqual({ count: 0, total: 0 });
  });

  it('takes a line with every older one, and gives the newest one back on a second tap', () => {
    expect(nextCount(3, 0)).toBe(1);
    expect(nextCount(1, 2)).toBe(3);
    expect(nextCount(3, 2)).toBe(2);
    // The last line left is not untaken by a tap — there is always something to pay.
    expect(nextCount(1, 0)).toBe(1);
  });
});

describe('returnAmount', () => {
  it('splits a discounted line so its units add up to the line exactly', () => {
    const discounted = line({ quantity: 3, line_total_cents: 9599, owed_cents: 9599, remaining_quantity: 3 });
    const first = returnAmount(discounted, 1);
    const second = returnAmount({ ...discounted, returned_quantity: 1 }, 1);
    const third = returnAmount({ ...discounted, returned_quantity: 2 }, 1);
    expect(first + second + third).toBe(9599);
    expect(returnAmount(discounted, 0)).toBe(0);
  });
});

describe('words', () => {
  it('counts days on the calendar, not in hours', () => {
    const now = new Date(2026, 9, 24, 9, 0);
    expect(daysSince(new Date(2026, 9, 23, 23, 59).toISOString(), now)).toBe(1);
    expect(ageText(new Date(2026, 9, 24, 1, 0).toISOString(), now)).toBe('сьогодні');
    expect(ageText(new Date(2026, 9, 23, 1, 0).toISOString(), now)).toBe('вчора');
    expect(ageText(new Date(2026, 9, 21).toISOString(), now)).toBe('3 дні');
    expect(ageText(new Date(2026, 9, 12).toISOString(), now)).toBe('12 днів');
    expect(ageText(new Date(2026, 8, 23).toISOString(), now)).toBe('31 день');
  });

  it('declines «товар» the Ukrainian way', () => {
    expect(goodsText(1)).toBe('1 товар');
    expect(goodsText(3)).toBe('3 товари');
    expect(goodsText(6)).toBe('6 товарів');
    expect(goodsText(11)).toBe('11 товарів');
    expect(goodsText(22)).toBe('22 товари');
  });

  it('says the debt and what is left, or why nothing is', () => {
    const owed = `Борг ${formatUah(124000)}`;
    expect(creditLine(credit())).toBe(`${owed} · ще можна ${formatUah(176000)}`);
    expect(creditLine(credit({ locked: true }))).toBe(`${owed} · записи заблоковано`);
    expect(creditLine(credit({ limit_cents: null, available_cents: null }))).toBe(
      `${owed} · під запис більше не можна`
    );
  });

  it('says by how much a debt is above the limit — only an offline handover or a lowered limit puts it there', () => {
    const over = credit({ balance_cents: 320000, available_cents: 0 });
    expect(creditLine(over)).toBe(`Борг ${formatUah(320000)} · понад ліміт на ${formatUah(20000)}`);
    expect(creditLine({ ...over, locked: true })).toBe(`Борг ${formatUah(320000)} · записи заблоковано`);
    expect(isOverLimit({ balance_cents: 320000, limit_cents: 300000 })).toBe(true);
    expect(isOverLimit({ balance_cents: 300000, limit_cents: 300000 })).toBe(false);
    expect(isOverLimit({ balance_cents: 5000, limit_cents: null })).toBe(false);
  });

  it('says there is no debt rather than a debt of nought', () => {
    expect(creditLine(credit({ balance_cents: 0, available_cents: 300000 }))).toBe(
      `Боргу немає · ще можна ${formatUah(300000)}`
    );
    expect(creditLine(credit({ balance_cents: 0, locked: true }))).toBe('Боргу немає · записи заблоковано');
    expect(creditLine(credit({ balance_cents: 0, limit_cents: null, available_cents: null }))).toBe('Боргу немає');
  });
});

describe('limitInputToCents', () => {
  it('reads hryvnias with a comma or a point and spaces, and nothing else', () => {
    expect(limitInputToCents('2000')).toBe(200000);
    expect(limitInputToCents('2 000,50')).toBe(200050);
    expect(limitInputToCents('1.5')).toBe(150);
    expect(limitInputToCents('')).toBeNull();
    expect(limitInputToCents('дві тисячі')).toBeNull();
    expect(limitInputToCents('1,234')).toBeNull();
  });
});

describe('matchesDebtor', () => {
  const row = { name: 'Оксана Петрівна', phone: '+380671234567' };

  it('finds by name, or by the phone digit to digit', () => {
    expect(matchesDebtor(row, '')).toBe(true);
    expect(matchesDebtor(row, 'оксана')).toBe(true);
    expect(matchesDebtor(row, '067 123')).toBe(true);
    expect(matchesDebtor(row, 'Марія')).toBe(false);
    // One digit is not a search.
    expect(matchesDebtor(row, '7')).toBe(false);
  });
});
