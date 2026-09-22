// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers behind the kitchen board (café phase К3c). Pinned by
// `kitchen.test.ts`; nothing here touches React or the network.

import type { CatalogItem } from '@pos/platform';
import type { KitchenOrder } from '../types';

/** Waiting longer than this is worth a colour; longer than the second, a louder one. */
export const WAIT_WARN_S = 300;
export const WAIT_LATE_S = 600;

/**
 * How far the tablet's clock is from the server's, in ms. Nobody sets a
 * kitchen tablet's clock; the server's `now` is the reference and this is
 * what corrects the local one before every wait is computed.
 */
export function clockOffset(serverNow: string, clientNow = Date.now()): number {
  const server = new Date(serverNow).getTime();
  if (Number.isNaN(server)) return 0;
  return server - clientNow;
}

/** Seconds since `since`, on the server's clock. Never negative. */
export function waitSeconds(since: string, offset: number, clientNow = Date.now()): number {
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((clientNow + offset - start) / 1000));
}

export type WaitTone = 'ok' | 'warn' | 'late';

export function waitTone(seconds: number): WaitTone {
  if (seconds >= WAIT_LATE_S) return 'late';
  if (seconds >= WAIT_WARN_S) return 'warn';
  return 'ok';
}

/** `m:ss`, and `h:mm:ss` once an order has waited an hour. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The two columns: what is being made, and what waits on the shelf. Both oldest first. */
export function splitColumns(orders: KitchenOrder[]): {
  inWork: KitchenOrder[];
  pickup: KitchenOrder[];
} {
  return {
    inWork: orders.filter((o) => o.prep_status === 'new'),
    pickup: orders.filter((o) => o.prep_status === 'ready'),
  };
}

/** A round fired from a table, as opposed to a sale rung at the counter. */
export function isRound(order: Pick<KitchenOrder, 'kind'>): boolean {
  return order.kind === 'round';
}

/**
 * What is called out across the kitchen: the daily number at the counter, the
 * TABLE for a round.
 *
 * A round carries neither `order_no` nor `receipt_number` — nothing is paid
 * yet — so the old rule returned an empty string and the ticket arrived with
 * a blank where its identity should be. The table is the thing a cook needs;
 * which round of it goes underneath, in `orderSubLabel`.
 */
export function orderLabel(
  order: Pick<KitchenOrder, 'order_no' | 'receipt_number' | 'kind' | 'table_name' | 'title'>
): string {
  if (isRound(order)) return order.table_name || order.title || '';
  return order.order_no != null ? String(order.order_no) : order.receipt_number;
}

/** "раунд 2" under a table's name; nothing for a counter sale. */
export function orderSubLabel(
  order: Pick<KitchenOrder, 'kind' | 'round_seq'>
): string | null {
  if (!isRound(order) || order.round_seq == null) return null;
  return `раунд ${order.round_seq}`;
}

/**
 * What identifies a card on the board.
 *
 * NOT the id: sales and rounds are separate tables with separate sequences,
 * so sale 7 and round 7 sit on the same board at the same time. Everything
 * that singles a card out — the optimistic move, the React key, the test id —
 * goes through this.
 */
export function orderKey(order: Pick<KitchenOrder, 'id' | 'kind'>): string {
  return `${order.kind ?? 'sale'}-${order.id}`;
}

/**
 * Move an order on the board the moment a tap is sent, before the server
 * answers: «Готово» moves it to the shelf, «Видано» takes it off. The next
 * poll is the truth; this only keeps the tap from feeling ignored.
 */
export function applyPrep(
  orders: KitchenOrder[],
  target: Pick<KitchenOrder, 'id' | 'kind'>,
  status: 'ready' | 'served',
  readyAt: string
): KitchenOrder[] {
  const key = orderKey(target);
  if (status === 'served') return orders.filter((o) => orderKey(o) !== key);
  return orders.map((o) =>
    orderKey(o) === key ? { ...o, prep_status: 'ready', ready_at: o.ready_at ?? readyAt } : o
  );
}

export interface StopListEntry {
  product_id: number;
  name: string;
  image_url: string | null;
  stop_listed: boolean;
  /** Stock-driven «немає» is shown beside the switch, as its own reason. */
  stock: number;
}

/**
 * The stop-list tab's rows: one per product (a cheesecake is off in every
 * size), on the menu only — an ingredient is not something to pull for the
 * day. Alphabetical, because the barista is looking for one by name.
 */
export function groupStopList(catalog: CatalogItem[]): StopListEntry[] {
  const byProduct = new Map<number, StopListEntry>();
  for (const item of catalog) {
    if (item.sellable === false) continue;
    const row = byProduct.get(item.product_id);
    if (row) {
      row.stock += item.quantity;
      row.stop_listed = row.stop_listed || item.stop_listed === true;
    } else {
      byProduct.set(item.product_id, {
        product_id: item.product_id,
        name: item.product_name,
        image_url: item.image_url ?? null,
        stop_listed: item.stop_listed === true,
        stock: item.quantity,
      });
    }
  }
  return [...byProduct.values()].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

/**
 * What the server said, when it said anything — a 409 in the kitchen's words
 * («Замовлення вже видано»), a 400 — or the caller's fallback.
 */
export function serverMessage(err: unknown, fallback: string): string {
  const sent = (err as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error;
  return typeof sent === 'string' && sent.trim() ? sent : fallback;
}
