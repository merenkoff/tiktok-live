// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  clampPhoneMinutes,
  clockOf,
  defaultPhoneMinutes,
  holdReason,
  kitchenLines,
  orderItems,
  phaseOf,
  readSetup,
  refusalOf,
  secondsUntil,
  signatureOf,
  dishWord,
  type CafeOrder,
} from './lib';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const at = (sec: number) => new Date(NOW + sec * 1000).toISOString();

function order(over: Partial<CafeOrder> = {}): CafeOrder {
  return {
    id: 7,
    revision: 1,
    status: 'requested',
    quote_source: null,
    quoted_minutes: null,
    suggested_minutes: 35,
    promised_at: null,
    answer_deadline_at: at(30),
    answer_overdue: false,
    quote_expires_at: null,
    decline_reason: null,
    kitchen_phone: '+380671112233',
    ...over,
  };
}

const pizza = { variant_id: 10, quantity: 2, product_name: 'Маргарита' };
const coffee = { variant_id: 20, quantity: 1, product_name: 'Капучино' };

describe('readSetup', () => {
  it('reads a cafe with a kitchen', () => {
    const setup = readSetup({
      as_cafe: {
        link: { id: 3, status: 'active', kitchen_title: 'Pulcinella кухня', kitchen_phone: ' +380 ', answer_seconds: 60 },
        kitchen: { accepting: false },
        items: [{ cafe_variant_id: 10 }, { cafe_variant_id: '11' }, { cafe_variant_id: null }],
      },
      as_kitchen: null,
    });
    expect(setup).toMatchObject({ linkId: 3, linkActive: true, kitchenTitle: 'Pulcinella кухня', accepting: false });
    expect(setup?.kitchenPhone).toBe('+380');
    expect([...(setup?.variantIds ?? [])]).toEqual([10, 11]);
  });

  it('is null for a store that is not a cafe with a kitchen', () => {
    expect(readSetup({ as_cafe: null, as_kitchen: { status: {} } })).toBeNull();
    expect(readSetup(null)).toBeNull();
    expect(readSetup({ as_cafe: { link: {} } })).toBeNull();
  });

  it('marks a paused link', () => {
    expect(readSetup({ as_cafe: { link: { id: 1, status: 'paused' }, items: [] } })?.linkActive).toBe(false);
  });
});

describe('the kitchen lines of a cart', () => {
  const ids = new Set([10]);

  it('keeps the mapped dishes and nothing else', () => {
    expect(kitchenLines([pizza, coffee], ids)).toEqual([pizza]);
  });

  it('never takes an assembled line or a weighed one', () => {
    expect(kitchenLines([{ ...pizza, components: [] }, { ...pizza, quantity: 350.5 }], ids)).toEqual([]);
  });

  it('sends the answers and the note with the dish', () => {
    expect(orderItems([{ ...pizza, modifiers: [{ id: 4 }], note: 'без цибулі' }, coffee])).toEqual([
      { variant_id: 10, quantity: 2, modifiers: [{ id: 4 }], note: 'без цибулі' },
      { variant_id: 20, quantity: 1 },
    ]);
  });

  it('changes its signature with the dishes, not with their order', () => {
    const a = signatureOf([pizza, coffee]);
    expect(signatureOf([coffee, pizza])).toBe(a);
    expect(signatureOf([{ ...pizza, quantity: 3 }, coffee])).not.toBe(a);
    expect(signatureOf([{ ...pizza, note: 'гостра' }, coffee])).not.toBe(a);
    expect(signatureOf([{ ...pizza, modifiers: [{ id: 2 }, { id: 1 }] }])).toBe(
      signatureOf([{ ...pizza, modifiers: [{ id: 1 }, { id: 2 }] }])
    );
  });
});

describe('phaseOf', () => {
  it('walks the conversation', () => {
    expect(phaseOf(null, false, NOW)).toBe('idle');
    expect(phaseOf(order(), false, NOW)).toBe('asking');
    expect(phaseOf(order({ answer_deadline_at: at(-1) }), false, NOW)).toBe('overdue');
    expect(phaseOf(order({ answer_overdue: true }), false, NOW)).toBe('overdue');
    const quoted = order({ status: 'quoted', quote_expires_at: at(120) });
    expect(phaseOf(quoted, false, NOW)).toBe('quoted');
    expect(phaseOf(quoted, true, NOW)).toBe('agreed');
    expect(phaseOf({ ...quoted, quote_expires_at: at(-1) }, true, NOW)).toBe('expired');
    expect(phaseOf(order({ status: 'declined' }), false, NOW)).toBe('declined');
    expect(phaseOf(order({ status: 'expired' }), false, NOW)).toBe('expired');
    expect(phaseOf(order({ status: 'guest_declined' }), false, NOW)).toBe('idle');
  });
});

describe('the hold on «Оплатити»', () => {
  it('holds every phase but the agreed one while a kitchen dish is in the cart', () => {
    for (const phase of ['idle', 'asking', 'overdue', 'quoted', 'declined', 'expired'] as const) {
      expect(holdReason(phase, true), phase).toMatch(/^Страви з кухні/);
    }
    expect(holdReason('agreed', true)).toBeNull();
    expect(holdReason('idle', false)).toBeNull();
  });
});

describe('time', () => {
  it('counts down and never below zero', () => {
    expect(secondsUntil(at(29.2), NOW)).toBe(30);
    expect(secondsUntil(at(-5), NOW)).toBe(0);
    expect(secondsUntil(null, NOW)).toBeNull();
  });

  it('shows a clock time', () => {
    expect(clockOf(new Date(2026, 10, 25, 9, 5).toISOString())).toBe('09:05');
    expect(clockOf(null)).toBeNull();
    expect(clockOf('nonsense')).toBeNull();
  });

  it('keeps the phone time in fives', () => {
    expect(clampPhoneMinutes(37)).toBe(40);
    expect(clampPhoneMinutes(0)).toBe(5);
    expect(clampPhoneMinutes(999)).toBe(240);
    expect(defaultPhoneMinutes(order({ suggested_minutes: 33 }))).toBe(35);
    expect(defaultPhoneMinutes(order({ suggested_minutes: null }))).toBe(40);
    expect(defaultPhoneMinutes(null)).toBe(40);
  });
});

describe('refusalOf', () => {
  it('takes the server words, and notices a paused kitchen', () => {
    const paused = { response: { data: { error: 'Кухня на паузі', paused: true, kitchen_phone: '+380' } } };
    expect(refusalOf(paused, 'x')).toEqual({ message: 'Кухня на паузі', paused: true, phone: '+380' });
    expect(refusalOf(new Error('boom'), 'Немає звʼязку')).toEqual({ message: 'Немає звʼязку', paused: false, phone: null });
  });
});

describe('dishWord', () => {
  it('agrees with the number', () => {
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25].map(dishWord)).toEqual([
      'страва',
      'страви',
      'страви',
      'страв',
      'страв',
      'страв',
      'страва',
      'страви',
      'страв',
    ]);
  });
});
