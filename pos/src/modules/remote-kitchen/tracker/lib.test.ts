// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { TrackedOrder } from './trackerApi';
import { itemsLine, minutesLate, nextStep, stageOf, trackedOrders, waitingTooLong } from './lib';

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
    expect(nextStep('cooking')).toBeNull();
    expect(nextStep('ready')?.label).toBe('Привезли');
    expect(nextStep('dispatched')?.action).toBe('arrived');
    expect(nextStep('arrived')).toEqual({ action: 'handed', label: 'Видали гостю' });
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
