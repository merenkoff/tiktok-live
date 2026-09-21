// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Routing a rung sale to the station printers (café phase К3e), pure.
//
// The station is a fact on the tag (`pos_tags.station`, migration 050), and
// the desktop resolves it from what it already holds offline: the sale's
// lines name their variants, the catalog mirror knows each variant's product
// and tags, the cached tag tree knows each tag's station. So a ticket prints
// with no network at all. The rules that are easy to get backwards:
//
// - a product wearing tags of two stations prints on both (a breakfast set
//   with a coffee: the kitchen makes one half, the bar the other);
// - a product with no station goes to the kitchen — the default station, so
//   nothing is ever silently unmade;
// - a store whose tags name no station at all gets ONE ticket with no
//   heading, because there is nothing to route by yet;
// - the ticket carries no prices: it is not a receipt.

import type { KitchenTicketData, KitchenTicketItem } from './printer';
import type { CatalogItem, PosTag, SaleDetail, TagStation } from '../types';
import { flattenTags } from '../offline/catalog-filter';
import { localOrderLabel } from './localOrderNo';

export type Station = TagStation;

/** Every station, in the order tickets come out. */
export const STATIONS: readonly Station[] = ['kitchen', 'bar'];

/** The heading a station's ticket carries. Upper case: it is read from a metre away. */
export const STATION_TITLES: Record<Station, string> = { kitchen: 'КУХНЯ', bar: 'БАР' };

/** A ticket bound for a station, or for the one printer of a store without stations. */
export interface KitchenTicketRoute {
  station: Station | null;
  ticket: KitchenTicketData;
}

/**
 * What the counter will call out, in order of preference: the server's daily
 * number, the till's own «К» number while the sale is still in the outbox,
 * and — for a sale from before either existed — the receipt number.
 */
export function orderLabelOf(
  sale: Pick<SaleDetail, 'order_no' | 'local_order_no' | 'receipt_number'>
): string {
  if (sale.order_no != null) return String(sale.order_no);
  if (sale.local_order_no != null) return localOrderLabel(sale.local_order_no);
  return sale.receipt_number;
}

/** `tag id → station` for every tag of the tree that names one. */
export function stationByTag(tags: PosTag[]): Map<number, Station> {
  const out = new Map<number, Station>();
  for (const tag of flattenTags(tags)) {
    if (tag.station === 'kitchen' || tag.station === 'bar') out.set(tag.id, tag.station);
  }
  return out;
}

/**
 * The stations a variant's product is made at — from its tags, in `STATIONS`
 * order, de-duplicated. No station named (or the variant unknown to the
 * mirror) → the kitchen, never nothing.
 */
export function stationsOf(
  variantId: number,
  catalogByVariant: Map<number, Pick<CatalogItem, 'tag_ids'>>,
  stations: Map<number, Station>
): Station[] {
  const found = new Set<Station>();
  for (const tagId of catalogByVariant.get(variantId)?.tag_ids ?? []) {
    const station = stations.get(tagId);
    if (station) found.add(station);
  }
  const ordered = STATIONS.filter((s) => found.has(s));
  return ordered.length > 0 ? ordered : ['kitchen'];
}

function ticketItem(item: SaleDetail['items'][number]): KitchenTicketItem {
  return {
    name: item.product_name,
    variant_label: item.variant_label,
    quantity: item.quantity,
    modifiers: (item.modifiers ?? []).map((m) => m.name),
    note: item.note?.trim() ? item.note.trim() : null,
  };
}

/** «14:59» — what the ticket says next to the staff name. */
export function formatTicketTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The tickets a sale produces: one per station its lines touch, each with
 * only that station's lines — or a single unheaded ticket with every line
 * when the store's tags name no station. An empty sale produces none.
 */
export function buildKitchenTickets(
  sale: SaleDetail,
  opts: { catalog: Array<Pick<CatalogItem, 'variant_id' | 'tag_ids'>>; tags: PosTag[]; formatTime?: (iso: string) => string }
): KitchenTicketRoute[] {
  if (sale.items.length === 0) return [];
  const formatTime = opts.formatTime ?? formatTicketTime;
  const head = {
    order_label: orderLabelOf(sale),
    created_at: formatTime(sale.created_at),
    staff_name: sale.staff_name,
    // The order-level note: the till sends one at checkout, but `SaleDetail`
    // does not carry it back yet, so the ticket has only the line notes.
    note: null,
    receipt_number: sale.receipt_number || null,
  };
  const stations = stationByTag(opts.tags);
  if (stations.size === 0) {
    return [{ station: null, ticket: { ...head, station: null, items: sale.items.map(ticketItem) } }];
  }
  const byVariant = new Map(opts.catalog.map((c) => [c.variant_id, c]));
  const perStation = new Map<Station, KitchenTicketItem[]>();
  for (const item of sale.items) {
    for (const station of stationsOf(item.variant_id, byVariant, stations)) {
      const list = perStation.get(station) ?? [];
      list.push(ticketItem(item));
      perStation.set(station, list);
    }
  }
  return STATIONS.filter((s) => perStation.has(s)).map((station) => ({
    station,
    ticket: { ...head, station: STATION_TITLES[station], items: perStation.get(station)! },
  }));
}
