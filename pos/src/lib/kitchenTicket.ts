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
import type { CatalogItem, PosTag, RemotePrintJob, RoundPrintJob, SaleDetail, TagStation } from '../types';
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

/**
 * The caption without the answers the server appended to it: a sale line's
 * `variant_label` is «M · вівсяне» (`lineCaption`), and the ticket prints
 * each answer on its own line under the dish — printing the caption whole
 * would name the milk twice on the cook's paper.
 */
export function bareVariantLabel(caption: string, modifierNames: readonly string[]): string {
  let label = caption;
  for (const name of [...modifierNames].reverse()) {
    if (label.endsWith(` · ${name}`)) label = label.slice(0, -(name.length + 3));
    else if (label === name) label = '';
  }
  return label;
}

function ticketItem(item: SaleDetail['items'][number]): KitchenTicketItem {
  const names = (item.modifiers ?? []).map((m) => m.name);
  return {
    name: item.product_name,
    variant_label: bareVariantLabel(item.variant_label, names),
    quantity: item.quantity,
    modifiers: names,
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
  // A dish a remote kitchen cooks (track РК) is that kitchen's to make, and its
  // ticket comes out of THAT kitchen's printer (`remoteTicketOf`); on this
  // store's printer it would send the hot-dog cook to bake a pizza.
  const items = sale.items.filter((item) => item.remote_order_item_id == null);
  if (items.length === 0) return [];
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
    return [{ station: null, ticket: { ...head, station: null, items: items.map(ticketItem) } }];
  }
  const byVariant = new Map(opts.catalog.map((c) => [c.variant_id, c]));
  const perStation = new Map<Station, KitchenTicketItem[]>();
  for (const item of items) {
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

/**
 * A table's round as its station's ticket (TechDocs/POS_TABLES.md §11): the
 * server's print queue already filtered the lines to this station, so this
 * only shapes them. «Стіл 5» is the big label — what the runner reads across
 * the pass — and «Раунд 2 · Тераса» sits under it; the station heading only
 * where the store routes by station. No prices and no receipt number: a round
 * has no receipt yet. The caption is printed without the answers the round
 * appended to it, and the answers one per line, exactly as a counter sale's.
 * A `cancel` job is the same ticket marked `cancelled` — «СКАСОВАНО» on top.
 */
export function roundTicketOf(
  job: RoundPrintJob,
  formatTime: (iso: string) => string = formatTicketTime
): KitchenTicketData {
  const where = [`Раунд ${job.round_seq}`, job.hall_name.trim()].filter(Boolean).join(' · ');
  return {
    order_label: `Стіл ${job.table_name}`,
    station: job.heading ? STATION_TITLES[job.heading] : null,
    subtitle: where,
    created_at: formatTime(job.fired_at),
    staff_name: job.staff_name,
    note: job.note,
    receipt_number: null,
    ...(job.kind === 'cancel' ? { cancelled: true } : {}),
    items: job.items.map((item) => ({
      name: item.product_name,
      variant_label: bareVariantLabel(item.variant_label, item.modifiers),
      quantity: item.quantity,
      modifiers: item.modifiers,
      note: item.note?.trim() ? item.note.trim() : null,
    })),
  };
}

/**
 * A cafe's paid order on the remote kitchen's printer (РК3,
 * TechDocs/POS_REMOTE_KITCHEN.md §7.2). «П-12» is the big label, the number
 * the kitchen's board shows; under it the cafe, the guest and the time the
 * guest was promised — what the cook plans the dish by. No station heading
 * (a dark kitchen cooks everything it is asked) and no prices. A `cancel` job
 * is the same ticket marked «СКАСОВАНО».
 */
export function remoteTicketOf(
  job: RemotePrintJob,
  formatTime: (iso: string) => string = formatTicketTime
): KitchenTicketData {
  const promised = job.promised_at ? formatTime(job.promised_at) : '';
  const subtitle = [job.cafe_name.trim(), job.guest_label?.trim() ?? '', promised ? `до ${promised}` : '']
    .filter(Boolean)
    .join(' · ');
  return {
    order_label: job.order_no != null ? `П-${job.order_no}` : `П · ${job.remote_order_id}`,
    station: null,
    subtitle,
    created_at: formatTime(job.paid_at),
    staff_name: job.cafe_name.trim(),
    note: job.note,
    receipt_number: null,
    ...(job.kind === 'cancel' ? { cancelled: true } : {}),
    items: job.items.map((item) => ({
      name: item.product_name,
      variant_label: bareVariantLabel(item.variant_label, item.modifiers),
      quantity: item.quantity,
      modifiers: item.modifiers,
      note: item.note?.trim() ? item.note.trim() : null,
    })),
  };
}
