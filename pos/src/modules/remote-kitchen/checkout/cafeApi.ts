// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's calls to «Віддалена кухня» (TechDocs/POS_REMOTE_KITCHEN.md §6–§8).
// Mirrored wire shapes: this bundle shares only `@pos/platform` with the host.

import { posRequest } from '../lib/hostPlatform';
import { orderItems, readSetup, type CafeOrder, type CafeSetup, type KitchenCartLine } from './lib';

export async function loadSetup(): Promise<CafeSetup | null> {
  return readSetup(await posRequest<unknown>('get', '/remote-kitchen/setup'));
}

/** A new request. A fresh uuid per request: a retry of the same tap reuses it. */
export function createOrder(clientUuid: string, lines: readonly KitchenCartLine[]): Promise<CafeOrder> {
  return posRequest<CafeOrder>('post', '/remote-kitchen/orders', {
    client_uuid: clientUuid,
    items: orderItems(lines),
  });
}

/** The cart changed (or «Запитати ще раз»): the same order, a new revision, asked again. */
export function reviseOrder(order: Pick<CafeOrder, 'id' | 'revision'>, lines: readonly KitchenCartLine[]): Promise<CafeOrder> {
  return posRequest<CafeOrder>('put', `/remote-kitchen/orders/${order.id}/items`, {
    revision: order.revision,
    items: orderItems(lines),
  });
}

export function readOrder(id: number): Promise<CafeOrder> {
  return posRequest<CafeOrder>('get', `/remote-kitchen/orders/${id}`);
}

/** The kitchen said a time on the phone: the whole promise, road included. */
export function phoneQuote(order: Pick<CafeOrder, 'id' | 'revision'>, minutes: number): Promise<CafeOrder> {
  return posRequest<CafeOrder>('post', `/remote-kitchen/orders/${order.id}/phone-quote`, {
    minutes,
    revision: order.revision,
  });
}

export function guestDeclined(order: Pick<CafeOrder, 'id'>): Promise<CafeOrder> {
  return posRequest<CafeOrder>('post', `/remote-kitchen/orders/${order.id}/guest-declined`);
}
