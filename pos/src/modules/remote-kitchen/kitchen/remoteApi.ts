// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen's side of «Віддалена кухня» (РК3, TechDocs/POS_REMOTE_KITCHEN.md):
// the cafe's requests waiting for a time, and the two answers. Mirrored wire
// shapes: this bundle shares only `@pos/platform` with the host.

import { posRequest } from '../lib/hostPlatform';
import { readSides } from '../lib/sides';

export interface RemoteRequestItem {
  id: number;
  product_name: string;
  variant_label: string;
  quantity: number;
  note: string;
}

/** The fields of `GET /remote-kitchen/orders?side=kitchen` this screen reads. */
export interface RemoteRequest {
  id: number;
  status: string;
  revision: number;
  cafe_name: string;
  guest_label: string | null;
  note: string | null;
  prep_minutes: number | null;
  load_minutes: number | null;
  transit_minutes: number | null;
  /** The whole promise the kitchen's own numbers suggest, road included. */
  suggested_minutes: number | null;
  answer_deadline_at: string | null;
  requested_at: string;
  /** For a time already given: who gave it — the server by itself (`auto`), the kitchen, the cafe's phone. */
  quote_source?: 'kitchen' | 'auto' | 'phone' | null;
  /** The whole promise, road included. */
  quoted_minutes?: number | null;
  /** Until when the cafe's guest may still agree to it. */
  quote_expires_at?: string | null;
  items: RemoteRequestItem[];
}

/**
 * Is this store a kitchen for some cafe at all? Read before the strip starts
 * polling: a store that is only a cafe (or has no link) must not ask the
 * server for a kitchen's requests every three seconds all day.
 */
export async function isKitchen(): Promise<boolean> {
  return (await readSides()).kitchen;
}

/**
 * Orders where this store is the kitchen, with the server's clock — the
 * countdown to «кафе вже дзвонить» is the server's deadline, not the device's.
 * A store with no link gets an empty list, not an error.
 */
export async function listKitchenSide(): Promise<{ orders: RemoteRequest[]; now?: string }> {
  const res = await posRequest<{ orders?: RemoteRequest[]; now?: string }>(
    'get',
    '/remote-kitchen/orders?side=kitchen'
  );
  return { orders: Array.isArray(res?.orders) ? res.orders : [], now: res?.now };
}

/** «Встигнемо за N хв» — the cooking time; the server adds the road and rounds up. */
export function answerWithTime(order: Pick<RemoteRequest, 'id' | 'revision'>, minutes: number): Promise<unknown> {
  return posRequest<unknown>('post', `/remote-kitchen/orders/${order.id}/quote`, {
    minutes,
    revision: order.revision,
  });
}

/** «Не зможемо». */
export function decline(order: Pick<RemoteRequest, 'id' | 'revision'>, reason: string): Promise<unknown> {
  return posRequest<unknown>('post', `/remote-kitchen/orders/${order.id}/decline`, {
    reason,
    revision: order.revision,
  });
}

/** The server keeps a reason of at most this many characters. */
export const REASON_MAX = 160;

/**
 * «Немає: Маргарита 50 см, Тірамісу» — each dish with its size (two sizes of
 * one pizza are two different answers), once, and cut at a comma rather than
 * mid-name when the list is longer than the server keeps.
 */
export function missingReason(items: ReadonlyArray<Pick<RemoteRequestItem, 'product_name' | 'variant_label'>>): string | undefined {
  const names = [...new Set(items.map((i) => (i.variant_label ? `${i.product_name} ${i.variant_label}` : i.product_name)))];
  if (names.length === 0) return undefined;
  let reason = 'Немає:';
  for (const [index, name] of names.entries()) {
    const next = `${reason}${index === 0 ? ' ' : ', '}${name}`;
    const more = names.length - index - 1;
    // Room for « та ще N» after it, if anything follows.
    if (next.length + (more > 0 ? ` та ще ${more}`.length : 0) > REASON_MAX) {
      return `${reason} та ще ${names.length - index}`.slice(0, REASON_MAX);
    }
    reason = next;
  }
  return reason;
}

/** «Немає» by a dish: the cafe gets the lines back marked, and asks again without them. */
export function declineDishes(
  order: Pick<RemoteRequest, 'id' | 'revision' | 'items'>,
  itemIds: number[]
): Promise<unknown> {
  // The cafe's till shows the reason, not the item list: name the dishes in it.
  const reason = missingReason(order.items.filter((i) => itemIds.includes(i.id)));
  return posRequest<unknown>('post', `/remote-kitchen/orders/${order.id}/decline`, {
    reason,
    problems: itemIds.map((item_id) => ({ item_id, problem: 'unavailable' })),
    revision: order.revision,
  });
}
