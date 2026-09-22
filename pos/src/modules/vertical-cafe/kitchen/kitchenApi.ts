// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Typed wrappers over the host's `api.posRequest` for the kitchen's routes —
// the `fiscal-core/data/fiscalApi.ts` shape. Nothing here is a new export of
// `@pos/platform`, which is what keeps this module on platform 13.

import type { CatalogItem } from '@pos/platform';
import { posRequest } from '../lib/hostPlatform';
import type { KitchenBoard, KitchenOrder, PrepStatusRow, StopListRow } from './types';

/** Today's open orders, oldest first, with the server's clock. */
export function listOrders(): Promise<KitchenBoard> {
  return posRequest<KitchenBoard>('get', '/kitchen/orders');
}

/**
 * One tap: «Готово» (`ready`) or «Видано» (`served`). 409 in the kitchen's words.
 *
 * Takes the ORDER, not an id, because the board has two kinds on it and they
 * are stamped in different tables: a counter sale through `/sales/:id/prep`,
 * a table's round through `/kitchen/rounds/:id/prep`. Sending a round's id to
 * the sales route is what answered «Замовлення не знайдено» to a cook who was
 * looking straight at the ticket.
 */
export function setPrep(
  order: Pick<KitchenOrder, 'id' | 'kind'>,
  status: 'ready' | 'served'
): Promise<PrepStatusRow> {
  const path =
    order.kind === 'round' ? `/kitchen/rounds/${order.id}/prep` : `/sales/${order.id}/prep`;
  return posRequest<PrepStatusRow>('patch', path, { prep_status: status });
}

/** «Сьогодні не робимо» — on or off for the store's day. */
export function setStopListed(productId: number, on: boolean): Promise<StopListRow> {
  return posRequest<StopListRow>('post', `/kitchen/stop-list/${productId}`, { stop_listed: on });
}

/** The menu as the till sees it — what the stop-list tab lists. */
export function menu(): Promise<CatalogItem[]> {
  return posRequest<CatalogItem[]>('get', '/catalog');
}
