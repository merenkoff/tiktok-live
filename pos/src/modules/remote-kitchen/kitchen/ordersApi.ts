// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen's paid orders from its cafes (РК5): «+10 хв» and «Скасувати»,
// the two things only the kitchen can say about an order already paid — and
// the two the cafe's tracker shows its cashier («кухня додала 10 хв»,
// «скасовано кухнею — поверніть гостю»). Mirrored wire shapes: this bundle
// shares only `@pos/platform` with the host.

import { posRequest } from '../lib/hostPlatform';

export interface KitchenOrderItem {
  id: number;
  product_name: string;
  variant_label: string;
  quantity: number;
}

/** The fields of `GET /remote-kitchen/orders?side=kitchen` this section reads. */
export interface KitchenOrder {
  id: number;
  status: string;
  order_no: number | null;
  cafe_name: string;
  guest_label: string | null;
  promised_at: string | null;
  /** Every «+N хв» so far; absent on an older server. */
  delayed_minutes?: number;
  items: KitchenOrderItem[];
}

/** Orders where this store is the kitchen, with the server's clock. */
export async function listKitchenOrders(): Promise<{ orders: KitchenOrder[]; now?: string }> {
  const res = await posRequest<{ orders?: KitchenOrder[]; now?: string }>('get', '/remote-kitchen/orders?side=kitchen');
  return { orders: Array.isArray(res?.orders) ? res.orders : [], now: res?.now };
}

/** «+N хв»: the promise moves, and the cafe sees the new time. */
export const delayOrder = (id: number, minutes: number) =>
  posRequest<KitchenOrder>('post', `/remote-kitchen/orders/${id}/delay`, { minutes });

/** «Скасувати»: the kitchen's shelf gets the order back; the cafe returns the money. */
export const cancelOrder = (id: number, reason: string) =>
  posRequest<KitchenOrder>('post', `/remote-kitchen/orders/${id}/cancel`, { reason });
