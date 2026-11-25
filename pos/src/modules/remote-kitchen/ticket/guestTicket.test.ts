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
      guest_label: 'Стіл 3',
      items: [
        { product_name: 'Маргарита', variant_label: '32 см', quantity: 2 },
        { product_name: 'Тірамісу', variant_label: '', quantity: 1 },
      ],
    });
    expect(slip?.title).toBe('ТАЛОН П-12');
    expect(slip?.lines?.[0]).toBe('Страви з кухні «Пульчинелла»');
    expect(slip?.lines).toContain('Стіл 3');
    expect(slip?.lines?.some((l) => /^Буде о \d\d:\d\d$/.test(l))).toBe(true);
    expect(slip?.items).toEqual([
      { name: 'Маргарита 32 см', quantity: '2' },
      { name: 'Тірамісу', quantity: '1' },
    ]);
  });

  it('is nothing before the kitchen numbered the order', () => {
    expect(ticketSlip({ order_no: null, promised_at: null })).toBeNull();
  });
});
