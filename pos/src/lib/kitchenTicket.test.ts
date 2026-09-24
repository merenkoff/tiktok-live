// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeSaleDetail } from '../test/utils';
import type { PosTag, SaleDetail } from '../types';
import { bareVariantLabel, buildKitchenTickets, formatTicketTime, orderLabelOf, stationByTag, stationsOf } from './kitchenTicket';

function tag(over: Partial<PosTag> & Pick<PosTag, 'id' | 'name'>): PosTag {
  return { store_id: 1, parent_id: null, sort_order: 0, color: null, show_in_catalog_bar: true, ...over };
}

// Кава → bar, Випічка → kitchen, Сніданки → kitchen, Сезонне → no station.
const TAGS: PosTag[] = [
  tag({ id: 1, name: 'Кава', station: 'bar' }),
  tag({
    id: 2,
    name: 'Їжа',
    children: [tag({ id: 3, name: 'Випічка', station: 'kitchen' }), tag({ id: 4, name: 'Сніданки', station: 'kitchen' })],
  }),
  tag({ id: 5, name: 'Сезонне' }),
];

// Латте (bar), Круасан (kitchen), Сніданок з кавою (both), Вода (no tag).
const CATALOG = [
  { variant_id: 10, tag_ids: [1] },
  { variant_id: 20, tag_ids: [3] },
  { variant_id: 30, tag_ids: [4, 1, 5] },
  { variant_id: 40, tag_ids: [] },
];

function line(over: Partial<SaleDetail['items'][number]> & { variant_id: number; product_name: string }): SaleDetail['items'][number] {
  return {
    id: over.variant_id,
    variant_label: '',
    quantity: 1,
    unit_price_cents: 0,
    line_total_cents: 0,
    refunded_quantity: 0,
    ...over,
  };
}

const fixed = () => '14:59';

describe('orderLabelOf', () => {
  it('prefers the server’s number, then the till’s own «К», then the receipt', () => {
    expect(orderLabelOf({ order_no: 17, local_order_no: 1, receipt_number: 'ЧК-1' })).toBe('17');
    expect(orderLabelOf({ order_no: null, local_order_no: 1, receipt_number: 'OFF-1' })).toBe('К1');
    expect(orderLabelOf({ order_no: null, receipt_number: 'ЧК-1' })).toBe('ЧК-1');
  });
});

describe('stationsOf', () => {
  const stations = stationByTag(TAGS);
  const byVariant = new Map(CATALOG.map((c) => [c.variant_id, c]));

  it('reads the station off the tags, nested ones included, in kitchen-then-bar order', () => {
    expect(stations.get(3)).toBe('kitchen');
    expect(stations.get(5)).toBeUndefined();
    expect(stationsOf(10, byVariant, stations)).toEqual(['bar']);
    expect(stationsOf(20, byVariant, stations)).toEqual(['kitchen']);
    expect(stationsOf(30, byVariant, stations)).toEqual(['kitchen', 'bar']);
  });

  it('sends a product with no station — or unknown to the mirror — to the kitchen, never nowhere', () => {
    expect(stationsOf(40, byVariant, stations)).toEqual(['kitchen']);
    expect(stationsOf(999, byVariant, stations)).toEqual(['kitchen']);
  });
});

describe('buildKitchenTickets', () => {
  const sale = makeSaleDetail({
    order_no: 17,
    receipt_number: 'ЧК-000017',
    staff_name: 'Олена',
    created_at: '2026-09-21T11:59:00.000Z',
    items: [
      line({
        variant_id: 10,
        product_name: 'Латте',
        variant_label: 'M · вівсяне',
        quantity: 2,
        modifiers: [{ modifier_id: 1, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 }],
        note: ' гарячіше ',
      }),
      line({ variant_id: 20, product_name: 'Круасан' }),
      line({ variant_id: 30, product_name: 'Сніданок з кавою' }),
      line({ variant_id: 40, product_name: 'Вода' }),
    ],
  });

  it('cuts one ticket per station with only that station’s lines, a two-station dish on both', () => {
    const routes = buildKitchenTickets(sale, { catalog: CATALOG, tags: TAGS, formatTime: fixed });
    expect(routes.map((r) => r.station)).toEqual(['kitchen', 'bar']);
    const [kitchen, bar] = routes.map((r) => r.ticket);
    expect(kitchen.station).toBe('КУХНЯ');
    expect(kitchen.items.map((i) => i.name)).toEqual(['Круасан', 'Сніданок з кавою', 'Вода']);
    expect(bar.station).toBe('БАР');
    expect(bar.items.map((i) => i.name)).toEqual(['Латте', 'Сніданок з кавою']);
    // The head is the same on every ticket of the sale.
    for (const t of [kitchen, bar]) {
      expect(t).toMatchObject({ order_label: '17', created_at: '14:59', staff_name: 'Олена', receipt_number: 'ЧК-000017' });
    }
  });

  it('carries the answers by name and the trimmed line note, and no price anywhere', () => {
    const [, bar] = buildKitchenTickets(sale, { catalog: CATALOG, tags: TAGS, formatTime: fixed });
    expect(bar.ticket.items[0]).toEqual({
      name: 'Латте',
      variant_label: 'M',
      quantity: 2,
      modifiers: ['вівсяне'],
      note: 'гарячіше',
    });
    expect(JSON.stringify(bar.ticket)).not.toMatch(/cents|price/);
  });

  it('prints one unheaded ticket with every line when the store’s tags name no station', () => {
    const plain = TAGS.map((t) => ({ ...t, station: null, children: t.children?.map((c) => ({ ...c, station: null })) }));
    const routes = buildKitchenTickets(sale, { catalog: CATALOG, tags: plain, formatTime: fixed });
    expect(routes).toHaveLength(1);
    expect(routes[0].station).toBeNull();
    expect(routes[0].ticket.station).toBeNull();
    expect(routes[0].ticket.items).toHaveLength(4);
  });

  it('labels a sale still in the outbox with the till’s own «К» number', () => {
    const queued = makeSaleDetail({ ...sale, order_no: null, local_order_no: 3, receipt_number: 'OFF-ABCD1234' });
    const [first] = buildKitchenTickets(queued, { catalog: CATALOG, tags: TAGS, formatTime: fixed });
    expect(first.ticket.order_label).toBe('К3');
    expect(first.ticket.receipt_number).toBe('OFF-ABCD1234');
  });

  it('produces nothing for a sale with no lines', () => {
    expect(buildKitchenTickets(makeSaleDetail({ items: [] }), { catalog: CATALOG, tags: TAGS })).toEqual([]);
  });
});

describe('formatTicketTime', () => {
  it('is hours and minutes, and blank for a date it cannot read', () => {
    expect(formatTicketTime('2026-09-21T11:59:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
    expect(formatTicketTime('not a date')).toBe('');
  });
});

describe('bareVariantLabel', () => {
  it('takes the appended answers off the caption and leaves the size', () => {
    expect(bareVariantLabel('M · вівсяне · без цукру', ['вівсяне', 'без цукру'])).toBe('M');
    expect(bareVariantLabel('вівсяне', ['вівсяне'])).toBe('');
    expect(bareVariantLabel('M', [])).toBe('M');
    // A caption that was not composed this way is left alone.
    expect(bareVariantLabel('M · щось інше', ['вівсяне'])).toBe('M · щось інше');
  });
});
