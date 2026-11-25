// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's calls to «Віддалена кухня» (TechDocs/POS_REMOTE_KITCHEN.md §6–§8).
// Mirrored wire shapes: this bundle shares only `@pos/platform` with the host.

import { currentStoreId, isOnline, posRequest } from '../lib/hostPlatform';
import { rememberSetup, rememberedSetup } from '../lib/setupMemory';
import type { RawSetup } from '../lib/sides';
import { orderItems, readSetup, type CafeOrder, type CafeSetup, type KitchenCartLine } from './lib';

/** No answer at all — no network, a timeout — as against an answer that said no. */
function noAnswer(error: unknown): boolean {
  return !(error && typeof error === 'object' && (error as { response?: unknown }).response);
}

/**
 * This till's side of the link. Offline (РК5, §8) the last answer this till
 * kept stands in, marked `fromMemory`, so the block still knows which dishes
 * are the kitchen's and whom to call. So does a read that got no answer at all
 * while the till still thinks it is online — a router with no internet at
 * opening — since that is offline in all but name; an answer that said no
 * (a 403, a 500) is not.
 */
export async function loadSetup(): Promise<CafeSetup | null> {
  const store = currentStoreId();
  try {
    const raw = await posRequest<RawSetup>('get', '/remote-kitchen/setup');
    rememberSetup(raw ?? {}, store);
    return readSetup(raw);
  } catch (error) {
    const kept = !isOnline() || noAnswer(error) ? rememberedSetup() : null;
    if (!kept) throw error;
    const setup = readSetup(kept);
    return setup ? { ...setup, fromMemory: true } : null;
  }
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
