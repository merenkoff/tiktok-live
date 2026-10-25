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
  entryLabel,
  goodsText,
  hasAssembledLine,
  issueBlock,
  issueItems,
  isOverLimit,
  limitInputToCents,
  lineProgress,
  linesCoveredBy,
  matchesDebtor,
  nextCount,
  planPayment,
  planRequest,
  planTakes,
  planTotal,
  planWords,
  prefixTotals,
  quantityText,
  returnAmount,
  returnBlockedByPrepay,
  returnsWhole,
  takesParts,
  takesUnits,
  unitsCents,
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

describe('weighed goods «під запис» (TechDocs/grocery/G4_WEIGHED.md)', () => {
  it('sends how a weighed line was weighed — the server refuses one without it', () => {
    expect(
      issueItems([
        cartLine({ uid: 'weighed:1', variant_id: 70, quantity: 350, unit: 'г', price_per: 1000, weight_source: 'manual' }),
      ])
    ).toEqual([{ variant_id: 70, quantity: 350, weight_source: 'manual' }]);
  });

  it('reads a weighed quantity in kilograms and a piece as before', () => {
    expect(quantityText(350, 'г', 1000)).toBe('0,350 кг');
    expect(quantityText(250, 'г')).toBe('250 г');
    expect(quantityText(2, '')).toBe('2 шт');
  });

  it('gives weighed goods back only whole', () => {
    expect(returnsWhole({ price_per: 1000 })).toBe(true);
    expect(returnsWhole({ price_per: 1 })).toBe(false);
    expect(returnsWhole({})).toBe(false);
  });
});

describe('paying in parts (Д4 revised, G3_DEBTS.md §11)', () => {
  // A backend with 078 says how many units of every line are paid.
  const p = (over: Partial<DebtLine>) => line({ paid_quantity: 0, prepaid_cents: 0, ...over });
  const cash = { method: 'cash' as const, step: 0 as const, partial: true, prepayAllowed: true };
  const bread = p({ id: 1, product_name: 'Хліб', owed_cents: 3200, line_total_cents: 3200, unit_price_cents: 3200 });
  const milk = p({ id: 2, product_name: 'Молоко', owed_cents: 4500, line_total_cents: 4500, unit_price_cents: 4500 });
  const cap = p({ id: 3, product_name: 'Кепка', owed_cents: 59000, line_total_cents: 59000, unit_price_cents: 59000 });
  const buns = p({
    id: 4,
    product_name: 'Булка',
    quantity: 5,
    remaining_quantity: 5,
    unit_price_cents: 2500,
    line_total_cents: 12500,
    owed_cents: 12500,
  });

  it('knows a backend that takes parts by the paid units on every line', () => {
    expect(takesParts([bread, milk])).toBe(true);
    expect(takesParts([line(), bread])).toBe(false);
    expect(takesParts([])).toBe(false);
  });

  it('takes 300 against a 590 cap as a «внесок» — the case that had no answer', () => {
    const plan = planPayment([cap], 30000, cash);
    expect(plan).toMatchObject({ wholeCount: 0, units: null, receiptCents: 0, changeCents: 0, prepayRefused: false });
    expect(plan.prepay).toEqual({ line: cap, cents: 30000 });
    expect(planTotal(plan)).toBe(30000);
    expect(planRequest([cap], plan, 'cash')).toEqual({
      part: { line_id: 3, amount_cents: 30000, method: 'cash' },
      payments: [],
    });
    expect(planWords(plan, [cap])).toEqual([`Внесок ${formatUah(30000)} на «Кепка» — лишиться винно ${formatUah(29000)}`]);
  });

  it('closes whole lines first, then units of a piece line, then a «внесок» toward that same line', () => {
    const open = [bread, milk, buns];
    const plan = planPayment(open, 18000, cash);
    expect(plan.wholeCount).toBe(2);
    expect(plan.wholeCents).toBe(7700);
    // 103 ₴ left: four buns, 100 ₴ (all five would be the whole line), and the 3 ₴ over them a «внесок».
    expect(plan.units).toEqual({ line: buns, quantity: 4, cents: 10000 });
    expect(plan.prepay).toEqual({ line: buns, cents: 300 });
    expect(planTotal(plan)).toBe(18000);
    expect(planRequest(open, plan, 'card')).toEqual({
      line_ids: [1, 2],
      part: { line_id: 4, quantity: 4, amount_cents: 300, method: 'card' },
      payments: [{ method: 'card', amount_cents: 17700 }],
    });
    expect(planWords(plan, open)).toEqual([
      `Закриває 2 товари на ${formatUah(7700)}`,
      `4 з 5 шт «Булка» на ${formatUah(10000)}`,
      `Внесок ${formatUah(300)} на «Булка» — лишиться винно ${formatUah(2200)}`,
    ]);
  });

  it('never takes every unit of a line as a part — that is the whole line, closed above', () => {
    const plan = planPayment([buns], 12499, cash);
    expect(plan.units?.quantity).toBe(4);
    expect(planPayment([buns], 12500, cash).wholeCount).toBe(1);
  });

  it('prices the units by the refund’s cumulative rule, as the server does', () => {
    // 3 at 35 ₴ less 5 ₴: 100 ₴ for the line, 33,33 + 33,34 + 33,33.
    const discounted = p({ quantity: 3, remaining_quantity: 3, line_total_cents: 10000, owed_cents: 10000 });
    expect(unitsCents(discounted, 1)).toBe(3333);
    expect(unitsCents({ ...discounted, paid_quantity: 1 }, 1)).toBe(3334);
    expect(unitsCents({ ...discounted, paid_quantity: 1, returned_quantity: 1 }, 1)).toBe(3333);
    // A return after units were paid counts after both, like the server.
    expect(returnAmount({ ...discounted, paid_quantity: 2 }, 1)).toBe(3333);
  });

  it('takes no units of a weighed line, nor of one money was already taken toward', () => {
    const cheese = p({ id: 5, quantity: 350, remaining_quantity: 350, unit: 'г', price_per: 1000, line_total_cents: 6650, owed_cents: 6650 });
    expect(takesUnits(cheese)).toBe(false);
    const plan = planPayment([cheese], 5000, cash);
    expect(plan.units).toBeNull();
    expect(plan.prepay?.cents).toBe(5000);

    const prepaid = { ...buns, prepaid_cents: 3000, owed_cents: 9500 };
    expect(takesUnits(prepaid)).toBe(false);
    expect(planPayment([prepaid], 5000, cash).prepay?.cents).toBe(5000);
  });

  it('in a store with ПРРО keeps the units — a real receipt — and gives the rest back (no chain yet)', () => {
    const fiscal = { ...cash, prepayAllowed: false };
    const plan = planPayment([buns], 8000, fiscal);
    expect(plan.units?.quantity).toBe(3);
    expect(plan.prepay).toBeNull();
    expect(plan.changeCents).toBe(500);
    expect(plan.prepayRefused).toBe(true);
    expect(planWords(plan, [buns]).at(-1)).toBe(
      `Решту ${formatUah(500)} поверніть покупцеві: у магазині з ПРРО внесок за частину товару поки не приймається`
    );

    const none = planPayment([cap], 30000, fiscal);
    expect(planTakes(none)).toBe(false);
    expect(planWords(none, [cap])).toEqual([
      `Не вистачає навіть на найстаріший товар (${formatUah(59000)})`,
      'У магазині з ПРРО внесок за частину товару поки не приймається — гроші поверніть покупцеві',
    ]);
  });

  it('rounds the receipt’s cash and keeps a cash «внесок» on the store’s step (НБУ № 25)', () => {
    const odd = { ...bread, owed_cents: 3183, line_total_cents: 3183 };
    const step50 = { ...cash, step: 50 as const };
    const plan = planPayment([odd, milk], 5000, step50);
    expect(plan.wholeCount).toBe(1);
    expect(plan.roundingCents).toBe(17);
    expect(plan.prepay?.cents).toBe(1800);
    expect(planTotal(plan)).toBe(5000);
    expect(planRequest([odd, milk], plan, 'cash').payments).toEqual([{ method: 'cash', amount_cents: 3200 }]);
    // A sum no coin makes: the «внесок» stays on the step and the kopecks go back.
    const coins = planPayment([odd, milk], 5030, step50);
    expect(coins.prepay?.cents).toBe(1800);
    expect(coins.changeCents).toBe(30);
    // A card is never rounded.
    expect(planPayment([odd, milk], 5000, { ...step50, method: 'card' }).roundingCents).toBe(0);
  });

  it('gives change for a sum above everything owed', () => {
    const plan = planPayment([bread, milk], 10000, cash);
    expect(plan).toMatchObject({ wholeCount: 2, prepay: null, changeCents: 2300 });
    expect(planWords(plan, [bread, milk]).at(-1)).toBe(`Решта ${formatUah(2300)}`);
  });

  it('asks an older backend for whole lines only — it would ignore a part', () => {
    const old = [line({ id: 1, owed_cents: 3200 }), line({ id: 2, owed_cents: 59000 })];
    const plan = planPayment(old, 30000, { ...cash, partial: takesParts(old) });
    expect(plan).toMatchObject({ wholeCount: 1, units: null, prepay: null, changeCents: 26800 });
    expect(planRequest(old, plan, 'cash')).toEqual({ line_ids: [1], payments: [{ method: 'cash', amount_cents: 3200 }] });
  });

  it('says what already happened to a line beside what is left of it', () => {
    expect(lineProgress(p({}))).toBeNull();
    expect(lineProgress({ ...buns, returned_quantity: 1, paid_quantity: 2 })).toBe('повернуто 1 шт, оплачено 2 шт');
    expect(lineProgress({ ...cap, prepaid_cents: 30000 })).toBe(`внесено ${formatUah(30000)}`);
    expect(returnBlockedByPrepay({ prepaid_cents: 30000 })).toBe(true);
    expect(returnBlockedByPrepay({})).toBe(false);
  });

  it('names a «внесок» in the journal for what it is', () => {
    expect(entryLabel({ kind: 'payment', prepayment: true })).toBe('Внесок');
    expect(entryLabel({ kind: 'payment_void', prepayment: true })).toBe('Внесок скасовано');
    expect(entryLabel({ kind: 'payment' })).toBe('Погашено');
  });
});
