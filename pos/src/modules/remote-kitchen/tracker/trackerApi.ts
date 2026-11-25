// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's side of a paid kitchen order (РК5, TechDocs/POS_REMOTE_KITCHEN.md
// §8): where the order is, and the cafe's three taps — «Привезли», «Видали
// гостю», «Гостю повернули». Mirrored wire shapes: this bundle shares only
// `@pos/platform` with the host.

import { posRequest } from '../lib/hostPlatform';
import { readSides } from '../lib/sides';

export interface TrackedItem {
  id: number;
  product_name: string;
  variant_label: string;
  quantity: number;
}

/** The fields of `GET /remote-kitchen/orders?side=cafe` the tracker reads. */
export interface TrackedOrder {
  id: number;
  status: string;
  order_no: number | null;
  guest_label: string | null;
  kitchen_title: string;
  kitchen_phone: string | null;
  promised_at: string | null;
  paid_at: string | null;
  arrived_at: string | null;
  decline_reason: string | null;
  /** Absent on a server before migration 118: no kitchen's cancel is told then. */
  cancelled_by?: 'cafe' | 'kitchen' | null;
  cancel_seen_at?: string | null;
  delayed_minutes?: number;
  items: TrackedItem[];
}

/** Is this store a cafe that asks a kitchen? Read before the tracker polls. */
export async function isCafe(): Promise<boolean> {
  return (await readSides()).cafe;
}

/** Orders where this store is the cafe, with the server's clock. */
export async function listCafeSide(): Promise<{ orders: TrackedOrder[]; now?: string }> {
  const res = await posRequest<{ orders?: TrackedOrder[]; now?: string }>('get', '/remote-kitchen/orders?side=cafe');
  return { orders: Array.isArray(res?.orders) ? res.orders : [], now: res?.now };
}

export const markArrived = (id: number) => posRequest<TrackedOrder>('post', `/remote-kitchen/orders/${id}/arrived`);

export const markHanded = (id: number) => posRequest<TrackedOrder>('post', `/remote-kitchen/orders/${id}/handed`);

/** «Гостю повернули»: the cafe answered the kitchen's cancel. */
export const markCancelSeen = (id: number) =>
  posRequest<TrackedOrder>('post', `/remote-kitchen/orders/${id}/cancel-seen`);
