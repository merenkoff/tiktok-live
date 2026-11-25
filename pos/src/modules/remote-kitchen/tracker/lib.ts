// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the cafe's tracker shows of an order, as pure functions (РК5).

import type { TrackedOrder } from './trackerApi';

/** After payment and before «Видали гостю». */
const ON_ITS_WAY = ['paid', 'cooking', 'ready', 'dispatched', 'arrived'] as const;

/** «Готується → Їде → Привезли → Видали». */
export const STAGES = ['Готується', 'Їде', 'Привезли', 'Видали'] as const;

/** An «arrived» order no one handed over for this long gets a reminder. */
export const UNHANDED_MS = 2 * 60 * 60_000;

/**
 * How far past its promise an order the kitchen never marked may be said to
 * have come — the server's `LATE_ARRIVAL_MINUTES` (remote-kitchen.service.ts),
 * which refuses it any earlier.
 */
export const LATE_ARRIVAL_MINUTES = 20;

export function isKitchenCancel(order: TrackedOrder): boolean {
  return order.status === 'cancelled' && order.cancelled_by === 'kitchen' && !order.cancel_seen_at;
}

/**
 * The orders the tracker draws: the kitchen's cancels no cashier answered
 * yet first (the guest is owed money), then everything paid and not handed
 * over, the soonest promise first.
 */
export function trackedOrders(orders: TrackedOrder[]): TrackedOrder[] {
  const cancels = orders.filter(isKitchenCancel);
  const going = orders
    .filter((o) => (ON_ITS_WAY as readonly string[]).includes(o.status))
    .sort((a, b) => promisedMs(a) - promisedMs(b) || a.id - b.id);
  return [...cancels, ...going];
}

function promisedMs(order: TrackedOrder): number {
  const at = order.promised_at ? Date.parse(order.promised_at) : NaN;
  return Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : at;
}

/** Which of the four stages the order is at; -1 for anything else. */
export function stageOf(status: string): number {
  switch (status) {
    case 'paid':
    case 'cooking':
    case 'ready':
      return 0;
    case 'dispatched':
      return 1;
    case 'arrived':
      return 2;
    case 'handed_over':
      return 3;
    default:
      return -1;
  }
}

export interface CafeStep {
  action: 'arrived' | 'handed';
  label: string;
  /** Asked before the tap is sent: the kitchen never said the order left. */
  confirm?: string;
}

/**
 * The cafe's next tap, if any: the courier came, then the guest got it.
 * While the kitchen cooks there is none — a mistaken tap would take the card
 * off the kitchen's board with the pizza still in the oven — until the order
 * is `LATE_ARRIVAL_MINUTES` past its promise: then the kitchen most likely
 * forgot to tap, and the cafe may close what it can see, after one question.
 */
export function nextStep(order: Pick<TrackedOrder, 'status' | 'promised_at'>, nowMs: number): CafeStep | null {
  const { status } = order;
  if (status === 'ready' || status === 'dispatched') return { action: 'arrived', label: 'Привезли' };
  if (status === 'arrived') return { action: 'handed', label: 'Видали гостю' };
  if ((status === 'paid' || status === 'cooking') && order.promised_at) {
    const late = nowMs - Date.parse(order.promised_at);
    if (Number.isFinite(late) && late >= LATE_ARRIVAL_MINUTES * 60_000) {
      return {
        action: 'arrived',
        label: 'Вже привезли',
        confirm: 'Кухня не відмітила, що віддала замовлення. Його справді привезли?',
      };
    }
  }
  return null;
}

/** «чек R-000123» — the cafe's receipt a kitchen's cancel is refunded from; nothing on an older server. */
export function receiptOf(order: Pick<TrackedOrder, 'cafe_receipt_number'>): string {
  return order.cafe_receipt_number ? `чек ${order.cafe_receipt_number}` : '';
}

/** Whole minutes past the promise, for an order not yet at the cafe; 0 when on time. */
export function minutesLate(order: Pick<TrackedOrder, 'status' | 'promised_at'>, nowMs: number): number {
  if (order.status === 'arrived' || !order.promised_at) return 0;
  const late = nowMs - Date.parse(order.promised_at);
  return Number.isFinite(late) && late > 0 ? Math.ceil(late / 60_000) : 0;
}

/** At the cafe for two hours and nobody handed it over. */
export function waitingTooLong(order: TrackedOrder, nowMs: number): boolean {
  if (order.status !== 'arrived' || !order.arrived_at) return false;
  return nowMs - Date.parse(order.arrived_at) >= UNHANDED_MS;
}

/** «П-12», or nothing before the kitchen numbered it. */
export function numberOf(order: Pick<TrackedOrder, 'order_no'>): string {
  return order.order_no != null ? `П-${order.order_no}` : '';
}

/** «2× Маргарита 32 см, Карбонара». */
export function itemsLine(order: Pick<TrackedOrder, 'items'>): string {
  return order.items
    .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.product_name}${i.variant_label ? ` ${i.variant_label}` : ''}`)
    .join(', ');
}

export function clockOf(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}
