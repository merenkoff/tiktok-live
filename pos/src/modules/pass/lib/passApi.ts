// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's calls into `/api/pos/serving` (`serving.routes.ts`), all
// through the host's one client (`lib/hostPlatform.ts`).

import { posRequest } from './hostPlatform';
import type { ServeAnswer, ServingBill, ServingFeed, UndoAnswer } from './types';

/** Every open bill of the store, with what of its rounds is still to carry. */
export function getFeed(): Promise<ServingFeed> {
  return posRequest<ServingFeed>('get', '/serving');
}

/** One bill: its live rounds and «Винесено». */
export function getServingBill(billId: number): Promise<ServingBill> {
  return posRequest<ServingBill>('get', `/serving/bills/${billId}`);
}

/**
 * «Несу»: one tray. All or nothing on the server, and idempotent on
 * `clientUuid` — a tray repeated after a timeout comes back as the rows the
 * first request wrote, never as a second tray.
 */
export function serve(clientUuid: string, items: Array<{ bill_item_id: number; quantity: number }>): Promise<ServeAnswer> {
  return posRequest<ServeAnswer>('post', '/serving/serve', { client_uuid: clientUuid, items });
}

/** «Повернути»: the taps of one tray, by their event ids. */
export function undo(eventIds: number[]): Promise<UndoAnswer> {
  return posRequest<UndoAnswer>('post', '/serving/undo', { event_ids: eventIds });
}
