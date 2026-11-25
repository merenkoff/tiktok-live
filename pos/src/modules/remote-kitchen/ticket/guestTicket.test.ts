// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { ticketSlip } from './guestTicket';

describe('the guest’s ticket', () => {
  it('carries the kitchen’s number, the dishes and the time', () => {
    const slip = ticketSlip({
      order_no: 12,
      promised_at: '2026-11-25T16:40:00Z',
      kitchen_title: 'Пульчинелла',
      items: [
        { product_name: 'Маргарита', variant_label: '32 см', quantity: 2 },
        { product_name: 'Тірамісу', variant_label: '', quantity: 1 },
      ],
    });
    expect(slip?.title).toBe('ТАЛОН П-12');
    expect(slip?.lines?.[0]).toBe('Страви з кухні «Пульчинелла»');
    // The cafe's till sends no guest label: nothing between the kitchen and the time.
    expect(slip?.lines).toHaveLength(2);
    expect(slip?.lines?.some((l) => /^Буде о \d\d:\d\d$/.test(l))).toBe(true);
    expect(slip?.items).toEqual([
      { name: 'Маргарита 32 см', quantity: '2' },
      { name: 'Тірамісу', quantity: '1' },
    ]);
  });

  it('names the answers and the note, so two pizzas of one size are told apart', () => {
    const slip = ticketSlip({
      order_no: 7,
      promised_at: null,
      items: [
        {
          product_name: 'Маргарита',
          // The server's caption may already carry the answers: they are not printed twice.
          variant_label: '30 см · сирний борт',
          quantity: 1,
          modifiers: [{ modifier_id: 3, group_name: 'Борт', name: 'сирний борт', price_delta_cents: 8000, sort_order: 0 }],
          note: ' без цибулі ',
        },
        { product_name: 'Маргарита', variant_label: '30 см', quantity: 1, modifiers: [{ modifier_id: 4 }], note: '' },
      ],
    });
    expect(slip?.items).toEqual([
      { name: 'Маргарита 30 см · сирний борт — без цибулі', quantity: '1' },
      { name: 'Маргарита 30 см', quantity: '1' },
    ]);
    // No time, no «Буде о».
    expect(slip?.lines).toEqual(['Страви з кухні']);
  });

  it('is nothing before the kitchen numbered the order', () => {
    expect(ticketSlip({ order_no: null, promised_at: null })).toBeNull();
  });
});
