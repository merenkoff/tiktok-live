// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { TrackedOrder } from './trackerApi';
import {
  LATE_ARRIVAL_MINUTES,
  itemsLine,
  minutesLate,
  nextStep,
  receiptOf,
  stageOf,
  trackedOrders,
  waitingTooLong,
} from './lib';

function order(over: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    id: 1,
    status: 'cooking',
    order_no: 12,
    guest_label: 'Стіл 3',
    kitchen_title: 'Кухня Пульчинелли',
    kitchen_phone: null,
    promised_at: '2026-11-25T18:40:00Z',
    paid_at: '2026-11-25T18:10:00Z',
    arrived_at: null,
    decline_reason: null,
    cancelled_by: null,
    cancel_seen_at: null,
    delayed_minutes: 0,
    items: [{ id: 1, product_name: 'Маргарита', variant_label: '32 см', quantity: 2 }],
    ...over,
  };
}

describe('the cafe tracker', () => {
  it('shows the kitchen’s unanswered cancels first, then what is on its way, soonest first', () => {
    const list = trackedOrders([
      order({ id: 1, promised_at: '2026-11-25T19:00:00Z' }),
      order({ id: 2, status: 'handed_over' }),
      order({ id: 3, status: 'cancelled', cancelled_by: 'kitchen' }),
      order({ id: 4, status: 'cancelled', cancelled_by: 'cafe' }),
      order({ id: 5, status: 'cancelled', cancelled_by: 'kitchen', cancel_seen_at: '2026-11-25T18:20:00Z' }),
      order({ id: 6, status: 'dispatched', promised_at: '2026-11-25T18:30:00Z' }),
      order({ id: 7, status: 'quoted' }),
      order({ id: 8, status: 'arrived' }),
    ]);
    expect(list.map((o) => o.id)).toEqual([3, 6, 8, 1]);
  });

  it('a server before the tracker’s migration never shows a cancel as the kitchen’s', () => {
    const { cancelled_by: _by, ...old } = order({ id: 9, status: 'cancelled' });
    expect(trackedOrders([old as TrackedOrder])).toEqual([]);
  });

  it('walks the four stages and offers the cafe’s next tap only when it is the cafe’s', () => {
    expect(['cooking', 'ready', 'dispatched', 'arrived', 'handed_over'].map(stageOf)).toEqual([0, 0, 1, 2, 3]);
    const now = Date.parse('2026-11-25T18:30:00Z');
    expect(nextStep(order({ status: 'cooking' }), now)).toBeNull();
    expect(nextStep(order({ status: 'ready' }), now)?.label).toBe('Привезли');
    expect(nextStep(order({ status: 'dispatched' }), now)?.action).toBe('arrived');
    expect(nextStep(order({ status: 'arrived' }), now)).toEqual({ action: 'handed', label: 'Видали гостю' });
  });

  it('lets the cafe close an order the kitchen never moved only well past its promise, and asks first', () => {
    const promised = Date.parse('2026-11-25T18:40:00Z');
    const cooking = order({ status: 'cooking' });
    expect(nextStep(cooking, promised + (LATE_ARRIVAL_MINUTES - 1) * 60_000)).toBeNull();
    const late = nextStep(cooking, promised + LATE_ARRIVAL_MINUTES * 60_000);
    expect(late).toMatchObject({ action: 'arrived', label: 'Вже привезли' });
    expect(late?.confirm).toContain('Кухня не відмітила');
    expect(nextStep(order({ status: 'paid' }), promised + 3 * 60 * 60_000)?.action).toBe('arrived');
    expect(nextStep(order({ status: 'cooking', promised_at: null }), promised + 3 * 60 * 60_000)).toBeNull();
  });

  it('names the cafe’s receipt, and nothing on a server that does not send it', () => {
    expect(receiptOf(order({ cafe_receipt_number: 'ЧК-000123' }))).toBe('чек ЧК-000123');
    expect(receiptOf(order())).toBe('');
  });

  it('counts lateness up to the cafe’s door, and a two-hour wait after it', () => {
    const promised = Date.parse('2026-11-25T18:40:00Z');
    expect(minutesLate(order(), promised - 60_000)).toBe(0);
    expect(minutesLate(order(), promised + 61_000)).toBe(2);
    expect(minutesLate(order({ status: 'arrived' }), promised + 600_000)).toBe(0);
    const arrived = order({ status: 'arrived', arrived_at: '2026-11-25T18:35:00Z' });
    expect(waitingTooLong(arrived, Date.parse('2026-11-25T20:34:00Z'))).toBe(false);
    expect(waitingTooLong(arrived, Date.parse('2026-11-25T20:35:00Z'))).toBe(true);
  });

  it('names the dishes as the cashier sold them', () => {
    expect(
      itemsLine(
        order({
          items: [
            { id: 1, product_name: 'Маргарита', variant_label: '32 см', quantity: 2 },
            { id: 2, product_name: 'Карбонара', variant_label: '', quantity: 1 },
          ],
        })
      )
    ).toBe('2× Маргарита 32 см, Карбонара');
  });
});
